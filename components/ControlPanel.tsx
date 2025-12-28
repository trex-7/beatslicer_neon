
import React, { useState, memo } from 'react';
import type { AllParams, Slice, NoteSubdivision, SliceType, EffectParams } from '../types';
import Slider from './Slider';
import EffectSection from './EffectSection';
import Tooltip from './Tooltip';
import SliceWaveformEditor from './SliceWaveformEditor';

interface ControlPanelProps {
    params: AllParams;
    onParamChange: <K extends keyof AllParams>(key: K, value: AllParams[K]) => void;
    onEffectParamChange: <E extends keyof EffectParams, P extends keyof EffectParams[E]>(effect: E, param: P, value: EffectParams[E][P]) => void;
    disabled: boolean;
    generateAiBeat: (complexity: number) => void;
    slices: Slice[];
    selectedSliceIndex: number | null;
    onSliceUpdate: (index: number, changes: Partial<Slice>) => void;
    onPlaySlice: (index: number) => void;
    onLoopSlice: (index: number) => void;
    sliceLoopState: { index: number | null, isLooping: boolean };
    audioBuffer: any;
    isProMode: boolean;
}

const subdivisionOptions: { value: NoteSubdivision; label: string }[] = [
    { value: '1m', label: '1 Bar' },
    { value: '2n', label: '1/2' },
    { value: '4n', label: '1/4' },
    { value: '4t', label: '1/4 Trip' },
    { value: '8n', label: '1/8' },
    { value: '8t', label: '1/8 Trip' },
    { value: '16n', label: '1/16' },
    { value: '32n', label: '1/32' },
];

const InfoIcon = ({ text }: { text: string }) => (
    <Tooltip text={text} position="top">
        <div className="w-5 h-5 rounded-full border border-white/30 text-white/50 flex items-center justify-center text-xs cursor-help hover:text-hyper-cyan hover:border-hyper-cyan hover:bg-white/5 transition-colors font-serif italic ml-2">
            i
        </div>
    </Tooltip>
);

