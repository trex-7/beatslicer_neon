import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { GranularSynthParams, EffectParams, AllParams, Slice, SequencerState, SequencerMode, SequencerStep, SliceType, Preset, KitSample } from '../types';
import { detectBPM } from '../utils/bpmDetector';
import { classifySlice } from '../utils/audioAnalysis';
import { audioBufferToWav, blobToBase64, base64ToBlob } from '../utils/audioHelpers';

declare const Tone: any; // Using Tone.js from CDN

// Improved Defaults for better immediate user experience
const initialParams: AllParams = {
  grainSize: 0.12,  // Slightly larger for smoother texture
  overlap: 0.08,    // Smoother crossfade to avoid buzzing
  detune: 0,
  playbackRate: 1,
  bpm: 120,
  attack: 0.05,     // Softer attack
  release: 0.25,    // Longer release for better sustain
  reverb: { decay: 2.0, wet: 0.15, isSynced: false, syncValue: '2n' },
  delay: { delayTime: 0.5, feedback: 0.3, wet: 0, isSynced: false, syncValue: '8n' },
  filter: { frequency: 20000, q: 1, type: 'lowpass' },
  distortion: { amount: 0, wet: 0 },
  tapeSaturation: { drive: 0, tone: 20000, wet: 0 },
  bitCrusher: { bits: 8, wet: 0 },
  glitch: { chaos: 0, allowReverse: true, allowOctaveJump: true }
};

const generateDefaultSteps = (count: number): SequencerStep[] => {
  return Array(count).fill(0).map((_, i) => ({
    active: i % 2 === 0, // More active steps by default
    sliceIndex: i, // Map steps to slices sequentially
    ratchet: 1
  }));
};

// Transient Detection Algorithm
const findTransients = (audioBuffer: AudioBuffer, startTime: number, endTime: number): number[] => {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.min(channelData.length, Math.floor(endTime * sampleRate));
    
    // Analysis window (~10ms)
    const windowSize = 512; 
    const stepSize = 128; // 75% overlap for better time resolution
    const minDistanceTime = 0.05; // Minimum 50ms between slices to avoid granular stutter on long kicks
    
    const transients: number[] = [];
    let lastTransientTime = -100;
    
    let prevEnergy = 0;
    
    for (let i = startSample; i < endSample - windowSize; i += stepSize) {
        let currentEnergy = 0;
        // Calculate RMS
        for (let j = 0; j < windowSize; j++) {
            const sample = channelData[i + j];
            currentEnergy += sample * sample;
        }
        currentEnergy = Math.sqrt(currentEnergy / windowSize);
        
        // Onset Detection Logic:
        if (currentEnergy > 0.01 && currentEnergy > prevEnergy * 1.6) {
             const time = i / sampleRate;
             if (time - lastTransientTime > minDistanceTime) {
                 const adjustedTime = Math.max(startTime, time - 0.005);
                 transients.push(adjustedTime);
                 lastTransientTime = adjustedTime;
             }
        }
        prevEnergy = Math.max(currentEnergy, 0.005); 
    }
    
    if (transients.length === 0) {
        transients.push(startTime);
    } else if (transients[0] - startTime > 0.1) {
        transients.unshift(startTime);
    }

    return transients;
};

