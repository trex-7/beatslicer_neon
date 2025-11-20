
export interface GranularSynthParams {
  grainSize: number;
  overlap: number;
  detune: number;
  playbackRate: number;
  bpm: number;
  attack: number;
  release: number;
}

export interface EffectParams {
  reverb: {
    decay: number;
    wet: number;
  };
  delay: {
    delayTime: number;
    feedback: number;
    wet: number;
  };
  filter: {
    frequency: number;
    q: number;
    type: BiquadFilterType;
  };
  distortion: {
    amount: number;
    wet: number;
  };
  bitCrusher: {
    bits: number;
    wet: number;
  };
}

export interface AllParams extends GranularSynthParams, EffectParams {}

export interface Slice {
  id: number;
  offset: number; // Start time in seconds
  duration: number; // Duration in seconds
}

export type SequencerMode = 'forward' | 'backward' | 'pendulum' | 'random';

export interface SequencerStep {
  active: boolean;
  sliceIndex: number; // Which slice (0-15 typically) to play
}

export interface SequencerState {
  steps: SequencerStep[];
  stepCount: 8 | 16 | 32;
  mode: SequencerMode;
  currentStep: number;
  isPlaying: boolean;
}
