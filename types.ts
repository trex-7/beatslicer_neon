
export type BiquadFilterType = "lowpass" | "highpass" | "bandpass" | "lowshelf" | "highshelf" | "peaking" | "notch" | "allpass";

export interface GranularSynthParams {
  grainSize: number;
  overlap: number;
  detune: number;
  playbackRate: number;
  bpm: number;
  attack: number;
  release: number;
}

export type NoteSubdivision = '1m' | '2n' | '4n' | '4t' | '8n' | '8t' | '16n';

export interface EffectParams {
  reverb: {
    decay: number;
    wet: number;
    isSynced: boolean;
    syncValue: NoteSubdivision;
  };
  delay: {
    delayTime: number;
    feedback: number;
    wet: number;
    isSynced: boolean;
    syncValue: NoteSubdivision;
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
  tapeSaturation: {
    drive: number;
    tone: number;
    wet: number;
  };
  bitCrusher: {
    bits: number; // 1 to 16
    wet: number;
  };
}

export interface GlitchParams {
    chaos: number; // 0 to 1 probability
    allowReverse: boolean;
    allowOctaveJump: boolean;
}

export interface AllParams extends GranularSynthParams, EffectParams {
    glitch: GlitchParams;
}

export type SliceType = 'kick' | 'snare' | 'hihat' | 'perc';

export interface Slice {
  id: number;
  offset: number; // Start time in seconds
  duration: number; // Duration in seconds
  isActive: boolean; // Used in sequencer randomization
  type: SliceType;
  level: number; // Linear gain 0.0 to 2.0 (default 1.0)
}

export type SequencerMode = 'forward' | 'backward' | 'pendulum' | 'random';

export interface SequencerStep {
  active: boolean;
  sliceIndex: number; // Which slice (0-15 typically) to play
  ratchet: number; // 1 = normal, 2 = double, 3 = triplet, 4 = quad
}

export interface SequencerState {
  steps: SequencerStep[];
  stepCount: 8 | 16 | 32;
  mode: SequencerMode;
  currentStep: number;
  isPlaying: boolean;
  editMode: 'trigger' | 'ratchet'; // New UI mode
}

export interface Preset {
  id: string;
  name: string;
  date: number;
  params: AllParams;
  sequencer: Omit<SequencerState, 'isPlaying' | 'currentStep' | 'editMode'>;
  slices: Slice[];
  sampleName?: string;
  audioData?: string; // Base64 encoded WAV file
}
