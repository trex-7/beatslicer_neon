
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AllParams, Slice, SequencerState, SequencerMode, SequencerStep, SliceType, Preset, KitSample } from '../types';
import { detectBPM } from '../utils/bpmDetector';
import { classifySlice } from '../utils/audioAnalysis';
import { audioBufferToWav, blobToBase64, base64ToBlob } from '../utils/audioHelpers';
import { removeLeadingSilence, generateTransientSlices } from '../utils/transientDetection';

declare const Tone: any;

// --- INLINED WORKLET CODE ---
const GRANULAR_WORKLET_CODE = `
try {
    registerProcessor('granular-engine', class extends AudioWorkletProcessor {
        constructor() {
            super();
            this.bufferL = null;
            this.bufferR = null;
            this.sampleRate = 44100;
            this.currentSample = 0;
            this.isPlaying = false;
            this.bpm = 120;
            this.stepCount = 16;
            this.currentStep = -1;
            this.nextStepTime = 0;
            this.steps = [];
            this.slices = [];
            this.grains = [];
            this.maxGrains = 64; 
            this.pendingTriggers = [];
            this.params = {
                grainSize: 0.1,
                overlap: 0.05,
                playbackRate: 1.0,
                detune: 0,
                volume: 1.0,
                glitch: { chaos: 0, allowReverse: false, allowOctaveJump: false, pitchShift: true }
            };
            this.port.onmessage = (e) => this.handleMessage(e.data);
        }
        handleMessage(data) {
            if (data.type === 'load') {
                this.bufferL = data.bufferL;
                this.bufferR = data.bufferR;
                this.sampleRate = data.sampleRate || 44100;
            } else if (data.type === 'play') {
                this.isPlaying = data.value;
                if (this.isPlaying) {
                    if (data.reset) {
                        this.currentStep = -1;
                        this.nextStepTime = this.currentSample; 
                        this.pendingTriggers = [];
                    }
                } else {
                    this.grains = [];
                    this.pendingTriggers = [];
                }
            } else if (data.type === 'sequencer') {
                this.steps = data.steps;
                this.stepCount = data.stepCount;
                this.bpm = data.bpm;
            } else if (data.type === 'slices') {
                this.slices = data.slices;
            } else if (data.type === 'params') {
                if (data.params) {
                    this.params = { ...this.params, ...data.params };
                    if (data.params.glitch) {
                        this.params.glitch = { ...this.params.glitch, ...data.params.glitch };
                    }
                }
            }
        }
        spawnGrain(sliceIndex, velocity = 1.0, ratchetCount = 1) {
            if (!this.bufferL || !this.slices[sliceIndex]) return;
            const slice = this.slices[sliceIndex];
            if (!slice.isActive) return;
            const grain = {
                active: true,
                position: slice.offset * this.sampleRate, 
                startPosition: slice.offset * this.sampleRate,
                duration: 0, 
                age: 0, 
                speed: this.params.playbackRate,
                amp: velocity * this.params.volume * (slice.level || 1.0),
                attack: 0,
                release: 0,
                isReverse: slice.reverse || false
            };
            const g = this.params.glitch;
            if (g && g.chaos > 0 && Math.random() < g.chaos) {
                 if (g.allowReverse && Math.random() < 0.4) grain.isReverse = !grain.isReverse;
                 if (g.allowOctaveJump && Math.random() < 0.5) {
                     grain.speed *= (Math.random() > 0.5 ? 2.0 : 0.5);
                 }
            }
            const detuneMult = Math.pow(2, this.params.detune / 1200);
            grain.speed *= detuneMult;
            if (this.params.grainSize < 0.15) {
                 grain.duration = this.params.grainSize * this.sampleRate;
            } else {
                 grain.duration = slice.duration * this.sampleRate;
                 if (ratchetCount > 1) {
                     grain.duration /= ratchetCount;
                 }
            }
            
            // Enveloping: Slice overrides Global if defined
            const effectiveAttack = (typeof slice.fadeIn === 'number') ? slice.fadeIn : this.params.attack;
            const effectiveRelease = (typeof slice.fadeOut === 'number') ? slice.fadeOut : this.params.release;

            const attackS = Math.max(0.001, effectiveAttack || 0.002);
            const releaseS = Math.max(0.001, effectiveRelease || 0.005);
            
            grain.attack = attackS * this.sampleRate;
            grain.release = releaseS * this.sampleRate;
            
            if (grain.duration < grain.attack + grain.release) {
                grain.duration = grain.attack + grain.release + 500;
            }
            const emptyIdx = this.grains.findIndex(g => !g.active);
            if (emptyIdx >= 0) {
                this.grains[emptyIdx] = grain;
            } else if (this.grains.length < this.maxGrains) {
                this.grains.push(grain);
            } else {
                this.grains[0] = grain; 
            }
        }
        process(inputs, outputs, parameters) {
            const outputL = outputs[0][0];
            const outputR = outputs[0][1];
            if (!outputL) return true;
            const bufferSize = outputL.length;
            for (let i = 0; i < bufferSize; i++) {
                if (this.isPlaying) {
                    if (this.currentSample >= this.nextStepTime) {
                        this.currentStep = (this.currentStep + 1) % this.stepCount;
                        const samplesPerBeat = (this.sampleRate * 60) / this.bpm;
                        const samplesPerStep = samplesPerBeat / 4;
                        this.nextStepTime += samplesPerStep;
                        this.port.postMessage({ type: 'step', value: this.currentStep });
                        if (this.steps[this.currentStep]) {
                            const stepData = this.steps[this.currentStep];
                            if (stepData.active) {
                                const repeats = stepData.ratchet || 1;
                                const interval = samplesPerStep / repeats;
                                for (let r = 0; r < repeats; r++) {
                                    this.pendingTriggers.push({
                                        time: Math.floor(this.currentSample + (r * interval)),
                                        sliceIndex: stepData.sliceIndex,
                                        ratchetCount: repeats
                                    });
                                }
                            }
                        }
                    }
                    for (let j = this.pendingTriggers.length - 1; j >= 0; j--) {
                        if (this.currentSample >= this.pendingTriggers[j].time) {
                            const trig = this.pendingTriggers[j];
                            this.spawnGrain(trig.sliceIndex, 1.0, trig.ratchetCount);
                            this.pendingTriggers.splice(j, 1);
                        }
                    }
                    this.currentSample++;
                }
                let left = 0;
                let right = 0;
                for (let g = 0; g < this.grains.length; g++) {
                    const grain = this.grains[g];
                    if (!grain.active) continue;
                    if (grain.age >= grain.duration) {
                        grain.active = false;
                        continue;
                    }
                    let pos = grain.position;
                    let idx = Math.floor(pos);
                    let frac = pos - idx;
                    if (idx < 0) idx = 0;
                    if (this.bufferL && idx < this.bufferL.length - 1) {
                        const l1 = this.bufferL[idx];
                        const l2 = this.bufferL[idx + 1];
                        const r1 = this.bufferR ? this.bufferR[idx] : l1;
                        const r2 = this.bufferR ? this.bufferR[idx + 1] : l2;
                        let sampL = l1 + frac * (l2 - l1);
                        let sampR = r1 + frac * (r2 - r1);
                        let env = 1.0;
                        if (grain.age < grain.attack) {
                            env = grain.age / grain.attack;
                        } else if (grain.age > grain.duration - grain.release) {
                            env = (grain.duration - grain.age) / grain.release;
                        }
                        left += sampL * env * grain.amp;
                        right += sampR * env * grain.amp;
                    }
                    if (grain.isReverse) {
                        grain.position -= grain.speed;
                    } else {
                        grain.position += grain.speed;
                    }
                    grain.age++;
                }
                if (left > 1.0) left = 1.0; else if (left < -1.0) left = -1.0;
                if (right > 1.0) right = 1.0; else if (right < -1.0) right = -1.0;
                outputL[i] = left;
                if (outputR) outputR[i] = right;
            }
            return true;
        }
    });
} catch(e) {}
`;

