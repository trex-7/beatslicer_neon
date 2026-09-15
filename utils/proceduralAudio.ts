// Utility to generate a synthetic procedural drum loop as an AudioBuffer
// Used as a default audio sample on startup or as a fallback test sample.

declare const Tone: any;

export function generateSyntheticDrumLoop(audioContext: AudioContext, bpm: number = 120): AudioBuffer {
  const sampleRate = audioContext.sampleRate || 44100;
  const barDuration = (60 / bpm) * 4; // 1 bar (4 beats) duration in seconds
  const totalDuration = barDuration * 2; // 2 bars
  const totalSamples = Math.ceil(totalDuration * sampleRate);

  const buffer = audioContext.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const stepDuration = totalDuration / 32; // 32 steps across 2 bars
  const samplesPerStep = Math.floor(stepDuration * sampleRate);

  // Synthesizer helpers
  const renderKick = (startSample: number, volume: number = 0.9) => {
    const durSamples = Math.floor(0.25 * sampleRate);
    for (let i = 0; i < durSamples && (startSample + i) < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 18);
      const freq = 130 * Math.exp(-t * 35) + 40;
      const val = Math.sin(2 * Math.PI * freq * t) * env * volume;
      left[startSample + i] += val;
      right[startSample + i] += val;
    }
  };

  const renderSnare = (startSample: number, volume: number = 0.7) => {
    const durSamples = Math.floor(0.2 * sampleRate);
    for (let i = 0; i < durSamples && (startSample + i) < totalSamples; i++) {
      const t = i / sampleRate;
      const envTone = Math.exp(-t * 25);
      const envNoise = Math.exp(-t * 15);
      const tone = Math.sin(2 * Math.PI * 180 * t) * envTone * 0.4;
      const noise = (Math.random() * 2 - 1) * envNoise * 0.6;
      const val = (tone + noise) * volume;
      left[startSample + i] += val;
      right[startSample + i] += val;
    }
  };

  const renderHiHat = (startSample: number, isClosed: boolean = true, volume: number = 0.4) => {
    const durSec = isClosed ? 0.05 : 0.18;
    const durSamples = Math.floor(durSec * sampleRate);
    for (let i = 0; i < durSamples && (startSample + i) < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * (isClosed ? 60 : 20));
      // High-passed noise
      const noise = (Math.random() * 2 - 1);
      const val = noise * env * volume;
      // Slight stereo spread
      left[startSample + i] += val * 0.9;
      right[startSample + i] += val * 1.1;
    }
  };

  const renderClap = (startSample: number, volume: number = 0.6) => {
    const durSamples = Math.floor(0.18 * sampleRate);
    const bursts = [0, 0.008, 0.016, 0.024];
    bursts.forEach(b => {
      const offsetSamples = Math.floor(b * sampleRate);
      for (let i = 0; i < durSamples && (startSample + offsetSamples + i) < totalSamples; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 22);
        const val = (Math.random() * 2 - 1) * env * volume * 0.35;
        left[startSample + offsetSamples + i] += val;
        right[startSample + offsetSamples + i] += val;
      }
    });
  };

  const renderPerc = (startSample: number, freq: number = 440, volume: number = 0.5) => {
    const durSamples = Math.floor(0.1 * sampleRate);
    for (let i = 0; i < durSamples && (startSample + i) < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 30);
      const val = Math.sin(2 * Math.PI * freq * t) * env * volume;
      left[startSample + i] += val * 0.8;
      right[startSample + i] += val * 1.2;
    }
  };

  // 32 Step Pattern Rendering (2 Bars of 16 steps)
  for (let step = 0; step < 32; step++) {
    const stepStart = step * samplesPerStep;

    // Kicks on 0, 8, 14, 16, 24, 30
    if (step === 0 || step === 8 || step === 14 || step === 16 || step === 24 || step === 30) {
      renderKick(stepStart, 0.95);
    }

    // Snares on 4, 12, 20, 28
    if (step === 4 || step === 12 || step === 20 || step === 28) {
      renderSnare(stepStart, 0.8);
    }

    // Claps on 12, 28
    if (step === 12 || step === 28) {
      renderClap(stepStart, 0.6);
    }

    // HiHats on every 8th/16th note
    if (step % 2 === 0) {
      const isOpen = step === 6 || step === 14 || step === 22 || step === 30;
      renderHiHat(stepStart, !isOpen, isOpen ? 0.5 : 0.35);
    } else if (step % 4 === 3) {
      renderHiHat(stepStart, true, 0.25);
    }

    // Percs / Rimshots on syncopated steps
    if (step === 3 || step === 10 || step === 19 || step === 26) {
      renderPerc(stepStart, step % 2 === 0 ? 520 : 680, 0.4);
    }
  }

  // Soft limiting to prevent clipping
  for (let i = 0; i < totalSamples; i++) {
    left[i] = Math.tanh(left[i] * 1.1);
    right[i] = Math.tanh(right[i] * 1.1);
  }

  return buffer;
}
