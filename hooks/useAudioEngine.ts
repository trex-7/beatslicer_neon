
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AllParams, Slice, SequencerState, SequencerMode, SequencerStep, SliceType, Preset, KitSample } from '../types';
import { detectBPM } from '../utils/bpmDetector';
import { classifySlice } from '../utils/audioAnalysis';
import { audioBufferToWav, blobToBase64, base64ToBlob } from '../utils/audioHelpers';
import { removeLeadingSilence, generateTransientSlices } from '../utils/transientDetection';

declare const Tone: any;

// Helper for BitCrusher Curve (Staircase function)
const createBitCrusherCurve = (bits: number) => {
    const steps = Math.pow(2, bits); 
    const length = 4096;
    const curve = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        // Normalized input -1 to 1
        const x = (i / (length - 1)) * 2 - 1; 
        // Quantize to steps
        curve[i] = Math.round(x * steps) / steps;
    }
    return curve;
};

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
                glitch: { chaos: 0, allowReverse: false, allowOctaveJump: false, pitchShift: true, allowFormant: false, allowRatchet: false }
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
                isReverse: slice.reverse || false,
                pan: 0.5
            };
            
            const g = this.params.glitch;
            
            // --- CHAOS ENGINE ---
            if (g && g.chaos > 0) {
                 // Check if glitch should trigger this grain
                 if (Math.random() < g.chaos) {
                     
                     // 1. REVERSE
                     if (g.allowReverse && Math.random() < 0.5) grain.isReverse = !grain.isReverse;
                     
                     // 2. OCTAVE JUMP / PITCH SCRAMBLE
                     if (g.allowOctaveJump && Math.random() < 0.6) {
                         const multipliers = [0.5, 2.0, 4.0, 0.25];
                         grain.speed *= multipliers[Math.floor(Math.random() * multipliers.length)];
                     }

                     // 3. TIME JITTER (Smearing)
                     // Shift start position slightly for phasing/humanize/glitch artifacts
                     // Jitter up to 100ms based on chaos
                     const jitterMax = 0.1 * this.sampleRate;
                     const jitter = (Math.random() - 0.5) * jitterMax * g.chaos;
                     grain.position += jitter;
                     // Wrap position safely? usually fine if handled in process loop
                     
                     // 4. PAN JITTER
                     // Spread grains across stereo field
                     grain.pan = Math.max(0, Math.min(1, 0.5 + (Math.random() - 0.5) * g.chaos * 1.5));
                 }
                 
                 // 5. FORMANT / TEXTURE SCRAMBLE
                 // Modulate grain duration independently of playback speed
                 // This creates robotic or stretched textures without changing pitch
                 if (g.allowFormant) {
                     // Factor 0.2x to 3.0x
                     const warp = 1.0 + (Math.random() * 2.0 - 1.0) * g.chaos; 
                     grain.duration *= Math.max(0.2, warp);
                 }
            }
            
            const detuneMult = Math.pow(2, this.params.detune / 1200);
            grain.speed *= detuneMult;
            
            // Duration Logic
            if (this.params.grainSize < 0.15) {
                 // Texture Mode overrides slice duration
                 grain.duration = this.params.grainSize * this.sampleRate;
            } else {
                 // Slice Mode uses slice duration
                 grain.duration = slice.duration * this.sampleRate;
                 if (ratchetCount > 1) {
                     grain.duration /= ratchetCount;
                 }
            }
            
            // Apply Overlap (Extend Duration)
            if (this.params.overlap > 0) {
                grain.duration += (this.params.overlap * this.sampleRate);
            }
            
            // Enveloping
            const effectiveAttack = (typeof slice.fadeIn === 'number') ? slice.fadeIn : this.params.attack;
            let effectiveRelease = (typeof slice.fadeOut === 'number') ? slice.fadeOut : this.params.release;

            if (this.params.overlap > effectiveRelease) {
                effectiveRelease = this.params.overlap;
            }

            const attackS = Math.max(0.001, effectiveAttack || 0.002);
            const releaseS = Math.max(0.001, effectiveRelease || 0.005);
            
            grain.attack = attackS * this.sampleRate;
            grain.release = releaseS * this.sampleRate;
            
            if (grain.duration < grain.attack + grain.release) {
                grain.duration = grain.attack + grain.release + 500;
            }
            
            // Find slot
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
                        // Support mono buffers by duplicating channel 0 if channel 1 is missing
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
                        
                        // Apply Pan (Square root for constant power approximation)
                        const panL = Math.sqrt(1.0 - grain.pan);
                        const panR = Math.sqrt(grain.pan);

                        left += sampL * env * grain.amp * panL;
                        right += sampR * env * grain.amp * panR;
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
  grainSize: 0.06,  
  overlap: 0.03,    
  detune: 0,
  playbackRate: 1,
  bpm: 120,
  attack: 0.002,    
  release: 0.1,     
  sustain: 0.5,     
  reverb: { isActive: false, decay: 1.5, wet: 0, isSynced: false, syncValue: '2n', lowCut: 20, highCut: 20000 },
  delay: { isActive: false, delayTime: 0.375, feedback: 0.2, wet: 0, isSynced: true, syncValue: '8n', lowCut: 20, highCut: 20000 },
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
  distortion: { isActive: false, amount: 1.0, wet: 0.04 }, 
  compressor: { isActive: true, threshold: -24, ratio: 4, attack: 0.01, release: 0.1 },
  bitCrusher: { isActive: false, bits: 4, wet: 1.0 },
  glitch: { 
      chaos: 0, 
      allowReverse: false, 
      allowOctaveJump: true, 
      allowRatchet: true, 
      pitchShift: true, 
      allowFormant: true 
  },
  order: ['compressor', 'distortion', 'bitCrusher', 'filter', 'delay', 'reverb']
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
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null); 
  
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
    // Standard Node References for Params
    reverb: null as any,
    delay: null as any,
    filter: null as any,
    distortion: null as any,
    compressor: null as any,
    bitCrusher: null as any, // WaveShaper
    
    // Auxiliary Control Nodes
    filterFollower: null as any,
    filterLFO: null as any,
    filterEnvDepth: null as any,
    filterLFODepth: null as any,
    
    // Master Limiter
    limiter: null as any,
    
    // Entry Input Gain (Bridge from Native Worklet)
    inputGain: null as any,
    
    // Explicit Native Bridge Gain (AudioContext -> Tone)
    nativeBridgeGain: null as any,

    // Modular Routing
    // Each module is { input: Gain, output: Gain }
    modules: {} as Record<string, { input: any, output: any }>
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

  // --- CHAIN RECONNECTION LOGIC ---
  const reconnectEffectChain = useCallback(() => {
      const { modules, limiter, inputGain } = effects.current;
      const order = paramsRef.current.order;
      
      if (!inputGain || !limiter) return;

      // 1. Disconnect dynamic chain starting from inputGain
      try { inputGain.disconnect(); } catch(e) {}
      
      Object.values(modules).forEach(mod => {
          try { mod.output.disconnect(); } catch(e) {}
      });

      // 2. Build Chain (Tone->Tone)
      let currentSource = inputGain;

      order.forEach((effectName) => {
          const mod = modules[effectName];
          if (mod) {
              if (currentSource) {
                  currentSource.connect(mod.input);
                  currentSource = mod.output;
              }
          }
      });

      // 3. Connect End to Limiter -> Destination
      if (currentSource) {
          currentSource.connect(limiter);
      }
  }, []);

  useEffect(() => { sequencerRef.current = sequencer; }, [sequencer]);
  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { slicesRef.current = slices; }, [slices]);

  // Sync Sequencer to Worklet
  useEffect(() => {
      if (workletNode.current) {
          workletNode.current.port.postMessage({ 
              type: 'sequencer', 
              steps: sequencer.steps, 
              stepCount: sequencer.stepCount, 
              bpm: params.bpm 
          });
      }
  }, [sequencer.steps, sequencer.stepCount, params.bpm]);

  // Sync Slices to Worklet
  useEffect(() => {
      if (workletNode.current) {
          workletNode.current.port.postMessage({ 
              type: 'slices', 
              slices: slices 
          });
      }
  }, [slices]);

  // --- SETUP AUDIO ---
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
            // Init messages
            workletNode.current.port.postMessage({ type: 'sequencer', steps: sequencerRef.current.steps, stepCount: sequencerRef.current.stepCount, bpm: paramsRef.current.bpm });
            workletNode.current.port.postMessage({ type: 'params', params: { grainSize: paramsRef.current.grainSize, overlap: paramsRef.current.overlap, playbackRate: paramsRef.current.playbackRate, detune: paramsRef.current.detune, glitch: paramsRef.current.glitch, attack: paramsRef.current.attack, release: paramsRef.current.release } });
            workletNode.current.port.postMessage({ type: 'slices', slices: slicesRef.current });

            // Create Native Bridge Gain to safely interface with Tone.js
            effects.current.nativeBridgeGain = targetContext.createGain();
            workletNode.current.connect(effects.current.nativeBridgeGain);

            // Create Tone Input Buffer 
            effects.current.inputGain = new Tone.Gain(1);
            
            // Bridge Native -> Tone using Tone.connect on the NATIVE node
            Tone.connect(effects.current.nativeBridgeGain, effects.current.inputGain);

          } catch(e) {
              console.error("Failed to create AudioWorkletNode", e);
              return;
          }

          previewPlayer.current = new Tone.Player().toDestination();
          
          // --- EFFECT MODULE INSTANTIATION ---
          const createModule = () => ({ input: new Tone.Gain(1), output: new Tone.Gain(1) });
          
          const mods = {
              compressor: createModule(),
              distortion: createModule(),
              bitCrusher: createModule(),
              filter: createModule(),
              delay: createModule(),
              reverb: createModule()
          };
          effects.current.modules = mods;

          // 1. Reverb (Manual Wet/Dry with Filter)
          effects.current.reverb = new Tone.Reverb({ decay: params.reverb.decay });
          effects.current.reverb.wet.value = 1; 
          effects.current.reverb.generate().catch((e: any) => console.warn("Reverb gen", e));
          
          const revLP = new Tone.Filter(params.reverb.highCut, "lowpass", -12);
          const revHP = new Tone.Filter(params.reverb.lowCut, "highpass", -12);
          const revWetGain = new Tone.Gain(0); 
          const revDryGain = new Tone.Gain(1); 
          
          mods.reverb.input.connect(revDryGain);
          mods.reverb.input.connect(effects.current.reverb);
          effects.current.reverb.connect(revLP);
          revLP.connect(revHP);
          revHP.connect(revWetGain);
          revWetGain.connect(mods.reverb.output);
          revDryGain.connect(mods.reverb.output);
          
          (effects.current as any).reverbWetGain = revWetGain;
          (effects.current as any).reverbDryGain = revDryGain;
          (effects.current as any).revLP = revLP;
          (effects.current as any).revHP = revHP;

          // 2. Delay (Manual Wet/Dry with Filter)
          effects.current.delay = new Tone.FeedbackDelay({ 
              delayTime: params.delay.delayTime, 
              feedback: params.delay.feedback, 
              wet: 1 // Force 100% wet for manual mixing
          });
          
          const delLP = new Tone.Filter(params.delay.highCut, "lowpass", -12);
          const delHP = new Tone.Filter(params.delay.lowCut, "highpass", -12);
          const delWetGain = new Tone.Gain(0);
          const delDryGain = new Tone.Gain(1);

          mods.delay.input.connect(delDryGain);
          mods.delay.input.connect(effects.current.delay);
          effects.current.delay.connect(delLP);
          delLP.connect(delHP);
          delHP.connect(delWetGain);
          delWetGain.connect(mods.delay.output);
          delDryGain.connect(mods.delay.output);

          (effects.current as any).delayWetGain = delWetGain;
          (effects.current as any).delayDryGain = delDryGain;
          (effects.current as any).delayLP = delLP;
          (effects.current as any).delayHP = delHP;

          // 3. Filter
          effects.current.filter = new Tone.Filter({ frequency: params.filter.frequency, Q: params.filter.q, type: params.filter.type });
          const filterMakeup = new Tone.Gain(1);
          const dcBlocker = new Tone.Filter({ frequency: 10, type: 'highpass', rolloff: -24 });
          
          effects.current.filterFollower = new Tone.Follower(0.02);
          effects.current.filterEnvDepth = new Tone.Gain(0);
          effects.current.filterLFO = new Tone.LFO(1, -1, 1).start();
          effects.current.filterLFODepth = new Tone.Gain(0);
          
          mods.filter.input.connect(effects.current.filter);
          mods.filter.input.connect(effects.current.filterFollower);
          
          effects.current.filter.connect(filterMakeup);
          filterMakeup.connect(dcBlocker);
          dcBlocker.connect(mods.filter.output);
          
          effects.current.filterFollower.connect(effects.current.filterEnvDepth);
          effects.current.filterEnvDepth.connect(effects.current.filter.frequency);
          effects.current.filterLFO.connect(effects.current.filterLFODepth);
          effects.current.filterLFODepth.connect(effects.current.filter.frequency);
          (effects.current as any).filterMakeup = filterMakeup;

          // 4. BitCrusher
          effects.current.bitCrusher = new Tone.WaveShaper(createBitCrusherCurve(4));
          const bcWet = new Tone.Gain(0);
          const bcDry = new Tone.Gain(1);
          
          mods.bitCrusher.input.connect(bcDry);
          mods.bitCrusher.input.connect(effects.current.bitCrusher);
          effects.current.bitCrusher.connect(bcWet);
          bcWet.connect(mods.bitCrusher.output);
          bcDry.connect(mods.bitCrusher.output);
          
          (effects.current as any).bitCrusherWet = bcWet;
          (effects.current as any).bitCrusherDry = bcDry;

          // 5. Distortion
          effects.current.distortion = new Tone.Distortion(params.distortion.amount);
          effects.current.distortion.wet.value = params.distortion.wet;
          mods.distortion.input.connect(effects.current.distortion);
          effects.current.distortion.connect(mods.distortion.output);

          // 6. Compressor
          effects.current.compressor = new Tone.Compressor({ threshold: params.compressor.threshold, ratio: params.compressor.ratio, attack: params.compressor.attack, release: params.compressor.release });
          mods.compressor.input.connect(effects.current.compressor);
          effects.current.compressor.connect(mods.compressor.output);

          // 7. Master Limiter
          effects.current.limiter = new Tone.Limiter(0).toDestination();

          // Connect Chain
          reconnectEffectChain();

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
      if (effects.current.modules) {
          Object.values(effects.current.modules).forEach(m => {
              m.input.dispose();
              m.output.dispose();
          });
      }
      Object.values(effects.current).forEach((effect: any) => {
          if (effect && effect.dispose) effect.dispose();
      });
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {});
    };
  }, [reconnectEffectChain]);

  // Update Params
  const updateParams = useCallback((newParams: Partial<AllParams>) => {
    const prevOrder = paramsRef.current.order;
    const updated = { ...paramsRef.current, ...newParams };
    paramsRef.current = updated;
    setParams(updated);
    const efx = effects.current;

    if (newParams.order && JSON.stringify(newParams.order) !== JSON.stringify(prevOrder)) {
        reconnectEffectChain();
    }

    if (newParams.bpm !== undefined) Tone.Transport.bpm.value = updated.bpm;
    
    if (efx.reverb && newParams.reverb) {
        const rev = updated.reverb;
        let decay = rev.decay;
        if (rev.isSynced) {
            try { decay = Tone.Time(rev.syncValue).toSeconds(); } catch(e) {}
        }
        efx.reverb.decay = Math.max(0.1, Math.min(decay, 10));
        const mix = rev.isActive ? rev.wet : 0;
        if ((efx as any).reverbDryGain) setToneParam((efx as any).reverbDryGain, 'gain', 1 - mix, 0.1);
        if ((efx as any).reverbWetGain) setToneParam((efx as any).reverbWetGain, 'gain', mix, 0.1);
        
        if ((efx as any).revLP) setToneParam((efx as any).revLP, 'frequency', rev.highCut);
        if ((efx as any).revHP) setToneParam((efx as any).revHP, 'frequency', rev.lowCut);
    }
    
    if (efx.delay && newParams.delay) {
        const del = updated.delay;
        if (del.isSynced) setToneParam(efx.delay, 'delayTime', Tone.Time(del.syncValue).toSeconds());
        else setToneParam(efx.delay, 'delayTime', del.delayTime);
        setToneParam(efx.delay, 'feedback', del.feedback);
        
        // Manual Delay Wet/Dry
        const mix = del.isActive ? del.wet : 0;
        if ((efx as any).delayDryGain) setToneParam((efx as any).delayDryGain, 'gain', 1 - mix, 0.1);
        if ((efx as any).delayWetGain) setToneParam((efx as any).delayWetGain, 'gain', mix, 0.1);
        
        if ((efx as any).delayLP) setToneParam((efx as any).delayLP, 'frequency', del.highCut);
        if ((efx as any).delayHP) setToneParam((efx as any).delayHP, 'frequency', del.lowCut);
    }

    if (newParams.filter && efx.filter) {
        const f = updated.filter;
        
        if (efx.filterLFO) efx.filterLFO.frequency.value = f.isSynced ? Tone.Time(f.syncValue).toSeconds() : f.lfoRate; 
        
        if (!f.isActive) {
            efx.filter.type = 'lowpass';
            setToneParam(efx.filter, 'frequency', 20000);
            setToneParam(efx.filter, 'Q', 0.1);
            setToneParam(efx.filterEnvDepth, 'gain', 0);
            setToneParam(efx.filterLFODepth, 'gain', 0);
            if ((efx as any).filterMakeup) setToneParam((efx as any).filterMakeup, 'gain', 1, 0.1);
        } else {
            efx.filter.type = f.type;
            const safeFreq = Math.max(10, Math.min(20000, f.frequency));
            setToneParam(efx.filter, 'frequency', safeFreq);
            setToneParam(efx.filter, 'Q', f.q);
            setToneParam(efx.filterEnvDepth, 'gain', f.envDepth);
            setToneParam(efx.filterLFODepth, 'gain', f.lfoDepth);
            
            let makeup = 1.0;
            if (f.type === 'bandpass') {
                makeup = 1.0 + (f.q * 0.2); 
            }
            if (makeup > 4.0) makeup = 4.0;
            if ((efx as any).filterMakeup) setToneParam((efx as any).filterMakeup, 'gain', makeup, 0.1);
        }
    }
    
    if (newParams.distortion && efx.distortion) {
        efx.distortion.distortion = updated.distortion.amount;
        setToneParam(efx.distortion, 'wet', updated.distortion.isActive ? updated.distortion.wet : 0);
    }

    if (newParams.bitCrusher && efx.bitCrusher) {
        const { bits, wet, isActive } = updated.bitCrusher;
        const effectiveWet = isActive ? wet : 0;
        
        if (newParams.bitCrusher.bits !== undefined && efx.bitCrusher.curve) {
             efx.bitCrusher.curve = createBitCrusherCurve(bits);
        }

        if ((efx as any).bitCrusherWet) setToneParam((efx as any).bitCrusherWet, 'gain', effectiveWet);
        if ((efx as any).bitCrusherDry) setToneParam((efx as any).bitCrusherDry, 'gain', 1 - effectiveWet);
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
             workletNode.current.port.postMessage({ type: 'sequencer', steps: sequencerRef.current.steps, stepCount: sequencerRef.current.stepCount, bpm: updated.bpm });
         }
    }
  }, [setToneParam, reconnectEffectChain]);

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
      setCurrentSampleId(cloudId || null); 
      setCurrentPresetId(null); 

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
          setCurrentSampleId(null);
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

  const loadPreset = useCallback(async (preset: Preset) => {
      setIsLoading(true);
      try {
          if (preset.params) updateParams(preset.params);
          if (preset.sequencer) setSequencer(prev => ({ ...prev, ...preset.sequencer }));
          if (preset.slices && preset.slices.length > 0) setSlices(preset.slices);
          if (preset.sampleName) setSampleName(preset.sampleName);
          if (preset.sampleId) setCurrentSampleId(preset.sampleId);
          if (preset.id) setCurrentPresetId(preset.id);

          if (preset.sampleUrl) {
              if (previewPlayer.current) {
                  previewPlayer.current.stop();
                  setIsPreviewPlaying(false);
                  setSliceLoopState({ index: null, isLooping: false });
              }

              const buffer = new Tone.Buffer();
              await buffer.load(preset.sampleUrl);
              
              let rawBuffer = buffer.get();
              if (!rawBuffer) throw new Error("Audio Buffer failed to decode");
              
              rawBuffer = removeLeadingSilence(rawBuffer);
              const processedBuffer = new Tone.Buffer(rawBuffer);
              
              setAudioBuffer(processedBuffer);
              if (previewPlayer.current) previewPlayer.current.buffer = processedBuffer;

              if (workletNode.current) {
                  const nativeBuf = processedBuffer.get();
                  if (nativeBuf && nativeBuf.numberOfChannels > 0) {
                      const chan0 = nativeBuf.getChannelData(0);
                      const chan1 = nativeBuf.numberOfChannels > 1 ? nativeBuf.getChannelData(1) : chan0;
                      workletNode.current.port.postMessage({ type: 'load', bufferL: chan0, bufferR: chan1, sampleRate: processedBuffer.sampleRate });
                      if (preset.slices) workletNode.current.port.postMessage({ type: 'slices', slices: preset.slices });
                  }
              }
          }
      } catch (e) {
          console.error("Preset Load Error:", e);
          alert("Failed to load preset audio data.");
      } finally {
          setIsLoading(false);
      }
  }, [updateParams]);

  // Standard Functions (Toggle, Scrub, Slice Management)
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

  const addSlice = useCallback((start: number, end: number) => {
    if (!audioBuffer) return;
    const rawBuffer = audioBuffer.get();
    const nextId = slices.length > 0 ? Math.max(...slices.map(s => s.id)) + 1 : 0;
    const newSlice: Slice = {
        id: nextId, offset: start, duration: end - start, isActive: true,
        type: classifySlice(rawBuffer, start, end - start), level: 1.0, reverse: false,
    };
    setSlices(prev => [...prev, newSlice]);
    setSelectedSliceIndex(slices.length);
  }, [audioBuffer, slices]);

  const sliceRegion = useCallback((start: number, end: number) => addSlice(start, end), [addSlice]);

  const scrub = useCallback((position: number) => {
      if (!audioBuffer) return;
      const time = position * audioBuffer.duration;
      if (previewPlayer.current && !isPlaying) {
          previewPlayer.current.start(Tone.now(), time, 0.1);
      }
  }, [audioBuffer, isPlaying]);

  const updateSequencerStep = useCallback((index: number, changes: Partial<SequencerStep>) => {
      setSequencer(prev => {
          const newSteps = [...prev.steps];
          if (newSteps[index]) newSteps[index] = { ...newSteps[index], ...changes };
          return { ...prev, steps: newSteps };
      });
  }, []);

  const setSequencerMode = useCallback((mode: SequencerMode) => setSequencer(prev => ({ ...prev, mode })), []);
  const setSequencerStepCount = useCallback((count: number) => {
      setSequencer(prev => {
          let newSteps = [...prev.steps];
          if (count > prev.steps.length) {
              const diff = count - prev.steps.length;
              for (let i = 0; i < diff; i++) newSteps.push({ active: false, sliceIndex: 0, ratchet: 1 });
          } else newSteps = newSteps.slice(0, count);
          return { ...prev, stepCount: count, steps: newSteps };
      });
  }, []);
  const setSequencerEditMode = useCallback((mode: 'trigger' | 'ratchet') => setSequencer(prev => ({ ...prev, editMode: mode })), []);
  const setSequencerPlaybackBehavior = useCallback((behavior: 'reset' | 'continue') => setSequencer(prev => ({ ...prev, playbackBehavior: behavior })), []);

  const randomizePattern = useCallback(() => {
      setSequencer(prev => {
          const newSteps = prev.steps.map(s => ({
              ...s,
              active: Math.random() > 0.5,
              sliceIndex: Math.floor(Math.random() * slicesRef.current.length),
              ratchet: Math.random() > 0.8 ? Math.floor(Math.random() * 3) + 1 : 1
          }));
          return { ...prev, steps: newSteps };
      });
  }, []);

  const generateAiBeat = useCallback((complexity: number) => {
      // Complexity 0.0 -> 1.0
      // 0.0: Basic House/Techno (Kick on 1/5/9/13, Snare on 5/13, Hats on offbeats)
      // 0.5: Breakbeat / Syncopated
      // 1.0: IDM / Glitch Chaos

      const slices = slicesRef.current;
      if (slices.length === 0) return;

      const kicks = slices.filter(s => s.type === 'kick').map(s => s.id);
      const snares = slices.filter(s => s.type === 'snare').map(s => s.id);
      const hats = slices.filter(s => s.type === 'hihat').map(s => s.id);
      const percs = slices.filter(s => s.type === 'perc').map(s => s.id);
      const all = slices.map(s => s.id);

      const pick = (arr: number[]) => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : (all[0] || 0);

      setSequencer(prev => {
          const newSteps = prev.steps.map((step, i) => {
              let active = false;
              let sliceIndex = 0;
              let ratchet = 1;

              // Probability thresholds based on complexity
              const isDownbeat = i % 4 === 0; // 0, 4, 8, 12
              const isBackbeat = i % 8 === 4; // 4, 12
              const isOffbeat = i % 2 !== 0;  // 1, 3, 5...

              // 1. Determine Activation
              if (complexity < 0.3) {
                  // Solid Foundation
                  if (isDownbeat) active = true;
                  if (isOffbeat && Math.random() > 0.2) active = true; // Hats
              } else {
                  // Chaotic Density
                  const density = 0.3 + (complexity * 0.4); // 0.3 to 0.7
                  active = Math.random() < density;
                  
                  // Force Downbeats on lower-mid complexity
                  if (complexity < 0.6 && isDownbeat) active = true;
              }

              // 2. Determine Instrument
              if (active) {
                  const rnd = Math.random();
                  // Shift probabilities: Low complexity favors structure, High complexity favors random percs
                  const kickProb = (isDownbeat ? 0.9 : 0.1) * (1 - complexity) + 0.2 * complexity; 
                  const snareProb = (isBackbeat ? 0.9 : 0.1) * (1 - complexity) + 0.2 * complexity;

                  if (rnd < kickProb) {
                      sliceIndex = pick(kicks);
                  } else if (rnd < kickProb + snareProb) {
                      sliceIndex = pick(snares);
                  } else {
                      if (Math.random() < 0.5) sliceIndex = pick(hats);
                      else sliceIndex = pick(percs.length ? percs : all);
                  }
              }

              // 3. Ratchets (The "Glitch" part of sequencing)
              if (active && Math.random() < (complexity * complexity * 0.6)) {
                  ratchet = Math.floor(Math.random() * 3) + 2; // 2, 3, 4
              }

              // 4. Pure Chaos Injection (Overwrite types with random slices)
              if (active && Math.random() < (complexity * 0.5)) {
                  sliceIndex = pick(all);
              }

              return { active, sliceIndex, ratchet };
          });
          return { ...prev, steps: newSteps };
      });
  }, []);

  const selectSlice = useCallback((index: number) => setSelectedSliceIndex(index), []);
  const toggleSliceActive = useCallback((index: number) => {
      const newSlices = [...slices];
      if (newSlices[index]) {
          newSlices[index].isActive = !newSlices[index].isActive;
          setSlices(newSlices);
      }
  }, [slices]);
  const updateSlice = useCallback((index: number, changes: Partial<Slice>) => {
      setSlices(prev => {
          const newSlices = [...prev];
          if (newSlices[index]) newSlices[index] = { ...newSlices[index], ...changes };
          return newSlices;
      });
  }, []);

  const autoSlice = useCallback(() => {
      if (!audioBuffer) return;
      const detectedBpm = params.bpm;
      const newSlices = generateTransientSlices(audioBuffer, detectedBpm, 0, audioBuffer.duration);
      setSlices(newSlices);
      setSelectedSliceIndex(0);
      setSequencer(prev => {
          const newSteps = prev.steps.map((s, i) => ({ ...s, sliceIndex: i % newSlices.length }));
          return { ...prev, steps: newSteps };
      });
  }, [audioBuffer, params.bpm]);

  const exportPreset = useCallback(async (name: string): Promise<string> => {
      const preset: Preset = {
          id: crypto.randomUUID(), name, date: Date.now(),
          params: params, sequencer: sequencer, slices: slices,
          sampleName: sampleName, sampleId: currentSampleId || undefined
      };
      return JSON.stringify(preset, null, 2);
  }, [params, sequencer, slices, sampleName, currentSampleId]);

  const importPreset = useCallback(async (json: string) => {
      try { const preset = JSON.parse(json) as Preset; loadPreset(preset); } catch (e) { console.error("Invalid Preset JSON"); }
  }, [loadPreset]);

  const getSourceAudio = useCallback(async () => {
       if (!audioBuffer) return null;
       return audioBufferToWav(audioBuffer.get());
  }, [audioBuffer]);

  const getAudioWav = useCallback(async () => getSourceAudio(), [getSourceAudio]);

  return {
    isReady, isPlaying, isLoading, audioBuffer, params, sequencer, slices, selectedSliceIndex, sampleName, currentSampleId, currentPresetId,
    loadAudioFile, loadConstructionKit, togglePlay, updateParams, scrub, updateSequencerStep, setSequencerMode, setSequencerStepCount,
    setSequencerEditMode, setSequencerPlaybackBehavior, randomizePattern, generateAiBeat, selectSlice, toggleSliceActive, updateSlice,
    sliceRegion, autoSlice, exportPreset, importPreset, loadPreset, getAudioWav, getSourceAudio, togglePreviewOriginal, isPreviewPlaying,
    playSliceRaw, toggleSliceLoop, sliceLoopState
  };
};
