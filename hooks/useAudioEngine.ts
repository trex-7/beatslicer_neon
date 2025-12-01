
import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { GranularSynthParams, EffectParams, AllParams, Slice, SequencerState, SequencerMode, SequencerStep, SliceType, Preset, KitSample } from '../types';
import { detectBPM } from '../utils/bpmDetector';
import { classifySlice } from '../utils/audioAnalysis';
import { audioBufferToWav, blobToBase64, base64ToBlob } from '../utils/audioHelpers';
import { removeLeadingSilence, generateTransientSlices } from '../utils/transientDetection';

declare const Tone: any; // Using Tone.js from CDN

// Improved Defaults - Only Compressor (Med) is active by default
const initialParams: AllParams = {
  grainSize: 0.08,  // Tighter grain (80ms) for percussion
  overlap: 0.05,    // Smoother crossfade (50ms)
  detune: 0,
  playbackRate: 1,
  bpm: 120,
  attack: 0.005,    // Safe default attack (5ms) to prevent clicks
  release: 0.1,     // 100ms Release for tight tails
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
  distortion: { isActive: true, amount: 1.0, wet: 0.1 }, // Updated Default: Enabled, High Drive, Low Mix
  compressor: { isActive: true, threshold: -24, ratio: 4, attack: 0.01, release: 0.1 }, // Med Preset Default
  bitCrusher: { isActive: false, bits: 8, wet: 0 },
  glitch: { 
      chaos: 0, 
      allowReverse: false, 
      allowOctaveJump: true,
      allowRatchet: true,
      pitchShift: true, // Default to preserving length
      allowFormant: true 
  }
};