const PowerButton = ({ active, onClick, disabled }: { active: boolean, onClick: () => void, disabled: boolean }) => (
    <Tooltip text={active ? "Effect ON" : "Effect OFF (Bypass)"}>
        <button 
            onClick={onClick}
            disabled={disabled}
            className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${active ? 'border-hyper-cyan bg-hyper-cyan text-deep-space shadow-[0_0_8px_rgba(0,246,255,0.6)]' : 'border-star-dust/30 text-transparent hover:border-star-dust/50'}`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1v11" />
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            </svg>
        </button>
    </Tooltip>
);

// Helper to reverse-calculate macro values from params for UI sync
const getTextureFromParams = (grainSize: number) => {
    // Logic: grainSize = 0.02 + (1 - val) * 0.48
    // val = 1 - ((grainSize - 0.02) / 0.48)
    const val = 1 - ((grainSize - 0.02) / 0.48);
    return Math.max(0, Math.min(1, val));
};

const getSpaceFromParams = (reverb: any) => {
    if (!reverb.isActive) return 0;
    // Logic: wet = val * 1.2
    return Math.min(1, reverb.wet / 1.2); 
};

const getEchoFromParams = (delay: any) => {
    if (!delay.isActive) return 0;
    // Logic: wet = val
    return delay.wet;
};

const getGritFromParams = (distortion: any) => {
    if (!distortion.isActive) return 0;
    // Logic: amount = val
    return distortion.amount;
};


const ControlPanel: React.FC<ControlPanelProps> = memo(({ 
    params, 
    onParamChange, 
    onEffectParamChange, 
    disabled, 
    generateAiBeat,
    slices, 
    selectedSliceIndex,
    onSliceUpdate,
    onPlaySlice,
    onLoopSlice,
    sliceLoopState,
    audioBuffer,
    isProMode
}) => {
    
    const [aiComplexity, setAiComplexity] = useState(0);

    const currentSlice = selectedSliceIndex !== null ? slices[selectedSliceIndex] : null;

    // --- PRO MODE FUNCTIONS ---

    const updateSliceType = (type: SliceType) => {
        if (selectedSliceIndex !== null) onSliceUpdate(selectedSliceIndex, { type });
    };

    const nudgeSliceStart = (amount: number) => {
        if (currentSlice && selectedSliceIndex !== null) {
            const newOffset = Math.max(0, currentSlice.offset + amount);
            onSliceUpdate(selectedSliceIndex, { offset: newOffset });
        }
    };

    const nudgeSliceDuration = (amount: number) => {
        if (currentSlice && selectedSliceIndex !== null) {
            const newDuration = Math.max(0.01, currentSlice.duration + amount);
            onSliceUpdate(selectedSliceIndex, { duration: newDuration });
        }
    };

    const applyCompressorPreset = (type: 'smooth' | 'med' | 'hard') => {
        if (type === 'smooth') {
            onParamChange('compressor', { ...params.compressor, threshold: -20, ratio: 2, attack: 0.03, release: 0.2 });
        } else if (type === 'med') {
            onParamChange('compressor', { ...params.compressor, threshold: -24, ratio: 4, attack: 0.01, release: 0.1 });
        } else if (type === 'hard') {
            onParamChange('compressor', { ...params.compressor, threshold: -30, ratio: 20, attack: 0.001, release: 0.05 });
        }
    };

    // --- SIMPLE MODE MACROS ---

    const updateTextureMacro = (val: number) => {
        // Val 0 (Smooth/Ambient) -> Val 1 (Choppy/Glitchy)
        // Grain Size: 0.5 -> 0.02
        // Overlap: 0.25 -> 0.01
        const inv = 1 - val;
        onParamChange('grainSize', 0.02 + (inv * 0.48));
        onParamChange('overlap', 0.01 + (inv * 0.24));
    };

    const updateReverbMacro = (val: number) => {
        // Space / Reverb
        // Force active if val > 0
        const isActive = val > 0; 
        const newReverb = {
            ...params.reverb,
            isActive: isActive,
            wet: Math.min(1, val * 1.2), // Boost wetness curve
            decay: 0.5 + (val * 9.5) // 0.5s to 10s
        };
        onParamChange('reverb', newReverb);
    };

    const updateDelayMacro = (val: number) => {
        // Echo / Delay
        const isActive = val > 0;
        const newDelay = {
            ...params.delay,
            isActive: isActive,
            wet: Math.min(1, val * 1.0),
            feedback: Math.min(0.9, val * 0.85)
        };
        onParamChange('delay', newDelay);
    };

    const updateDirtMacro = (val: number) => {
        // Controls Distortion + BitCrush
        const distAmount = val; 
        const distWet = Math.min(0.6, val * 0.8);
        const crushBits = 16 - (val * 12); // 16 down to 4 bits
        const crushWet = val > 0.3 ? Math.min(0.5, (val - 0.3)) : 0;

        const newDistortion = {
            ...params.distortion,
            isActive: val > 0,
            amount: distAmount,
            wet: distWet
        };

        const newBitCrusher = {
            ...params.bitCrusher,
            isActive: val > 0.3,
            bits: Math.max(1, crushBits),
            wet: crushWet
        };

        onParamChange('distortion', newDistortion);
        onParamChange('bitCrusher', newBitCrusher);
    };

    const updateChaosMacro = (val: number) => {
        onParamChange('glitch', {
            ...params.glitch,
            chaos: val,
            allowRatchet: val > 0.2,
            allowOctaveJump: val > 0.4,
            allowReverse: val > 0.6,
            allowFormant: val > 0.8
        });
    };

    // --- RENDER ---

    if (!isProMode) {
        // ==========================================
        //             SIMPLE MODE UI
        // ==========================================
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                {/* 1. Magic Beat Generator (Moved to top) */}
                <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 p-6 rounded-2xl border border-white/10 flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="text-2xl font-bold text-white mb-2">✨ Magic Pattern Generator</h3>
                        <p className="text-star-dust/70">Don't want to program beats? Let the AI remix your slices instantly.</p>
                    </div>
                    <div className="flex gap-4">
                         <button 
                            onClick={() => generateAiBeat(0.2)} 
                            className="px-6 py-4 bg-deep-space border border-hyper-cyan/30 text-hyper-cyan font-bold rounded-xl hover:bg-hyper-cyan hover:text-deep-space transition-all shadow-lg active:scale-95"
                         >
                            House Vibe
                         </button>
                         <button 
                            onClick={() => generateAiBeat(0.5)} 
                            className="px-6 py-4 bg-deep-space border border-purple-500/30 text-purple-400 font-bold rounded-xl hover:bg-purple-500 hover:text-white transition-all shadow-lg active:scale-95"
                         >
                            Breakbeat
                         </button>
                         <button 
                            onClick={() => generateAiBeat(0.9)} 
                            className="px-6 py-4 bg-deep-space border border-plasma-pink/30 text-plasma-pink font-bold rounded-xl hover:bg-plasma-pink hover:text-white transition-all shadow-lg active:scale-95"
                         >
                            Glitchy
                         </button>
                    </div>
                </div>

                {/* 2. Macro Controls */}
                <div className="bg-deep-space/50 p-6 rounded-2xl border border-white/5 shadow-2xl">
                    <div className="flex items-center gap-2 mb-6">
                        <span className="text-2xl">🎛️</span>
                        <h2 className="text-xl font-bold text-white uppercase tracking-widest">Sound Macros</h2>
                    </div>
                    
                    {/* Grid updated to 5 columns for new Echo slider */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                         {/* Texture */}
                         <div className="bg-[#151a23] p-4 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner">
                            <span className="text-3xl mb-2">🌊</span>
                            <label className="text-hyper-cyan font-bold uppercase tracking-widest text-xs">Texture</label>
                            <input 
                                type="range" min="0" max="1" step="0.01" 
                                value={getTextureFromParams(params.grainSize)}
                                onChange={(e) => updateTextureMacro(parseFloat(e.target.value))}
                                className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-hyper-cyan [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(0,246,255,0.5)]"
                            />
                            <div className="flex justify-between w-full text-[9px] text-star-dust uppercase font-bold mt-1">
                                <span>Smooth</span>
                                <span>Choppy</span>
                            </div>
                         </div>

                         {/* Space (Reverb) */}
                         <div className="bg-[#151a23] p-4 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner">
                            <span className="text-3xl mb-2">🌌</span>
                            <label className="text-purple-400 font-bold uppercase tracking-widest text-xs">Space</label>
                            <input 
                                type="range" min="0" max="1" step="0.01" 
                                value={getSpaceFromParams(params.reverb)}
                                onChange={(e) => updateReverbMacro(parseFloat(e.target.value))}
                                className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(192,132,252,0.5)]"
                            />
                            <div className="flex justify-between w-full text-[9px] text-star-dust uppercase font-bold mt-1">
                                <span>Dry</span>
                                <span>Cosmic</span>
                            </div>
                         </div>

                         {/* Echo (Delay) */}
                         <div className="bg-[#151a23] p-4 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner">
                            <span className="text-3xl mb-2">🔁</span>
                            <label className="text-blue-400 font-bold uppercase tracking-widest text-xs">Echo</label>
                            <input 
                                type="range" min="0" max="1" step="0.01" 
                                value={getEchoFromParams(params.delay)}
                                onChange={(e) => updateDelayMacro(parseFloat(e.target.value))}
                                className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(96,165,250,0.5)]"
                            />
                            <div className="flex justify-between w-full text-[9px] text-star-dust uppercase font-bold mt-1">
                                <span>Dry</span>
                                <span>Dub</span>
                            </div>
                         </div>

                         {/* Dirt */}
                         <div className="bg-[#151a23] p-4 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner">
                            <span className="text-3xl mb-2">🔥</span>
                            <label className="text-orange-500 font-bold uppercase tracking-widest text-xs">Grit</label>
                            <input 
                                type="range" min="0" max="1" step="0.01" 
                                value={getGritFromParams(params.distortion)}
                                onChange={(e) => updateDirtMacro(parseFloat(e.target.value))}
                                className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(249,115,22,0.5)]"
                            />
                            <div className="flex justify-between w-full text-[9px] text-star-dust uppercase font-bold mt-1">
                                <span>Clean</span>
                                <span>Dirty</span>
                            </div>
                         </div>

                         {/* Chaos */}
                         <div className="bg-[#151a23] p-4 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner">
                            <span className="text-3xl mb-2">🎲</span>
                            <label className="text-plasma-pink font-bold uppercase tracking-widest text-xs">Glitch</label>
                            <input 
                                type="range" min="0" max="1" step="0.01" 
                                value={params.glitch?.chaos || 0}
                                onChange={(e) => updateChaosMacro(parseFloat(e.target.value))}
                                className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-plasma-pink [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(255,0,170,0.5)]"
                            />
                            <div className="flex justify-between w-full text-[9px] text-star-dust uppercase font-bold mt-1">
                                <span>Safe</span>
                                <span>Chaos</span>
                            </div>
                         </div>
                    </div>
                </div>
            </div>
        );
    }

    // ==========================================
    //             PRO MODE UI (Legacy)
    // ==========================================
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Slice Properties Section */}
                <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-white/20 shadow-lg shadow-white/5 flex flex-col">
                     <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                        <span className="text-white">◆</span> Slice Control
                        <InfoIcon text="Select a slice to edit its properties, type, and envelope. Drag graph handles for micro-control." />
                    </h3>
                    {currentSlice && selectedSliceIndex !== null ? (
                        <div className="space-y-3 flex-1 flex flex-col">
                            {/* Header: ID & Active & Audition */}
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-hyper-cyan">Slice #{currentSlice.id}</span>
                                    
                                    {/* Audition Controls */}
                                    <div className="flex bg-deep-space/50 rounded border border-white/10 overflow-hidden ml-2">
                                        <Tooltip text="Play Slice (Raw)">
                                            <button 
                                                onClick={() => onPlaySlice(selectedSliceIndex)}
                                                className="px-2 py-1 hover:bg-white/10 transition-colors text-white border-r border-white/10"
                                            >
                                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                                                     <path d="M8 5v14l11-7z" />
                                                 </svg>
                                            </button>
                                        </Tooltip>
                                        <Tooltip text="Loop Slice">
                                             <button 
                                                onClick={() => onLoopSlice(selectedSliceIndex)}
                                                className={`px-2 py-1 transition-colors ${
                                                    sliceLoopState.index === selectedSliceIndex && sliceLoopState.isLooping 
                                                    ? 'bg-plasma-pink text-white animate-pulse' 
                                                    : 'hover:bg-white/10 text-white/50'
                                                }`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => onSliceUpdate(selectedSliceIndex, { isActive: !currentSlice.isActive })}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border transition-colors ${currentSlice.isActive ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}
                                    >
                                        {currentSlice.isActive ? 'ACTIVE' : 'MUTED'}
                                    </button>
                                </div>
                            </div>
                            
                            {/* Waveform Editor */}
                            <SliceWaveformEditor 
                                audioBuffer={audioBuffer} 
                                slice={currentSlice} 
                                onUpdate={(changes) => onSliceUpdate(selectedSliceIndex, changes)} 
                            />

                            {/* Type & Reverse */}
                            <div className="grid grid-cols-5 gap-1">
                                {(['kick', 'snare', 'hihat', 'perc'] as SliceType[]).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => updateSliceType(t)}
                                        className={`h-6 text-[9px] font-bold uppercase rounded border transition-all ${
                                            currentSlice.type === t 
                                            ? 'bg-white text-deep-space border-white' 
                                            : 'bg-transparent text-star-dust/50 border-white/10 hover:bg-white/5'
                                        }`}
                                    >
                                        {t === 'hihat' ? 'Hat' : t}
                                    </button>
                                ))}
                                <button
                                    onClick={() => onSliceUpdate(selectedSliceIndex, { reverse: !currentSlice.reverse })}
                                    className={`h-6 text-[9px] font-bold uppercase rounded border transition-all ${
                                        currentSlice.reverse 
                                        ? 'bg-yellow-500 text-black border-yellow-500' 
                                        : 'bg-transparent text-star-dust/50 border-white/10 hover:bg-white/5'
                                    }`}
                                >
                                    Rev
                                </button>
                            </div>
                            
                            {/* Timing Nudge */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-bold text-star-dust/70 uppercase">Start</label>
                                    <div className="flex gap-1">
                                         <button onClick={() => nudgeSliceStart(-0.01)} className="flex-1 h-6 bg-nebula-blue hover:bg-white/20 rounded border border-white/10 text-white text-xs">{'<'}</button>
                                         <button onClick={() => nudgeSliceStart(0.01)} className="flex-1 h-6 bg-nebula-blue hover:bg-white/20 rounded border border-white/10 text-white text-xs">{'>'}</button>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-bold text-star-dust/70 uppercase">Len</label>
                                    <div className="flex gap-1">
                                         <button onClick={() => nudgeSliceDuration(-0.01)} className="flex-1 h-6 bg-nebula-blue hover:bg-white/20 rounded border border-white/10 text-white text-xs">{'<'}</button>
                                         <button onClick={() => nudgeSliceDuration(0.01)} className="flex-1 h-6 bg-nebula-blue hover:bg-white/20 rounded border border-white/10 text-white text-xs">{'>'}</button>
                                    </div>
                                </div>
                            </div>

                            {/* Fade & Level */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                <Slider 
                                    label="Fade In" min={0} max={0.2} step={0.001} 
                                    value={currentSlice.fadeIn ?? params.attack} 
                                    onChange={(v) => onSliceUpdate(selectedSliceIndex, { fadeIn: v })} 
                                    disabled={disabled} unit="s" defaultValue={params.attack}
                                />
                                <Slider 
                                    label="Fade Out" min={0} max={0.5} step={0.001} 
                                    value={currentSlice.fadeOut ?? params.release} 
                                    onChange={(v) => onSliceUpdate(selectedSliceIndex, { fadeOut: v })} 
                                    disabled={disabled} unit="s" defaultValue={params.release}
                                />
                            </div>
                             <Slider 
                                label="Level" min={0} max={2} step={0.01} 
                                value={currentSlice.level || 1.0} 
                                onChange={(v) => onSliceUpdate(selectedSliceIndex, { level: v })} 
                                disabled={disabled} unit="x" defaultValue={1.0}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-star-dust/40 italic text-sm">
                            Select a slice to edit
                        </div>
                    )}
                </div>

                {/* AI Beat Generator Section */}
                <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-hyper-cyan/50 shadow-lg shadow-hyper-cyan/10">
                     <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                        <span className="text-hyper-cyan">⚡</span> Pattern Gen
                        <InfoIcon text="Algorithmic sequencer. Use the slider to shift probability from steady House beats to chaotic Glitch patterns." />
                    </h3>
                    <div className="space-y-4">
                        <div className="px-1">
                            <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-star-dust mb-1">
                                <span>Steady</span>
                                <span>Dynamic</span>
                                <span>Chaos</span>
                            </div>
                            <Tooltip text="Adjust complexity: Left for steady patterns, Right for chaotic sequences">
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step={0.01} 
                                    value={aiComplexity} 
                                    onChange={(e) => setAiComplexity(parseFloat(e.target.value))}
                                    className="w-full h-3 bg-nebula-blue rounded-lg appearance-none cursor-pointer
                                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                                            [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full 
                                            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-hyper-cyan
                                            [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,246,255,0.5)]
                                            hover:[&::-webkit-slider-thumb]:scale-110 transition-all"
                                    onDoubleClick={() => setAiComplexity(0)}
                                />
                            </Tooltip>
                        </div>
                        
                        <Tooltip text="Generate a new sequence based on the complexity slider">
                            <button 
                                onClick={() => generateAiBeat(aiComplexity)}
                                disabled={disabled}
                                className="w-full py-3 bg-gradient-to-r from-hyper-cyan to-blue-600 text-white font-bold text-sm rounded hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
                            >
                                GENERATE
                            </button>
                        </Tooltip>

                        {/* Glitch Chaos Engine */}
                         <div className="pt-3 border-t border-white/10">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-xs font-bold text-plasma-pink uppercase">Glitch Chaos</h4>
                                <span className="text-[10px] text-star-dust/50">{Math.round((params.glitch?.chaos || 0) * 100)}%</span>
                            </div>
                            <Slider 
                                label=""
                                min={0}
                                max={1}
                                step={0.01}
                                value={params.glitch?.chaos || 0}
                                onChange={(v) => onParamChange('glitch', { ...params.glitch, chaos: v })}
                                disabled={disabled}
                                tooltip="Probability of random variations occurring on each step"
                                defaultValue={0}
                            />
                            
                            {/* Chaos Toggles */}
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <Tooltip text="Allow Random Repeats (Ratchet)">
                                    <button 
                                        onClick={() => onParamChange('glitch', { ...params.glitch, allowRatchet: !params.glitch.allowRatchet })}
                                        className={`py-1 text-[9px] font-bold uppercase rounded border ${params.glitch.allowRatchet ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}
                                    >
                                        Ratchet
                                    </button>
                                </Tooltip>
                                
                                <Tooltip text="Allow Random Reverse">
                                    <button 
                                        onClick={() => onParamChange('glitch', { ...params.glitch, allowReverse: !params.glitch.allowReverse })}
                                        className={`py-1 text-[9px] font-bold uppercase rounded border ${params.glitch.allowReverse ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}
                                    >
                                        Rev
                                    </button>
                                </Tooltip>
                                
                                <Tooltip text="Allow Random Octave Jumps (+/- 1200 cents)">
                                    <button 
                                        onClick={() => onParamChange('glitch', { ...params.glitch, allowOctaveJump: !params.glitch.allowOctaveJump })}
                                        className={`py-1 text-[9px] font-bold uppercase rounded border ${params.glitch.allowOctaveJump ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}
                                    >
                                        Octave
                                    </button>
                                </Tooltip>
                                
                                <Tooltip text="Allow Random Grain Size Modulation (Robotic/Formant Textures)">
                                    <button 
                                        onClick={() => onParamChange('glitch', { ...params.glitch, allowFormant: !params.glitch.allowFormant })}
                                        className={`py-1 text-[9px] font-bold uppercase rounded border ${params.glitch.allowFormant ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}
                                    >
                                        Formant
                                    </button>
                                </Tooltip>
                            </div>

                            {/* Pitch Shift Mode Toggle */}
                            <div className="mt-2 flex items-center justify-between bg-deep-space/40 rounded px-2 py-1 border border-white/5">
                                <span className="text-[9px] text-star-dust/60 font-bold uppercase">Pitch Mode</span>
                                <Tooltip text="Pitch Shift: Random pitch changes preserve length (Detune). Tape Speed: Pitch changes affect speed/length (Rate).">
                                    <button 
                                        onClick={() => onParamChange('glitch', { ...params.glitch, pitchShift: !params.glitch.pitchShift })}
                                        className={`text-[9px] font-bold px-2 py-0.5 rounded transition-colors ${params.glitch.pitchShift ? 'bg-hyper-cyan text-deep-space' : 'bg-white/10 text-star-dust'}`}
                                    >
                                        {params.glitch.pitchShift ? 'P.SHIFT (Fixed Len)' : 'TAPE (Var Len)'}
                                    </button>
                                </Tooltip>
                            </div>

                        </div>
                    </div>
                </div>

                {/* BPM & Global Controls - Moved here since DJ FX removed */}
                <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-white/10 shadow-lg flex items-center justify-between">
                     <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="text-white">⏱</span> Global
                    </h3>
                    <div className="w-1/2">
                         <Slider label="BPM" min={60} max={200} step={1} value={params.bpm} onChange={(v) => onParamChange('bpm', v)} disabled={disabled} unit="" tooltip="Master Tempo" defaultValue={120} />
                    </div>
                </div>

            </div>

            {/* Standard Controls */}
            <div className="bg-deep-space/50 p-4 rounded-lg ring-1 ring-white/10 space-y-6">
                <EffectSection title="Granular Engine" info="Controls how audio is chopped into grains. Size and Overlap determine texture density.">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                        <Slider label="Grain Size" min={0.01} max={0.5} step={0.01} value={params.grainSize} onChange={(v) => onParamChange('grainSize', v)} disabled={disabled} unit="s" tooltip="Duration of each audio grain. Smaller = choppy, Larger = smooth" defaultValue={0.08} />
                        <Slider label="Overlap" min={0.01} max={0.5} step={0.01} value={params.overlap} onChange={(v) => onParamChange('overlap', v)} disabled={disabled} unit="s" tooltip="Crossfade duration between grains" defaultValue={0.04} />
                        <Slider label="Detune" min={-1200} max={1200} step={1} value={params.detune} onChange={(v) => onParamChange('detune', v)} disabled={disabled} unit="cnt" tooltip="Pitch shift in cents (100 cents = 1 semitone)" defaultValue={0} />
                        <Slider label="Playback Rate" min={0.1} max={4} step={0.01} value={params.playbackRate} onChange={(v) => onParamChange('playbackRate', v)} disabled={disabled} unit="x" tooltip="Speed of grain playback. 1.0 is normal speed" defaultValue={1.0} />
                        
                        <Slider label="Attack" min={0.001} max={1.0} step={0.001} value={params.attack} onChange={(v) => onParamChange('attack', v)} disabled={disabled} unit="s" tooltip="Grain amplitude envelope attack time" defaultValue={0.005} />
                        <Slider label="Release" min={0.001} max={2.0} step={0.001} value={params.release} onChange={(v) => onParamChange('release', v)} disabled={disabled} unit="s" tooltip="Grain amplitude envelope release time" defaultValue={0.1} />
                        <Slider label="Sustain" min={0} max={2.0} step={0.01} value={params.sustain} onChange={(v) => onParamChange('sustain', v)} disabled={disabled} unit="s" tooltip="Length of grain sustain phase" defaultValue={0.5} />
                    </div>
                </EffectSection>

                <EffectSection title="Effects Rack" info="Chain of audio effects for shaping tone, dynamics, and spatial ambience.">
                     <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                         {/* Compressor (Replaces Vintage Tape) */}
                         <div className={`space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5 transition-opacity ${params.compressor?.isActive ? 'opacity-100' : 'opacity-60'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-orange-400 text-xs uppercase tracking-wider">Compressor</h4>
                                <PowerButton 
                                    active={params.compressor?.isActive ?? true} 
                                    onClick={() => onEffectParamChange('compressor', 'isActive', !params.compressor?.isActive)} 
                                    disabled={disabled}
                                />
                            </div>
                            
                            <div className="flex gap-1 mb-2">
                                <button onClick={() => applyCompressorPreset('smooth')} className="flex-1 text-[9px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70">Smooth</button>
                                <button onClick={() => applyCompressorPreset('med')} className="flex-1 text-[9px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70">Med</button>
                                <button onClick={() => applyCompressorPreset('hard')} className="flex-1 text-[9px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70 font-bold text-red-300">Hard</button>
                            </div>

                            <Slider label="Thresh" min={-60} max={0} step={1} value={params.compressor?.threshold ?? -24} onChange={(v) => onEffectParamChange('compressor', 'threshold', v)} disabled={disabled} unit="dB" tooltip="Signal level above which compression starts" defaultValue={-24} />
                            <Slider label="Ratio" min={1} max={20} step={0.5} value={params.compressor?.ratio ?? 4} onChange={(v) => onEffectParamChange('compressor', 'ratio', v)} disabled={disabled} unit=":1" tooltip="Amount of compression applied" defaultValue={4} />
                        </div>

                        {/* Distortion */}
                        <div className={`space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5 transition-opacity ${params.distortion.isActive ? 'opacity-100' : 'opacity-60'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-plasma-pink text-xs uppercase tracking-wider">Distortion</h4>
                                <PowerButton 
                                    active={params.distortion.isActive} 
                                    onClick={() => onEffectParamChange('distortion', 'isActive', !params.distortion.isActive)} 
                                    disabled={disabled}
                                />
                            </div>
                            <Slider label="Drive" min={0} max={1} step={0.01} value={params.distortion.amount} onChange={(v) => onEffectParamChange('distortion', 'amount', v)} disabled={disabled} tooltip="Amount of hard clipping distortion" defaultValue={0} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.distortion.wet} onChange={(v) => onEffectParamChange('distortion', 'wet', v)} disabled={disabled} tooltip="Dry/Wet mix for distortion" defaultValue={0} />
                        </div>
                        
                         {/* BitCrusher */}
                        <div className={`space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5 transition-opacity ${params.bitCrusher.isActive ? 'opacity-100' : 'opacity-60'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-green-400 text-xs uppercase tracking-wider">BitCrush</h4>
                                <PowerButton 
                                    active={params.bitCrusher.isActive} 
                                    onClick={() => onEffectParamChange('bitCrusher', 'isActive', !params.bitCrusher.isActive)} 
                                    disabled={disabled}
                                />
                            </div>
                            <Slider label="Bits" min={1} max={16} step={1} value={params.bitCrusher?.bits ?? 8} onChange={(v) => onEffectParamChange('bitCrusher', 'bits', v)} disabled={disabled} tooltip="Bit depth reduction (Lower = Lo-fi)" defaultValue={8} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.bitCrusher?.wet ?? 0} onChange={(v) => onEffectParamChange('bitCrusher', 'wet', v)} disabled={disabled} tooltip="Dry/Wet mix for bitcrusher" defaultValue={0} />
                        </div>

                        {/* Filter - UPDATED: Auto Filter (Envelope & LFO) */}
                        <div className={`space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5 min-w-[200px] transition-opacity ${params.filter.isActive ? 'opacity-100' : 'opacity-60'}`}>
                             <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-hyper-cyan text-xs uppercase tracking-wider">Mod Filter</h4>
                                <PowerButton 
                                    active={params.filter.isActive} 
                                    onClick={() => onEffectParamChange('filter', 'isActive', !params.filter.isActive)} 
                                    disabled={disabled}
                                />
                             </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Slider label="Freq" min={20} max={15000} step={1} value={params.filter.frequency} onChange={(v) => onEffectParamChange('filter', 'frequency', v)} disabled={disabled} unit="" log tooltip="Base Cutoff Frequency" defaultValue={2000} />
                                <Slider label="Res" min={0.1} max={20} step={0.1} value={params.filter.q} onChange={(v) => onEffectParamChange('filter', 'q', v)} disabled={disabled} tooltip="Resonance (Q)" defaultValue={1} />
                            </div>
                            
                            <div className="pt-2 border-t border-white/10">
                                <label className="text-[9px] font-bold text-star-dust/60 uppercase mb-1 block">Envelope</label>
                                <Slider label="Sens" min={0} max={5000} step={10} value={params.filter.envDepth} onChange={(v) => onEffectParamChange('filter', 'envDepth', v)} disabled={disabled} tooltip="Envelope Sensitivity (Auto-Wah)" defaultValue={0} />
                            </div>

                            <div className="pt-2 border-t border-white/10">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[9px] font-bold text-star-dust/60 uppercase">LFO</label>
                                    <Tooltip text="Sync LFO to BPM">
                                        <button 
                                            onClick={() => onEffectParamChange('filter', 'isSynced', !params.filter.isSynced)}
                                            disabled={disabled}
                                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${params.filter.isSynced ? 'bg-hyper-cyan text-deep-space border-hyper-cyan' : 'bg-transparent text-star-dust/40 border-star-dust/20'}`}
                                        >
                                            SYNC
                                        </button>
                                    </Tooltip>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                     <Slider label="Depth" min={0} max={3000} step={10} value={params.filter.lfoDepth} onChange={(v) => onEffectParamChange('filter', 'lfoDepth', v)} disabled={disabled} tooltip="LFO Modulation Amount" defaultValue={0} />
                                     
                                     {params.filter.isSynced ? (
                                         <select 
                                            value={params.filter.syncValue}
                                            onChange={(e) => onEffectParamChange('filter', 'syncValue', e.target.value as NoteSubdivision)}
                                            disabled={disabled}
                                            className="w-full h-8 bg-nebula-blue text-[9px] text-white rounded border border-white/10 focus:border-hyper-cyan outline-none"
                                         >
                                             {subdivisionOptions.map(opt => (
                                                 <option key={opt.value} value={opt.value}>{opt.label}</option>
                                             ))}
                                         </select>
                                     ) : (
                                        <Slider label="Rate" min={0.1} max={10} step={0.1} value={params.filter.lfoRate} onChange={(v) => onEffectParamChange('filter', 'lfoRate', v)} disabled={disabled} unit="Hz" tooltip="LFO Rate" defaultValue={1} />
                                     )}
                                </div>
                            </div>
                        </div>

                        {/* Delay */}
                        <div className={`space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5 transition-opacity ${params.delay.isActive ? 'opacity-100' : 'opacity-60'}`}>
                             <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-hyper-cyan text-xs uppercase tracking-wider">Delay</h4>
                                <PowerButton 
                                    active={params.delay.isActive} 
                                    onClick={() => onEffectParamChange('delay', 'isActive', !params.delay.isActive)} 
                                    disabled={disabled}
                                />
                             </div>
                             
                             <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-medium text-star-dust/80">Time</label>
                                <Tooltip text="Sync delay time to Master BPM">
                                    <button 
                                        onClick={() => onEffectParamChange('delay', 'isSynced', !params.delay.isSynced)}
                                        disabled={disabled}
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors border ${params.delay.isSynced ? 'bg-hyper-cyan text-deep-space border-hyper-cyan' : 'bg-transparent text-star-dust/50 border-star-dust/20'}`}
                                    >
                                        SYNC
                                    </button>
                                </Tooltip>
                             </div>
                             
                             {params.delay.isSynced ? (
                                 <select 
                                    value={params.delay.syncValue}
                                    onChange={(e) => onEffectParamChange('delay', 'syncValue', e.target.value as NoteSubdivision)}
                                    disabled={disabled}
                                    className="w-full h-6 bg-nebula-blue text-[10px] text-white rounded border border-white/10 focus:border-hyper-cyan outline-none"
                                 >
                                     {subdivisionOptions.map(opt => (
                                         <option key={opt.value} value={opt.value}>{opt.label}</option>
                                     ))}
                                 </select>
                             ) : (
                                <Slider label="" min={0} max={1} step={0.01} value={params.delay.delayTime} onChange={(v) => onEffectParamChange('delay', 'delayTime', v)} disabled={disabled} unit="s" tooltip="Delay time in seconds" defaultValue={0.375} />
                             )}

                            <Slider label="Fdbk" min={0} max={0.95} step={0.01} value={params.delay.feedback} onChange={(v) => onEffectParamChange('delay', 'feedback', v)} disabled={disabled} tooltip="Amount of signal fed back into delay" defaultValue={0.2} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.delay.wet} onChange={(v) => onEffectParamChange('delay', 'wet', v)} disabled={disabled} tooltip="Volume of delayed signal" defaultValue={0} />
                        </div>

                         {/* Reverb */}
                        <div className={`space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5 transition-opacity ${params.reverb.isActive ? 'opacity-100' : 'opacity-60'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-hyper-cyan text-xs uppercase tracking-wider">Reverb</h4>
                                <PowerButton 
                                    active={params.reverb.isActive} 
                                    onClick={() => onEffectParamChange('reverb', 'isActive', !params.reverb.isActive)} 
                                    disabled={disabled}
                                />
                             </div>

                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-medium text-star-dust/80">Decay</label>
                                <Tooltip text="Sync reverb decay to Master BPM">
                                    <button 
                                        onClick={() => onEffectParamChange('reverb', 'isSynced', !params.reverb.isSynced)}
                                        disabled={disabled}
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors border ${params.reverb.isSynced ? 'bg-hyper-cyan text-deep-space border-hyper-cyan' : 'bg-transparent text-star-dust/50 border-star-dust/20'}`}
                                    >
                                        SYNC
                                    </button>
                                </Tooltip>
                             </div>
                             
                             {params.reverb.isSynced ? (
                                 <select 
                                    value={params.reverb.syncValue}
                                    onChange={(e) => onEffectParamChange('reverb', 'syncValue', e.target.value as NoteSubdivision)}
                                    disabled={disabled}
                                    className="w-full h-6 bg-nebula-blue text-[10px] text-white rounded border border-white/10 focus:border-hyper-cyan outline-none"
                                 >
                                     {subdivisionOptions.map(opt => (
                                         <option key={opt.value} value={opt.value}>{opt.label}</option>
                                     ))}
                                 </select>
                             ) : (
                                <Slider label="" min={0.1} max={10} step={0.1} value={params.reverb.decay} onChange={(v) => onEffectParamChange('reverb', 'decay', v)} disabled={disabled} unit="s" tooltip="Duration of reverb tail" defaultValue={1.5} />
                             )}

                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.reverb.wet} onChange={(v) => onEffectParamChange('reverb', 'wet', v)} disabled={disabled} tooltip="Volume of reverb signal" defaultValue={0} />
                        </div>
                    </div>
                </EffectSection>
            </div>
        </div>
    );
});

export default ControlPanel;
