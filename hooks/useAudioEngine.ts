








import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { GranularSynthParams, EffectParams, AllParams, Slice, SequencerState, SequencerMode, SequencerStep, SliceType, Preset, KitSample } from '../types';
import { detectBPM } from '../utils/bpmDetector';
import { classifySlice } from '../utils/audioAnalysis';
import { audioBufferToWav, blobToBase64, base64ToBlob } from '../utils/audioHelpers';

declare const Tone: any; // Using Tone.js from CDN

// Improved Defaults - Slightly softened to prevent clicks while maintaining punch
const initialParams: AllParams = {
  grainSize: 0.08,  // Tighter grain (80ms) for percussion
  overlap: 0.05,    // Smoother crossfade (50ms)
  detune: 0,
  playbackRate: 1,
  bpm: 120,
  attack: 0.005,    // Safe default attack (5ms) to prevent clicks
  release: 0.1,     // 100ms Release for tight tails
  reverb: { isActive: true, decay: 1.5, wet: 0, isSynced: false, syncValue: '2n' },
  delay: { isActive: true, delayTime: 0.375, feedback: 0.2, wet: 0, isSynced: true, syncValue: '8n' },
  filter: { 
      isActive: true,
      frequency: 2000, 
      q: 1, 
      type: 'lowpass',
      envDepth: 0,
      lfoDepth: 0,
      lfoRate: 1,
      isSynced: true,
      syncValue: '4n'
  },
  distortion: { isActive: true, amount: 0, wet: 0 },
  compressor: { isActive: true, threshold: -24, ratio: 4, attack: 0.01, release: 0.1 },
  bitCrusher: { isActive: true, bits: 8, wet: 0 },
  glitch: { chaos: 0, allowReverse: true, allowOctaveJump: true }
};

const generateDefaultSteps = (count: number): SequencerStep[] => {
  return Array(count).fill(0).map((_, i) => ({
    active: i % 2 === 0, // More active steps by default
    sliceIndex: i, // Map steps to slices sequentially
    ratchet: 1
  }));
};

// --- IMPROVED TRANSIENT DETECTION ---

// Finds the "valley" or noise floor immediately preceding a peak.
// This is superior to zero-crossing for preserving transients without clicking.
const backtrackToSilence = (channelData: Float32Array, peakIndex: number, sampleRate: number): number => {
    const scanWindow = Math.floor(sampleRate * 0.015); // Look back 15ms max
    const startIndex = Math.max(0, peakIndex - scanWindow);
    
    let lowestAmp = 10.0;
    let bestIndex = peakIndex;

    // Scan backwards from peak
    for (let i = peakIndex; i >= startIndex; i--) {
        const amp = Math.abs(channelData[i]);
        if (amp < lowestAmp) {
            lowestAmp = amp;
            bestIndex = i;
        }
        // If we hit effective silence, stop early
        if (amp < 0.001) {
            return i;
        }
    }
    return bestIndex;
};

// Detects transients based on energy rise, then backtracks to finding safe cut points
const findTransients = (audioBuffer: AudioBuffer, startTime: number, endTime: number): number[] => {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.min(channelData.length, Math.floor(endTime * sampleRate));
    
    // Analysis settings
    const windowSize = 512; 
    const stepSize = 128; 
    const minDistance = Math.floor(sampleRate * 0.06); // 60ms min distance between slices
    
    const transients: number[] = [];
    let lastTransientSample = -minDistance;
    
    let prevEnergy = 0;
    
    for (let i = startSample; i < endSample - windowSize; i += stepSize) {
        let currentEnergy = 0;
        // Calculate RMS
        for (let j = 0; j < windowSize; j++) {
            const sample = channelData[i + j];
            currentEnergy += sample * sample;
        }
        currentEnergy = Math.sqrt(currentEnergy / windowSize);
        
        // Dynamic Threshold: Look for sharp rise in energy
        // We use a lower threshold but enforce the backtrack logic to find the real start
        if (currentEnergy > 0.015 && currentEnergy > prevEnergy * 1.4) {
             // Check distance constraint
             if (i - lastTransientSample > minDistance) {
                 // Found a peak area. Now backtrack to find the "breath" before the hit.
                 const preciseStart = backtrackToSilence(channelData, i, sampleRate);
                 
                 const time = preciseStart / sampleRate;
                 // Ensure we are within bounds requested
                 if (time >= startTime) {
                     transients.push(time);
                     lastTransientSample = preciseStart;
                 }
             }
        }
        prevEnergy = Math.max(currentEnergy, 0.005); 
    }
    
    // Always include the very start if missed and significant enough
    if (transients.length === 0) {
        transients.push(startTime);
    } else if (transients[0] - startTime > 0.1) {
        transients.unshift(startTime);
    }

    return transients;
};