const initialParams: AllParams = {
  grainSize: 0.12,  
  overlap: 0.05,    
  detune: 0,
  playbackRate: 1,
  bpm: 120,
  attack: 0.005,    
  release: 0.1,     
  sustain: 0.5,     
  reverb: { isActive: false, decay: 1.5, wet: 0, isSynced: false, syncValue: '2n' },
  delay: { isActive: false, delayTime: 0.375, feedback: 0.2, wet: 0, isSynced: true, syncValue: '8n' },
  filter: { 
      isActive: false,
      frequency: 2000, 
      q: 1, 
      type: 'lowpass',
      envDepth: 0,
      lfoDepth: 0,
      lfoRate: 1,
      isSynced: true,
      syncValue: '4n'
  },
  distortion: { isActive: true, amount: 1.0, wet: 0.04 }, 
  compressor: { isActive: true, threshold: -24, ratio: 4, attack: 0.01, release: 0.1 },
  bitCrusher: { isActive: false, bits: 4, wet: 1.0 },
  glitch: { 
      chaos: 0, 
      allowReverse: false, 
      allowOctaveJump: true,
      allowRatchet: true, 
      pitchShift: true, 
      allowFormant: true 
  }
};

const generateDefaultSteps = (count: number): SequencerStep[] => {
  return Array(count).fill(0).map((_, i) => ({
    active: i % 2 === 0, 
    sliceIndex: i, 
    ratchet: 1
  }));
};

