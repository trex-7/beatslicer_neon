
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AllParams, Slice, SequencerState, SequencerMode, SequencerStep, SliceType, Preset, KitSample, MidiConfig, MidiDevice, MetronomeConfig } from '../types';
import { detectBPM } from '../utils/bpmDetector';
import { classifySlice } from '../utils/audioAnalysis';
import { audioBufferToWav, blobToBase64, base64ToBlob, validateFile } from '../utils/audioHelpers';
import { removeLeadingSilence, generateTransientSlices } from '../utils/transientDetection';

/// <reference types="vite/client" />

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

// Helper to generate a procedural Vinyl IR (fallback)
const createDefaultVinylImpulse = () => {
    // Ensure context exists and has a sample rate to prevent crash on early call
    if (!Tone.context || !Tone.context.sampleRate) return null;

    const sampleRate = Tone.context.sampleRate;
    // Shorter tail for fallback to avoid washout (0.2s instead of 1.0s)
    // Focus on frequency characteristic "lo-fi" burst rather than long reverb
    const length = 0.2 * sampleRate; 
    const buffer = Tone.context.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (sampleRate * 0.05)); // Fast decay
        
        // Band-limited noise approximation (simple random)
        // High pass slightly to remove mud, Low pass to remove digital harshness
        // Simulated by random * decay
        const noise = (Math.random() * 2 - 1) * 0.5;
        
        // Add distinct crackle spikes sparsely
        let crackle = 0;
        if (Math.random() > 0.995) crackle = (Math.random() * 2 - 1) * 0.8;

        const val = (noise * 0.2 + crackle) * decay;

        left[i] = val;
        right[i] = val;
    }
    return buffer;
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
            this.isLooping = true;
            this.mode = 'forward'; // 'forward', 'backward', 'pendulum', 'random'
            this.direction = 1; // 1 or -1 for pendulum
            this.params = {
                grainSize: 0.1,
                overlap: 0.05,
                playbackRate: 1.0,
                detune: 0,
                volume: 1.0,
                swing: 0,
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
                        // Reset logic based on mode
                        if (this.mode === 'backward') {
                            this.currentStep = this.stepCount; 
                        } else {
                            this.currentStep = -1;
                        }
                        this.direction = 1;
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
                if (data.isLooping !== undefined) this.isLooping = data.isLooping;
                if (data.mode) this.mode = data.mode;
            } else if (data.type === 'trigger') {
                // Manual Trigger (e.g. from Step Forward/Back)
                this.spawnGrain(data.sliceIndex, 1.0, 1);
            } else if (data.type === 'slices') {
                this.slices = data.slices;
            } else if (data.type === 'params') {
                if (data.params) {
                    // Correctly merge top-level params including swing
                    this.params = { ...this.params, ...data.params };
                    // Deep merge glitch if present
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
                         let multipliers = [0.5, 2.0, 4.0, 0.25];
                         if (slice.type === 'kick') multipliers = [2.0, 4.0];
                         const mult = multipliers[Math.floor(Math.random() * multipliers.length)];
                         grain.speed *= mult;
                         if (!g.pitchShift) {
                             grain.duration /= mult;
                         }
                     }

                     // 3. TIME JITTER (Smearing)
                     const jitterMax = 0.1 * this.sampleRate;
                     const jitter = (Math.random() - 0.5) * jitterMax * g.chaos;
                     grain.position += jitter;
                     
                     // 4. PAN JITTER
                     if (slice.type === 'kick') {
                         grain.pan = 0.5; // Always center
                     } else if (slice.type === 'snare') {
                         if (Math.random() < 0.3) grain.pan = 0.5 + (Math.random() - 0.5) * 0.4;
                     } else {
                         grain.pan = Math.max(0, Math.min(1, 0.5 + (Math.random() - 0.5) * g.chaos * 1.5));
                     }
                 }
                 
                 // 5. FORMANT / TEXTURE SCRAMBLE
                 if (g.allowFormant) {
                     const warp = 1.0 + (Math.random() * 2.0 - 1.0) * g.chaos; 
                     grain.duration *= Math.max(0.2, warp);
                 }
            }
            
            const detuneMult = Math.pow(2, this.params.detune / 1200);
            grain.speed *= detuneMult;

            // Apply Individual Slice Pitch Shift (Semitones)
            if (slice.pitch) {
                const pitchMult = Math.pow(2, slice.pitch / 12);
                grain.speed *= pitchMult;
            }
            
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
                        
                        // --- ADVANCE STEP LOGIC ---
                        if (this.mode === 'random') {
                            this.currentStep = Math.floor(Math.random() * this.stepCount);
                        } else if (this.mode === 'backward') {
                            // First step init handling for backward
                            if (this.currentStep === -1) this.currentStep = this.stepCount - 1;
                            else this.currentStep--;
                            
                            if (this.currentStep < 0) {
                                if (this.isLooping) this.currentStep = this.stepCount - 1;
                                else {
                                    this.isPlaying = false;
                                    this.port.postMessage({ type: 'stop' });
                                }
                            }
                        } else if (this.mode === 'pendulum') {
                            // Init
                            if (this.currentStep === -1) {
                                this.currentStep = 0;
                                this.direction = 1;
                            } else {
                                this.currentStep += this.direction;
                            }

                            if (this.currentStep >= this.stepCount) {
                                this.currentStep = Math.max(0, this.stepCount - 2);
                                this.direction = -1;
                            } else if (this.currentStep < 0) {
                                this.currentStep = 1;
                                this.direction = 1;
                            }
                            
                            // Safety for stepCount=1
                            if (this.stepCount === 1) this.currentStep = 0;
                        } else {
                            // Default: Forward
                            this.currentStep = (this.currentStep + 1);
                            if (this.currentStep >= this.stepCount) {
                                if (!this.isLooping) {
                                    this.isPlaying = false;
                                    this.currentStep = -1;
                                    this.port.postMessage({ type: 'stop' });
                                } else {
                                    this.currentStep = 0;
                                }
                            }
                        }

                        // Play step if still playing
                        if (this.isPlaying) {
                            const samplesPerBeat = (this.sampleRate * 60) / this.bpm;
                            const samplesPerStep = samplesPerBeat / 4;
                            
                            // SWING LOGIC
                            // If currentStep is EVEN (Downbeat), delay the next step (making this step longer)
                            // If currentStep is ODD (Offbeat), shorten this step to catch up
                            // Increased swing range to 0.45 (approx 75% shuffle feeling at max)
                            let swingOffset = 0;
                            if (this.params.swing > 0) {
                                const maxSwing = samplesPerStep * 0.45; 
                                const currentSwing = maxSwing * this.params.swing;
                                if (this.currentStep % 2 === 0) {
                                    swingOffset = currentSwing;
                                } else {
                                    swingOffset = -currentSwing;
                                }
                            }

                            this.nextStepTime += (samplesPerStep + swingOffset);
                            
                            this.port.postMessage({ type: 'step', value: this.currentStep });
                            
                            if (this.steps[this.currentStep]) {
                                const stepData = this.steps[this.currentStep];
                                if (stepData.active) {
                                    const repeats = stepData.ratchet || 1;
                                    const stepDuration = samplesPerStep + swingOffset;
                                    const interval = stepDuration / repeats;
                                    
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
  grainSize: 0.09,  
  overlap: 0.03,    
  detune: 0,
  playbackRate: 1,
  bpm: 120,
  attack: 0.001,    
  release: 0.01,     
  sustain: 0.5,
  swing: 0,
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
  vinyl: { isActive: false, wet: 1.0 },
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

const STYLE_SEEDS: Record<string, { prompt: string, bpmRange: [number, number] }> = {
    'techno': {
        prompt: "Techno style: 4/4 four-on-the-floor kick pattern. Consistent 16th note hi-hats with accents on off-beats. Industrial and repetitive feel.",
        bpmRange: [125, 135]
    },
    'trap': {
        prompt: "Trap style: Heavy syncopated kicks. Rapid triplet hi-hat rolls (ratchets). Snare on beats 2 and 4.",
        bpmRange: [140, 160]
    },
    'house': {
        prompt: "House style: 4/4 four-on-the-floor kick. Syncopated 'shuffling' hi-hats on off-beats. Snare or clap on beats 2 and 4.",
        bpmRange: [120, 128]
    },
    'dnb': {
        prompt: "Drum & Bass style: Fast syncopated breakbeat. Kick on 1 and 3.5. Snare on 2 and 4. Ghost notes and complex hi-hat patterns.",
        bpmRange: [170, 175]
    },
    'hiphop': {
        prompt: "Hip Hop (Boom Bap) style: Swung 16th notes. Heavy kick on 1 and syncopated variations. Snare on 2 and 4. Laid-back, groovy feel.",
        bpmRange: [85, 95]
    }
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
    steps: generateDefaultSteps(32), 
    stepCount: 32,
    mode: 'forward',
    currentStep: -1,
    isPlaying: false,
    isLooping: true,
    editMode: 'trigger',
    playbackBehavior: 'reset'
  });

  const [metronomeConfig, setMetronomeConfig] = useState<MetronomeConfig>({
      enabled: false,
      volume: 0.8
  });
  const metronomeConfigRef = useRef(metronomeConfig);
  // Ref for sample-based metronome
  const metronomePlayers = useRef<any>(null);
  // Ref for fallback synthetic metronome
  const metronomeSynth = useRef<any>(null);
  const metronomeGain = useRef<any>(null);

  const [midiConfig, setMidiConfig] = useState<MidiConfig>({
      enabled: true,
      inputPortId: '',
      outputPortId: '',
      inputChannel: 'all',
      outputChannel: 1,
      clockSource: 'internal',
      ppq: 24,
      sendClock: true, 
      sendTransport: true,
      clockOffset: 100
  });
  const [midiInputs, setMidiInputs] = useState<MidiDevice[]>([]);
  const [midiOutputs, setMidiOutputs] = useState<MidiDevice[]>([]);

  const sequencerRef = useRef(sequencer);
  const paramsRef = useRef(params); 
  const slicesRef = useRef(slices);
  const audioContextRef = useRef<AudioContext | null>(null);
  const midiAccessRef = useRef<any>(null);
  const workletNode = useRef<AudioWorkletNode | null>(null);
  const previewPlayer = useRef<any>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [sliceLoopState, setSliceLoopState] = useState<{index: number | null, isLooping: boolean}>({ index: null, isLooping: false });
  
  const midiLogRef = useRef<string[]>([]);
  const midiClockCountRef = useRef<number>(0);
  const midiClockDeltasRef = useRef<number[]>([]); 
  
  const midiNextNoteTimeRef = useRef<number>(0);
  const schedulerRequestRef = useRef<number | undefined>(undefined);
  const playStartTimeRef = useRef<number>(0);

  const logMidi = useCallback((msg: string) => {
      const time = new Date().toISOString().split('T')[1].slice(0, -1);
      midiLogRef.current = [`[${time}] ${msg}`, ...midiLogRef.current].slice(0, 20);
  }, []);
  
  const midiConfigRef = useRef(midiConfig);
  useEffect(() => { midiConfigRef.current = midiConfig; }, [midiConfig]);
  useEffect(() => { metronomeConfigRef.current = metronomeConfig; }, [metronomeConfig]);

  const effects = useRef({
    reverb: null as any,
    delay: null as any,
    filter: null as any,
    distortion: null as any,
    compressor: null as any,
    bitCrusher: null as any,
    vinyl: null as any,
    
    filterFollower: null as any,
    filterLFO: null as any,
    filterEnvDepth: null as any,
    filterLFODepth: null as any,
    
    limiter: null as any,
    inputGain: null as any,
    nativeBridgeGain: null as any,

    modules: {} as Record<string, { input: any, output: any }>
  });
  
  const setToneParam = useCallback((target: any, param: string, value: number, rampTime?: number) => {
      if (!target || target[param] === undefined) return;
      
      const p = target[param];
      if (p && typeof p === 'object' && 'value' in p) {
          if (rampTime) {
              try {
                  if ((param === 'gain' || param === 'wet') && typeof p.linearRampTo === 'function') {
                      p.linearRampTo(value, rampTime);
                  } else if (typeof p.rampTo === 'function') {
                      p.rampTo(value, rampTime);
                  } else {
                      p.value = value;
                  }
              } catch (e) {
                  p.value = value;
              }
          } else {
              p.value = value;
          }
      } else {
          target[param] = value;
      }
  }, []);

  const reconnectEffectChain = useCallback(() => {
      const { modules, limiter, inputGain } = effects.current;
      const order = paramsRef.current.order;
      
      if (!inputGain || !limiter) return;

      try { inputGain.disconnect(); } catch(e) {}
      
      Object.values(modules).forEach((mod: any) => {
          try { mod.output.disconnect(); } catch(e) {}
      });

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

      if (currentSource) {
          currentSource.connect(limiter);
      }
  }, []);

  useEffect(() => { sequencerRef.current = sequencer; }, [sequencer]);
  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { slicesRef.current = slices; }, [slices]);

  // ... (Worklet message handling unchanged) ...
  useEffect(() => {
      if (workletNode.current) {
          workletNode.current.port.postMessage({ 
              type: 'sequencer', 
              steps: sequencer.steps, 
              stepCount: sequencer.stepCount, 
              bpm: params.bpm,
              isLooping: sequencer.isLooping,
              mode: sequencer.mode 
          });
      }
  }, [sequencer.steps, sequencer.stepCount, sequencer.isLooping, sequencer.mode, params.bpm]);

  useEffect(() => {
      if (workletNode.current) {
          workletNode.current.port.postMessage({ 
              type: 'slices', 
              slices: slices 
          });
      }
  }, [slices]);

  useEffect(() => {
      if (typeof schedulerRequestRef.current === 'number') cancelAnimationFrame(schedulerRequestRef.current);

      if (isPlaying && midiConfig.enabled && midiConfig.sendClock) {
          midiNextNoteTimeRef.current = playStartTimeRef.current || performance.now();
          const schedule = () => {
              if (!isPlaying) return;
              const now = performance.now();
              const lookahead = 50.0; 
              const outputs = midiAccessRef.current?.outputs;
              const currentBpm = paramsRef.current.bpm; 
              const ppq = midiConfigRef.current.ppq || 24;
              const offset = midiConfigRef.current.clockOffset || 0;
              const interval = 60000 / (currentBpm * ppq);

              if (outputs && interval > 0) {
                  while (midiNextNoteTimeRef.current < now + lookahead) {
                      const idealTime = midiNextNoteTimeRef.current;
                      const timeToSend = idealTime + offset;
                      if (timeToSend >= now - 100) { 
                          if (outputs.forEach) {
                              outputs.forEach((output: any) => {
                                  if (!midiConfigRef.current.outputPortId || output.id === midiConfigRef.current.outputPortId) {
                                      try { output.send([0xF8], timeToSend); } catch(e){}
                                  }
                              });
                          } else {
                              for (const output of outputs.values()) {
                                  if (!midiConfigRef.current.outputPortId || output.id === midiConfigRef.current.outputPortId) {
                                      try { output.send([0xF8], timeToSend); } catch(e){}
                                  }
                              }
                          }
                          midiClockCountRef.current++;
                          midiClockDeltasRef.current = [interval, ...midiClockDeltasRef.current].slice(0, 20);
                      }
                      midiNextNoteTimeRef.current += interval;
                  }
              }
              schedulerRequestRef.current = requestAnimationFrame(schedule);
          }
          schedulerRequestRef.current = requestAnimationFrame(schedule);
      }
      return () => {
          if (typeof schedulerRequestRef.current === 'number') cancelAnimationFrame(schedulerRequestRef.current);
      }
  }, [isPlaying, midiConfig.enabled, midiConfig.sendClock]);

  // Setup Audio
  useEffect(() => {
    let active = true;

    // Add user gesture handler to start audio context
    const startAudioOnGesture = async () => {
      if (Tone.context.state === 'suspended') {
        await Tone.start();
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    };
    document.addEventListener('click', startAudioOnGesture, { once: true });
    document.addEventListener('keydown', startAudioOnGesture, { once: true });
    document.addEventListener('touchstart', startAudioOnGesture, { once: true });

    if ((navigator as any).requestMIDIAccess) {
        (navigator as any).requestMIDIAccess({ sysex: false }).then(
            (access: any) => {
                if (!active) return;
                midiAccessRef.current = access;
                const inputs: MidiDevice[] = [];
                access.inputs.forEach((input: any) => inputs.push({ id: input.id, name: input.name, manufacturer: input.manufacturer }));
                setMidiInputs(inputs);
                const outputs: MidiDevice[] = [];
                access.outputs.forEach((output: any) => outputs.push({ id: output.id, name: output.name, manufacturer: output.manufacturer }));
                setMidiOutputs(outputs);
                access.onstatechange = (e: any) => {
                    const port = e.port;
                    if (port.type === 'input') {
                        setMidiInputs(prev => port.state === 'connected' ? (prev.find(p=>p.id===port.id)?prev:[...prev, {id:port.id, name:port.name}]) : prev.filter(p=>p.id!==port.id));
                    } else {
                        setMidiOutputs(prev => port.state === 'connected' ? (prev.find(p=>p.id===port.id)?prev:[...prev, {id:port.id, name:port.name}]) : prev.filter(p=>p.id!==port.id));
                    }
                }
            },
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

          if (!targetContext.audioWorklet) return;

          const blob = new Blob([GRANULAR_WORKLET_CODE], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          
          try { 
              await targetContext.audioWorklet.addModule(workletUrl); 
          } catch (e: any) {}
          
          if (!active) { 
              nativeContext.close().catch(() => {}); 
              return; 
          }

          // SAFE SET HELPER
          const safeSet = (node: any, param: string, value: number) => {
              if (node && node[param]) {
                  if (typeof node[param].value !== 'undefined') {
                      node[param].value = value;
                  } else {
                      node[param] = value;
                  }
              }
          };

          try {
            workletNode.current = new AudioWorkletNode(targetContext, 'granular-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
            workletNode.current.port.onmessage = (event) => {
                if (event.data.type === 'step') {
                     const step = event.data.value;
                     setSequencer(prev => prev.currentStep === step ? prev : { ...prev, currentStep: step });
                     // Metronome Trigger Logic
                     if (metronomeConfigRef.current.enabled && Tone.context.state === 'running') {
                         if (step % 4 === 0) {
                             const isDownbeat = step % 16 === 0;
                             
                             // Try samples first
                             if (metronomePlayers.current && metronomePlayers.current.loaded) {
                                 const sample = isDownbeat ? "high" : "low";
                                 try {
                                     metronomePlayers.current.player(sample).start(Tone.now() + 0.05);
                                 } catch(e) {}
                             } 
                             // Fallback to Synth if samples failed or not loaded
                             else if (metronomeSynth.current) {
                                 // Use higher pitch for visibility (Woodblock style)
                                 // C6 (High) / C5 (Low) instead of deep sub C3/C2
                                 const note = isDownbeat ? "C6" : "C5";
                                 try {
                                     // Short, sharp decay
                                     metronomeSynth.current.triggerAttackRelease(note, "32n", Tone.now() + 0.05);
                                 } catch(e) {}
                             }
                         }
                     }
                } else if (event.data.type === 'stop') {
                    setIsPlaying(false);
                    setSequencer(prev => ({ ...prev, isPlaying: false, currentStep: -1 }));
                    Tone.Transport.stop();
                }
            };
            workletNode.current.port.postMessage({ type: 'sequencer', steps: sequencerRef.current.steps, stepCount: sequencerRef.current.stepCount, bpm: paramsRef.current.bpm, isLooping: sequencerRef.current.isLooping, mode: sequencerRef.current.mode });
            workletNode.current.port.postMessage({ type: 'params', params: { ...paramsRef.current } });
            workletNode.current.port.postMessage({ type: 'slices', slices: slicesRef.current });

            effects.current.nativeBridgeGain = targetContext.createGain();
            workletNode.current.connect(effects.current.nativeBridgeGain);
            effects.current.inputGain = new Tone.Gain(1);
            Tone.connect(effects.current.nativeBridgeGain, effects.current.inputGain);

          } catch(e) { console.error(e); return; }

          metronomeGain.current = new Tone.Gain(0.8).toDestination();
          
          // 1. Load Sample Players (Absolute path)
          metronomePlayers.current = new Tone.Players({
              high: "/Audio/Synth_Block_A_hi.wav",
              low: "/Audio/Synth_Block_A_lo.wav"
          }, () => {
              console.log("Metronome samples loaded successfully");
          }).connect(metronomeGain.current);

          // 2. Setup Fallback Synth
          // Make it punchier and brighter for better audibility
          metronomeSynth.current = new Tone.MembraneSynth({
              pitchDecay: 0.01,
              octaves: 2,
              oscillator: { type: "sine" },
              envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
          }).connect(metronomeGain.current);

          previewPlayer.current = new Tone.Player().toDestination();
          
          const createModule = () => ({ input: new Tone.Gain(1), output: new Tone.Gain(1) });
          const mods = { compressor: createModule(), distortion: createModule(), bitCrusher: createModule(), filter: createModule(), delay: createModule(), reverb: createModule(), vinyl: createModule() };
          effects.current.modules = mods;

          // Reverb (Parallel)
          if (active) {
              effects.current.reverb = new Tone.Reverb({ decay: params.reverb.decay || 1.5, preDelay: 0.01 });
              await effects.current.reverb.generate(); 
              if (!active) return;
              
              safeSet(effects.current.reverb.wet, 'value', 1);
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
          }

          // Delay
          const maxDelay = 2.0; 
          effects.current.delay = new Tone.Delay(params.delay.delayTime, maxDelay);
          const delayFeedbackGain = new Tone.Gain(params.delay.feedback);
          const delayLP = new Tone.Filter(params.delay.highCut, "lowpass", -12);
          const delayHP = new Tone.Filter(params.delay.lowCut, "highpass", -12);
          const delayDistortion = new Tone.Distortion(0.02); 
          effects.current.delay.connect(delayLP);
          delayLP.connect(delayHP);
          delayHP.connect(delayDistortion);
          delayDistortion.connect(delayFeedbackGain);
          delayFeedbackGain.connect(effects.current.delay);
          const delWetGain = new Tone.Gain(0);
          const delDryGain = new Tone.Gain(1);
          mods.delay.input.connect(delDryGain);
          mods.delay.input.connect(effects.current.delay); 
          delayDistortion.connect(delWetGain);
          delWetGain.connect(mods.delay.output);
          delDryGain.connect(mods.delay.output);
          (effects.current as any).delayFeedbackGain = delayFeedbackGain;
          (effects.current as any).delayLP = delayLP;
          (effects.current as any).delayHP = delayHP;
          (effects.current as any).delayWetGain = delWetGain;
          (effects.current as any).delayDryGain = delDryGain;

          // Filter
          effects.current.filter = new Tone.Filter({ frequency: params.filter.frequency, Q: params.filter.q, type: params.filter.type });
          const filterMakeup = new Tone.Gain(1);
          const dcBlocker = new Tone.Filter({ frequency: 10, type: 'highpass', rolloff: -24 });
          effects.current.filterFollower = new Tone.Follower(0.02);
          effects.current.filterEnvDepth = new Tone.Gain(0);
          effects.current.filterLFO = new Tone.LFO(1, -1, 1).start(0);
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

          // BitCrusher
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

          // Vinyl Bypass (Feature Disabled)
          // We connect input directly to output to maintain the chain even if ordered
          mods.vinyl.input.connect(mods.vinyl.output);

          if (!active) return;

          // Distortion
          effects.current.distortion = new Tone.Distortion(params.distortion.amount);
          safeSet(effects.current.distortion.wet, 'value', params.distortion.wet);
          mods.distortion.input.connect(effects.current.distortion);
          effects.current.distortion.connect(mods.distortion.output);

          // Compressor
          effects.current.compressor = new Tone.Compressor({ threshold: params.compressor.threshold, ratio: params.compressor.ratio, attack: params.compressor.attack, release: params.compressor.release });
          mods.compressor.input.connect(effects.current.compressor);
          effects.current.compressor.connect(mods.compressor.output);

          // Limiter
          effects.current.limiter = new Tone.Limiter({ threshold: 0 }).toDestination();

          reconnectEffectChain();
          setIsReady(true);
      } catch (e) { 
          console.error("Audio Setup Failed", e);
          setIsReady(true); 
      }
    };

    const timer = setTimeout(() => setIsReady(true), 3000); 
    setupAudio().then(() => clearTimeout(timer));

    return () => {
      active = false;
      clearTimeout(timer);
      if (typeof schedulerRequestRef.current === 'number') cancelAnimationFrame(schedulerRequestRef.current);
      previewPlayer.current?.dispose();
      metronomePlayers.current?.dispose();
      metronomeSynth.current?.dispose();
      metronomeGain.current?.dispose();
      workletNode.current?.disconnect();
      if (effects.current.modules) Object.values(effects.current.modules).forEach((m: any) => { m.input.dispose(); m.output.dispose(); });
      Object.values(effects.current).forEach((effect: any) => { if (effect && effect.dispose) effect.dispose(); });
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {});
    };
  }, [reconnectEffectChain]);

  // ... (rest of hook body)
  
  const loadImpulseResponse = useCallback(async (file: File) => {
      // Feature Disabled
      alert("Vinyl/IR feature is currently disabled.");
  }, []);

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
    
    // ... (Other effects updates) ...
    if (efx.reverb && newParams.reverb) {
        const rev = updated.reverb;
        let decay = rev.decay;
        if (rev.isSynced) {
            try { decay = Tone.Time(rev.syncValue).toSeconds(); } catch(e) {}
        }
        
        setToneParam(efx.reverb.wet, 'value', 1);

        if (typeof efx.reverb.decay !== 'undefined') {
             if (Math.abs(efx.reverb.decay - decay) > 0.1) {
                 efx.reverb.decay = decay;
                 if (typeof efx.reverb.generate === 'function') {
                     efx.reverb.generate().catch(() => {});
                 }
             }
        } else if (typeof efx.reverb.roomSize !== 'undefined') {
             const roomSize = 0.7 + (Math.min(10, decay) / 10) * 0.29;
             setToneParam(efx.reverb, 'roomSize', roomSize, 0.1);
        }
        
        const mix = rev.isActive ? rev.wet : 0;
        if ((efx as any).reverbDryGain) setToneParam((efx as any).reverbDryGain, 'gain', 1 - mix, 0.1);
        if ((efx as any).reverbWetGain) setToneParam((efx as any).reverbWetGain, 'gain', mix, 0.1);
        
        if ((efx as any).revLP) setToneParam((efx as any).revLP, 'frequency', rev.highCut);
        if ((efx as any).revHP) setToneParam((efx as any).revHP, 'frequency', rev.lowCut);
    }
    
    if (efx.delay && newParams.delay) {
        const del = updated.delay;
        if (del.isSynced) setToneParam(efx.delay, 'delayTime', Tone.Time(del.syncValue).toSeconds(), 0.1);
        else setToneParam(efx.delay, 'delayTime', del.delayTime, 0.1);
        
        if ((efx as any).delayFeedbackGain) {
            setToneParam((efx as any).delayFeedbackGain, 'gain', del.feedback, 0.1);
        } else if (efx.delay.feedback) {
            setToneParam(efx.delay, 'feedback', del.feedback, 0.1);
        }
        
        const mix = del.isActive ? del.wet : 0;
        if ((efx as any).delayDryGain) setToneParam((efx as any).delayDryGain, 'gain', 1 - mix, 0.1);
        if ((efx as any).delayWetGain) setToneParam((efx as any).delayWetGain, 'gain', mix, 0.1);
        
        if ((efx as any).delayLP) setToneParam((efx as any).delayLP, 'frequency', del.highCut, 0.1);
        if ((efx as any).delayHP) setToneParam((efx as any).delayHP, 'frequency', del.lowCut, 0.1);
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
            if (f.type === 'bandpass') makeup = 1.0 + (f.q * 0.2); 
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
        if (newParams.bitCrusher.bits !== undefined && efx.bitCrusher.curve) efx.bitCrusher.curve = createBitCrusherCurve(bits);
        if ((efx as any).bitCrusherWet) setToneParam((efx as any).bitCrusherWet, 'gain', effectiveWet);
        if ((efx as any).bitCrusherDry) setToneParam((efx as any).bitCrusherDry, 'gain', 1 - effectiveWet);
    }

    // VINYL UPDATES DISABLED

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
         workletNode.current.port.postMessage({ type: 'params', params: { ...updated } });
         if (newParams.bpm) {
             workletNode.current.port.postMessage({ type: 'sequencer', steps: sequencerRef.current.steps, stepCount: sequencerRef.current.stepCount, bpm: updated.bpm, isLooping: sequencerRef.current.isLooping, mode: sequencerRef.current.mode });
         }
    }
  }, [setToneParam, reconnectEffectChain]);

  // ... (unchanged functions)
  
  // UPDATED LOAD PRESET TO FIX MISSING VINYL
  const loadPreset = useCallback(async (preset: Preset) => {
      setIsLoading(true);
      try {
          if (previewPlayer.current) { previewPlayer.current.stop(); setIsPreviewPlaying(false); setSliceLoopState({ index: null, isLooping: false }); }
          if (preset.sampleName) setSampleName(preset.sampleName);
          if (preset.sampleId) setCurrentSampleId(preset.sampleId);
          if (preset.id) setCurrentPresetId(preset.id);
          if (preset.sampleUrl) {
              const buffer = new Tone.Buffer(); await buffer.load(preset.sampleUrl);
              let rawBuffer = buffer.get(); if (!rawBuffer) throw new Error("Decode failed");
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
                  }
              }
          }
          
          // Sanitize Params to ensure Vinyl is NOT in order (since we disabled it)
          if (preset.params) {
              const sanitizedParams = { ...preset.params };
              
              if (sanitizedParams.order) {
                  // Filter out vinyl
                  sanitizedParams.order = sanitizedParams.order.filter(id => id !== 'vinyl');
              } else {
                  // Use default (which now excludes vinyl)
                  sanitizedParams.order = initialParams.order;
              }

              updateParams(sanitizedParams);
          }

          if (preset.sequencer) setSequencer(prev => ({ ...prev, ...preset.sequencer }));
          if (preset.slices && preset.slices.length > 0) {
              setSlices(preset.slices);
               if (workletNode.current) {
                   workletNode.current.port.postMessage({ type: 'slices', slices: preset.slices });
               }
          }
      } catch (e) { console.error("Preset Load Error:", e); alert("Failed to load preset audio."); } finally { setIsLoading(false); }
  }, [updateParams]);

  // ... (Rest of file unchanged) ...

  const loadAudioFile = useCallback(async (audioFile: File | string, preserveSettings: boolean = false, nameOverride?: string, cloudId?: string) => {
    setIsLoading(true);
    if (previewPlayer.current) { previewPlayer.current.stop(); setIsPreviewPlaying(false); setSliceLoopState({ index: null, isLooping: false }); }
    try {
      const url = typeof audioFile === 'string' ? audioFile : URL.createObjectURL(audioFile);
      let filename = nameOverride || (audioFile instanceof File ? audioFile.name : (typeof audioFile === 'string' ? audioFile.split('/').pop()?.split('?')[0] || 'Default' : 'Default'));
      setSampleName(filename); setCurrentSampleId(cloudId || null); setCurrentPresetId(null); 
      
      if (audioFile instanceof File) {
          const err = validateFile(audioFile);
          if (err) {
              alert(err);
              setIsLoading(false);
              return;
          }
      }

      const buffer = new Tone.Buffer(); 
      await buffer.load(url);
      
      let rawBuffer = buffer.get(); if (!rawBuffer) throw new Error("Decode failed");
      rawBuffer = removeLeadingSilence(rawBuffer);
      const processedBuffer = new Tone.Buffer(rawBuffer);
      
      let currentSlices = slices; let currentSequencer = sequencer;
      
      if (!preserveSettings) {
          let detectedBpm = 0;
          if (filename.match(/(\d{2,3})\s*bpm/i)) detectedBpm = parseInt(filename.match(/(\d{2,3})\s*bpm/i)![1]);
          if (!detectedBpm) detectedBpm = await detectBPM(rawBuffer);
          const newSlices = generateTransientSlices(processedBuffer, detectedBpm || 120, 0, processedBuffer.duration);
          setSlices(newSlices); currentSlices = newSlices; setSelectedSliceIndex(0);
          setSequencer(prev => {
            const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({ ...step, sliceIndex: i % (newSlices.length || 1), ratchet: 1 }));
            const newState = { ...prev, steps: newSteps, currentStep: -1 }; currentSequencer = newState; return newState;
          });
          updateParams({ ...initialParams, bpm: detectedBpm || 120 });
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
              workletNode.current.port.postMessage({ type: 'sequencer', steps: currentSequencer.steps, stepCount: currentSequencer.stepCount, bpm: paramsRef.current.bpm, isLooping: currentSequencer.isLooping, mode: currentSequencer.mode });
          }
      }
      if (isPlaying) {
        if (workletNode.current) workletNode.current.port.postMessage({ type: 'play', value: true });
        if (Tone.Transport.state !== 'started') Tone.Transport.start();
      }
    } catch (error: any) { alert("Failed to load audio."); } finally { setIsLoading(false); }
  }, [isPlaying, updateParams, slices, sequencer]);

  const loadConstructionKit = useCallback(async (files: File[] | KitSample[], kitName: string) => {
      setIsLoading(true); if (previewPlayer.current) previewPlayer.current.stop();
      try {
          setSampleName(kitName); setCurrentSampleId(null); setCurrentPresetId(null);
          if (files.length > 32) { alert("Too many files. Limit is 32."); setIsLoading(false); return; }
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
              try { const buffer = new Tone.Buffer(); await buffer.load(url); buffers.push({ buffer: buffer.get(), name, type }); } catch (e) {}
          }
          if (buffers.length === 0) throw new Error("No audio files");
          const padding = 0.1; const totalDuration = buffers.reduce((acc, b) => acc + b.buffer.duration + padding, 0);
          const sampleRate = Tone.context.sampleRate;
          const masterBuffer = Tone.context.createBuffer(1, Math.ceil(totalDuration * sampleRate), sampleRate);
          const channelData = masterBuffer.getChannelData(0);
          const newSlices: Slice[] = []; let currentOffset = 0;
          buffers.forEach((b, index) => {
              const bData = b.buffer.getChannelData(0);
              const startSample = Math.floor(currentOffset * sampleRate);
              for (let i = 0; i < bData.length; i++) { if (startSample + i < channelData.length) channelData[startSample + i] = bData[i]; }
              newSlices.push({ id: index, offset: currentOffset, duration: b.buffer.duration, isActive: true, type: b.type, level: 1.0, pitch: 0 });
              currentOffset += b.buffer.duration + padding;
          });
          const finalToneBuffer = new Tone.Buffer(masterBuffer);
          setAudioBuffer(finalToneBuffer); setSlices(newSlices); setSelectedSliceIndex(0);
          let currentSequencer = sequencer;
          setSequencer(prev => {
              const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({ ...step, active: i % 2 === 0, sliceIndex: i % newSlices.length, ratchet: 1 }));
              const newState = { ...prev, steps: newSteps, currentStep: -1 }; currentSequencer = newState; return newState;
          });
          updateParams({ ...initialParams, bpm: 120 });
          if (previewPlayer.current) previewPlayer.current.buffer = finalToneBuffer;
          if (workletNode.current) {
            workletNode.current.port.postMessage({ type: 'load', bufferL: masterBuffer.getChannelData(0), bufferR: masterBuffer.getChannelData(0), sampleRate: sampleRate });
            workletNode.current.port.postMessage({ type: 'slices', slices: newSlices });
            workletNode.current.port.postMessage({ type: 'sequencer', steps: currentSequencer.steps, stepCount: currentSequencer.stepCount, bpm: 120, isLooping: currentSequencer.isLooping, mode: currentSequencer.mode });
          }
      } catch (error: any) { alert(`Failed to load kit: ${error.message}.`); } finally { setIsLoading(false); }
  }, [updateParams, sequencer]);

  const togglePlay = useCallback(async () => {
    // Explicitly resume audio context if suspended - critical fix for "no sound"
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    // Also ensure Tone context is started
    if (Tone.context.state === 'suspended') {
        await Tone.start();
    }

    if (!midiAccessRef.current && (navigator as any).requestMIDIAccess) { try { midiAccessRef.current = await (navigator as any).requestMIDIAccess({ sysex: false }); } catch (e) {} }
    
    if (isPlaying) {
      if (workletNode.current) workletNode.current.port.postMessage({ type: 'play', value: false });
      Tone.Transport.stop(); setIsPlaying(false);
      if (midiAccessRef.current && midiConfigRef.current.enabled && midiConfigRef.current.sendTransport) {
          const outputs = midiAccessRef.current.outputs;
          if (outputs.forEach) {
              outputs.forEach((o: any) => { if (!midiConfigRef.current.outputPortId || o.id === midiConfigRef.current.outputPortId) { try { o.send([0xFC]); logMidi(`TX ${o.name}: STOP`); } catch(e){ logMidi(`ERR: ${e}`); } } });
          } else { for(const o of outputs.values()) { if (!midiConfigRef.current.outputPortId || o.id === midiConfigRef.current.outputPortId) { try { o.send([0xFC]); logMidi(`TX ${o.name}: STOP`); } catch(e){ logMidi(`ERR: ${e}`); } } } }
      }
      if (sequencer.playbackBehavior === 'continue') { setSequencer(prev => ({ ...prev, isPlaying: false })); } else { setSequencer(prev => ({ ...prev, isPlaying: false, currentStep: -1 })); }
    } else {
      const shouldReset = sequencer.playbackBehavior === 'reset';
      if (workletNode.current) workletNode.current.port.postMessage({ type: 'play', value: true, reset: shouldReset });
      playStartTimeRef.current = performance.now();
      if (midiAccessRef.current && midiConfigRef.current.enabled && midiConfigRef.current.sendTransport) {
          const msg = sequencer.playbackBehavior === 'continue' ? 0xFB : 0xFA;
          const msgName = sequencer.playbackBehavior === 'continue' ? 'CONT' : 'START';
          const outputs = midiAccessRef.current.outputs;
          if (outputs.forEach) {
              outputs.forEach((o: any) => { if (!midiConfigRef.current.outputPortId || o.id === midiConfigRef.current.outputPortId) { try { o.send([msg]); logMidi(`TX ${o.name}: ${msgName}`); } catch(e){ logMidi(`ERR: ${e}`); } } });
          } else { for(const o of outputs.values()) { if (!midiConfigRef.current.outputPortId || o.id === midiConfigRef.current.outputPortId) { try { o.send([msg]); logMidi(`TX ${o.name}: ${msgName}`); } catch(e){ logMidi(`ERR: ${e}`); } } } }
      }
      if (shouldReset) Tone.Transport.position = 0;
      Tone.Transport.start(); setIsPlaying(true); setSequencer(prev => ({ ...prev, isPlaying: true }));
    }
  }, [isPlaying, sequencer.playbackBehavior, logMidi]);

  const setTransportBpm = useCallback((bpm: number) => { updateParams({ bpm }); }, [updateParams]);
  const toggleLoop = useCallback(() => {
      setSequencer(prev => {
          const newState = { ...prev, isLooping: !prev.isLooping };
          if (workletNode.current) workletNode.current.port.postMessage({ type: 'sequencer', steps: prev.steps, stepCount: prev.stepCount, bpm: paramsRef.current.bpm, isLooping: newState.isLooping, mode: prev.mode });
          return newState;
      });
  }, []);
  const stepForward = useCallback(() => {
      if (!workletNode.current || !audioBuffer) return;
      setSequencer(prev => {
          const nextStep = (prev.currentStep + 1) % prev.stepCount;
          if (prev.steps[nextStep]) workletNode.current?.port.postMessage({ type: 'trigger', sliceIndex: prev.steps[nextStep].sliceIndex });
          return { ...prev, currentStep: nextStep };
      });
  }, [audioBuffer]);
  const stepBackward = useCallback(() => {
      if (!workletNode.current || !audioBuffer) return;
      setSequencer(prev => {
          let nextStep = prev.currentStep - 1; if (nextStep < 0) nextStep = prev.stepCount - 1;
          if (prev.steps[nextStep]) workletNode.current?.port.postMessage({ type: 'trigger', sliceIndex: prev.steps[nextStep].sliceIndex });
          return { ...prev, currentStep: nextStep };
      });
  }, [audioBuffer]);
  const updateMidiConfig = useCallback((newConfig: Partial<MidiConfig>) => { setMidiConfig(prev => ({ ...prev, ...newConfig })); }, []);
  
  const updateMetronomeConfig = useCallback((newConfig: Partial<MetronomeConfig>) => {
      setMetronomeConfig(prev => {
          const next = { ...prev, ...newConfig };
          if (metronomeGain.current && newConfig.volume !== undefined) {
              metronomeGain.current.gain.rampTo(newConfig.volume, 0.1);
          }
          return next;
      });
  }, []);

  const togglePreviewOriginal = useCallback(() => {
      if (!previewPlayer.current || !previewPlayer.current.buffer.loaded) return;
      if (isPreviewPlaying) { previewPlayer.current.stop(); setIsPreviewPlaying(false); setSliceLoopState({ index: null, isLooping: false }); } 
      else { setSliceLoopState({ index: null, isLooping: false }); previewPlayer.current.loop = true; previewPlayer.current.loopStart = 0; previewPlayer.current.loopEnd = previewPlayer.current.buffer.duration; previewPlayer.current.start(); setIsPreviewPlaying(true); }
  }, [isPreviewPlaying]);
  const playSliceRaw = useCallback((index: number) => {
      if (!previewPlayer.current || !slices[index]) return;
      previewPlayer.current.stop(); setIsPreviewPlaying(false); setSliceLoopState({ index: null, isLooping: false });
      const s = slices[index]; previewPlayer.current.loop = false; previewPlayer.current.start(Tone.now(), s.offset, s.duration);
  }, [slices]);
  const toggleSliceLoop = useCallback((index: number) => {
      if (!previewPlayer.current || !slices[index]) return;
      if (sliceLoopState.index === index && sliceLoopState.isLooping) { previewPlayer.current.stop(); setSliceLoopState({ index: null, isLooping: false }); } 
      else { previewPlayer.current.stop(); setIsPreviewPlaying(false); const s = slices[index]; previewPlayer.current.loopStart = s.offset; previewPlayer.current.loopEnd = s.offset + s.duration; previewPlayer.current.loop = true; previewPlayer.current.start(Tone.now(), s.offset); setSliceLoopState({ index, isLooping: true }); }
  }, [slices, sliceLoopState]);
  const addSlice = useCallback((start: number, end: number) => {
    if (!audioBuffer) return;
    const rawBuffer = audioBuffer.get();
    const nextId = slices.length > 0 ? Math.max(...slices.map(s => s.id)) + 1 : 0;
    const newSlice: Slice = { id: nextId, offset: start, duration: end - start, isActive: true, type: classifySlice(rawBuffer, start, end - start), level: 1.0, reverse: false, pitch: 0 };
    setSlices(prev => [...prev, newSlice]); setSelectedSliceIndex(slices.length);
  }, [audioBuffer, slices]);
  const sliceRegion = useCallback((start: number, end: number) => addSlice(start, end), [addSlice]);
  const scrub = useCallback((position: number) => { if (!audioBuffer) return; const time = position * audioBuffer.duration; if (previewPlayer.current && !isPlaying) previewPlayer.current.start(Tone.now(), time, 0.1); }, [audioBuffer, isPlaying]);
  const updateSequencerStep = useCallback((index: number, changes: Partial<SequencerStep>) => { setSequencer(prev => { const newSteps = [...prev.steps]; if (newSteps[index]) newSteps[index] = { ...newSteps[index], ...changes }; return { ...prev, steps: newSteps }; }); }, []);
  const setSequencerMode = useCallback((mode: SequencerMode) => setSequencer(prev => ({ ...prev, mode })), []);
  const setSequencerStepCount = useCallback((count: number) => { setSequencer(prev => { let newSteps = [...prev.steps]; if (count > prev.steps.length) { const diff = count - prev.steps.length; for (let i = 0; i < diff; i++) newSteps.push({ active: false, sliceIndex: 0, ratchet: 1 }); } else newSteps = newSteps.slice(0, count); return { ...prev, stepCount: count, steps: newSteps }; }); }, []);
  const setSequencerEditMode = useCallback((mode: 'trigger' | 'ratchet') => setSequencer(prev => ({ ...prev, editMode: mode })), []);
  const setSequencerPlaybackBehavior = useCallback((behavior: 'reset' | 'continue') => setSequencer(prev => ({ ...prev, playbackBehavior: behavior })), []);
  const randomizePattern = useCallback(() => { setSequencer(prev => { const newSteps = prev.steps.map(s => ({ ...s, active: Math.random() > 0.5, sliceIndex: Math.floor(Math.random() * slicesRef.current.length), ratchet: Math.random() > 0.8 ? Math.floor(Math.random() * 3) + 1 : 1 })); return { ...prev, steps: newSteps }; }); }, []);
  
  const generateAiBeat = useCallback((inputComplexity: number) => {
      const complexity = inputComplexity * 0.6;
      const slices = slicesRef.current;
      if (slices.length === 0) return;
      const kicks = slices.filter(s => s.type === 'kick').map(s => s.id);
      const snares = slices.filter(s => s.type === 'snare').map(s => s.id);
      const hats = slices.filter(s => s.type === 'hihat').map(s => s.id);
      const percs = slices.filter(s => s.type === 'perc').map(s => s.id);
      const allIndices = slices.map(s => s.id);
      const getRand = (arr: number[]) => arr[Math.floor(Math.random() * arr.length)];

      setSequencer(prev => {
          const newSteps = prev.steps.map((step, i) => {
              let probability = 0;
              const stepInBar = i % 16;
              const isDownbeat = i % 4 === 0;
              const isBackbeat = stepInBar === 4 || stepInBar === 12;
              const isOffbeat = i % 2 !== 0;

              if (isDownbeat) probability = 0.95 - (complexity * 0.4);
              else if (isOffbeat) probability = 0.1 + (complexity * 0.8);
              else probability = 0.4 + (complexity * 0.3);

              const active = Math.random() < probability;
              if (!active) return { ...step, active: false, ratchet: 1 };

              let sliceIndex = 0;
              const rand = Math.random();
              if (complexity < 0.4) {
                  if (isBackbeat) sliceIndex = snares.length ? getRand(snares) : getRand(allIndices);
                  else if (stepInBar === 0 || stepInBar === 8) sliceIndex = kicks.length ? getRand(kicks) : getRand(allIndices);
                  else sliceIndex = hats.length ? getRand(hats) : (percs.length ? getRand(percs) : getRand(allIndices));
              } else if (complexity < 0.7) {
                  if (rand < 0.3) sliceIndex = kicks.length ? getRand(kicks) : 0;
                  else if (rand < 0.6) sliceIndex = snares.length ? getRand(snares) : 0;
                  else sliceIndex = hats.length ? getRand(hats) : 0;
              } else {
                  sliceIndex = getRand(allIndices);
              }
              if (sliceIndex === undefined) sliceIndex = getRand(allIndices);

              let ratchet = 1;
              if (active && Math.random() < (complexity * 0.5)) {
                  ratchet = Math.floor(Math.random() * 3) + 2;
              }
              return { ...step, active: true, sliceIndex, ratchet };
          });
          return { ...prev, steps: newSteps };
      });
  }, []);

  const generateAiPattern = useCallback(async (model: string, inputType: 'slider' | 'text', stepCount: 8 | 16 | 32, description: string, complexity?: number, apiKey?: string, bpm?: string, style?: string) => {
      const slices = slicesRef.current;
      if (slices.length === 0) return;

      // Classify slices
      const kicks = slices.filter(s => s.type === 'kick');
      const snares = slices.filter(s => s.type === 'snare');
      const hats = slices.filter(s => s.type === 'hihat');
      const percs = slices.filter(s => s.type === 'perc');

      // Build prompt
      let prompt = `Generate a ${stepCount}-step drum pattern in 4/4 time. Step 1 is the beginning of the beat (downbeat). `;
      
      if (style && STYLE_SEEDS[style]) {
          prompt += `${STYLE_SEEDS[style].prompt} `;
      }

      if (bpm) {
          prompt += `At ${bpm} BPM. `;
      } else if (style && STYLE_SEEDS[style]) {
          const [min, max] = STYLE_SEEDS[style].bpmRange;
          prompt += `Suggest a BPM between ${min} and ${max}. `;
      }

      prompt += `Available slices: `;
      if (kicks.length) prompt += `${kicks.length} kicks (indices: ${kicks.map(s => s.id).join(',')}), `;
      if (snares.length) prompt += `${snares.length} snares (indices: ${snares.map(s => s.id).join(',')}), `;
      if (hats.length) prompt += `${hats.length} hats (indices: ${hats.map(s => s.id).join(',')}), `;
      if (percs.length) prompt += `${percs.length} percussion (indices: ${percs.map(s => s.id).join(',')}). `;

      if (inputType === 'text') {
          prompt += `Style description: ${description}. `;
      } else {
          const complexityLabel = complexity! < 0.3 ? 'simple' : complexity! < 0.7 ? 'medium' : 'complex';
          prompt += `Complexity level: ${complexityLabel}. `;
      }

      prompt += `Create a rhythmic pattern that fits 4/4 time signature, with appropriate emphasis on beats 1, 2, 3, 4. `;

      if (bpm) {
          prompt += `Return a JSON array of ${stepCount} objects, each with: active (boolean), sliceIndex (number), ratchet (1-4). Only use valid slice indices.`;
      } else {
          prompt += `Return a JSON object with "bpm" (suggested tempo) and "pattern" (array of ${stepCount} objects, each with: active (boolean), sliceIndex (number), ratchet (1-4)). Only use valid slice indices.`;
      }
try {
    // Call AI API
    let envKey = '';
    if (model === 'deepseek') {
        envKey = (import.meta as any).env.VITE_DEEPSEEK_API_KEY || '';
    } else {
        envKey = (import.meta as any).env.VITE_OPENAI_API_KEY || '';
    }
    const effectiveApiKey = apiKey || envKey;
    if (!effectiveApiKey) {
        alert('Please provide an API key.');
        return;
    }

    let apiUrl = '';
    let payload: any = {};
    let headers: any = { 'Content-Type': 'application/json' };

    if (model.startsWith('openai-')) {
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${effectiveApiKey}`;
        payload = {
            model: model === 'openai-gpt4' ? 'gpt-4' : 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        };
    } else if (model === 'deepseek') {
        apiUrl = 'https://api.deepseek.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${effectiveApiKey}`;
        payload = {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1000
        };
    } else if (model === 'gemini') {
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${effectiveApiKey}`;
        payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };
    } else if (model === 'claude') {
        alert('Claude integration not implemented yet.');
        return;
    } else {
        alert('Unsupported model.');
        return;
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`AI API call failed: ${response.status} ${response.statusText}`);

    const data = await response.json();
    let aiResponse = '';

    if (model.startsWith('openai-') || model === 'deepseek') {
        aiResponse = data.choices[0].message.content;
    } else if (model === 'gemini') {
        aiResponse = data.candidates[0].content.parts[0].text;
    }

    console.log('AI Response:', aiResponse);

    // Try to extract JSON from ```json code block
    let jsonString = '';
    let aiData: any;
    if (bpm) {
        // Expect array
        const jsonBlockMatch = aiResponse.match(/```json\s*(\[[\s\S]*?\])\s*```/);
        if (jsonBlockMatch) {
            jsonString = jsonBlockMatch[1];
        } else {
            const arrayMatch = aiResponse.match(/\[[\s\S]*\]/);
            if (arrayMatch) jsonString = arrayMatch[0];
        }
        if (!jsonString) throw new Error('AI did not return a valid pattern array. Response: ' + aiResponse.substring(0, 200));
        aiData = { pattern: JSON.parse(jsonString) };
    } else {
        // Expect object with bpm and pattern
        const jsonBlockMatch = aiResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonBlockMatch) {
            jsonString = jsonBlockMatch[1];
        } else {
            const objectMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (objectMatch) jsonString = objectMatch[0];
        }
        if (!jsonString) throw new Error('AI did not return a valid pattern object. Response: ' + aiResponse.substring(0, 200));
        aiData = JSON.parse(jsonString);
    }

    const pattern = aiData.pattern;
    if (aiData.bpm && !bpm) {
        // Set the suggested BPM
        updateParams({ bpm: aiData.bpm });
    }

          // Update sequencer
          setSequencer(prev => {
              const newSteps = Array(stepCount).fill(0).map((_, i) => ({
                  active: pattern[i]?.active || false,
                  sliceIndex: pattern[i]?.sliceIndex || 0,
                  ratchet: pattern[i]?.ratchet || 1
              }));
              // Pad or truncate to match current stepCount
              while (newSteps.length < prev.stepCount) newSteps.push({ active: false, sliceIndex: 0, ratchet: 1 });
              newSteps.splice(prev.stepCount);
              return { ...prev, steps: newSteps, stepCount: Math.max(prev.stepCount, stepCount) };
          });

      } catch (error) {
          console.error('AI Pattern Generation failed:', error);
          alert(`Failed to generate AI pattern: ${error.message}`);
      }
  }, []);

  const selectSlice = useCallback((index: number) => setSelectedSliceIndex(index), []);
  const toggleSliceActive = useCallback((index: number) => { setSlices(prev => { const newSlices = [...prev]; if (newSlices[index]) newSlices[index] = { ...newSlices[index], isActive: !newSlices[index].isActive }; return newSlices; }); }, []);
  const updateSlice = useCallback((index: number, changes: Partial<Slice>) => { setSlices(prev => { const newSlices = [...prev]; if (newSlices[index]) newSlices[index] = { ...newSlices[index], ...changes }; return newSlices; }); }, []);
  const autoSlice = useCallback(() => { if (!audioBuffer) return; const newSlices = generateTransientSlices(audioBuffer, params.bpm || 120, 0, audioBuffer.duration); setSlices(newSlices); setSelectedSliceIndex(0); setSequencer(prev => ({ ...prev, steps: prev.steps.map((s, i) => ({ ...s, sliceIndex: i % newSlices.length })) })); }, [audioBuffer, params.bpm]);
  const getSourceAudio = useCallback(async (): Promise<Blob | null> => { if (!audioBuffer) return null; return audioBufferToWav(audioBuffer.get()); }, [audioBuffer]);
  const getAudioWav = useCallback(async (): Promise<Blob | null> => { return getSourceAudio(); }, [getSourceAudio]);
  const exportPreset = useCallback(async (name: string): Promise<string> => { const preset: Preset = { id: crypto.randomUUID(), name, date: Date.now(), params: paramsRef.current, sequencer: sequencerRef.current, slices: slicesRef.current, sampleName: sampleName, sampleId: currentSampleId || undefined }; return JSON.stringify(preset, null, 2); }, [sampleName, currentSampleId]);
  const importPreset = useCallback(async (json: string) => { try { const preset = JSON.parse(json) as Preset; await loadPreset(preset); } catch (e) { console.error(e); alert("Invalid preset"); } }, [loadPreset]);

  return {
    isReady, isPlaying, isLoading, audioBuffer, params, sequencer, slices, selectedSliceIndex, sampleName, currentSampleId, currentPresetId, midiConfig, midiInputs, midiOutputs,
    midiDebug: { log: midiLogRef, clockCount: midiClockCountRef, clockDeltas: midiClockDeltasRef },
    metronomeConfig,
    loadAudioFile, loadConstructionKit, togglePlay, updateParams, scrub, updateSequencerStep, setSequencerMode, setSequencerStepCount, setSequencerEditMode, setSequencerPlaybackBehavior, randomizePattern, generateAiBeat, generateAiPattern, selectSlice, toggleSliceActive, updateSlice, sliceRegion, autoSlice, exportPreset, importPreset, loadPreset, getAudioWav, getSourceAudio, togglePreviewOriginal, isPreviewPlaying, playSliceRaw, toggleSliceLoop, sliceLoopState, setTransportBpm, toggleLoop, stepForward, stepBackward, updateMidiConfig, updateMetronomeConfig,
    loadImpulseResponse
  };
};