const generateDefaultSteps = (count: number): SequencerStep[] => {
  return Array(count).fill(0).map((_, i) => ({
    active: i % 2 === 0, // More active steps by default
    sliceIndex: i, // Map steps to slices sequentially
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
  
  const [slices, setSlices] = useState<Slice[]>([]);
  const [selectedSliceIndex, setSelectedSliceIndex] = useState<number | null>(null);
  
  const [sequencer, setSequencer] = useState<SequencerState>({
    steps: generateDefaultSteps(16),
    stepCount: 16,
    mode: 'forward',
    currentStep: -1,
    isPlaying: false,
    editMode: 'trigger'
  });

  const sequenceRef = useRef<any>(null);
  const sequencerRef = useRef(sequencer);
  const paramsRef = useRef(params); 
  const slicesRef = useRef(slices); // Ref to hold latest slices
  const player = useRef<any>(null);
  const previewPlayer = useRef<any>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [sliceLoopState, setSliceLoopState] = useState<{index: number | null, isLooping: boolean}>({ index: null, isLooping: false });

  const effects = useRef({
    reverb: null as any, 
    delay: null as any, 
    filter: null as any, 
    dcBlocker: null as any,
    filterFollower: null as any,
    filterEnvDepth: null as any,
    filterLFO: null as any,
    filterLFODepth: null as any,
    distortion: null as any,
    bitCrusher: null as any,
    compressor: null as any
  });
  
  // Performance state for DJ FX
  const djLoopRef = useRef<any>(null);
  const isDjModeRef = useRef(false);
  const lastPlayedSliceRef = useRef<Slice | null>(null);
  const reverseRef = useRef(false);

  // Safe Parameter Setter Helper
  const setToneParam = useCallback((target: any, param: string, value: number, rampTime?: number) => {
      if (!target || target[param] === undefined) return;
      
      // Check if it's a Signal (has .value and it's not just a property named value)
      if (target[param] && typeof target[param] === 'object' && 'value' in target[param]) {
          if (rampTime && typeof target[param].rampTo === 'function') {
               target[param].rampTo(value, rampTime);
          } else {
               target[param].value = value;
          }
      } else {
          // It's a primitive or we are forcing assignment
          target[param] = value;
      }
  }, []);

  useEffect(() => {
    sequencerRef.current = sequencer;
  }, [sequencer]);

  useEffect(() => {
      paramsRef.current = params;
  }, [params]);

  useEffect(() => {
      slicesRef.current = slices;
  }, [slices]);

  useEffect(() => {
    const setupAudio = async () => {
      try {
          Tone.Transport.bpm.value = params.bpm;
          
          previewPlayer.current = new Tone.Player().toDestination();

          effects.current.reverb = new Tone.Reverb({
            decay: params.reverb.decay,
            wet: params.reverb.wet,
          }).toDestination();

          effects.current.delay = new Tone.FeedbackDelay({
            delayTime: params.delay.delayTime,
            feedback: params.delay.feedback,
            wet: params.delay.wet,
          }).connect(effects.current.reverb);

          // AutoFilter Chain Construction
          
          // 1. The main filter node
          effects.current.filter = new Tone.Filter({
            frequency: params.filter.frequency,
            Q: params.filter.q,
            type: params.filter.type,
          });

          // 2. DC Blocker / Safety Filter (HighPass @ 10Hz)
          effects.current.dcBlocker = new Tone.Filter({
              frequency: 10,
              type: 'highpass',
              rolloff: -24,
              Q: 0.1 
          }).connect(effects.current.delay);

          effects.current.filter.connect(effects.current.dcBlocker);

          // 3. Envelope Follower Branch
          effects.current.filterFollower = new Tone.Follower(0.05); 
          effects.current.filterEnvDepth = new Tone.Gain(0);
          effects.current.filterFollower.connect(effects.current.filterEnvDepth);
          effects.current.filterEnvDepth.connect(effects.current.filter.frequency);

          // 4. LFO Branch
          effects.current.filterLFO = new Tone.LFO(1, -1, 1).start();
          effects.current.filterLFODepth = new Tone.Gain(0);
          effects.current.filterLFO.connect(effects.current.filterLFODepth);
          effects.current.filterLFODepth.connect(effects.current.filter.frequency);

          effects.current.bitCrusher = new Tone.BitCrusher({
              bits: params.bitCrusher.bits,
              wet: params.bitCrusher.wet
          });
          // Fan out: BitCrusher connects to Filter (Audio) AND Follower (Modulation Source)
          effects.current.bitCrusher.connect(effects.current.filter);
          effects.current.bitCrusher.connect(effects.current.filterFollower);

          effects.current.distortion = new Tone.Distortion(params.distortion.amount).connect(effects.current.bitCrusher);
          effects.current.distortion.wet.value = params.distortion.wet;

          // Replace Tape Saturation with Compressor
          effects.current.compressor = new Tone.Compressor({
              threshold: params.compressor.threshold,
              ratio: params.compressor.ratio,
              attack: params.compressor.attack,
              release: params.compressor.release
          }).connect(effects.current.distortion);

          setIsReady(true);
      } catch (e) {
          console.error("Audio initialization failed", e);
          setIsReady(true);
      }
    };
    setupAudio();
    return () => {
      player.current?.dispose();
      previewPlayer.current?.dispose();
      sequenceRef.current?.dispose();
      if (djLoopRef.current) djLoopRef.current.dispose();
      Object.values(effects.current).forEach((effect: any) => effect?.dispose());
      Tone.Transport.stop();
      Tone.Transport.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parameter Update Logic
  const updateParams = useCallback((newParams: Partial<AllParams>) => {
    // 1. Calculate new state
    const updated = { ...paramsRef.current, ...newParams };
    
    // 2. Sync Ref immediately for Audio Loop access
    paramsRef.current = updated;

    // 3. Update React State
    setParams(updated);

    // 4. Apply Side Effects to Tone.js Nodes
    const efx = effects.current;

    if (newParams.bpm !== undefined) {
        Tone.Transport.bpm.value = updated.bpm;
    }
    
    if (player.current && !player.current.disposed) {
        // Change detection: Only update if explicitly in newParams to prevent redundant audio engine resets
        if (newParams.grainSize !== undefined) player.current.grainSize = updated.grainSize;
        if (newParams.overlap !== undefined) player.current.overlap = updated.overlap;
        
        // Use setToneParam for safety against crashes
        if (!isDjModeRef.current) {
            if (newParams.playbackRate !== undefined) {
                setToneParam(player.current, 'playbackRate', updated.playbackRate);
            }
            if (newParams.detune !== undefined) {
                setToneParam(player.current, 'detune', updated.detune);
            }
        }
        
        // Use 1ms minimum floor to prevent clicks
        if (newParams.attack !== undefined) player.current.fadeIn = Math.max(0.001, updated.attack); 
        if (newParams.release !== undefined) player.current.fadeOut = Math.max(0.001, updated.release);
    }
    
    // Effects Updates
    if (efx.reverb && newParams.reverb) {
            const rev = updated.reverb;
            let decay = rev.decay;
            if (rev.isSynced) {
                try {
                decay = Tone.Time(rev.syncValue).toSeconds();
                } catch(e) {
                    console.warn("Invalid sync value", rev.syncValue);
                }
            }
            efx.reverb.decay = Math.max(0.1, Math.min(decay, 10));
            // Toggle On/Off Logic (Use Mix)
            setToneParam(efx.reverb, 'wet', rev.isActive ? rev.wet : 0); 
    }

    if (efx.delay && newParams.delay) {
            const del = updated.delay;
            if (del.isSynced) {
            setToneParam(efx.delay, 'delayTime', Tone.Time(del.syncValue).toSeconds());
            } else {
            setToneParam(efx.delay, 'delayTime', del.delayTime);
            }
            setToneParam(efx.delay, 'feedback', del.feedback);
             // Toggle On/Off Logic (Use Mix)
            setToneParam(efx.delay, 'wet', del.isActive ? del.wet : 0);
    }

    if (newParams.filter && efx.filter) {
            const f = updated.filter;
            efx.filter.type = f.type;
            
            if (efx.filterLFO) {
                if (f.isSynced) {
                    efx.filterLFO.frequency.value = f.syncValue;
                } else {
                    efx.filterLFO.frequency.value = f.lfoRate;
                }
            }

            // Filter Bypass Logic
            if (!f.isActive) {
                if (f.type === 'lowpass') setToneParam(efx.filter, 'frequency', 20000);
                else if (f.type === 'highpass') setToneParam(efx.filter, 'frequency', 0);
                else setToneParam(efx.filter, 'frequency', f.frequency);

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
        setToneParam(efx.bitCrusher, 'bits', updated.bitCrusher.bits);
        setToneParam(efx.bitCrusher, 'wet', updated.bitCrusher.isActive ? updated.bitCrusher.wet : 0);
    }

    // Compressor Update
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
  }, [setToneParam]);


  // Sequencer Loop
  useEffect(() => {
    if (sequenceRef.current) sequenceRef.current.dispose();
    if (!audioBuffer) return;

    const indices = Array.from({ length: sequencer.stepCount }, (_, i) => i);

    sequenceRef.current = new Tone.Sequence((time: number, index: number) => {
        const currentSeq = sequencerRef.current;
        const currentParams = paramsRef.current;
        const currentSlices = slicesRef.current; 
        
        let actualStepIndex = index;
        const length = currentSeq.stepCount;

        switch (currentSeq.mode) {
            case 'backward': actualStepIndex = length - 1 - index; break;
            case 'random': actualStepIndex = Math.floor(Math.random() * length); break;
            case 'pendulum': /* To implement if needed */ break;
        }

        if (actualStepIndex < 0 || actualStepIndex >= currentSeq.steps.length) return;

        Tone.Draw.schedule(() => {
            setSequencer(prev => ({ ...prev, currentStep: actualStepIndex }));
        }, time);

        const stepData = currentSeq.steps[actualStepIndex];
        
        if (stepData.active && currentSlices.length > 0) {
             const slice = currentSlices[stepData.sliceIndex % currentSlices.length];
             if (slice && slice.isActive) {
                 lastPlayedSliceRef.current = slice;
             }
        }

        if (stepData.active && player.current && !player.current.disposed && currentSlices.length > 0) {
             const slice = currentSlices[stepData.sliceIndex % currentSlices.length];
             if (slice && slice.isActive) {
                 
                 if (isDjModeRef.current) return;

                 // 1. Glitch Chaos Logic
                 let playbackRate = currentParams.playbackRate;
                 let reverse = reverseRef.current !== (slice.reverse || false);
                 let detune = currentParams.detune;
                 let repeats = stepData.ratchet || 1;
                 
                 player.current.grainSize = currentParams.grainSize;
                 player.current.overlap = currentParams.overlap;

                 if (currentParams.glitch.chaos > 0 && Math.random() < currentParams.glitch.chaos) {
                     const roll = Math.random();
                     
                     if (currentParams.glitch.allowRatchet && Math.random() < 0.4) {
                         repeats = Math.floor(Math.random() * 3) + 2; 
                     }

                     if (currentParams.glitch.allowFormant && Math.random() < 0.4) {
                         player.current.grainSize = (Math.random() * 0.1) + 0.02;
                         player.current.overlap = Math.random() * 0.1;
                     }

                     if (currentParams.glitch.allowReverse && roll < 0.3) {
                         reverse = !reverse;
                     } 
                     else if (currentParams.glitch.allowOctaveJump && roll < 0.6) {
                         if (currentParams.glitch.pitchShift) {
                             const isKick = slice.type === 'kick';
                             const shift = isKick ? 1200 : (Math.random() > 0.5 ? 1200 : -1200);
                             detune += shift;
                         } else {
                             playbackRate *= (Math.random() > 0.5 ? 2.0 : 0.5);
                         }
                     } 
                     else {
                         if (currentParams.glitch.pitchShift) {
                             detune += (Math.random() * 400) - 200;
                         } else {
                             playbackRate *= (0.8 + Math.random() * 0.4);
                         }
                     }
                 }

                 setToneParam(player.current, 'playbackRate', playbackRate);
                 player.current.reverse = reverse;
                 setToneParam(player.current, 'detune', detune);

                 const attack = (slice.fadeIn !== undefined && slice.fadeIn >= 0) ? slice.fadeIn : currentParams.attack;
                 const release = (slice.fadeOut !== undefined && slice.fadeOut >= 0) ? slice.fadeOut : currentParams.release;
                 
                 player.current.fadeIn = Math.max(0.001, attack);
                 player.current.fadeOut = Math.max(0.001, release);

                 const levelDb = slice.level <= 0 ? -Infinity : 20 * Math.log10(slice.level);
                 setToneParam(player.current, 'volume', levelDb); 

                 const stepDuration = Tone.Time("16n").toSeconds();
                 const retriggerInterval = stepDuration / repeats;

                 for(let i = 0; i < repeats; i++) {
                     const triggerTime = time + (i * retriggerInterval);
                     player.current.stop(triggerTime);
                     player.current.start(triggerTime, slice.offset, slice.duration / repeats); 
                 }
             }
        }

    }, indices, "16n").start(0);

    if (isPlaying && Tone.Transport.state !== 'started') Tone.Transport.start();

    return () => sequenceRef.current?.dispose();
  }, [sequencer.stepCount, audioBuffer, isPlaying, setToneParam]);


  const loadAudioFile = useCallback(async (audioFile: File | string, preserveSettings: boolean = false, nameOverride?: string) => {
    setIsLoading(true);

    if (djLoopRef.current) {
        djLoopRef.current.dispose();
        djLoopRef.current = null;
    }
    isDjModeRef.current = false;
    reverseRef.current = false;

    if (player.current) {
      player.current.stop();
      player.current.dispose();
      player.current = null;
    }
    if (previewPlayer.current) {
        previewPlayer.current.stop();
        setIsPreviewPlaying(false);
        setSliceLoopState({ index: null, isLooping: false });
    }
    
    try {
      const url = typeof audioFile === 'string' ? audioFile : URL.createObjectURL(audioFile);
      
      let filename = 'Default';
      if (nameOverride) {
          filename = nameOverride;
      } else if (audioFile instanceof File) {
          filename = audioFile.name;
      } else if (typeof audioFile === 'string') {
          filename = audioFile.split('/').pop()?.split('?')[0] || 'Default';
      }
      setSampleName(filename);

      const bufferPromise = new Promise<any>((resolve, reject) => {
          const buff = new Tone.Buffer(url, () => resolve(buff), (err: any) => reject(err));
      });

      const buffer = await Promise.race([bufferPromise, new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 10000))]) as any;
      
      let rawBuffer = buffer.get();
      // Use imported utility
      rawBuffer = removeLeadingSilence(rawBuffer);
      
      const processedBuffer = new Tone.Buffer(rawBuffer);

      if (!preserveSettings) {
          let detectedBpm = 0;
          if (filename) {
              const explicitMatch = filename.match(/(\d{2,3})\s*bpm/i);
              if (explicitMatch) {
                  const val = parseInt(explicitMatch[1]);
                  if (val >= 50 && val <= 200) detectedBpm = val;
              }
              
              if (!detectedBpm) {
                   const numbers = filename.match(/\d+/g);
                   if (numbers) {
                       const valid = numbers.map(n => parseInt(n)).find(n => n >= 50 && n <= 200);
                       if (valid) detectedBpm = valid;
                   }
              }
          }

          if (!detectedBpm) {
              detectedBpm = await detectBPM(rawBuffer);
          }

          const beatDuration = 60 / (detectedBpm || 120);
          // Use imported utility
          const newSlices = generateTransientSlices(processedBuffer, detectedBpm || 120, 0, processedBuffer.duration);
          setSlices(newSlices);
          setSelectedSliceIndex(0);
          if (newSlices.length > 0) lastPlayedSliceRef.current = newSlices[0];

          setSequencer(prev => {
            const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
                ...step,
                sliceIndex: i % (newSlices.length || 1),
                ratchet: 1
            }));
            return { ...prev, steps: newSteps, currentStep: -1 };
          });

          // COMPLETE RESET OF PARAMETERS
          const resetParams: AllParams = {
              ...initialParams,
              bpm: detectedBpm || 120,
              grainSize: beatDuration / 8, 
              overlap: 0.05, 
              attack: 0.005,
              release: 0.1,
              delay: { 
                  ...initialParams.delay, 
                  delayTime: beatDuration * 0.75 
              },
              filter: initialParams.filter,
              reverb: initialParams.reverb,
              distortion: initialParams.distortion,
              bitCrusher: initialParams.bitCrusher,
              compressor: initialParams.compressor,
              glitch: initialParams.glitch
          };
          
          updateParams(resetParams);
      }

      // Use the latest params (whether preserved or reset)
      const currentParams = paramsRef.current;
      
      player.current = new Tone.GrainPlayer({
        url: processedBuffer,
        loop: false, 
        grainSize: currentParams.grainSize,
        overlap: currentParams.overlap,
        playbackRate: currentParams.playbackRate,
        detune: currentParams.detune,
        fadeIn: Math.max(0.001, currentParams.attack),
        fadeOut: Math.max(0.001, currentParams.release)
      }).connect(effects.current.compressor); 
      
      if (player.current) {
         player.current.grainSize = currentParams.grainSize;
         player.current.overlap = currentParams.overlap;
         player.current.playbackRate = currentParams.playbackRate;
         player.current.detune = currentParams.detune;
         player.current.fadeIn = Math.max(0.001, currentParams.attack);
         player.current.fadeOut = Math.max(0.001, currentParams.release);
         player.current.volume.value = 0;
      }

      setAudioBuffer(processedBuffer);
      
      if (previewPlayer.current) {
          previewPlayer.current.buffer = processedBuffer;
      }

      if (isPlaying) {
        await Tone.start();
        Tone.Transport.start();
      }

    } catch (error: any) {
      console.error("Error loading audio file:", error);
      let msg = error?.message || "Unknown error";
      if (typeof error === 'object' && error.target) {
          msg = "Network or Format Error (404/CORs)";
      }
      alert(`Failed to load audio file: ${msg}. The URL might be broken.`);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, updateParams, setToneParam]); 

  const loadConstructionKit = useCallback(async (files: File[] | KitSample[], kitName: string) => {
      setIsLoading(true);
      
      if (djLoopRef.current) {
          djLoopRef.current.dispose();
          djLoopRef.current = null;
      }
      isDjModeRef.current = false;
      reverseRef.current = false;

      if (player.current) {
        player.current.stop();
        player.current.dispose();
        player.current = null;
      }
      if (previewPlayer.current) {
          previewPlayer.current.stop();
          setIsPreviewPlaying(false);
          setSliceLoopState({ index: null, isLooping: false });
      }

      try {
          setSampleName(kitName);

          const buffers: { buffer: any, name: string, type: SliceType }[] = [];
          
          for (const item of files) {
              const url = item instanceof File ? URL.createObjectURL(item) : item.url;
              const name = item instanceof File ? item.name : item.name;
              
              let type: SliceType = 'perc';
              if (!(item instanceof File) && item.type) {
                  type = item.type;
              } else {
                  const lower = name.toLowerCase();
                  if (lower.includes('kick') || lower.includes('bd')) type = 'kick';
                  else if (lower.includes('snare') || lower.includes('sd') || lower.includes('clap')) type = 'snare';
                  else if (lower.includes('hat') || lower.includes('hh')) type = 'hihat';
              }

              try {
                  const buffer = await new Promise<any>((resolve, reject) => {
                      const b = new Tone.Buffer(url, () => resolve(b), (e: any) => reject(e));
                  });
                  buffers.push({ buffer: buffer.get(), name, type });
              } catch (e: any) {
                  console.warn(`Skipped loading sample: ${name} - ${e?.message || "Network Error"}`);
              }
          }

          if (buffers.length === 0) {
              throw new Error("No valid audio files found in this kit. Check your file paths or network connection.");
          }

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
                  if (startSample + i < channelData.length) {
                      channelData[startSample + i] = bData[i];
                  }
              }

              newSlices.push({
                  id: index,
                  offset: currentOffset,
                  duration: b.buffer.duration,
                  isActive: true,
                  type: b.type,
                  level: 1.0,
              });

              currentOffset += b.buffer.duration + padding;
          });

          const finalToneBuffer = new Tone.Buffer(masterBuffer);

          setAudioBuffer(finalToneBuffer);
          setSlices(newSlices);
          setSelectedSliceIndex(0);
          if (newSlices.length > 0) lastPlayedSliceRef.current = newSlices[0];

          setSequencer(prev => {
              const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
                  ...step,
                  active: i % 2 === 0, 
                  sliceIndex: i % newSlices.length,
                  ratchet: 1
              }));
              return { ...prev, steps: newSteps, currentStep: -1 };
          });

          // RESET PARAMETERS FOR KIT
          const resetParams: AllParams = {
              ...initialParams,
              bpm: 120, 
              grainSize: 0.05,
              overlap: 0.025,
              filter: initialParams.filter,
              reverb: initialParams.reverb,
              distortion: initialParams.distortion,
              bitCrusher: initialParams.bitCrusher,
              compressor: initialParams.compressor,
              glitch: initialParams.glitch
          };
          updateParams(resetParams);
          
          const currentParams = paramsRef.current;

          player.current = new Tone.GrainPlayer({
              url: finalToneBuffer,
              grainSize: currentParams.grainSize, 
              overlap: currentParams.overlap,  
              playbackRate: currentParams.playbackRate,
              detune: currentParams.detune,
              fadeIn: 0.001,   
              fadeOut: 0.01    
          }).connect(effects.current.compressor); 
          
          if (player.current) {
            player.current.grainSize = currentParams.grainSize;
            player.current.overlap = currentParams.overlap;
            player.current.playbackRate = currentParams.playbackRate;
            player.current.detune = currentParams.detune;
            player.current.fadeIn = 0.001;
            player.current.fadeOut = 0.01;
          }

          if (previewPlayer.current) {
            previewPlayer.current.buffer = finalToneBuffer;
          }

          if (isPlaying) {
            if (Tone.Transport.state !== 'started') Tone.Transport.start();
          }

      } catch (error: any) {
          console.error("Error loading construction kit", error);
          alert(`Failed to load kit: ${error.message || "Unknown error"}.`);
      } finally {
          setIsLoading(false);
      }
  }, [isPlaying, updateParams]);

  const togglePlay = useCallback(async () => {
    if (!player.current) return;
    if (Tone.context.state !== 'running') await Tone.start();

    if (isPlaying) {
      Tone.Transport.stop();
      player.current.stop();
      setIsPlaying(false);
      setSequencer(prev => ({ ...prev, isPlaying: false, currentStep: -1 }));
      
      isDjModeRef.current = false;
      if (djLoopRef.current) { djLoopRef.current.dispose(); djLoopRef.current = null; }

    } else {
      Tone.Transport.start();
      setIsPlaying(true);
      setSequencer(prev => ({ ...prev, isPlaying: true }));
    }
  }, [isPlaying]);

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


  // --- Slicing & Editing ---

  const sliceRegion = useCallback((start: number, end: number) => {
    if (!audioBuffer) return;
    
    const rawBuffer = audioBuffer.get();
    
    const newSlices = [{
            id: 0,
            offset: start,
            duration: end - start,
            isActive: true,
            type: classifySlice(rawBuffer, start, end - start),
            level: 1.0,
            reverse: false,
    }];

    setSlices(newSlices);
    setSelectedSliceIndex(0);
    if (newSlices.length > 0) lastPlayedSliceRef.current = newSlices[0];

    setSequencer(prev => {
        const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
            ...step,
            sliceIndex: i % newSlices.length,
            ratchet: 1
        }));
        return { ...prev, steps: newSteps, currentStep: -1 };
    });
  }, [audioBuffer]);

  const autoSlice = useCallback(() => {
    if (!audioBuffer) return;
    const newSlices = generateTransientSlices(audioBuffer, params.bpm, 0, audioBuffer.duration);
    setSlices(newSlices);
    setSelectedSliceIndex(0);
    if (newSlices.length > 0) lastPlayedSliceRef.current = newSlices[0];

    setSequencer(prev => {
        const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
            ...step,
            sliceIndex: i % (newSlices.length || 1),
            ratchet: 1
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

  const selectSlice = useCallback((index: number) => setSelectedSliceIndex(index), []);
  
  const toggleSliceActive = useCallback((index: number) => {
     updateSlice(index, { isActive: !slices[index].isActive });
  }, [slices, updateSlice]);

  const scrub = useCallback((pos: number) => {}, []);

  // --- DJ Actions ---
  const djActions = {
      triggerStutter: useCallback((subdivision: '4n'|'8n'|'16n'|'32n', active: boolean) => {
          if (active) {
               isDjModeRef.current = true;
               if (Tone.Transport.state !== 'started') {
                   Tone.Transport.start();
                   setIsPlaying(true);
                   setSequencer(prev => ({ ...prev, isPlaying: true }));
               }

               if (djLoopRef.current) { djLoopRef.current.dispose(); }
               
               const slice = lastPlayedSliceRef.current || slices[0];

               if (slice && player.current) {
                   player.current.stop(); 
                   
                   setToneParam(player.current, 'playbackRate', params.playbackRate);
                   player.current.reverse = false;

                   djLoopRef.current = new Tone.Loop((time: number) => {
                       player.current.stop(time);
                       player.current.start(time, slice.offset, slice.duration);
                   }, subdivision).start(); 
               }
          } else {
               isDjModeRef.current = false;
               if (djLoopRef.current) {
                   djLoopRef.current.dispose();
                   djLoopRef.current = null;
               }
               if (player.current) {
                    setToneParam(player.current, 'playbackRate', params.playbackRate);
                    player.current.reverse = false;
               }
          }
      }, [params.playbackRate, slices, setToneParam]),

      triggerTapeStop: useCallback((active: boolean) => {
           if (!player.current) return;
           if (active) {
               isDjModeRef.current = true;
               if (Tone.Transport.state !== 'started') {
                   Tone.Transport.start();
                   setIsPlaying(true);
                   setSequencer(prev => ({ ...prev, isPlaying: true }));
               }
               if (djLoopRef.current) { djLoopRef.current.dispose(); }

               const slice = lastPlayedSliceRef.current || slices[0];
               
               if (slice) {
                   player.current.stop();

                   setToneParam(player.current, 'playbackRate', 0.001, 0.8);
                   
                   djLoopRef.current = new Tone.Loop((time: number) => {
                       player.current.stop(time);
                       player.current.start(time, slice.offset, slice.duration);
                   }, "4n").start();
               }
           } else {
               isDjModeRef.current = false;
               if (djLoopRef.current) { djLoopRef.current.dispose(); djLoopRef.current = null; }
               setToneParam(player.current, 'playbackRate', params.playbackRate, 0.2);
           }
      }, [params.playbackRate, slices, setToneParam]),

      triggerReverse: useCallback((active: boolean) => {
           if (!player.current) return;
           if (active) {
               isDjModeRef.current = true;
               player.current.reverse = true;
               if (Tone.Transport.state !== 'started') {
                   Tone.Transport.start();
                   setIsPlaying(true);
                   setSequencer(prev => ({ ...prev, isPlaying: true }));
               }
               
               if (djLoopRef.current) { djLoopRef.current.dispose(); }
               
               const slice = lastPlayedSliceRef.current || slices[0];
               if (slice) {
                   player.current.stop();
                   
                   djLoopRef.current = new Tone.Loop((time: number) => {
                       player.current.stop(time);
                       player.current.start(time, slice.offset, slice.duration);
                   }, "8n").start();
               }

           } else {
               isDjModeRef.current = false;
               player.current.reverse = false;
               if (djLoopRef.current) {
                   djLoopRef.current.dispose();
                   djLoopRef.current = null;
               }
           }
      }, [slices]),

      triggerFill: useCallback((type: 'scatter' | 'build' | 'break', active: boolean) => {
        if (active) {
            isDjModeRef.current = true;
            if (Tone.Transport.state !== 'started') {
                   Tone.Transport.start();
                   setIsPlaying(true);
                   setSequencer(prev => ({ ...prev, isPlaying: true }));
            }
            if (djLoopRef.current) { djLoopRef.current.dispose(); }

            const activeSlices = slices.filter(s => s.isActive);
            const pool = activeSlices.length > 0 ? activeSlices : slices;
            if (pool.length === 0 || !player.current) return;

            const kicks = pool.filter(s => s.type === 'kick');
            const snares = pool.filter(s => s.type === 'snare');
            const hats = pool.filter(s => s.type === 'hihat');

            player.current.stop();
            player.current.reverse = false;
            setToneParam(player.current, 'playbackRate', params.playbackRate);

            player.current.volume.value = 0;

            let counter = 0;

            if (type === 'build') {
                 const s = snares.length > 0 ? snares[0] : (pool[Math.floor(pool.length/2)] || pool[0]);
                 
                 djLoopRef.current = new Tone.Loop((time: number) => {
                     player.current.stop(time);
                     
                     const pos = counter % 16;
                     
                     const pitchRamp = 1 + (pos / 16);
                     setToneParam(player.current, 'playbackRate', params.playbackRate * pitchRamp);
                     
                     const volRamp = -24 + ((pos / 15) * 26);
                     player.current.volume.value = volRamp;

                     player.current.start(time, s.offset, s.duration / pitchRamp);
                     counter++;
                 }, "16n").start();

            } else if (type === 'scatter') {
                 djLoopRef.current = new Tone.Loop((time: number) => {
                     player.current.stop(time);
                     player.current.volume.value = 0; 
                     
                     const s = pool[Math.floor(Math.random() * pool.length)];
                     
                     const reverse = Math.random() > 0.7;
                     const octave = Math.random() > 0.8 ? 2 : (Math.random() > 0.8 ? 0.5 : 1);
                     
                     player.current.reverse = reverse;
                     setToneParam(player.current, 'playbackRate', params.playbackRate * octave);
                     
                     player.current.start(time, s.offset, s.duration);
                 }, "16n").start();

            } else if (type === 'break') {
                 const patterns = [
                     ['k', 'h', 's', 'k', 'h', 'k', 's', 'h'], 
                     ['k', 'k', 's', null, 'k', null, 's', 'k'], 
                     ['k', 'h', 'k', 'h', 's', 'h', 's', 'k'] 
                 ];
                 const pat = patterns[Math.floor(Math.random() * patterns.length)];
                 const subdivision = "8n"; 
                 
                 djLoopRef.current = new Tone.Loop((time: number) => {
                     player.current.stop(time);
                     player.current.volume.value = 0; 
                     
                     const step = counter % 8;
                     const type = pat[step];
                     
                     if (!type && Math.random() > 0.5 && hats.length > 0) {
                         const h = hats[Math.floor(Math.random()*hats.length)];
                         setToneParam(player.current, 'playbackRate', params.playbackRate);
                         player.current.reverse = false;
                         player.current.start(time, h.offset, h.duration);
                     } else if (type) {
                         let s = pool[0];
                         if (type === 'k' && kicks.length) s = kicks[Math.floor(Math.random()*kicks.length)];
                         if (type === 's' && snares.length) s = snares[Math.floor(Math.random()*snares.length)];
                         if (type === 'h' && hats.length) s = hats[Math.floor(Math.random()*hats.length)];
                         
                         setToneParam(player.current, 'playbackRate', params.playbackRate);
                         player.current.reverse = false;
                         player.current.start(time, s.offset, s.duration);
                     }
                     
                     counter++;
                 }, subdivision).start();
            }

        } else {
            isDjModeRef.current = false;
            if (djLoopRef.current) { djLoopRef.current.dispose(); djLoopRef.current = null; }
            if (player.current) {
                 setToneParam(player.current, 'playbackRate', params.playbackRate);
                 setToneParam(player.current, 'detune', params.detune); 
                 player.current.reverse = false;
                 player.current.volume.rampTo(0, 0.1);
            }
        }
    }, [slices, params.playbackRate, params.detune, setToneParam])
  };

  // --- Generator ---

  const generateAiBeat = useCallback((complexity: number) => {
      if (slices.length === 0) return;
      
      const activeSlices = slices.filter(s => s.isActive);
      const pool = activeSlices.length > 0 ? activeSlices : slices;

      const kicks = pool.filter(s => s.type === 'kick');
      const snares = pool.filter(s => s.type === 'snare');
      const hats = pool.filter(s => s.type === 'hihat');
      const percs = pool.filter(s => s.type === 'perc');
      
      const getKick = () => kicks.length > 0 ? kicks[Math.floor(Math.random() * kicks.length)].id : (pool[0]?.id || 0);
      const getSnare = () => snares.length > 0 ? snares[Math.floor(Math.random() * snares.length)].id : (pool[0]?.id || 0);
      const getHat = () => hats.length > 0 ? hats[Math.floor(Math.random() * hats.length)].id : (pool[0]?.id || 0);
      const getAny = () => pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)].id : 0;

      const newSteps = Array(sequencer.steps.length).fill(0).map((_, i) => {
          const step = i % 16; 
          let active = false;
          let sliceId = 0;
          let ratchet = 1;

          if (complexity < 0.34) {
              if (step % 4 === 0) {
                  active = true;
                  if (step === 4 || step === 12) {
                      sliceId = getSnare(); 
                  } else {
                      sliceId = getKick();  
                  }
              }
              if (step % 4 === 2) {
                  active = true;
                  sliceId = getHat();
              }
              if (!active && Math.random() < (complexity * 1.5)) {
                   active = true;
                   sliceId = Math.random() > 0.5 ? getHat() : (percs.length ? percs[0].id : getHat());
              }
          } 
          else if (complexity < 0.67) {
              if (step === 0) { active = true; sliceId = getKick(); }
              if (step === 4 || step === 12) { active = true; sliceId = getSnare(); }
              
              const syncopationLevel = (complexity - 0.34) * 3; 

              if (!active && step === 8) {
                   if (Math.random() > 0.3) { active = true; sliceId = getKick(); }
              }

              if (!active && (step === 2 || step === 3 || step === 7 || step === 10 || step === 11 || step === 14)) {
                   if (Math.random() < 0.15 + (syncopationLevel * 0.25)) {
                       active = true;
                       sliceId = getKick();
                   }
              }

              if (!active) {
                   if (step % 2 === 0) {
                       active = true;
                       sliceId = getHat();
                   } 
                   else if (Math.random() < 0.2 + (syncopationLevel * 0.5)) {
                       active = true;
                       sliceId = getHat();
                       if (Math.random() < 0.3) ratchet = Math.random() > 0.5 ? 2 : 3;
                   }
              }
          }
          else {
              if (step === 0) { active = true; sliceId = getKick(); }
              if (step === 4 || step === 12) { active = true; sliceId = getSnare(); }

              if (!active) {
                  const chaosLevel = (complexity - 0.67) * 3; 
                  if (Math.random() < 0.5 + (chaosLevel * 0.4)) {
                      active = true;
                      sliceId = getAny();
                      
                      if (Math.random() < 0.3 + (chaosLevel * 0.3)) {
                          ratchet = Math.floor(Math.random() * 4) + 1;
                      }
                  }
              }
          }
          
          return { active, sliceIndex: active ? sliceId : 0, ratchet };
      });

      setSequencer(prev => ({ ...prev, steps: newSteps }));
  }, [slices, sequencer.steps.length]);

  // --- Preset Management ---

  const exportPreset = useCallback(async (name: string): Promise<string> => {
      const preset: Preset = {
          id: crypto.randomUUID(),
          name,
          date: Date.now(),
          params,
          sequencer: {
              steps: sequencer.steps,
              stepCount: sequencer.stepCount,
              mode: sequencer.mode
          },
          slices,
          sampleName,
      };
      return JSON.stringify(preset);
  }, [params, sequencer, slices, sampleName]);
  
  const getAudioWav = useCallback(async (): Promise<Blob | null> => {
      if (!audioBuffer) return null;
      return audioBufferToWav(audioBuffer.get());
  }, [audioBuffer]);

  const loadPreset = useCallback(async (preset: Preset) => {
      const mergedParams = { ...initialParams, ...preset.params };
      paramsRef.current = mergedParams;
      
      if (preset.audioData) {
          const blob = base64ToBlob(preset.audioData);
          const url = URL.createObjectURL(blob);
          await loadAudioFile(url, true);
      } 
      else if (preset.sampleUrl) {
          await loadAudioFile(preset.sampleUrl, true, preset.sampleName);
      }

      setParams(mergedParams);
      
      if (preset.slices && preset.slices.length > 0) {
          setSlices(preset.slices);
          if (preset.slices.length > 0) lastPlayedSliceRef.current = preset.slices[0];
      }

      const seqData = preset.sequencer || { steps: [], stepCount: 16, mode: 'forward' };
      setSequencer(prev => ({
          ...prev,
          steps: seqData.steps || [],
          stepCount: seqData.stepCount || 16,
          mode: seqData.mode || 'forward',
          currentStep: -1
      }));

      setSampleName(preset.sampleName || 'Imported Preset');
      
      updateParams(mergedParams);
  }, [loadAudioFile, updateParams]);

  const importPreset = useCallback(async (jsonString: string) => {
      try {
          const preset: Preset = JSON.parse(jsonString);
          await loadPreset(preset);
      } catch (e) {
          console.error("Import failed", e);
          alert("Failed to import preset. Invalid file.");
      }
  }, [loadPreset]);

  // State Wrappers
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

  const randomizePattern = useCallback(() => generateAiBeat(Math.random()), [generateAiBeat]);

  return {
    isReady, isPlaying, isLoading, audioBuffer, params, sequencer, slices, selectedSliceIndex, sampleName,
    loadAudioFile, loadConstructionKit, togglePlay, updateParams, scrub,
    updateSequencerStep,
    setSequencerMode,
    setSequencerStepCount,
    setSequencerEditMode,
    randomizePattern, 
    generateAiBeat,
    selectSlice, toggleSliceActive, updateSlice, sliceRegion, autoSlice,
    djActions,
    exportPreset, importPreset, loadPreset, getAudioWav,
    togglePreviewOriginal, isPreviewPlaying, playSliceRaw, toggleSliceLoop, sliceLoopState
  };
};
