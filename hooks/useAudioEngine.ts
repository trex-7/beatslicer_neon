
import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { GranularSynthParams, EffectParams, AllParams, Slice, SequencerState, SequencerMode, SequencerStep } from '../types';
import { detectBPM } from '../utils/bpmDetector';

declare const Tone: any; // Using Tone.js from CDN

const initialParams: AllParams = {
  grainSize: 0.1, // Reduced default for better transient response
  overlap: 0.05,
  detune: 0,
  playbackRate: 1,
  bpm: 120,
  attack: 0.005, // Very sharp attack by default
  release: 0.1,  // Short release
  reverb: { decay: 1.5, wet: 0 },
  delay: { delayTime: 0.5, feedback: 0.3, wet: 0 },
  filter: { frequency: 20000, q: 1, type: 'lowpass' },
  distortion: { amount: 0, wet: 0 },
  bitCrusher: { bits: 4, wet: 0 },
};

const generateDefaultSteps = (count: number): any[] => {
  return Array(count).fill(0).map((_, i) => ({
    active: i % 2 === 0, // More active steps by default
    sliceIndex: i // Map steps to slices sequentially
  }));
};

export const useAudioEngine = () => {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<any>(null); // Tone.AudioBuffer
  const [params, setParams] = useState<AllParams>(initialParams);
  
  // Slicer & Sequencer State
  const [slices, setSlices] = useState<Slice[]>([]);
  const [selectedSliceIndex, setSelectedSliceIndex] = useState<number | null>(null);
  
  const [sequencer, setSequencer] = useState<SequencerState>({
    steps: generateDefaultSteps(16),
    stepCount: 16,
    mode: 'forward',
    currentStep: -1,
    isPlaying: false
  });

  // Refs
  const sequenceRef = useRef<any>(null); // Tone.Sequence
  const sequencerRef = useRef(sequencer); // Ref to hold latest sequencer state for callback
  const previousParams = useRef<{ grainSize: number; playbackRate: number }>({ grainSize: 0.2, playbackRate: 1 });
  const player = useRef<any>(null); // Tone.GrainPlayer
  const effects = useRef({
    reverb: null as any, 
    delay: null as any, 
    filter: null as any, 
    distortion: null as any,
    bitCrusher: null as any,
  });

  // Keep sequencerRef in sync with state
  useEffect(() => {
    sequencerRef.current = sequencer;
  }, [sequencer]);

  useEffect(() => {
    // Initialize Audio Engine
    const setupAudio = async () => {
      try {
          Tone.Transport.bpm.value = params.bpm;

          // Chain: Player -> BitCrusher -> Distortion -> Filter -> Delay -> Reverb -> Out
          
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

          effects.current.distortion = new Tone.Distortion(params.distortion.amount).connect(effects.current.filter);
          effects.current.distortion.wet.value = params.distortion.wet;

          effects.current.bitCrusher = new Tone.BitCrusher({
            bits: params.bitCrusher.bits,
            wet: params.bitCrusher.wet
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
      sequenceRef.current?.dispose();
      Object.values(effects.current).forEach((effect: any) => effect?.dispose());
      Tone.Transport.stop();
      Tone.Transport.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-create sequence when step count changes or audio loads
  // Note: We do NOT include 'sequencer' in deps to avoid re-creating on every step update
  useEffect(() => {
    if (sequenceRef.current) {
      sequenceRef.current.dispose();
    }

    if (!audioBuffer) return;

    // Create an array of indices [0, 1, 2... N] to drive the sequence
    const indices = Array.from({ length: sequencer.stepCount }, (_, i) => i);

    sequenceRef.current = new Tone.Sequence((time: number, index: number) => {
        const currentSeq = sequencerRef.current;
        
        // Determine actual step based on mode
        let actualStepIndex = index;
        const length = currentSeq.stepCount;

        switch (currentSeq.mode) {
            case 'backward':
                actualStepIndex = length - 1 - index;
                break;
            case 'random':
                actualStepIndex = Math.floor(Math.random() * length);
                break;
            case 'pendulum':
                 // Simple pendulum logic if needed, currently behaves linear for simplicity
                 break;
        }

        // Safety check
        if (actualStepIndex < 0 || actualStepIndex >= currentSeq.steps.length) return;

        // Update UI for current step (draw callback)
        Tone.Draw.schedule(() => {
            setSequencer(prev => ({ ...prev, currentStep: actualStepIndex }));
        }, time);

        const stepData = currentSeq.steps[actualStepIndex];
        
        if (stepData.active && player.current) {
             const slice = slices[stepData.sliceIndex % slices.length];
             if (slice) {
                 // Ensure loop is off for discrete slices
                 player.current.loop = false;
                 
                 // Play the specific slice
                 // Use stop/start to handle re-triggering monophonically
                 player.current.stop(time);
                 player.current.start(time, slice.offset, slice.duration);
             }
        }

    }, indices, "16n").start(0);

    // Only start transport if we are playing
    if (isPlaying) {
        if (Tone.Transport.state !== 'started') Tone.Transport.start();
    }

    return () => sequenceRef.current?.dispose();
  }, [sequencer.stepCount, slices, audioBuffer, isPlaying]);


  const loadAudioFile = useCallback(async (audioFile: File | string) => {
    setIsLoading(true);
    if (player.current) {
      player.current.stop();
      player.current.dispose();
    }
    
    try {
      const url = typeof audioFile === 'string' ? audioFile : URL.createObjectURL(audioFile);
      
      const bufferPromise = new Promise<any>((resolve, reject) => {
          const buff = new Tone.Buffer(
              url,
              () => resolve(buff),
              (err: any) => reject(err)
          );
      });

      const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Audio loading timed out")), 10000)
      );

      const buffer = await Promise.race([bufferPromise, timeoutPromise]) as any;
      const rawBuffer = buffer.get();
      const detectedBpm = await detectBPM(rawBuffer);

      const beatDuration = 60 / detectedBpm;
      const sixteenthNote = beatDuration / 4;

      // Generate Random Slices
      const newSlices: Slice[] = [];
      const totalDuration = buffer.duration;
      
      let currentOffset = 0;
      let id = 0;
      
      // Max 32 slices to keep UI manageable, but fill the buffer
      while (currentOffset < totalDuration - 0.05 && id < 32) {
          // Random subdivision: 
          // 50% chance 16th note
          // 30% chance 8th note (2x 16th)
          // 20% chance Quarter note (4x 16th)
          const rand = Math.random();
          let mult = 1; 
          if (rand > 0.8) mult = 4; // Quarter
          else if (rand > 0.5) mult = 2; // Eighth
          
          let dur = sixteenthNote * mult;
          
          // Clamp to end of file
          if (currentOffset + dur > totalDuration) {
              dur = totalDuration - currentOffset;
          }
          
          newSlices.push({
              id: id,
              offset: currentOffset,
              duration: dur
          });
          
          currentOffset += dur;
          id++;
      }

      setSlices(newSlices);
      setSelectedSliceIndex(0);

      // Reset Sequencer Pattern when new file loads
      // Map the new random slices to the 16 steps
      setSequencer(prev => {
         const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
             ...step,
             sliceIndex: i % newSlices.length
         }));
         return {
            ...prev,
            steps: newSteps,
            currentStep: -1
         };
      });

      setParams(prev => {
          const newParams = { 
              ...prev, 
              bpm: detectedBpm,
              grainSize: sixteenthNote, // Smaller grains for tighter sound
              overlap: sixteenthNote / 2,
              delay: { ...prev.delay, delayTime: beatDuration * 0.75 }
          };
          Tone.Transport.bpm.value = detectedBpm;
          if (effects.current.delay) effects.current.delay.delayTime.value = beatDuration * 0.75;
          return newParams;
      });

      player.current = new Tone.GrainPlayer({
        url: buffer,
        loop: false, 
        grainSize: sixteenthNote,
        overlap: sixteenthNote / 2,
        playbackRate: params.playbackRate,
        detune: params.detune,
        fadeIn: params.attack,
        fadeOut: params.release
      }).connect(effects.current.bitCrusher);

      setAudioBuffer(buffer);
      
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
  }, [isPlaying, params.playbackRate, params.detune, params.attack, params.release]);

  // Toggle Play/Stop
  const togglePlay = useCallback(async () => {
    if (!player.current) return;
    if (Tone.context.state !== 'running') await Tone.start();

    if (isPlaying) {
      // Stop
      Tone.Transport.stop();
      // Ensure we stop the player too
      player.current.stop();
      setIsPlaying(false);
      setSequencer(prev => ({ ...prev, isPlaying: false, currentStep: -1 }));
    } else {
      // Start
      Tone.Transport.start();
      setIsPlaying(true);
      setSequencer(prev => ({ ...prev, isPlaying: true }));
    }
  }, [isPlaying]);

  // Sequencer Controls
  const updateSequencerStep = (index: number, changes: Partial<SequencerStep>) => {
      setSequencer(prev => {
          const newSteps = [...prev.steps];
          newSteps[index] = { ...newSteps[index], ...changes };
          return { ...prev, steps: newSteps };
      });
  };

  const setSequencerMode = (mode: SequencerMode) => {
      setSequencer(prev => ({ ...prev, mode }));
  };

  const setSequencerStepCount = (count: 8 | 16 | 32) => {
      setSequencer(prev => {
          // Regenerate steps array if size changes
          const currentSteps = prev.steps;
          let newSteps = [...currentSteps];
          if (count > currentSteps.length) {
              // Add more
              const added = Array(count - currentSteps.length).fill(0).map((_, i) => ({
                  active: false,
                  sliceIndex: (currentSteps.length + i) % slices.length
              }));
              newSteps = [...newSteps, ...added];
          } else {
              // Trim
              newSteps = newSteps.slice(0, count);
          }
          return { ...prev, stepCount: count, steps: newSteps };
      });
  };

  const randomizePattern = () => {
      setSequencer(prev => {
          const newSteps = prev.steps.map(step => ({
              active: Math.random() > 0.4,
              sliceIndex: Math.floor(Math.random() * slices.length)
          }));
          return { ...prev, steps: newSteps };
      });
  };
  
  const selectSlice = (index: number) => {
      if (index < 0 || index >= slices.length) return;
      setSelectedSliceIndex(index);
      
      // Preview slice
      if (player.current && audioBuffer && !isPlaying) {
          const slice = slices[index];
          if (Tone.context.state !== 'running') Tone.start();
          
          player.current.loop = false;
          player.current.stop();
          player.current.start(Tone.now(), slice.offset, slice.duration);
      }
  };

  // Standard Parameter Updates
  const updateParams = useCallback((newParams: Partial<AllParams>) => {
    setParams(prev => {
        const updated = { ...prev, ...newParams };
        if (updated.bpm !== prev.bpm) Tone.Transport.bpm.rampTo(updated.bpm, 0.1);
        
        if (player.current) {
            if (updated.grainSize !== prev.grainSize) player.current.grainSize = updated.grainSize;
            if (updated.overlap !== prev.overlap) player.current.overlap = updated.overlap;
            if (updated.detune !== prev.detune) player.current.detune = updated.detune;
            if (updated.playbackRate !== prev.playbackRate) player.current.playbackRate = updated.playbackRate;
            
            // Update Attack/Release (FadeIn/FadeOut)
            if (updated.attack !== prev.attack) player.current.fadeIn = updated.attack;
            if (updated.release !== prev.release) player.current.fadeOut = updated.release;
        }
        // Effects... (Keep existing logic)
        if (effects.current.reverb) {
            if(updated.reverb.decay !== prev.reverb.decay) effects.current.reverb.decay = updated.reverb.decay;
            if(updated.reverb.wet !== prev.reverb.wet) effects.current.reverb.wet.value = updated.reverb.wet;
        }
        if (effects.current.delay) {
            if(updated.delay.delayTime !== prev.delay.delayTime) effects.current.delay.delayTime.value = updated.delay.delayTime;
            if(updated.delay.feedback !== prev.delay.feedback) effects.current.delay.feedback.value = updated.delay.feedback;
            if(updated.delay.wet !== prev.delay.wet) effects.current.delay.wet.value = updated.delay.wet;
        }
        if (effects.current.filter) {
            if(updated.filter.frequency !== prev.filter.frequency) effects.current.filter.frequency.rampTo(updated.filter.frequency, 0.1);
            if(updated.filter.q !== prev.filter.q) effects.current.filter.Q.value = updated.filter.q;
            if(updated.filter.type !== prev.filter.type) effects.current.filter.type = updated.filter.type;
        }
        if (effects.current.distortion) {
            if(updated.distortion.amount !== prev.distortion.amount) effects.current.distortion.distortion = updated.distortion.amount;
            if(updated.distortion.wet !== prev.distortion.wet) effects.current.distortion.wet.value = updated.distortion.wet;
        }
        if (effects.current.bitCrusher) {
            if(updated.bitCrusher.bits !== prev.bitCrusher.bits) effects.current.bitCrusher.bits = updated.bitCrusher.bits;
            if(updated.bitCrusher.wet !== prev.bitCrusher.wet) effects.current.bitCrusher.wet.value = updated.bitCrusher.wet;
        }
        return updated;
    });
  }, []);
  
  const scrub = (position: number) => {
    if (player.current && audioBuffer) {
        const newStartTime = position * audioBuffer.duration;
        player.current.stop();
        player.current.start(undefined, newStartTime);
    }
  };

  // DJ FX
  const triggerStutter = (subdivision: '4n' | '8n' | '16n' | '32n', active: boolean) => {
      if (!player.current) return;
      if (active) {
          const seconds = Tone.Time(subdivision).toSeconds();
          previousParams.current.grainSize = player.current.grainSize;
          player.current.grainSize = seconds;
          player.current.overlap = 0.001; 
      } else {
          player.current.grainSize = previousParams.current.grainSize;
          player.current.overlap = params.overlap;
      }
  };

  const triggerTapeStop = (active: boolean) => {
      if (!player.current) return;
      if (active) {
          previousParams.current.playbackRate = player.current.playbackRate;
          player.current.playbackRate = 0.01; 
      } else {
          player.current.playbackRate = previousParams.current.playbackRate;
      }
  };

  const triggerReverse = () => {
      if (!player.current) return;
      player.current.reverse = !player.current.reverse;
  };

  return { 
      isReady, 
      isPlaying, 
      isLoading, 
      audioBuffer, 
      params, 
      sequencer,
      slices,
      selectedSliceIndex,
      loadAudioFile, 
      togglePlay, 
      updateParams, 
      scrub,
      updateSequencerStep,
      setSequencerMode,
      setSequencerStepCount,
      randomizePattern,
      selectSlice,
      djActions: {
          triggerStutter,
          triggerTapeStop,
          triggerReverse
      }
  };
};
