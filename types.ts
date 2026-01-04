
export type BiquadFilterType = "lowpass" | "highpass" | "bandpass" | "lowshelf" | "highshelf" | "peaking" | "notch" | "allpass";

export type NoteSubdivision = '1m' | '2n' | '4n' | '4t' | '8n' | '8t' | '16n' | '32n';

export type SliceType = 'kick' | 'snare' | 'hihat' | 'perc';

export interface Slice {
  id: number;
  offset: number;
  duration: number;
  isActive: boolean;
  type: SliceType;
  level: number;
  reverse?: boolean;
  pitch?: number; // Semitones
  fadeIn?: number;
  fadeOut?: number;
}

export interface GranularSynthParams {
  grainSize: number;
  overlap: number;
  detune: number;
  playbackRate: number;
  bpm: number;
  attack: number;
  release: number;
  sustain: number;
  swing: number; // 0 to 1
}

export interface ReverbParams {
  isActive: boolean;
  decay: number;
  wet: number;
  isSynced: boolean;
  syncValue: NoteSubdivision;
  lowCut: number;
  highCut: number;
}

export interface DelayParams {
  isActive: boolean;
  delayTime: number;
  feedback: number;
  wet: number;
  isSynced: boolean;
  syncValue: NoteSubdivision;
  lowCut: number;
  highCut: number;
}

export interface FilterParams {
  isActive: boolean;
  frequency: number;
  q: number;
  type: BiquadFilterType;
  envDepth: number;
  lfoDepth: number;
  lfoRate: number;
  isSynced: boolean;
  syncValue: NoteSubdivision;
}

export interface DistortionParams {
  isActive: boolean;
  amount: number;
  wet: number;
}

export interface CompressorParams {
  isActive: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
}

export interface BitCrusherParams {
  isActive: boolean;
  bits: number;
  wet: number;
}

export interface GlitchParams {
  chaos: number;
  allowReverse: boolean;
  allowOctaveJump: boolean;
  allowRatchet: boolean;
  pitchShift: boolean;
  allowFormant: boolean;
}

export interface EffectParams {
  reverb: ReverbParams;
  delay: DelayParams;
  filter: FilterParams;
  distortion: DistortionParams;
  compressor: CompressorParams;
  bitCrusher: BitCrusherParams;
  glitch: GlitchParams;
}

export interface AllParams extends GranularSynthParams, EffectParams {
    order: string[];
}

export interface SequencerStep {
  active: boolean;
  sliceIndex: number;
  ratchet: number;
}

export type SequencerMode = 'forward' | 'backward' | 'pendulum' | 'random';

export interface SequencerState {
  steps: SequencerStep[];
  stepCount: number;
  mode: SequencerMode;
  currentStep: number;
  isPlaying: boolean;
  isLooping: boolean;
  editMode: 'trigger' | 'ratchet';
  playbackBehavior: 'reset' | 'continue';
}

export interface MidiDevice {
    id: string;
    name: string;
    manufacturer?: string;
}

export interface MidiConfig {
    enabled: boolean;
    inputPortId: string;
    outputPortId: string;
    inputChannel: number | 'all'; // 1-16 or 'all'
    outputChannel: number; // 1-16
    clockSource: 'internal' | 'external';
    ppq: number;
    sendClock: boolean;
    sendTransport: boolean; 
    clockOffset: number; // Latency compensation in ms
}

export interface MetronomeConfig {
    enabled: boolean;
    volume: number;
}

export interface Preset {
  id: string;
  name: string;
  date: number;
  params: AllParams;
  sequencer: {
      steps: SequencerStep[];
      stepCount: number;
      mode: SequencerMode;
  };
  slices: Slice[];
  sampleName: string;
  sampleUrl?: string;
  sampleId?: string;
  audioData?: string; // base64
}

export interface KitSample {
    name: string;
    url: string;
    type?: SliceType;
}

export interface DemoKit {
    name: string;
    samples: KitSample[];
}

export interface Database {
  public: {
    Tables: {
      presets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          parameters: any;
          sequencer_data: any;
          slices_data: any;
          sample_id?: string;
          is_public: boolean;
          is_factory: boolean;
          created_at: string;
          profiles?: { username: string };
          samples?: { url: string; title: string };
        };
        Insert: {
          user_id: string;
          name: string;
          parameters: any;
          sequencer_data: any;
          slices_data: any;
          sample_id?: string;
          is_public?: boolean;
          is_factory?: boolean;
        };
      };
      samples: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          url: string;
          is_public: boolean;
          is_factory: boolean;
          created_at: string;
          profiles?: { username: string };
        };
        Insert: {
          user_id: string;
          title: string;
          url: string;
          is_public?: boolean;
          is_factory?: boolean;
        };
      };
      kits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          is_public: boolean;
          is_factory: boolean;
          created_at: string;
          profiles?: { username: string };
        };
        Insert: {
          user_id: string;
          name: string;
          is_public?: boolean;
          is_factory?: boolean;
        };
      };
      kit_samples: {
        Row: {
          kit_id: string;
          sample_id: string;
        };
        Insert: {
          kit_id: string;
          sample_id: string;
        };
      };
      feedback: {
        Row: {
          id: string;
          user_id: string | null;
          message: string;
          category: string;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          message: string;
          category: string;
        };
      };
      profiles: {
        Row: {
            id: string;
            username: string;
        }
      }
    };
  };
}