const SILENCE_THRESHOLD = 0.002; 

const trimSilence = (buffer: AudioBuffer, start: number, end: number): { duration: number, isSilent: boolean } => {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const sIx = Math.floor(start * sampleRate);
    const eIx = Math.min(channelData.length, Math.floor(end * sampleRate));
    
    // Too short to be useful
    if (eIx - sIx < 500) return { duration: 0, isSilent: true };

    // 1. RMS Check (Fast Scan)
    let sum = 0;
    const step = 4;
    for (let i = sIx; i < eIx; i+=step) {
        sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / ((eIx - sIx)/step));
    
    if (rms < SILENCE_THRESHOLD) return { duration: 0, isSilent: true };

    // 2. Tail Trimming
    // Scan backwards from end to find where audio drops below threshold
    const windowSize = Math.floor(sampleRate * 0.01); // 10ms analysis window
    let scanIx = eIx;
    
    // Safety break
    const limitIx = sIx + Math.floor(sampleRate * 0.05);

    while (scanIx > limitIx) {
        let wSum = 0;
        // Analyze window behind cursor
        for (let j = 0; j < windowSize; j++) {
            const val = channelData[scanIx - 1 - j];
            wSum += val * val;
        }
        const wRms = Math.sqrt(wSum / windowSize);
        
        if (wRms < SILENCE_THRESHOLD) {
            scanIx -= windowSize;
        } else {
            // Found audio. Add a generous release padding (50ms) to allow fadeOut to work
            scanIx = Math.min(eIx, scanIx + Math.floor(sampleRate * 0.05));
            break;
        }
    }

    // No zero crossing snap here - we rely on fadeOut envelopes for clean ends
    
    const finalDuration = (scanIx - sIx) / sampleRate;
    return { duration: finalDuration, isSilent: finalDuration < 0.01 };
}

// Start-of-file silence removal
const removeLeadingSilence = (buffer: AudioBuffer): AudioBuffer => {
    const threshold = 0.005; 
    const channelData = buffer.getChannelData(0);
    let startIndex = 0;
    
    // Scan for first significant peak
    for (let i = 0; i < channelData.length; i++) {
        if (Math.abs(channelData[i]) > threshold) {
            startIndex = i;
            break;
        }
    }

    if (startIndex < buffer.sampleRate * 0.01) {
        return buffer;
    }

    // Backtrack to silence to keep attack clean
    startIndex = backtrackToSilence(channelData, startIndex, buffer.sampleRate);
    
    const newLength = buffer.length - startIndex;
    const newBuffer = Tone.context.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);
    
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        newBuffer.getChannelData(c).set(buffer.getChannelData(c).subarray(startIndex));
    }
    
    return newBuffer;
};


