

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

export type NoteSubdivision = '1m' | '2n' | '4n' | '4t' | '8n' | '8t' | '16n' | '32n';

export interface EffectParams {
  reverb: {
    isActive: boolean;
    decay: number;
    wet: number;
    isSynced: boolean;
    syncValue: NoteSubdivision;
  };
  delay: {
    isActive: boolean;
    delayTime: number;
    feedback: number;
    wet: number;
    isSynced: boolean;
    syncValue: NoteSubdivision;
  };
  filter: {
    isActive: boolean;
    frequency: number;
    q: number;
    type: BiquadFilterType;
    envDepth: number; // Envelope Follower amount (Hz)
    lfoDepth: number; // LFO modulation amount (Hz)
    lfoRate: number; // LFO frequency in Hz
    isSynced: boolean;
    syncValue: NoteSubdivision;
  };
  distortion: {
    isActive: boolean;
    amount: number;
    wet: number;
  };
  compressor: {
    isActive: boolean;
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
  bitCrusher: {
    isActive: boolean;
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
  reverse?: boolean; // Play slice in reverse
  fadeIn?: number; // Override global attack
  fadeOut?: number; // Override global release
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
  audioData?: string; // Base64 encoded WAV file (Legacy/Local)
  sampleUrl?: string; // URL from DB
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

export interface DemoLoop {
    name: string;
    url: string; 
}

// --- Supabase Database Types ---

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          avatar_url: string | null;
          subscription_tier: 'free' | 'pro' | 'admin';
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          username?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      samples: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          url: string;
          bpm: number | null;
          is_public: boolean;
          is_factory: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          url: string;
          bpm?: number | null;
          is_public?: boolean;
          is_factory?: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          title?: string;
          url?: string;
          bpm?: number | null;
          is_public?: boolean;
          is_factory?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "samples_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ];
      };
      presets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          parameters: AllParams;
          sequencer_data: any;
          slices_data: Slice[];
          is_public: boolean;
          is_factory: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          parameters: AllParams;
          sequencer_data: any;
          slices_data: Slice[];
          is_public?: boolean;
          is_factory?: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          name?: string;
          parameters?: AllParams;
          sequencer_data?: any;
          slices_data?: Slice[];
          is_public?: boolean;
          is_factory?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "presets_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ];
      };
    };
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  };
}