const generateTransientSlices = (buffer: any, bpm: number, startTime: number = 0, endTime: number | null = null): Slice[] => {
    const audioBuffer = buffer.get(); // Get raw AudioBuffer from Tone.Buffer
    const end = endTime !== null ? endTime : audioBuffer.duration;
    const duration = end - startTime;
    
    if (duration <= 0) return [];

    let slicePoints = findTransients(audioBuffer, startTime, end);
    
    const maxSlices = 32;
    if (slicePoints.length > maxSlices) {
        slicePoints = slicePoints.slice(0, maxSlices);
    }

    const newSlices: Slice[] = [];
    for (let i = 0; i < slicePoints.length; i++) {
        const currentStart = slicePoints[i];
        const nextStart = (i < slicePoints.length - 1) ? slicePoints[i+1] : end;
        let sliceDur = nextStart - currentStart;
        
        if (sliceDur < 0.01 && newSlices.length > 0) {
            newSlices[newSlices.length - 1].duration += sliceDur;
        } else {
            const type = classifySlice(audioBuffer, currentStart, sliceDur);
            newSlices.push({
                id: i,
                offset: currentStart,
                duration: sliceDur,
                isActive: true,
                type: type,
                level: 1.0
            });
        }
    }
    return newSlices;
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
  const player = useRef<any>(null);
  const previewPlayer = useRef<any>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [sliceLoopState, setSliceLoopState] = useState<{index: number | null, isLooping: boolean}>({ index: null, isLooping: false });

  const effects = useRef({
    reverb: null as any, 
    delay: null as any, 
    filter: null as any, 
    distortion: null as any,
    bitCrusher: null as any,
    tapeSaturation: null as any,
    tapeFilter: null as any,
  });
  
  // Performance state for DJ FX
  const djLoopRef = useRef<any>(null);
  const isDjModeRef = useRef(false);
  const lastPlayedSliceRef = useRef<Slice | null>(null);
  const reverseRef = useRef(false);

  // Safe Parameter Setter Helper
  const setToneParam = (target: any, param: string, value: number, rampTime?: number) => {
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
  };

  useEffect(() => {
    sequencerRef.current = sequencer;
  }, [sequencer]);

  useEffect(() => {
      paramsRef.current = params;
  }, [params]);

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

          effects.current.filter = new Tone.Filter({
            frequency: params.filter.frequency,
            Q: params.filter.q,
            type: params.filter.type,
          }).connect(effects.current.delay);

          effects.current.bitCrusher = new Tone.BitCrusher({
              bits: params.bitCrusher.bits,
              wet: params.bitCrusher.wet
          }).connect(effects.current.filter);

          effects.current.distortion = new Tone.Distortion(params.distortion.amount).connect(effects.current.bitCrusher);
          effects.current.distortion.wet.value = params.distortion.wet;

          effects.current.tapeFilter = new Tone.Filter({
              frequency: params.tapeSaturation.tone,
              type: 'lowpass',
              Q: 0.5
          }).connect(effects.current.distortion);

          effects.current.tapeSaturation = new Tone.Distortion({
            distortion: params.tapeSaturation.drive,
            oversample: '4x',
            wet: params.tapeSaturation.wet
          }).connect(effects.current.tapeFilter);

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
  const updateParams = (newParams: Partial<AllParams>) => {
    setParams(prev => {
        const updated = { ...prev, ...newParams };
        const efx = effects.current;

        if (newParams.bpm) {
            Tone.Transport.bpm.value = newParams.bpm;
        }
        
        if (player.current && !player.current.disposed) {
            if (updated.grainSize !== undefined) player.current.grainSize = updated.grainSize;
            if (updated.overlap !== undefined) player.current.overlap = updated.overlap;
            
            // Use setToneParam for safety against crashes
            if (!isDjModeRef.current) {
                if (updated.playbackRate !== undefined) {
                    setToneParam(player.current, 'playbackRate', updated.playbackRate);
                }
                if (updated.detune !== undefined) {
                    setToneParam(player.current, 'detune', updated.detune);
                }
            }
            
            if (updated.attack !== undefined) player.current.fadeIn = updated.attack;
            if (updated.release !== undefined) player.current.fadeOut = updated.release;
        }
        
        // Effects Updates
        if (efx.reverb && updated.reverb) {
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
             setToneParam(efx.reverb, 'wet', rev.wet); 
        }

        if (efx.delay && updated.delay) {
             const del = updated.delay;
             if (del.isSynced) {
                setToneParam(efx.delay, 'delayTime', Tone.Time(del.syncValue).toSeconds());
             } else {
                setToneParam(efx.delay, 'delayTime', del.delayTime);
             }
             setToneParam(efx.delay, 'feedback', del.feedback);
             setToneParam(efx.delay, 'wet', del.wet);
        }

        if (updated.filter && efx.filter) {
             setToneParam(efx.filter, 'frequency', updated.filter.frequency);
             setToneParam(efx.filter, 'Q', updated.filter.q);
             efx.filter.type = updated.filter.type;
        }

        if (updated.distortion && efx.distortion) {
             efx.distortion.distortion = updated.distortion.amount;
             setToneParam(efx.distortion, 'wet', updated.distortion.wet);
        }

        if (updated.bitCrusher && efx.bitCrusher) {
            setToneParam(efx.bitCrusher, 'bits', updated.bitCrusher.bits);
            setToneParam(efx.bitCrusher, 'wet', updated.bitCrusher.wet);
        }

        if (updated.tapeSaturation) {
            if (efx.tapeSaturation) {
                efx.tapeSaturation.distortion = updated.tapeSaturation.drive;
                setToneParam(efx.tapeSaturation, 'wet', updated.tapeSaturation.wet);
            }
            if (efx.tapeFilter) {
                setToneParam(efx.tapeFilter, 'frequency', updated.tapeSaturation.tone);
            }
        }

        return updated;
    });
  };


  // Sequencer Loop
  useEffect(() => {
    if (sequenceRef.current) sequenceRef.current.dispose();
    if (!audioBuffer) return;

    const indices = Array.from({ length: sequencer.stepCount }, (_, i) => i);

    sequenceRef.current = new Tone.Sequence((time: number, index: number) => {
        const currentSeq = sequencerRef.current;
        const currentParams = paramsRef.current;
        
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
        
        // Logic to determine current slice
        if (stepData.active && slices.length > 0) {
             const slice = slices[stepData.sliceIndex % slices.length];
             if (slice && slice.isActive) {
                 // Update tracking ref for DJ effects to the most recent active slice
                 lastPlayedSliceRef.current = slice;
             }
        }

        // Playback logic
        if (stepData.active && player.current && !player.current.disposed && slices.length > 0) {
             const slice = slices[stepData.sliceIndex % slices.length];
             if (slice && slice.isActive) {
                 
                 // Freeze Logic: If DJ mode is active, skip the sequencer trigger
                 if (isDjModeRef.current) return;

                 // 1. Glitch Chaos Logic
                 let playbackRate = currentParams.playbackRate;
                 
                 // XOR Logic: If global reverse is true, and slice reverse is true, we play forward.
                 // If only one is true, we play reverse.
                 let reverse = reverseRef.current !== (slice.reverse || false);
                 
                 let detune = currentParams.detune;
                 
                 if (currentParams.glitch.chaos > 0 && Math.random() < currentParams.glitch.chaos) {
                     const roll = Math.random();
                     if (currentParams.glitch.allowReverse && roll < 0.3) {
                         reverse = !reverse;
                     } else if (currentParams.glitch.allowOctaveJump && roll < 0.6) {
                         detune += (Math.random() > 0.5 ? 1200 : -1200);
                     } else {
                         playbackRate *= (0.8 + Math.random() * 0.4);
                     }
                 }

                 // Apply Params
                 setToneParam(player.current, 'playbackRate', playbackRate);
                 player.current.reverse = reverse;
                 setToneParam(player.current, 'detune', detune);

                 // Apply Per-Slice Envelope Overrides if present
                 const attack = slice.fadeIn !== undefined ? slice.fadeIn : currentParams.attack;
                 const release = slice.fadeOut !== undefined ? slice.fadeOut : currentParams.release;
                 player.current.fadeIn = attack;
                 player.current.fadeOut = release;

                 const levelDb = slice.level <= 0 ? -Infinity : 20 * Math.log10(slice.level);
                 setToneParam(player.current, 'volume', levelDb); 

                 // 2. Ratchet Logic (Retriggers)
                 const repeats = stepData.ratchet || 1;
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
  }, [sequencer.stepCount, slices, audioBuffer, isPlaying]);


  const loadAudioFile = useCallback(async (audioFile: File | string, preserveSettings: boolean = false, nameOverride?: string) => {
    setIsLoading(true);
    if (player.current) {
      player.current.stop();
      player.current.dispose();
      player.current = null;
    }
    // Stop preview player
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
      const rawBuffer = buffer.get();
      
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
          const newSlices = generateTransientSlices(buffer, detectedBpm || 120, 0, buffer.duration);
          setSlices(newSlices);
          setSelectedSliceIndex(0);
          // Set initial last played slice to the first one so DJ buttons work immediately
          if (newSlices.length > 0) lastPlayedSliceRef.current = newSlices[0];

          setSequencer(prev => {
            const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
                ...step,
                sliceIndex: i % (newSlices.length || 1),
                ratchet: 1
            }));
            return { ...prev, steps: newSteps, currentStep: -1 };
          });

          updateParams({ 
              bpm: detectedBpm || 120,
              grainSize: beatDuration / 4,
              overlap: beatDuration / 8,
              delay: { ...params.delay, delayTime: beatDuration * 0.75 }
          });
      }

      const currentParams = preserveSettings ? params : { grainSize: 0.12, overlap: 0.08, playbackRate: 1, detune: 0, attack: 0.05, release: 0.25 };
      
      player.current = new Tone.GrainPlayer({
        url: buffer,
        loop: false, 
        grainSize: currentParams.grainSize || 0.12,
        overlap: currentParams.overlap || 0.08,
        playbackRate: currentParams.playbackRate || 1,
        detune: currentParams.detune || 0,
        fadeIn: currentParams.attack || 0.05,
        fadeOut: currentParams.release || 0.25
      }).connect(effects.current.tapeSaturation);

      setAudioBuffer(buffer);
      
      if (previewPlayer.current) {
          previewPlayer.current.buffer = buffer;
      }

      if (isPlaying) {
        await Tone.start();
        Tone.Transport.start();
      }

    } catch (error) {
      console.error("Error loading audio file:", error);
      alert("Failed to load audio file.");
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, params]); 

  // New Function: Load multiple files and stitch them into a "Tape" with manual slices
  const loadConstructionKit = useCallback(async (files: File[] | KitSample[], kitName: string) => {
      setIsLoading(true);
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

          // 1. Load all files into Tone Buffers
          const buffers: { buffer: any, name: string, type: SliceType }[] = [];
          
          for (const item of files) {
              const url = item instanceof File ? URL.createObjectURL(item) : item.url;
              const name = item instanceof File ? item.name : item.name;
              
              // Try to classify based on filename if not explicit
              let type: SliceType = 'perc';
              if (!(item instanceof File) && item.type) {
                  type = item.type;
              } else {
                  const lower = name.toLowerCase();
                  if (lower.includes('kick') || lower.includes('bd')) type = 'kick';
                  else if (lower.includes('snare') || lower.includes('sd') || lower.includes('clap')) type = 'snare';
                  else if (lower.includes('hat') || lower.includes('hh')) type = 'hihat';
              }

              // Load buffer
              const buffer = await new Promise<any>((resolve, reject) => {
                  const b = new Tone.Buffer(url, () => resolve(b), (e: any) => reject(e));
              });
              buffers.push({ buffer: buffer.get(), name, type });
          }

          if (buffers.length === 0) throw new Error("No valid audio files found");

          // 2. Stitch Buffers
          // We add 0.1s padding between samples to prevent granule bleeding
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
              
              // Copy data
              for (let i = 0; i < bData.length; i++) {
                  if (startSample + i < channelData.length) {
                      channelData[startSample + i] = bData[i];
                  }
              }

              // Create Slice
              newSlices.push({
                  id: index,
                  offset: currentOffset,
                  duration: b.buffer.duration,
                  isActive: true,
                  type: b.type,
                  level: 1.0
              });

              currentOffset += b.buffer.duration + padding;
          });

          // Wrap in Tone Buffer
          const finalToneBuffer = new Tone.Buffer(masterBuffer);

          // 3. Setup State
          setAudioBuffer(finalToneBuffer);
          setSlices(newSlices);
          setSelectedSliceIndex(0);
          if (newSlices.length > 0) lastPlayedSliceRef.current = newSlices[0];

          // 4. Create Player
          player.current = new Tone.GrainPlayer({
              url: finalToneBuffer,
              grainSize: 0.1,
              overlap: 0.05,
              playbackRate: 1,
              detune: 0,
              fadeIn: 0.01,
              fadeOut: 0.05 // Tighter envelopes for one-shots
          }).connect(effects.current.tapeSaturation);
          
          if (previewPlayer.current) {
            previewPlayer.current.buffer = finalToneBuffer;
          }

          // 5. Reset Sequencer
          // Map slices sequentially across the steps
          setSequencer(prev => {
              const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
                  ...step,
                  active: i % 2 === 0, // simple 1/4 beat pattern default
                  sliceIndex: i % newSlices.length,
                  ratchet: 1
              }));
              return { ...prev, steps: newSteps, currentStep: -1 };
          });

          // Defaults for kits
          updateParams({
              bpm: 120, // Default bpm since we can't detect from one-shots
              grainSize: 0.1,
              overlap: 0.05
          });

          if (isPlaying) {
            if (Tone.Transport.state !== 'started') Tone.Transport.start();
          }

      } catch (error) {
          console.error("Error loading construction kit", error);
          alert("Failed to load kit.");
      } finally {
          setIsLoading(false);
      }
  }, [isPlaying]);

  const togglePlay = useCallback(async () => {
    if (!player.current) return;
    if (Tone.context.state !== 'running') await Tone.start();

    if (isPlaying) {
      Tone.Transport.stop();
      player.current.stop();
      setIsPlaying(false);
      setSequencer(prev => ({ ...prev, isPlaying: false, currentStep: -1 }));
      
      // Reset DJ State
      isDjModeRef.current = false;
      if (djLoopRef.current) { djLoopRef.current.dispose(); djLoopRef.current = null; }

    } else {
      Tone.Transport.start();
      setIsPlaying(true);
      setSequencer(prev => ({ ...prev, isPlaying: true }));
    }
  }, [isPlaying]);

  // --- Preview Logic ---
  const togglePreviewOriginal = () => {
      if (!previewPlayer.current || !previewPlayer.current.buffer.loaded) return;
      
      if (isPreviewPlaying) {
          previewPlayer.current.stop();
          setIsPreviewPlaying(false);
          setSliceLoopState({ index: null, isLooping: false });
      } else {
          // Stop any specific slice loop
          setSliceLoopState({ index: null, isLooping: false });
          
          previewPlayer.current.loop = true;
          previewPlayer.current.loopStart = 0;
          previewPlayer.current.loopEnd = previewPlayer.current.buffer.duration;
          previewPlayer.current.start();
          setIsPreviewPlaying(true);
      }
  };

  const playSliceRaw = (index: number) => {
      if (!previewPlayer.current || !slices[index]) return;
      
      // Stop any current preview/loop
      previewPlayer.current.stop();
      setIsPreviewPlaying(false);
      setSliceLoopState({ index: null, isLooping: false });

      const s = slices[index];
      previewPlayer.current.loop = false;
      previewPlayer.current.start(Tone.now(), s.offset, s.duration);
  };

  const toggleSliceLoop = (index: number) => {
      if (!previewPlayer.current || !slices[index]) return;

      if (sliceLoopState.index === index && sliceLoopState.isLooping) {
          // Stop
          previewPlayer.current.stop();
          setSliceLoopState({ index: null, isLooping: false });
      } else {
          // Start Loop
          previewPlayer.current.stop();
          setIsPreviewPlaying(false);

          const s = slices[index];
          previewPlayer.current.loopStart = s.offset;
          previewPlayer.current.loopEnd = s.offset + s.duration;
          previewPlayer.current.loop = true;
          previewPlayer.current.start(Tone.now(), s.offset);
          
          setSliceLoopState({ index, isLooping: true });
      }
  };


  // --- Slicing & Editing ---

  const sliceRegion = (start: number, end: number) => {
    if (!audioBuffer) return;
    const id = slices.length > 0 ? Math.max(...slices.map(s => s.id)) + 1 : 0;
    const newSlice: Slice = {
        id,
        offset: start,
        duration: end - start,
        isActive: true,
        type: classifySlice(audioBuffer.get(), start, end - start),
        level: 1.0,
        reverse: false
    };
    setSlices(prev => [...prev, newSlice]);
    setSelectedSliceIndex(slices.length);
  };

  const autoSlice = () => {
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
  };

  const updateSlice = (index: number, changes: Partial<Slice>) => {
      setSlices(prev => {
          const newSlices = [...prev];
          newSlices[index] = { ...newSlices[index], ...changes };
          return newSlices;
      });
      // If we update duration/offset while looping, update the loop
      if (sliceLoopState.index === index && sliceLoopState.isLooping && previewPlayer.current) {
          // Debounce or check if necessary logic could go here, but simple re-set is fine
          const s = { ...slices[index], ...changes };
          previewPlayer.current.loopStart = s.offset;
          previewPlayer.current.loopEnd = s.offset + s.duration;
      }
  };

  const selectSlice = (index: number) => setSelectedSliceIndex(index);
  
  const toggleSliceActive = (index: number) => {
     updateSlice(index, { isActive: !slices[index].isActive });
  };

  const scrub = (pos: number) => {
  };

  // --- DJ Actions ---
  const djActions = {
      triggerStutter: (subdivision: '4n'|'8n'|'16n'|'32n', active: boolean) => {
          if (active) {
               isDjModeRef.current = true;
               if (Tone.Transport.state !== 'started') {
                   Tone.Transport.start();
                   setIsPlaying(true);
                   setSequencer(prev => ({ ...prev, isPlaying: true }));
               }

               if (djLoopRef.current) { djLoopRef.current.dispose(); }
               
               // Fallback to first slice if nothing played yet
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
               // Reset Params
               if (player.current) {
                    setToneParam(player.current, 'playbackRate', params.playbackRate);
                    player.current.reverse = false;
               }
          }
      },
      triggerTapeStop: (active: boolean) => {
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

                   // Ramp down rate for the stop effect
                   setToneParam(player.current, 'playbackRate', 0.001, 0.8);
                   
                   djLoopRef.current = new Tone.Loop((time: number) => {
                       player.current.stop(time);
                       player.current.start(time, slice.offset, slice.duration);
                   }, "4n").start();
               }
           } else {
               isDjModeRef.current = false;
               if (djLoopRef.current) { djLoopRef.current.dispose(); djLoopRef.current = null; }
               // Restore rate
               setToneParam(player.current, 'playbackRate', params.playbackRate, 0.2);
           }
      },
      triggerReverse: (active: boolean) => {
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
      },
      triggerFill: (type: 'scatter' | 'build' | 'break', active: boolean) => {
        if (active) {
            isDjModeRef.current = true;
            if (Tone.Transport.state !== 'started') {
                   Tone.Transport.start();
                   setIsPlaying(true);
                   setSequencer(prev => ({ ...prev, isPlaying: true }));
            }
            if (djLoopRef.current) { djLoopRef.current.dispose(); }

            // Get active slices for pool
            const activeSlices = slices.filter(s => s.isActive);
            const pool = activeSlices.length > 0 ? activeSlices : slices;
            if (pool.length === 0 || !player.current) return;

            const kicks = pool.filter(s => s.type === 'kick');
            const snares = pool.filter(s => s.type === 'snare');
            const hats = pool.filter(s => s.type === 'hihat');

            player.current.stop();
            player.current.reverse = false;
            setToneParam(player.current, 'playbackRate', params.playbackRate);

            let counter = 0;

            if (type === 'build') {
                 // 1 Bar Build up
                 // Rising pitch and intensity
                 const s = snares.length > 0 ? snares[0] : (pool[Math.floor(pool.length/2)] || pool[0]);
                 
                 djLoopRef.current = new Tone.Loop((time: number) => {
                     player.current.stop(time);
                     
                     // Calculate position in the measure (0 to 15)
                     const pos = counter % 16;
                     
                     // Ramp Pitch: Starts normal, goes up to +12st
                     const pitchRamp = 1 + (pos / 16);
                     setToneParam(player.current, 'playbackRate', params.playbackRate * pitchRamp);
                     
                     // Retrigger speed increases? 
                     // For simplicity in a Loop, we stick to 16th notes but shorten duration?
                     player.current.start(time, s.offset, s.duration / pitchRamp);
                     counter++;
                 }, "16n").start();

            } else if (type === 'scatter') {
                 // Chaos: Random slices, random reverse, random octave
                 djLoopRef.current = new Tone.Loop((time: number) => {
                     player.current.stop(time);
                     
                     const s = pool[Math.floor(Math.random() * pool.length)];
                     
                     // Random Parameters
                     const reverse = Math.random() > 0.7;
                     const octave = Math.random() > 0.8 ? 2 : (Math.random() > 0.8 ? 0.5 : 1);
                     
                     player.current.reverse = reverse;
                     setToneParam(player.current, 'playbackRate', params.playbackRate * octave);
                     
                     player.current.start(time, s.offset, s.duration);
                 }, "16n").start();

            } else if (type === 'break') {
                 // Generative Breakbeat
                 // 1 Bar Pattern generated on trigger
                 // We can use a few templates or pure random weights
                 const patterns = [
                     ['k', 'h', 's', 'k', 'h', 'k', 's', 'h'], // Classic
                     ['k', 'k', 's', null, 'k', null, 's', 'k'], // D&Bish
                     ['k', 'h', 'k', 'h', 's', 'h', 's', 'k']  // Jungle
                 ];
                 const pat = patterns[Math.floor(Math.random() * patterns.length)];
                 const subdivision = "8n"; // 8th note base for breaks
                 
                 djLoopRef.current = new Tone.Loop((time: number) => {
                     player.current.stop(time);
                     
                     const step = counter % 8;
                     const type = pat[step];
                     
                     // Add some 16th note ghost notes randomly
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
            // RELEASE: Return to beat one / main sequence
            isDjModeRef.current = false;
            if (djLoopRef.current) { djLoopRef.current.dispose(); djLoopRef.current = null; }
            if (player.current) {
                 setToneParam(player.current, 'playbackRate', params.playbackRate);
                 setToneParam(player.current, 'detune', params.detune); // Reset detune too
                 player.current.reverse = false;
            }
        }
    }
  };

  // --- Generator ---

  const generateAiBeat = (complexity: number) => {
      if (slices.length === 0) return;
      const activeSlices = slices.filter(s => s.isActive);
      const pool = activeSlices.length > 0 ? activeSlices : slices;

      const kicks = pool.filter(s => s.type === 'kick');
      const snares = pool.filter(s => s.type === 'snare');
      const hats = pool.filter(s => s.type === 'hihat');
      
      const getSlice = (arr: Slice[], fb: Slice[]) => (arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)].id : (fb.length > 0 ? fb[Math.floor(Math.random() * fb.length)].id : 0));

      const newSteps = Array(sequencer.steps.length).fill(0).map((_, i) => {
          const stepNum = i % 16; 
          let active = false;
          let sliceId = 0;
          let ratchet = 1;

          if (complexity < 0.3) {
              // House
              if (stepNum % 4 === 0) { active = true; sliceId = getSlice(kicks, pool); }
              else if (stepNum % 4 === 2) { active = true; sliceId = getSlice(hats, pool); }
              if (stepNum === 4 || stepNum === 12) { active = true; sliceId = getSlice(snares, kicks); }
          } else if (complexity < 0.7) {
              // Breakbeat / Hip Hop
              if (stepNum === 0 || stepNum === 10) { active = true; sliceId = getSlice(kicks, pool); }
              if (stepNum === 4 || stepNum === 12) { active = true; sliceId = getSlice(snares, pool); }
              if (stepNum % 2 === 0 && !active) { 
                  if(Math.random()>0.5) { active = true; sliceId = getSlice(hats, pool); } 
              }
              // Trap Rolls
              if (active && Math.random() < 0.2 && complexity > 0.5) {
                  ratchet = Math.random() > 0.5 ? 2 : 3;
              }
          } else {
              // Glitch
              if (Math.random() > 0.3) { active = true; sliceId = getSlice(pool, pool); }
              if (active && Math.random() > 0.5) ratchet = Math.floor(Math.random() * 3) + 1; // 1 to 3
          }
          
          if (Math.random() < complexity * 0.3) active = !active;

          return { active, sliceIndex: active ? sliceId : 0, ratchet };
      });

      setSequencer(prev => ({ ...prev, steps: newSteps }));
  };

  // --- Preset Management ---

  const exportPreset = async (name: string): Promise<string> => {
      if (!audioBuffer) throw new Error("No audio loaded");
      const wavBlob = audioBufferToWav(audioBuffer.get());
      const base64Audio = await blobToBase64(wavBlob);
      
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
          audioData: base64Audio
      };
      return JSON.stringify(preset);
  };

  const importPreset = async (jsonString: string) => {
      try {
          const preset: Preset = JSON.parse(jsonString);
          await loadPreset(preset);
      } catch (e) {
          console.error("Import failed", e);
          alert("Failed to import preset. Invalid file.");
      }
  };

  const loadPreset = async (preset: Preset) => {
      if (preset.audioData) {
          const blob = base64ToBlob(preset.audioData);
          const url = URL.createObjectURL(blob);
          await loadAudioFile(url, true);
      }
      // If no audio data, we assume we are applying params to the current audio

      setParams(preset.params);
      
      // If the preset has slices (from a save), load them. 
      // Factory presets typically have empty slices so we don't overwrite the auto-slice
      if (preset.slices && preset.slices.length > 0) {
          setSlices(preset.slices);
          if (preset.slices.length > 0) lastPlayedSliceRef.current = preset.slices[0];
      }

      setSequencer(prev => ({
          ...prev,
          steps: preset.sequencer.steps,
          stepCount: preset.sequencer.stepCount,
          mode: preset.sequencer.mode,
          currentStep: -1
          // Keep playing state
      }));

      setSampleName(preset.sampleName || 'Imported Preset');
      updateParams(preset.params);
  };

  return {
    isReady, isPlaying, isLoading, audioBuffer, params, sequencer, slices, selectedSliceIndex,
    loadAudioFile, loadConstructionKit, togglePlay, updateParams, scrub,
    updateSequencerStep: (idx, chg) => setSequencer(p => { const s = [...p.steps]; s[idx] = {...s[idx], ...chg}; return {...p, steps: s}}),
    setSequencerMode: (m) => setSequencer(p => ({...p, mode: m})),
    setSequencerStepCount: (c) => setSequencer(p => {
        let newSteps = [...p.steps];
        if (c > newSteps.length) newSteps = [...newSteps, ...Array(c - newSteps.length).fill(0).map((_,i) => ({active:false, sliceIndex:0, ratchet: 1}))];
        else newSteps = newSteps.slice(0, c);
        return {...p, stepCount: c, steps: newSteps};
    }),
    setSequencerEditMode: (m: 'trigger' | 'ratchet') => setSequencer(p => ({...p, editMode: m})),
    randomizePattern: () => generateAiBeat(Math.random()), 
    generateAiBeat,
    selectSlice, toggleSliceActive, updateSlice, sliceRegion, autoSlice,
    djActions,
    exportPreset, importPreset, loadPreset,
    togglePreviewOriginal, isPreviewPlaying, playSliceRaw, toggleSliceLoop, sliceLoopState
  };
};