const generateTransientSlices = (buffer: any, bpm: number, startTime: number = 0, endTime: number | null = null): Slice[] => {
    const audioBuffer = buffer.get(); // Get raw AudioBuffer from Tone.Buffer
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
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
        
        // Use trimSilence to determine real duration and validity
        const { duration, isSilent } = trimSilence(audioBuffer, currentStart, nextStart);

        if (!isSilent && duration > 0.01) {
            const type = classifySlice(audioBuffer, currentStart, duration);
            newSlices.push({
                id: newSlices.length, // Ensure sequential IDs
                offset: currentStart,
                duration: duration,
                isActive: true,
                type: type,
                level: 1.0,
                fadeIn: 0.002, // Default micro-fade
                fadeOut: 0.005
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

          // 2. DC Blocker / Safety Filter (HighPass @ 30Hz)
          // This prevents low-frequency clicks/rumble when filter closes near 0Hz
          effects.current.dcBlocker = new Tone.Filter({
              frequency: 30,
              type: 'highpass',
              rolloff: -12,
              Q: 0.1 
          }).connect(effects.current.delay);

          effects.current.filter.connect(effects.current.dcBlocker);

          // 3. Envelope Follower Branch
          // Reads input amplitude -> Envelope Signal -> Scaled by Gain -> Modulates Frequency
          effects.current.filterFollower = new Tone.Follower(0.05); // Fast attack/decay smoothing
          effects.current.filterEnvDepth = new Tone.Gain(0);
          effects.current.filterFollower.connect(effects.current.filterEnvDepth);
          effects.current.filterEnvDepth.connect(effects.current.filter.frequency);

          // 4. LFO Branch
          // LFO Signal -> Scaled by Gain -> Modulates Frequency
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
  const updateParams = (newParams: Partial<AllParams>) => {
    // 1. Calculate new state
    const updated = { ...paramsRef.current, ...newParams };
    
    // 2. Sync Ref immediately for Audio Loop access
    paramsRef.current = updated;

    // 3. Update React State
    setParams(updated);

    // 4. Apply Side Effects to Tone.js Nodes
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
        
        if (updated.attack !== undefined) player.current.fadeIn = Math.max(0.002, updated.attack);
        if (updated.release !== undefined) player.current.fadeOut = Math.max(0.002, updated.release);
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
            // Toggle On/Off Logic (Use Mix)
            setToneParam(efx.reverb, 'wet', rev.isActive ? rev.wet : 0); 
    }

    if (efx.delay && updated.delay) {
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

    if (updated.filter && efx.filter) {
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
            // Since Tone.Filter is an insert effect without a wet/dry, we neutralize it when inactive
            if (!f.isActive) {
                // Neutralize Frequency based on type
                if (f.type === 'lowpass') setToneParam(efx.filter, 'frequency', 20000);
                else if (f.type === 'highpass') setToneParam(efx.filter, 'frequency', 0);
                else setToneParam(efx.filter, 'frequency', f.frequency); // Fallback

                // Disable Modulations
                setToneParam(efx.filterEnvDepth, 'gain', 0);
                setToneParam(efx.filterLFODepth, 'gain', 0);
            } else {
                setToneParam(efx.filter, 'frequency', f.frequency);
                setToneParam(efx.filter, 'Q', f.q);
                // Restore Modulations
                setToneParam(efx.filterEnvDepth, 'gain', f.envDepth);
                setToneParam(efx.filterLFODepth, 'gain', f.lfoDepth);
            }
    }

    if (updated.distortion && efx.distortion) {
            efx.distortion.distortion = updated.distortion.amount;
            setToneParam(efx.distortion, 'wet', updated.distortion.isActive ? updated.distortion.wet : 0);
    }

    if (updated.bitCrusher && efx.bitCrusher) {
        setToneParam(efx.bitCrusher, 'bits', updated.bitCrusher.bits);
        setToneParam(efx.bitCrusher, 'wet', updated.bitCrusher.isActive ? updated.bitCrusher.wet : 0);
    }

    // Compressor Update
    if (updated.compressor && efx.compressor) {
        const cmp = updated.compressor;
        if (cmp.isActive) {
            setToneParam(efx.compressor.threshold, 'value', cmp.threshold);
            setToneParam(efx.compressor.ratio, 'value', cmp.ratio);
            setToneParam(efx.compressor.attack, 'value', cmp.attack);
            setToneParam(efx.compressor.release, 'value', cmp.release);
        } else {
            // Bypass logic: Ratio 1:1, Threshold 0
            setToneParam(efx.compressor.threshold, 'value', 0);
            setToneParam(efx.compressor.ratio, 'value', 1);
        }
    }
  };


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
                 const attack = (slice.fadeIn !== undefined && slice.fadeIn >= 0) ? slice.fadeIn : currentParams.attack;
                 const release = (slice.fadeOut !== undefined && slice.fadeOut >= 0) ? slice.fadeOut : currentParams.release;
                 
                 // CRITICAL FIX: Enforce minimum fade times to prevent clicks
                 player.current.fadeIn = Math.max(0.002, attack);
                 player.current.fadeOut = Math.max(0.002, release);

                 const levelDb = slice.level <= 0 ? -Infinity : 20 * Math.log10(slice.level);
                 setToneParam(player.current, 'volume', levelDb); 

                 // 2. Ratchet Logic
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
  }, [sequencer.stepCount, audioBuffer, isPlaying]);


  const loadAudioFile = useCallback(async (audioFile: File | string, preserveSettings: boolean = false, nameOverride?: string) => {
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
      // Remove leading silence using improved algorithm
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

          updateParams({ 
              bpm: detectedBpm || 120,
              grainSize: beatDuration / 8, 
              overlap: 0.05, 
              attack: 0.005,
              release: 0.1,
              delay: { ...params.delay, delayTime: beatDuration * 0.75 }
          });
      }

      const currentParams = preserveSettings ? paramsRef.current : { grainSize: 0.08, overlap: 0.05, playbackRate: 1, detune: 0, attack: 0.005, release: 0.1 };
      
      player.current = new Tone.GrainPlayer({
        url: processedBuffer,
        loop: false, 
        grainSize: currentParams.grainSize || 0.08,
        overlap: currentParams.overlap || 0.05,
        playbackRate: currentParams.playbackRate || 1,
        detune: currentParams.detune || 0,
        fadeIn: Math.max(0.002, currentParams.attack || 0.005),
        fadeOut: Math.max(0.002, currentParams.release || 0.1)
      }).connect(effects.current.compressor); // Connect to Compressor instead of Tape
      
      player.current.volume.value = 0;

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
                  fadeIn: 0.002,
                  fadeOut: 0.01
              });

              currentOffset += b.buffer.duration + padding;
          });

          const finalToneBuffer = new Tone.Buffer(masterBuffer);

          setAudioBuffer(finalToneBuffer);
          setSlices(newSlices);
          setSelectedSliceIndex(0);
          if (newSlices.length > 0) lastPlayedSliceRef.current = newSlices[0];

          player.current = new Tone.GrainPlayer({
              url: finalToneBuffer,
              grainSize: 0.05, 
              overlap: 0.025,  
              playbackRate: 1,
              detune: 0,
              fadeIn: 0.002,   
              fadeOut: 0.05    
          }).connect(effects.current.compressor); // Connect to Compressor
          
          if (previewPlayer.current) {
            previewPlayer.current.buffer = finalToneBuffer;
          }

          setSequencer(prev => {
              const newSteps = generateDefaultSteps(prev.stepCount).map((step, i) => ({
                  ...step,
                  active: i % 2 === 0, 
                  sliceIndex: i % newSlices.length,
                  ratchet: 1
              }));
              return { ...prev, steps: newSteps, currentStep: -1 };
          });

          updateParams({
              bpm: 120, 
              grainSize: 0.05,
              overlap: 0.025
          });

          if (isPlaying) {
            if (Tone.Transport.state !== 'started') Tone.Transport.start();
          }

      } catch (error: any) {
          console.error("Error loading construction kit", error);
          alert(`Failed to load kit: ${error.message || "Unknown error"}.`);
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
      
      isDjModeRef.current = false;
      if (djLoopRef.current) { djLoopRef.current.dispose(); djLoopRef.current = null; }

    } else {
      Tone.Transport.start();
      setIsPlaying(true);
      setSequencer(prev => ({ ...prev, isPlaying: true }));
    }
  }, [isPlaying]);

  const togglePreviewOriginal = () => {
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
  };

  const playSliceRaw = (index: number) => {
      if (!previewPlayer.current || !slices[index]) return;
      
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
  };


  // --- Slicing & Editing ---

  const sliceRegion = (start: number, end: number) => {
    if (!audioBuffer) return;
    
    const rawBuffer = audioBuffer.get();
    const channelData = rawBuffer.getChannelData(0);
    const sampleRate = rawBuffer.sampleRate;
    
    // Instead of snapping to zero-crossing, we just ensure valid bounds
    // The visual editor might still feel snappy, but we don't enforce ZC on the engine level here
    // to allow free slicing.
    let newSlices = generateTransientSlices(audioBuffer, params.bpm, start, end);

    if (newSlices.length === 0) {
         newSlices = [{
            id: 0,
            offset: start,
            duration: end - start,
            isActive: true,
            type: classifySlice(rawBuffer, start, end - start),
            level: 1.0,
            reverse: false,
            fadeIn: 0.005,
            fadeOut: 0.005
         }];
    }

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
      if (sliceLoopState.index === index && sliceLoopState.isLooping && previewPlayer.current) {
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
  };

  // --- Preset Management ---

  const exportPreset = async (name: string): Promise<string> => {
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
  };
  
  const getAudioWav = async (): Promise<Blob | null> => {
      if (!audioBuffer) return null;
      return audioBufferToWav(audioBuffer.get());
  }

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
      // Merge with defaults to ensure backward compatibility for new fields like 'compressor'
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

      setSequencer(prev => ({
          ...prev,
          steps: preset.sequencer.steps,
          stepCount: preset.sequencer.stepCount,
          mode: preset.sequencer.mode,
          currentStep: -1
      }));

      setSampleName(preset.sampleName || 'Imported Preset');
      
      updateParams(mergedParams);
  };

  return {
    isReady, isPlaying, isLoading, audioBuffer, params, sequencer, slices, selectedSliceIndex, sampleName,
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
    exportPreset, importPreset, loadPreset, getAudioWav,
    togglePreviewOriginal, isPreviewPlaying, playSliceRaw, toggleSliceLoop, sliceLoopState
  };
};