export const useAudioEngine = () => {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<any>(null);
  const [params, setParams] = useState<AllParams>(initialParams);
  const [sampleName, setSampleName] = useState<string>('Default');
  const [currentSampleId, setCurrentSampleId] = useState<string | null>(null);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null); // New state to track preset ID
  
  const [slices, setSlices] = useState<Slice[]>([]);
  const [selectedSliceIndex, setSelectedSliceIndex] = useState<number | null>(null);
  
  const [sequencer, setSequencer] = useState<SequencerState>({
    steps: generateDefaultSteps(16),
    stepCount: 16,
    mode: 'forward',
    currentStep: -1,
    isPlaying: false,
    editMode: 'trigger',
    playbackBehavior: 'reset'
  });

  const sequencerRef = useRef(sequencer);
  const paramsRef = useRef(params); 
  const slicesRef = useRef(slices);
  const audioContextRef = useRef<AudioContext | null>(null);
  const midiAccessRef = useRef<any>(null);
  const midiClockIdRef = useRef<number | null>(null);
  const workletNode = useRef<AudioWorkletNode | null>(null);
  const previewPlayer = useRef<any>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [sliceLoopState, setSliceLoopState] = useState<{index: number | null, isLooping: boolean}>({ index: null, isLooping: false });

  const effects = useRef({
    gain: null as any,
    reverb: null as any, 
    reverbLP: null as any,
    reverbHP: null as any,
    reverbGain: null as any,
    dryGain: null as any,
    delay: null as any, 
    filter: null as any, 
    dcBlocker: null as any,
    filterFollower: null as any,
    filterEnvDepth: null as any,
    filterLFO: null as any,
    filterLFODepth: null as any,
    distortion: null as any,
    bitCrusher: null as any,
    bitCrusherShaper: null as any,
    bitCrusherWet: null as any,
    bitCrusherDry: null as any,
    compressor: null as any
  });
  
  const setToneParam = useCallback((target: any, param: string, value: number, rampTime?: number) => {
      if (!target || target[param] === undefined) return;
      if (target[param] && typeof target[param] === 'object' && 'value' in target[param]) {
          if (rampTime && typeof target[param].rampTo === 'function') {
               target[param].rampTo(value, rampTime);
          } else {
               target[param].value = value;
          }
      } else {
          target[param] = value;
      }
  }, []);

  useEffect(() => { sequencerRef.current = sequencer; }, [sequencer]);
  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { slicesRef.current = slices; }, [slices]);

  useEffect(() => {
    let active = true;
    if ((navigator as any).requestMIDIAccess) {
        (navigator as any).requestMIDIAccess({ sysex: false }).then(
            (access: any) => { midiAccessRef.current = access; },
            (err: any) => console.warn("MIDI Access Denied/Failed", err)
        );
    }

    const setupAudio = async () => {
      try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const nativeContext = new AudioContextClass();
          Tone.setContext(nativeContext);
          audioContextRef.current = nativeContext;
          const targetContext = nativeContext;

          if (!targetContext.audioWorklet) {
              console.error("AudioWorklet not supported");
              return;
          }

          const blob = new Blob([GRANULAR_WORKLET_CODE], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);

          try { await targetContext.audioWorklet.addModule(workletUrl); } catch (e: any) {}
          
          if (!active) {
              nativeContext.close().catch(() => {});
              return;
          }

          try {
            workletNode.current = new AudioWorkletNode(targetContext, 'granular-engine', {
                numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
            });
            workletNode.current.port.onmessage = (event) => {
                if (event.data.type === 'step') {
                     setSequencer(prev => {
                         if (prev.currentStep === event.data.value) return prev;
                         return { ...prev, currentStep: event.data.value };
                     });
                }
            };
            workletNode.current.port.postMessage({ type: 'sequencer', steps: sequencerRef.current.steps, stepCount: sequencerRef.current.stepCount, bpm: paramsRef.current.bpm });
            workletNode.current.port.postMessage({ type: 'params', params: { grainSize: paramsRef.current.grainSize, overlap: paramsRef.current.overlap, playbackRate: paramsRef.current.playbackRate, detune: paramsRef.current.detune, glitch: paramsRef.current.glitch, attack: paramsRef.current.attack, release: paramsRef.current.release } });
            workletNode.current.port.postMessage({ type: 'slices', slices: slicesRef.current });

          } catch(e) {
              console.error("Failed to create AudioWorkletNode", e);
              return;
          }

          previewPlayer.current = new Tone.Player().toDestination();
          effects.current.gain = new Tone.Gain(1);
          effects.current.reverb = new Tone.Reverb({ decay: params.reverb.decay });
          effects.current.reverb.wet.value = 1; 
          effects.current.reverb.generate().catch((e: any) => console.warn("Reverb gen", e));

          effects.current.reverbLP = new Tone.Filter(3000, "lowpass", -12);
          effects.current.reverbHP = new Tone.Filter(500, "highpass", -12);
          effects.current.dryGain = new Tone.Gain(1).toDestination();
          effects.current.reverbGain = new Tone.Gain(0).toDestination();
          effects.current.reverb.connect(effects.current.reverbLP);
          effects.current.reverbLP.connect(effects.current.reverbHP);
          effects.current.reverbHP.connect(effects.current.reverbGain);

          effects.current.delay = new Tone.FeedbackDelay({ delayTime: params.delay.delayTime, feedback: params.delay.feedback, wet: params.delay.wet });
          effects.current.delay.connect(effects.current.dryGain);
          effects.current.delay.connect(effects.current.reverb);

          effects.current.filter = new Tone.Filter({ frequency: params.filter.frequency, Q: params.filter.q, type: params.filter.type });
          effects.current.dcBlocker = new Tone.Filter({ frequency: 10, type: 'highpass', rolloff: -24 }).connect(effects.current.delay);
          effects.current.filter.connect(effects.current.dcBlocker);

          effects.current.filterFollower = new Tone.Follower(0.05); 
          effects.current.filterEnvDepth = new Tone.Gain(0);
          effects.current.filterFollower.connect(effects.current.filterEnvDepth);
          effects.current.filterEnvDepth.connect(effects.current.filter.frequency);

          effects.current.filterLFO = new Tone.LFO(1, -1, 1).start();
          effects.current.filterLFODepth = new Tone.Gain(0);
          effects.current.filterLFO.connect(effects.current.filterLFODepth);
          effects.current.filterLFODepth.connect(effects.current.filter.frequency);

          effects.current.bitCrusher = new Tone.BitCrusher(4);
          effects.current.bitCrusher.wet.value = 1; 
          effects.current.bitCrusherShaper = new Tone.Chebyshev(1); 
          effects.current.bitCrusherShaper.wet.value = 1;
          effects.current.bitCrusherWet = new Tone.Gain(0);
          effects.current.bitCrusherDry = new Tone.Gain(1);
          
          effects.current.bitCrusher.connect(effects.current.bitCrusherShaper);
          effects.current.bitCrusherShaper.connect(effects.current.bitCrusherWet);
          
          effects.current.bitCrusherWet.connect(effects.current.filter);
          effects.current.bitCrusherWet.connect(effects.current.filterFollower);
          effects.current.bitCrusherDry.connect(effects.current.filter);
          effects.current.bitCrusherDry.connect(effects.current.filterFollower);

          effects.current.distortion = new Tone.Distortion(params.distortion.amount);
          effects.current.distortion.connect(effects.current.bitCrusher); 
          effects.current.distortion.connect(effects.current.bitCrusherDry); 
          effects.current.distortion.wet.value = params.distortion.wet;

          effects.current.compressor = new Tone.Compressor({ threshold: params.compressor.threshold, ratio: params.compressor.ratio, attack: params.compressor.attack, release: params.compressor.release }).connect(effects.current.distortion);

          if (workletNode.current) {
               const dest = effects.current.compressor;
               try {
                   if (Tone.connect) {
                       Tone.connect(workletNode.current, dest);
                   } else {
                       const rawDest = dest.input || dest;
                       workletNode.current.connect(rawDest);
                   }
               } catch (connErr) {
                   try { workletNode.current.connect(targetContext.destination); } catch(e) {}
               }
          }

          midiClockIdRef.current = Tone.Transport.scheduleRepeat((time: number) => {
              if (midiAccessRef.current) {
                  const audioTimeNow = Tone.context.currentTime;
                  const perfTimeNow = performance.now();
                  const offsetSeconds = time - audioTimeNow;
                  let midiTimestamp = perfTimeNow + (offsetSeconds * 1000);
                  if (midiTimestamp < perfTimeNow) midiTimestamp = perfTimeNow;
                  const outputs = midiAccessRef.current.outputs;
                  outputs.forEach((output: any) => {
                      try { output.send([0xF8], midiTimestamp); } catch (e) {}
                  });
              }
          }, "96n");

          setIsReady(true);
      } catch (e) {
          setIsReady(true); 
      }
    };

    const timer = setTimeout(() => setIsReady(true), 3000); 
    setupAudio().then(() => clearTimeout(timer));

    return () => {
      active = false;
      clearTimeout(timer);
      if (midiClockIdRef.current !== null) Tone.Transport.clear(midiClockIdRef.current);
      previewPlayer.current?.dispose();
      workletNode.current?.disconnect();
      Object.values(effects.current).forEach((effect: any) => effect?.dispose());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {});
    };
  }, []);

  const updateParams = useCallback((newParams: Partial<AllParams>) => {
    const updated = { ...paramsRef.current, ...newParams };
    paramsRef.current = updated;
    setParams(updated);
    const efx = effects.current;

    if (newParams.bpm !== undefined) Tone.Transport.bpm.value = updated.bpm;
    
    if (efx.reverb && newParams.reverb) {
        const rev = updated.reverb;
        let decay = rev.decay;
        if (rev.isSynced) {
            try { decay = Tone.Time(rev.syncValue).toSeconds(); } catch(e) {}
        }
        efx.reverb.decay = Math.max(0.1, Math.min(decay, 10));
        const mix = rev.isActive ? rev.wet : 0;
        if (efx.dryGain) setToneParam(efx.dryGain, 'gain', 1 - mix, 0.1);
        if (efx.reverbGain) setToneParam(efx.reverbGain, 'gain', mix, 0.1);
    }
    
    if (efx.delay && newParams.delay) {
        const del = updated.delay;
        if (del.isSynced) setToneParam(efx.delay, 'delayTime', Tone.Time(del.syncValue).toSeconds());
        else setToneParam(efx.delay, 'delayTime', del.delayTime);
        setToneParam(efx.delay, 'feedback', del.feedback);
        setToneParam(efx.delay, 'wet', del.isActive ? del.wet : 0);
    }

    if (newParams.filter && efx.filter) {
        const f = updated.filter;
        efx.filter.type = f.type;
        if (efx.filterLFO) efx.filterLFO.frequency.value = f.isSynced ? Tone.Time(f.syncValue).toSeconds() : f.lfoRate; 
        if (!f.isActive) {
            setToneParam(efx.filter, 'frequency', f.type === 'lowpass' ? 20000 : 0);
            setToneParam(efx.filterEnvDepth, 'gain', 0);
            setToneParam(efx.filterLFODepth, 'gain', 0);
        } else {
            setToneParam(efx.filter, 'frequency', f.frequency);
            setToneParam(efx.filter, 'Q', f.q);
            setToneParam(efx.filterEnvDepth, 'gain', f.envDepth);
            setToneParam(efx.filterLFODepth, 'gain', f.lfoDepth);
        }
    }
    
    if (newParams.distortion && efx.distortion) {
        efx.distortion.distortion = updated.distortion.amount;
        setToneParam(efx.distortion, 'wet', updated.distortion.isActive ? updated.distortion.wet : 0);
    }

    if (newParams.bitCrusher && efx.bitCrusher) {
        const { bits, wet, isActive } = updated.bitCrusher;
        const effectiveWet = isActive ? wet : 0;
        setToneParam(efx.bitCrusher, 'bits', bits);
        if (efx.bitCrusherShaper) {
            const shapeOrder = Math.max(1, Math.min(50, Math.floor((17 - bits))));
            if (efx.bitCrusherShaper.order !== shapeOrder) efx.bitCrusherShaper.order = shapeOrder;
        }
        setToneParam(efx.bitCrusherWet, 'gain', effectiveWet);
        setToneParam(efx.bitCrusherDry, 'gain', 1 - effectiveWet);
    }

    if (newParams.compressor && efx.compressor) {
        const cmp = updated.compressor;
        if (cmp.isActive) {
            setToneParam(efx.compressor.threshold, 'value', cmp.threshold);
            setToneParam(efx.compressor.ratio, 'value', cmp.ratio);
            setToneParam(efx.compressor.attack, 'value', cmp.attack);
            setToneParam(efx.compressor.release, 'value', cmp.release);
        } else {
            setToneParam(efx.compressor.threshold, 'value', 0);
            setToneParam(efx.compressor.ratio, 'value', 1);
        }
    }

    if (workletNode.current) {
         workletNode.current.port.postMessage({ type: 'params', params: { grainSize: updated.grainSize, overlap: updated.overlap, playbackRate: updated.playbackRate, detune: updated.detune, glitch: updated.glitch, attack: updated.attack, release: updated.release } });
         if (newParams.bpm) {
             workletNode.current.port.postMessage({ type: 'sequencer', steps: sequencer.steps, stepCount: sequencer.stepCount, bpm: updated.bpm });
         }
    }
  }, [sequencer, setToneParam]);

  useEffect(() => {
      if (!workletNode.current) return;
      workletNode.current.port.postMessage({ type: 'sequencer', steps: sequencer.steps, stepCount: sequencer.stepCount, bpm: params.bpm });
  }, [sequencer.steps, sequencer.stepCount, sequencer.mode, params.bpm]);
  
  useEffect(() => {
      if (!workletNode.current) return;
      workletNode.current.port.postMessage({ type: 'slices', slices: slices });
  }, [slices]);

  const loadAudioFile = useCallback(async (audioFile: File | string, preserveSettings: boolean = false, nameOverride?: string, cloudId?: string) => {
    setIsLoading(true);
    if (previewPlayer.current) {
        previewPlayer.current.stop();
        setIsPreviewPlaying(false);
        setSliceLoopState({ index: null, isLooping: false });
    }
    
    try {
      const url = typeof audioFile === 'string' ? audioFile : URL.createObjectURL(audioFile);
      let filename = 'Default';
      if (nameOverride) filename = nameOverride;
      else if (audioFile instanceof File) filename = audioFile.name;
      else if (typeof audioFile === 'string') filename = audioFile.split('/').pop()?.split('?')[0] || 'Default';
      setSampleName(filename);
      setCurrentSampleId(cloudId || null); // Set cloud ID if present
      setCurrentPresetId(null); // Clear preset ID on new file load

      const buffer = new Tone.Buffer();
      await buffer.load(url);
      
      let rawBuffer = buffer.get();
      if (!rawBuffer) throw new Error("Audio Buffer failed to decode");
      
      rawBuffer = removeLeadingSilence(rawBuffer);
      const processedBuffer = new Tone.Buffer(rawBuffer);

      let currentSlices = slices;
      let currentSequencer = sequencer;

      if (!preserveSettings) {
          let detectedBpm = 0;
          if (filename.match(/(\d{2,3})\s*bpm/i)) detectedBpm = parseInt(filename.match(/(\d{2,3})\s*bpm/i)![1]);
          if (!detectedBpm) detectedBpm = await detectBPM(rawBuffer);

          const newSlices = generateTransientSlices(processedBuffer, detectedBpm || 120, 0, processedBuffer.duration);
          setSlices(newSlices);
          currentSlices = newSlices;
          setSelectedSliceIndex(0);

          setSequencer(prev => {
            const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
                ...step, sliceIndex: i % (newSlices.length || 1), ratchet: 1
            }));
            const newState = { ...prev, steps: newSteps, currentStep: -1 };
            currentSequencer = newState;
            return newState;
          });

          const resetParams: AllParams = { ...initialParams, bpm: detectedBpm || 120 };
          updateParams(resetParams);
      }

      setAudioBuffer(processedBuffer);
      
      if (previewPlayer.current) previewPlayer.current.buffer = processedBuffer;

      if (workletNode.current) {
          const nativeBuf = processedBuffer.get();
          if (nativeBuf && nativeBuf.numberOfChannels > 0) {
              const chan0 = nativeBuf.getChannelData(0);
              const chan1 = nativeBuf.numberOfChannels > 1 ? nativeBuf.getChannelData(1) : chan0;
              workletNode.current.port.postMessage({ type: 'load', bufferL: chan0, bufferR: chan1, sampleRate: processedBuffer.sampleRate });
              workletNode.current.port.postMessage({ type: 'slices', slices: currentSlices });
              workletNode.current.port.postMessage({ type: 'sequencer', steps: currentSequencer.steps, stepCount: currentSequencer.stepCount, bpm: paramsRef.current.bpm });
          }
      }

      if (isPlaying) {
        if (workletNode.current) workletNode.current.port.postMessage({ type: 'play', value: true });
        if (Tone.Transport.state !== 'started') Tone.Transport.start();
      }

    } catch (error: any) {
      alert("Failed to load audio file.");
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, updateParams, slices, sequencer]);


  const loadConstructionKit = useCallback(async (files: File[] | KitSample[], kitName: string) => {
      setIsLoading(true);
      if (previewPlayer.current) previewPlayer.current.stop();

      try {
          setSampleName(kitName);
          setCurrentSampleId(null); // Kits generate new composite audio
          setCurrentPresetId(null);
          
          const buffers: { buffer: any, name: string, type: SliceType }[] = [];
          
          for (const item of files) {
              const url = item instanceof File ? URL.createObjectURL(item) : item.url;
              const name = item instanceof File ? item.name : item.name;
              let type: SliceType = 'perc';
              if (!(item instanceof File) && item.type) type = item.type;
              else {
                  const lower = name.toLowerCase();
                  if (lower.includes('kick') || lower.includes('bd')) type = 'kick';
                  else if (lower.includes('snare') || lower.includes('sd')) type = 'snare';
                  else if (lower.includes('hat') || lower.includes('hh')) type = 'hihat';
              }

              try {
                  const buffer = new Tone.Buffer();
                  await buffer.load(url);
                  buffers.push({ buffer: buffer.get(), name, type });
              } catch (e) {}
          }

          if (buffers.length === 0) throw new Error("No audio files");

          const padding = 0.1; 
          const totalDuration = buffers.reduce((acc, b) => acc + b.buffer.duration + padding, 0);
          const sampleRate = Tone.context.sampleRate;
          const masterBuffer = Tone.context.createBuffer(1, Math.ceil(totalDuration * sampleRate), sampleRate);
          const channelData = masterBuffer.getChannelData(0);
          
          const newSlices: Slice[] = [];
          let currentOffset = 0;

          buffers.forEach((b, index) => {
              const bData = b.buffer.getChannelData(0);
              const startSample = Math.floor(currentOffset * sampleRate);
              for (let i = 0; i < bData.length; i++) {
                  if (startSample + i < channelData.length) channelData[startSample + i] = bData[i];
              }
              newSlices.push({
                  id: index, offset: currentOffset, duration: b.buffer.duration, isActive: true, type: b.type, level: 1.0,
              });
              currentOffset += b.buffer.duration + padding;
          });

          const finalToneBuffer = new Tone.Buffer(masterBuffer);
          setAudioBuffer(finalToneBuffer);
          setSlices(newSlices);
          setSelectedSliceIndex(0);

          let currentSequencer = sequencer;
          setSequencer(prev => {
              const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
                  ...step, active: i % 2 === 0, sliceIndex: i % newSlices.length, ratchet: 1
              }));
              const newState = { ...prev, steps: newSteps, currentStep: -1 };
              currentSequencer = newState;
              return newState;
          });

          const resetParams = { ...initialParams, bpm: 120 };
          updateParams(resetParams);
          
          if (previewPlayer.current) previewPlayer.current.buffer = finalToneBuffer;

          if (workletNode.current) {
            workletNode.current.port.postMessage({ type: 'load', bufferL: masterBuffer.getChannelData(0), bufferR: masterBuffer.getChannelData(0), sampleRate: sampleRate });
            workletNode.current.port.postMessage({ type: 'slices', slices: newSlices });
            workletNode.current.port.postMessage({ type: 'sequencer', steps: currentSequencer.steps, stepCount: currentSequencer.stepCount, bpm: 120 });
          }

      } catch (error: any) {
          alert(`Failed to load kit: ${error.message}.`);
      } finally {
          setIsLoading(false);
      }
  }, [updateParams, sequencer]);


  const togglePlay = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    if (!midiAccessRef.current && (navigator as any).requestMIDIAccess) {
        try { midiAccessRef.current = await (navigator as any).requestMIDIAccess({ sysex: false }); } catch (e) {}
    }
    await Tone.start();
    if (isPlaying) {
      if (workletNode.current) workletNode.current.port.postMessage({ type: 'play', value: false });
      if (midiAccessRef.current) {
          const outputs = midiAccessRef.current.outputs;
          outputs.forEach((o: any) => { try { o.send([0xFC]); } catch(e){} });
      }
      Tone.Transport.stop();
      setIsPlaying(false);
      if (sequencer.playbackBehavior === 'continue') {
          setSequencer(prev => ({ ...prev, isPlaying: false }));
      } else {
          setSequencer(prev => ({ ...prev, isPlaying: false, currentStep: -1 }));
      }
    } else {
      const shouldReset = sequencer.playbackBehavior === 'reset';
      if (workletNode.current) workletNode.current.port.postMessage({ type: 'play', value: true, reset: shouldReset });
      if (midiAccessRef.current) {
          const msg = sequencer.playbackBehavior === 'continue' ? 0xFB : 0xFA;
          const outputs = midiAccessRef.current.outputs;
          outputs.forEach((o: any) => { try { o.send([msg]); } catch(e){} });
      }
      if (shouldReset) Tone.Transport.position = 0;
      Tone.Transport.start();
      setIsPlaying(true);
      setSequencer(prev => ({ ...prev, isPlaying: true }));
    }
  }, [isPlaying, sequencer.playbackBehavior]);


  const togglePreviewOriginal = useCallback(() => {
      if (!previewPlayer.current || !previewPlayer.current.buffer.loaded) return;
      if (isPreviewPlaying) {
          previewPlayer.current.stop();
          setIsPreviewPlaying(false);
          setSliceLoopState({ index: null, isLooping: false });
      } else {
          setSliceLoopState({ index: null, isLooping: false });
          previewPlayer.current.loop = true;
          previewPlayer.current.loopStart = 0;
          previewPlayer.current.loopEnd = previewPlayer.current.buffer.duration;
          previewPlayer.current.start();
          setIsPreviewPlaying(true);
      }
  }, [isPreviewPlaying]);

  const playSliceRaw = useCallback((index: number) => {
      if (!previewPlayer.current || !slices[index]) return;
      previewPlayer.current.stop();
      setIsPreviewPlaying(false);
      setSliceLoopState({ index: null, isLooping: false });
      const s = slices[index];
      previewPlayer.current.loop = false;
      previewPlayer.current.start(Tone.now(), s.offset, s.duration);
  }, [slices]);

  const toggleSliceLoop = useCallback((index: number) => {
      if (!previewPlayer.current || !slices[index]) return;
      if (sliceLoopState.index === index && sliceLoopState.isLooping) {
          previewPlayer.current.stop();
          setSliceLoopState({ index: null, isLooping: false });
      } else {
          previewPlayer.current.stop();
          setIsPreviewPlaying(false);
          const s = slices[index];
          previewPlayer.current.loopStart = s.offset;
          previewPlayer.current.loopEnd = s.offset + s.duration;
          previewPlayer.current.loop = true;
          previewPlayer.current.start(Tone.now(), s.offset);
          setSliceLoopState({ index, isLooping: true });
      }
  }, [slices, sliceLoopState]);


  const sliceRegion = useCallback((start: number, end: number) => {
    if (!audioBuffer) return;
    const rawBuffer = audioBuffer.get();
    const newSlices = [{
            id: 0, offset: start, duration: end - start, isActive: true,
            type: classifySlice(rawBuffer, start, end - start), level: 1.0, reverse: false,
    }];
    setSlices(newSlices);
    setSelectedSliceIndex(0);
    setSequencer(prev => {
        const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
            ...step, sliceIndex: i % newSlices.length, ratchet: 1
        }));
        return { ...prev, steps: newSteps, currentStep: -1 };
    });
  }, [audioBuffer]);

  const autoSlice = useCallback(() => {
    if (!audioBuffer) return;
    const newSlices = generateTransientSlices(audioBuffer, params.bpm, 0, audioBuffer.duration);
    setSlices(newSlices);
    setSelectedSliceIndex(0);
    setSequencer(prev => {
        const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
            ...step, sliceIndex: i % (newSlices.length || 1), ratchet: 1
        }));
        return { ...prev, steps: newSteps, currentStep: -1 };
    });
  }, [audioBuffer, params.bpm]);

  const updateSlice = useCallback((index: number, changes: Partial<Slice>) => {
      setSlices(prev => {
          const newSlices = [...prev];
          newSlices[index] = { ...newSlices[index], ...changes };
          return newSlices;
      });
      if (sliceLoopState.index === index && sliceLoopState.isLooping && previewPlayer.current) {
          const s = { ...slices[index], ...changes };
          previewPlayer.current.loopStart = s.offset;
          previewPlayer.current.loopEnd = s.offset + s.duration;
      }
  }, [slices, sliceLoopState]);

  const generateAiBeat = useCallback((complexity: number) => {
      if (slices.length === 0) return;
      const getSlicesByType = (t: SliceType) => slices.map((s, i) => ({...s, originalIndex: i})).filter(s => s.type === t);
      const kicks = getSlicesByType('kick');
      const snares = getSlicesByType('snare');
      const hats = getSlicesByType('hihat');
      const percs = getSlicesByType('perc');
      
      const getRandomSliceIndex = (type: SliceType) => {
          let candidates = [];
          if (type === 'kick') candidates = kicks;
          else if (type === 'snare') candidates = snares;
          else if (type === 'hihat') candidates = hats;
          else candidates = percs;
          if (candidates.length === 0) candidates = slices.map((s, i) => ({...s, originalIndex: i}));
          const selection = candidates[Math.floor(Math.random() * candidates.length)];
          return selection ? selection.originalIndex : 0;
      };

      const steps = Array(sequencer.stepCount).fill(null).map((_, i) => ({ active: false, sliceIndex: 0, ratchet: 1 }));

      if (complexity <= 0.35) {
          const intense = complexity / 0.35; 
          for (let i = 0; i < steps.length; i+=4) steps[i] = { active: true, sliceIndex: getRandomSliceIndex('kick'), ratchet: 1 };
          steps[4] = { active: true, sliceIndex: getRandomSliceIndex('snare'), ratchet: 1 };
          steps[12] = { active: true, sliceIndex: getRandomSliceIndex('snare'), ratchet: 1 };
          for (let i = 2; i < steps.length; i+=4) { if (Math.random() < 0.8 + (intense * 0.2)) steps[i] = { active: true, sliceIndex: getRandomSliceIndex('hihat'), ratchet: 1 }; }
          for (let i = 0; i < steps.length; i++) { if (!steps[i].active && Math.random() < intense * 0.4) steps[i] = { active: true, sliceIndex: getRandomSliceIndex('perc'), ratchet: 1 }; }
      } else if (complexity <= 0.7) {
          const intense = (complexity - 0.35) / 0.35;
          steps[0] = { active: true, sliceIndex: getRandomSliceIndex('kick'), ratchet: 1 };
          if (Math.random() > 0.5) steps[10] = { active: true, sliceIndex: getRandomSliceIndex('kick'), ratchet: 1 }; else steps[7] = { active: true, sliceIndex: getRandomSliceIndex('kick'), ratchet: 1 };
          if (Math.random() < intense) steps[14] = { active: true, sliceIndex: getRandomSliceIndex('kick'), ratchet: 1 };
          steps[4] = { active: true, sliceIndex: getRandomSliceIndex('snare'), ratchet: 1 };
          steps[12] = { active: true, sliceIndex: getRandomSliceIndex('snare'), ratchet: 1 };
          if (Math.random() < 0.3 + (intense * 0.3)) steps[15] = { active: true, sliceIndex: getRandomSliceIndex('snare'), ratchet: 1 };
          for (let i = 0; i < steps.length; i+=2) { if (!steps[i].active || (steps[i].active && i % 4 !== 0)) steps[i] = { active: true, sliceIndex: getRandomSliceIndex('hihat'), ratchet: 1 }; }
          for (let i = 0; i < steps.length; i++) { if (!steps[i].active && Math.random() < intense * 0.3) steps[i] = { active: true, sliceIndex: getRandomSliceIndex('perc'), ratchet: Math.random() > 0.7 ? 2 : 1 }; }
      } else {
          const intense = (complexity - 0.7) / 0.3;
          for (let i = 0; i < steps.length; i++) {
              if (Math.random() < 0.6 + (intense * 0.4)) {
                  const r = Math.random();
                  let type: SliceType = 'perc';
                  if (r < 0.2) type = 'kick'; else if (r < 0.4) type = 'snare'; else if (r < 0.7) type = 'hihat';
                  let ratchet = 1;
                  if (Math.random() < 0.3 + (intense * 0.5)) ratchet = Math.floor(Math.random() * 3) + 2;
                  steps[i] = { active: true, sliceIndex: getRandomSliceIndex(type), ratchet };
              }
          }
          if (!steps[0].active) steps[0] = { active: true, sliceIndex: getRandomSliceIndex('kick'), ratchet: 1 };
          if (!steps[4].active) steps[4] = { active: true, sliceIndex: getRandomSliceIndex('snare'), ratchet: 1 };
      }
      setSequencer(prev => ({ ...prev, steps }));
  }, [slices, sequencer.stepCount]);

  const exportPreset = useCallback(async (name: string): Promise<string> => {
      // Ensure strict separation of data to prevent circular reference errors during JSON.stringify
      const cleanParams = JSON.parse(JSON.stringify(params));
      
      const preset: Preset = {
          id: crypto.randomUUID(),
          name, date: Date.now(), 
          params: cleanParams,
          sequencer: { steps: sequencer.steps, stepCount: sequencer.stepCount, mode: sequencer.mode },
          slices, sampleName,
      };
      return JSON.stringify(preset);
  }, [params, sequencer, slices, sampleName]);
  
  const getAudioWav = useCallback(async (): Promise<Blob | null> => {
      if (!audioBuffer) return null;
      const secondsPerBeat = 60 / params.bpm;
      const totalBeats = sequencer.stepCount / 4;
      const cycleDuration = totalBeats * secondsPerBeat;
      const renderDuration = cycleDuration * 2; 

      const toneBufferObj = audioBuffer; 
      const originalBuffer = toneBufferObj.get ? toneBufferObj.get() : toneBufferObj;
      const channels = originalBuffer.numberOfChannels;
      const sampleRate = originalBuffer.sampleRate;
      const chan0 = originalBuffer.getChannelData(0);
      const chan1 = channels > 1 ? originalBuffer.getChannelData(1) : chan0;

      const renderedBuffer = await Tone.Offline(async (toneCtx: any) => {
          let nativeCtx = toneCtx;
          if (nativeCtx && typeof nativeCtx.rawContext !== 'undefined') nativeCtx = nativeCtx.rawContext;
          else if (nativeCtx && typeof nativeCtx._context !== 'undefined') nativeCtx = nativeCtx._context;

          if (!nativeCtx.audioWorklet) {
              console.error("AudioWorklet missing in OfflineContext");
          }

          const blob = new Blob([GRANULAR_WORKLET_CODE], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          try { await nativeCtx.audioWorklet.addModule(workletUrl); } catch(e) {}

          const workletNode = new AudioWorkletNode(nativeCtx, 'granular-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
          const gain = new Tone.Gain({ context: toneCtx, gain: 1 }).toDestination();
          const reverb = new Tone.Reverb({ decay: params.reverb.decay, context: toneCtx });
          reverb.wet.value = 1; 
          await reverb.generate(); 

          const reverbLP = new Tone.Filter({ frequency: 3000, type: "lowpass", rolloff: -12, context: toneCtx });
          const reverbHP = new Tone.Filter({ frequency: 500, type: "highpass", rolloff: -12, context: toneCtx });
          const dryGain = new Tone.Gain({ gain: 1, context: toneCtx }).connect(gain);
          const reverbGain = new Tone.Gain({ gain: 0, context: toneCtx }).connect(gain);
          reverb.connect(reverbLP); reverbLP.connect(reverbHP); reverbHP.connect(reverbGain);

          const delay = new Tone.FeedbackDelay({ delayTime: params.delay.delayTime, feedback: params.delay.feedback, wet: params.delay.wet, context: toneCtx });
          delay.connect(dryGain); delay.connect(reverb);

          const filter = new Tone.Filter({ frequency: params.filter.frequency, Q: params.filter.q, type: params.filter.type, context: toneCtx });
          const dcBlocker = new Tone.Filter({ frequency: 10, type: 'highpass', rolloff: -24, context: toneCtx }).connect(delay);
          filter.connect(dcBlocker);

          const filterFollower = new Tone.Follower({ smoothing: 0.05, context: toneCtx }); 
          const filterEnvDepth = new Tone.Gain({ gain: 0, context: toneCtx });
          filterFollower.connect(filterEnvDepth); filterEnvDepth.connect(filter.frequency);

          const bitCrusher = new Tone.BitCrusher({ bits: 4, context: toneCtx });
          bitCrusher.wet.value = 1;
          const bitCrusherShaper = new Tone.Chebyshev({ order: 1, context: toneCtx });
          bitCrusherShaper.wet.value = 1;
          const bitCrusherWet = new Tone.Gain({ gain: 0, context: toneCtx });
          const bitCrusherDry = new Tone.Gain({ gain: 1, context: toneCtx });
          bitCrusher.connect(bitCrusherShaper); bitCrusherShaper.connect(bitCrusherWet);
          bitCrusherWet.connect(filter); bitCrusherWet.connect(filterFollower);
          bitCrusherDry.connect(filter); bitCrusherDry.connect(filterFollower);

          const distortion = new Tone.Distortion({ distortion: params.distortion.amount, context: toneCtx });
          distortion.wet.value = params.distortion.wet;
          distortion.connect(bitCrusher); distortion.connect(bitCrusherDry); 

          const compressor = new Tone.Compressor({ threshold: params.compressor.threshold, ratio: params.compressor.ratio, attack: params.compressor.attack, release: params.compressor.release, context: toneCtx }).connect(distortion);

          if (Tone.connect) Tone.connect(workletNode, compressor); else workletNode.connect(compressor);

          const revMix = params.reverb.isActive ? params.reverb.wet : 0;
          dryGain.gain.value = 1 - revMix; reverbGain.gain.value = revMix;
          if (params.filter.isActive) filterEnvDepth.gain.value = params.filter.envDepth;
          else filter.frequency.value = params.filter.type === 'lowpass' ? 20000 : 0;

          if (params.bitCrusher.isActive) {
              bitCrusher.bits.value = params.bitCrusher.bits;
              const shapeOrder = Math.max(1, Math.min(50, Math.floor((17 - params.bitCrusher.bits))));
              bitCrusherShaper.order = shapeOrder;
              bitCrusherWet.gain.value = params.bitCrusher.wet;
              bitCrusherDry.gain.value = 1 - params.bitCrusher.wet;
          }

          const cleanParams = JSON.parse(JSON.stringify({ 
              grainSize: params.grainSize, 
              overlap: params.overlap, 
              playbackRate: params.playbackRate, 
              detune: params.detune, 
              glitch: params.glitch,
              attack: params.attack, 
              release: params.release
          }));

          workletNode.port.postMessage({ type: 'load', bufferL: chan0, bufferR: chan1, sampleRate: sampleRate });
          workletNode.port.postMessage({ type: 'params', params: cleanParams });
          workletNode.port.postMessage({ type: 'sequencer', steps: sequencer.steps, stepCount: sequencer.stepCount, bpm: params.bpm });
          workletNode.port.postMessage({ type: 'slices', slices: slices });
          workletNode.port.postMessage({ type: 'play', value: true });

      }, renderDuration);

      const finalBuffer = renderedBuffer.get ? renderedBuffer.get() : renderedBuffer;
      return audioBufferToWav(finalBuffer);
  }, [audioBuffer, params, sequencer, slices]);

  // NEW: Get Source Audio (Raw)
  const getSourceAudio = useCallback(async (): Promise<Blob | null> => {
      if (!audioBuffer) return null;
      // Handle Tone wrapper
      const rawBuffer = audioBuffer.get ? audioBuffer.get() : audioBuffer;
      return audioBufferToWav(rawBuffer);
  }, [audioBuffer]);

  const loadPreset = useCallback(async (preset: Preset) => {
      const mergedParams = { ...initialParams, ...preset.params };
      paramsRef.current = mergedParams;
      
      // Update ID logic
      let loadedId = null;

      if (preset.audioData) {
          const blob = base64ToBlob(preset.audioData);
          await loadAudioFile(URL.createObjectURL(blob), true);
      } else if (preset.sampleUrl) {
          if (preset.sampleId) loadedId = preset.sampleId;
          await loadAudioFile(preset.sampleUrl, true, preset.sampleName, loadedId || undefined);
      }
      
      setParams(mergedParams);
      if (preset.slices && preset.slices.length > 0) setSlices(preset.slices);
      const seqData = preset.sequencer || { steps: [], stepCount: 16, mode: 'forward' };
      setSequencer(prev => ({
          ...prev,
          steps: seqData.steps || [],
          stepCount: seqData.stepCount || 16,
          mode: seqData.mode || 'forward',
          currentStep: -1
      }));
      setSampleName(preset.sampleName || 'Imported Preset');
      // Use the actual preset ID from the DB if available, otherwise it's just a local/imported one without a cloud ID
      if (preset.id && !preset.id.startsWith('fp_') && !preset.audioData) { // Assuming factory presets start with fp_ or shouldn't be overwritten
           setCurrentPresetId(preset.id);
      } else {
           setCurrentPresetId(null);
      }

      updateParams(mergedParams);
  }, [loadAudioFile, updateParams]);

  const importPreset = useCallback(async (jsonString: string) => {
      try {
          const preset: Preset = JSON.parse(jsonString);
          await loadPreset(preset);
      } catch (e) {
          alert("Failed to import preset.");
      }
  }, [loadPreset]);

  // State Setters
  const updateSequencerStep = useCallback((idx: number, chg: Partial<SequencerStep>) => {
      setSequencer(p => { 
          const s = [...p.steps]; 
          s[idx] = {...s[idx], ...chg}; 
          return {...p, steps: s}
      });
  }, []);
  const setSequencerMode = useCallback((m: SequencerMode) => setSequencer(p => ({...p, mode: m})), []);
  const setSequencerStepCount = useCallback((c: 8 | 16 | 32) => {
      setSequencer(p => {
        let newSteps = [...p.steps];
        if (c > newSteps.length) newSteps = [...newSteps, ...Array(c - newSteps.length).fill(0).map((_,i) => ({active:false, sliceIndex:0, ratchet: 1}))];
        else newSteps = newSteps.slice(0, c);
        return {...p, stepCount: c, steps: newSteps};
    });
  }, []);
  const setSequencerEditMode = useCallback((m: 'trigger' | 'ratchet') => setSequencer(p => ({...p, editMode: m})), []);
  const setSequencerPlaybackBehavior = useCallback((b: 'reset' | 'continue') => setSequencer(p => ({...p, playbackBehavior: b})), []);
  
  const randomizePattern = useCallback(() => generateAiBeat(Math.random()), [generateAiBeat]);
  const selectSlice = useCallback((index: number) => setSelectedSliceIndex(index), []);
  const toggleSliceActive = useCallback((index: number) => updateSlice(index, { isActive: !slices[index].isActive }), [slices, updateSlice]);
  const scrub = useCallback((time: number) => {
      if (previewPlayer.current && previewPlayer.current.buffer.loaded) {
          if (previewPlayer.current.state !== 'started') {
              previewPlayer.current.start(Tone.now(), time, 0.1);
          }
      }
  }, []);

  return {
    isReady, isPlaying, isLoading, audioBuffer, params, sequencer, slices, selectedSliceIndex, sampleName, currentSampleId, currentPresetId,
    loadAudioFile, loadConstructionKit, togglePlay, updateParams, scrub,
    updateSequencerStep, setSequencerMode, setSequencerStepCount, setSequencerEditMode, setSequencerPlaybackBehavior,
    randomizePattern, generateAiBeat, selectSlice, toggleSliceActive, updateSlice, sliceRegion, autoSlice,
    exportPreset, importPreset, loadPreset, getAudioWav, getSourceAudio,
    togglePreviewOriginal, isPreviewPlaying, playSliceRaw, toggleSliceLoop, sliceLoopState
  };
};
