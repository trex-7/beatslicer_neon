import type { Preset, AllParams, SequencerState } from '../types';

// Helper to create a base preset structure
const createPreset = (
    id: string, 
    name: string, 
    params: Partial<AllParams>, 
    sequencerOverrides: Partial<SequencerState>
): Preset => {
    // Default sequencer state
    const defaultSteps = Array(16).fill(0).map((_, i) => ({
        active: i % 2 === 0,
        sliceIndex: i,
        ratchet: 1
    }));

    const baseParams: AllParams = {
        grainSize: 0.1,
        overlap: 0.05,
        detune: 0,
        playbackRate: 1,
        bpm: 120,
        attack: 0.02,
        release: 0.2,
        reverb: { decay: 1.5, wet: 0, isSynced: false, syncValue: '2n' },
        delay: { delayTime: 0.5, feedback: 0.3, wet: 0, isSynced: false, syncValue: '8n' },
        filter: { frequency: 20000, q: 1, type: 'lowpass' },
        distortion: { amount: 0, wet: 0 },
        tapeSaturation: { drive: 0, tone: 20000, wet: 0 },
        bitCrusher: { bits: 8, wet: 0 },
        glitch: { chaos: 0, allowReverse: true, allowOctaveJump: true }
    };

    // Deep merge params roughly
    const mergedParams = { ...baseParams, ...params };
    // Handle nested objects that might have been partially supplied
    if (params.reverb) mergedParams.reverb = { ...baseParams.reverb, ...params.reverb };
    if (params.delay) mergedParams.delay = { ...baseParams.delay, ...params.delay };
    if (params.filter) mergedParams.filter = { ...baseParams.filter, ...params.filter };
    if (params.distortion) mergedParams.distortion = { ...baseParams.distortion, ...params.distortion };
    if (params.tapeSaturation) mergedParams.tapeSaturation = { ...baseParams.tapeSaturation, ...params.tapeSaturation };
    if (params.bitCrusher) mergedParams.bitCrusher = { ...baseParams.bitCrusher, ...params.bitCrusher };
    if (params.glitch) mergedParams.glitch = { ...baseParams.glitch, ...params.glitch };

    return {
        id,
        name,
        date: Date.now(),
        params: mergedParams,
        sequencer: {
            steps: defaultSteps,
            stepCount: 16,
            mode: 'forward',
            ...sequencerOverrides
        },
        slices: [], // Factory presets apply to current audio slices
        sampleName: 'Current Sample'
    };
};

export const FACTORY_PRESETS: Preset[] = [
    createPreset(
        'fp_01', 
        'Default Clean', 
        {}, 
        { mode: 'forward' }
    ),
    createPreset(
        'fp_02',
        'Glitch Chaos',
        {
            bpm: 120, // Will likely be overridden by audio load unless preset loaded after
            grainSize: 0.05,
            overlap: 0.02,
            playbackRate: 1.0,
            glitch: { chaos: 0.45, allowReverse: true, allowOctaveJump: true },
            bitCrusher: { bits: 4, wet: 0.25 },
            distortion: { amount: 0.4, wet: 0.15 },
            filter: { frequency: 12000, q: 1, type: 'lowpass' }
        },
        { mode: 'random' }
    ),
    createPreset(
        'fp_03',
        'Ambient Cloud',
        {
            grainSize: 0.35,
            overlap: 0.25,
            playbackRate: 0.5, 
            attack: 0.3,
            release: 0.8,
            detune: 0,
            reverb: { decay: 5.0, wet: 0.5, isSynced: false, syncValue: '1m' },
            delay: { delayTime: 0.5, feedback: 0.6, wet: 0.35, isSynced: true, syncValue: '4n' },
            filter: { frequency: 2500, q: 0.5, type: 'lowpass' },
            tapeSaturation: { drive: 0.3, tone: 3000, wet: 0.5 }
        },
        { mode: 'pendulum' }
    ),
    createPreset(
        'fp_04',
        'Hard Industrial',
        {
            grainSize: 0.12,
            overlap: 0.01, // Choppy
            playbackRate: 0.9,
            detune: -200, // Down a tone
            tapeSaturation: { drive: 0.8, tone: 4000, wet: 1.0 },
            distortion: { amount: 0.8, wet: 0.3 },
            filter: { frequency: 150, q: 2, type: 'highpass' } // Thin out bottom
        },
        { mode: 'forward' }
    ),
    createPreset(
        'fp_05',
        'Micro-Ratchets',
        {
            grainSize: 0.025, // Tiny grains
            overlap: 0.02,
            delay: { delayTime: 0.1, feedback: 0.7, wet: 0.3, isSynced: true, syncValue: '32n' },
            glitch: { chaos: 0.1, allowReverse: true, allowOctaveJump: false }
        },
        { mode: 'forward' }
    )
];