
import React, { useState, memo, useCallback, useRef } from 'react';
import type { AllParams, Slice, NoteSubdivision, SliceType, EffectParams } from '../types';
import Slider from './Slider';
import EffectSection from './EffectSection';
import Tooltip from './Tooltip';
import InfoIcon from './InfoIcon';
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
    simpleView?: 'macros' | 'magic';
    visibleSections?: ('slices' | 'pattern' | 'engine' | 'effects')[];
    effectsLayout?: 'grid' | 'vertical';
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

const PowerButton = ({ active, onClick, disabled }: { active: boolean, onClick: (e: React.MouseEvent) => void, disabled: boolean }) => (
    <Tooltip text={active ? "Effect ON" : "Effect OFF (Bypass)"}>
        <button 
            onClick={onClick}
            disabled={disabled}
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all z-10 relative ${active ? 'border-hyper-cyan bg-hyper-cyan text-deep-space shadow-[0_0_8px_rgba(0,246,255,0.6)]' : 'border-star-dust/30 text-transparent hover:border-star-dust/50 bg-black/20'}`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1v11" />
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            </svg>
        </button>
    </Tooltip>
);

// Draggable Effect Unit Wrapper
interface EffectUnitProps {
    id: string;
    title: string;
    active: boolean;
    onToggle: () => void;
    children?: React.ReactNode;
    colorClass: string;
    info: string;
    disabled: boolean;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, id: string) => void;
}

const EffectUnit: React.FC<EffectUnitProps> = ({ 
    id,
    title, 
    active, 
    onToggle, 
    children, 
    colorClass, 
    info,
    disabled,
    onDragStart,
    onDragOver,
    onDrop
}) => {
    const [expanded, setExpanded] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const handleHandleDragStart = (e: React.DragEvent) => {
        // Set drag image to the whole unit if available
        if (ref.current) {
             e.dataTransfer.setDragImage(ref.current, 0, 0);
        }
        onDragStart(e, id);
    };

    return (
        <div 
            ref={ref}
            className={`rounded-md border transition-all duration-200 overflow-hidden mb-2 ${active ? 'bg-nebula-blue/30 border-white/10' : 'bg-[#0f1319] border-white/5 opacity-80'}`}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, id)}
        >
            <div 
                className="flex items-center justify-between p-2 hover:bg-white/5 transition-colors select-none"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                    {/* Drag Handle - Draggable is ONLY here */}
                    <div 
                        className="text-white/30 mr-2 cursor-grab hover:text-white active:cursor-grabbing p-1 hover:bg-white/10 rounded"
                        draggable={!disabled}
                        onDragStart={handleHandleDragStart}
                        onClick={(e) => e.stopPropagation()} // Prevent expand/collapse
                        title="Drag to reorder"
                    >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M8 6h8v2H8zm0 10h8v2H8zm0-5h8v2H8z" />
                        </svg>
                    </div>
                    
                    <span className={`text-[10px] transform transition-transform duration-200 ${expanded ? 'rotate-90' : ''} text-white/50 cursor-pointer`}>▶</span>
                    <h4 className={`font-bold text-xs uppercase tracking-wider flex items-center gap-2 truncate ${colorClass} cursor-pointer`}>
                        {title}
                    </h4>
                    <InfoIcon text={info} className="w-3 h-3 text-[10px]" />
                </div>
                <div className="pl-2">
                    <PowerButton 
                        active={active} 
                        onClick={(e) => { e.stopPropagation(); onToggle(); }} 
                        disabled={disabled} 
                    />
                </div>
            </div>
            
            <div className={`transition-all duration-300 ease-in-out ${expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="p-3 pt-0 border-t border-white/5 space-y-3 mt-2 cursor-default">
                    {children}
                </div>
            </div>
        </div>
    );
};

// ... (Macros Helper Functions Unchanged) ...
const getTextureFromParams = (grainSize: number) => {
    const val = 1 - ((grainSize - 0.02) / 0.48);
    return Math.max(0, Math.min(1, val));
};

const getSpaceFromParams = (reverb: any) => {
    if (!reverb?.isActive) return 0;
    return Math.min(1, reverb.wet / 1.2); 
};

const getEchoFromParams = (delay: any) => {
    if (!delay?.isActive) return 0;
    return delay.wet;
};

const getGritFromParams = (distortion: any) => {
    if (!distortion?.isActive) return 0;
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
    isProMode, 
    simpleView, 
    visibleSections, 
    effectsLayout // Removed default to respect passed prop logic better or force usage
}) => {
    
    const [aiComplexity, setAiComplexity] = useState(0);

    const currentSlice = selectedSliceIndex !== null ? slices[selectedSliceIndex] : null;

    // --- CUSTOM GRAIN SIZE CURVE HANDLERS ---
    const MIN_GRAIN = 0.01;
    const MAX_GRAIN = 0.5;
    
    const getGrainSizeSliderValue = useCallback((seconds: number) => {
        const pct = Math.sqrt((seconds - MIN_GRAIN) / (MAX_GRAIN - MIN_GRAIN));
        return Math.max(0, Math.min(100, pct * 100));
    }, []);

    const onGrainSizeSliderChange = useCallback((val: number) => {
        const pct = val / 100;
        const seconds = MIN_GRAIN + (MAX_GRAIN - MIN_GRAIN) * (pct * pct);
        onParamChange('grainSize', seconds);
    }, [onParamChange]);


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

    const applyFilterPreset = (type: 'wah' | 'quack' | 'down') => {
        if (type === 'wah') {
            onParamChange('filter', { ...params.filter, frequency: 200, q: 5, type: 'lowpass', envDepth: 3000, isActive: true });
        } else if (type === 'quack') {
            onParamChange('filter', { ...params.filter, frequency: 450, q: 3.5, type: 'bandpass', envDepth: 2000, isActive: true });
        } else if (type === 'down') {
            onParamChange('filter', { ...params.filter, frequency: 6000, q: 1.0, type: 'lowpass', envDepth: -4000, isActive: true });
        }
    };

    const getSafeMinFrequency = () => {
        if (params.filter.envDepth < 0) {
            return Math.abs(params.filter.envDepth) + 200;
        }
        return 20;
    };

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData("text/plain");
        if (sourceId === targetId) return;

        const newOrder = [...params.order];
        const sourceIndex = newOrder.indexOf(sourceId);
        const targetIndex = newOrder.indexOf(targetId);

        if (sourceIndex > -1 && targetIndex > -1) {
            newOrder.splice(sourceIndex, 1);
            newOrder.splice(targetIndex, 0, sourceId);
            onParamChange('order', newOrder);
        }
    };

    // --- SIMPLE MODE MACROS (Same as before) ---
    const updateTextureMacro = (val: number) => {
        const inv = 1 - val;
        onParamChange('grainSize', 0.02 + (inv * 0.48));
        onParamChange('overlap', 0.01 + (inv * 0.24));
    };
    const updateReverbMacro = (val: number) => {
        const isActive = val > 0; 
        const newReverb = { ...params.reverb, isActive: isActive, wet: Math.min(1, val * 1.2), decay: 0.5 + (val * 9.5) };
        onParamChange('reverb', newReverb);
    };
    const updateDelayMacro = (val: number) => {
        const isActive = val > 0;
        const newDelay = { ...params.delay, isActive: isActive, wet: Math.min(1, val * 1.0), feedback: Math.min(0.9, val * 0.85) };
        onParamChange('delay', newDelay);
    };
    const updateDirtMacro = (val: number) => {
        const distAmount = val; 
        const distWet = Math.min(0.6, val * 0.8);
        const crushBits = 16 - (val * 12); 
        const crushWet = val > 0.3 ? Math.min(0.5, (val - 0.3)) : 0;
        onParamChange('distortion', { ...params.distortion, isActive: val > 0, amount: distAmount, wet: distWet });
        onParamChange('bitCrusher', { ...params.bitCrusher, isActive: val > 0.3, bits: Math.max(1, crushBits), wet: crushWet });
    };
    const updateChaosMacro = (val: number) => {
        onParamChange('glitch', { ...params.glitch, chaos: val, allowRatchet: val > 0.2, allowOctaveJump: val > 0.4, allowReverse: val > 0.6, allowFormant: val > 0.8 });
    };
    const getMacroStyle = (val: number, color: string) => ({ background: `linear-gradient(to right, ${color} ${val * 100}%, #1e293b ${val * 100}%)` });
    const macroInputClass = "w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110";

    // --- RENDER ---
    if (!isProMode) {
        // ... (Simple Mode code unchanged - preserving) ...
        const macroGridClass = simpleView === 'macros' ? "grid-cols-1 gap-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6";
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                {(!simpleView || simpleView === 'magic') && (
                    <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 p-4 rounded-xl border border-white/10 flex flex-col items-center gap-4 text-center relative group">
                        <div className="absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity">
                            <InfoIcon text="Magic Patterns use AI-style probability to generate rhythms based on slice types (Kick, Snare, etc)." />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1">✨ Magic Patterns</h3>
                            <p className="text-[10px] text-star-dust/70">Instantly remix your slices with AI logic.</p>
                        </div>
                        <div className="flex gap-2 w-full">
                             <button onClick={() => generateAiBeat(0.2)} className="flex-1 py-3 bg-deep-space/50 border border-hyper-cyan/30 text-hyper-cyan font-bold text-xs rounded-lg hover:bg-hyper-cyan hover:text-deep-space transition-all shadow-lg active:scale-95">🏠 House</button>
                             <button onClick={() => generateAiBeat(0.5)} className="flex-1 py-3 bg-deep-space/50 border border-purple-500/30 text-purple-400 font-bold text-xs rounded-lg hover:bg-purple-500 hover:text-white transition-all shadow-lg active:scale-95">🥁 Break</button>
                             <button onClick={() => generateAiBeat(0.9)} className="flex-1 py-3 bg-deep-space/50 border border-plasma-pink/30 text-plasma-pink font-bold text-xs rounded-lg hover:bg-plasma-pink hover:text-white transition-all shadow-lg active:scale-95">🎲 Chaos</button>
                        </div>
                    </div>
                )}
                {(!simpleView || simpleView === 'macros') && (
                    <div className={`grid ${macroGridClass}`}>
                         <div className="bg-[#151a23] p-3 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner group hover:border-hyper-cyan/30 transition-colors relative">
                            <div className="absolute top-1 right-1"><InfoIcon text="Controls grain size and overlap. Low = choppy, High = smooth cloud." className="w-3 h-3 text-[10px]" /></div>
                            <div className="flex items-center gap-2 w-full justify-between px-1">
                                <span className="text-xl group-hover:scale-110 transition-transform">🌊</span>
                                <label className="text-hyper-cyan font-bold uppercase tracking-widest text-[10px]">Texture</label>
                            </div>
                            <input type="range" min="0" max="1" step="0.01" value={getTextureFromParams(params.grainSize)} onChange={(e) => updateTextureMacro(parseFloat(e.target.value))} style={getMacroStyle(getTextureFromParams(params.grainSize), '#00f6ff')} className={macroInputClass} />
                         </div>
                         <div className="bg-[#151a23] p-3 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner group hover:border-purple-400/30 transition-colors relative">
                            <div className="absolute top-1 right-1"><InfoIcon text="Reverb mix and decay time." className="w-3 h-3 text-[10px]" /></div>
                            <div className="flex items-center gap-2 w-full justify-between px-1">
                                <span className="text-xl group-hover:scale-110 transition-transform">🌌</span>
                                <label className="text-purple-400 font-bold uppercase tracking-widest text-[10px]">Space</label>
                            </div>
                            <input type="range" min="0" max="1" step="0.01" value={getSpaceFromParams(params.reverb)} onChange={(e) => updateReverbMacro(parseFloat(e.target.value))} style={getMacroStyle(getSpaceFromParams(params.reverb), '#c084fc')} className={macroInputClass} />
                         </div>
                         <div className="bg-[#151a23] p-3 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner group hover:border-blue-400/30 transition-colors relative">
                            <div className="absolute top-1 right-1"><InfoIcon text="Delay mix and feedback." className="w-3 h-3 text-[10px]" /></div>
                            <div className="flex items-center gap-2 w-full justify-between px-1">
                                <span className="text-xl group-hover:scale-110 transition-transform">🔁</span>
                                <label className="text-blue-400 font-bold uppercase tracking-widest text-[10px]">Echo</label>
                            </div>
                            <input type="range" min="0" max="1" step="0.01" value={getEchoFromParams(params.delay)} onChange={(e) => updateDelayMacro(parseFloat(e.target.value))} style={getMacroStyle(getEchoFromParams(params.delay), '#60a5fa')} className={macroInputClass} />
                         </div>
                         <div className="bg-[#151a23] p-3 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner group hover:border-orange-500/30 transition-colors relative">
                            <div className="absolute top-1 right-1"><InfoIcon text="Combines Distortion and Bitcrushing." className="w-3 h-3 text-[10px]" /></div>
                            <div className="flex items-center gap-2 w-full justify-between px-1">
                                <span className="text-xl group-hover:scale-110 transition-transform">🔥</span>
                                <label className="text-orange-500 font-bold uppercase tracking-widest text-[10px]">Grit</label>
                            </div>
                            <input type="range" min="0" max="1" step="0.01" value={getGritFromParams(params.distortion)} onChange={(e) => updateDirtMacro(parseFloat(e.target.value))} style={getMacroStyle(getGritFromParams(params.distortion), '#f97316')} className={macroInputClass} />
                         </div>
                         <div className="bg-[#151a23] p-3 rounded-xl border border-white/5 flex flex-col items-center gap-2 shadow-inner group hover:border-plasma-pink/30 transition-colors relative">
                            <div className="absolute top-1 right-1"><InfoIcon text="Increases probability of random stutter, reverse, and octave jumps." className="w-3 h-3 text-[10px]" /></div>
                            <div className="flex items-center gap-2 w-full justify-between px-1">
                                <span className="text-xl group-hover:scale-110 transition-transform">🎲</span>
                                <label className="text-plasma-pink font-bold uppercase tracking-widest text-[10px]">Glitch</label>
                            </div>
                            <input type="range" min="0" max="1" step="0.01" value={params.glitch?.chaos || 0} onChange={(e) => updateChaosMacro(parseFloat(e.target.value))} style={getMacroStyle(params.glitch?.chaos || 0, '#ff00aa')} className={macroInputClass} />
                         </div>
                    </div>
                )}
            </div>
        );
    }

    // ==========================================
    //             PRO MODE UI
    // ==========================================
    
    // Determine visibility
    const showSlices = !visibleSections || visibleSections.includes('slices');
    const showPattern = !visibleSections || visibleSections.includes('pattern');
    const showEngine = !visibleSections || visibleSections.includes('engine');
    const showEffects = !visibleSections || visibleSections.includes('effects');

    // MAPPING FOR EFFECTS RENDER
    const renderEffect = (id: string) => {
        switch (id) {
            case 'compressor':
                return (
                    <EffectUnit 
                        key="compressor" id="compressor"
                        title="Compressor" 
                        active={params.compressor?.isActive ?? true}
                        onToggle={() => onEffectParamChange('compressor', 'isActive', !params.compressor?.isActive)}
                        colorClass="text-orange-400"
                        info="Dynamic range compression"
                        disabled={disabled}
                        onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                    >
                        <div className="flex gap-1 mb-2">
                            <button onClick={() => applyCompressorPreset('smooth')} className="flex-1 text-[10px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70">Smooth</button>
                            <button onClick={() => applyCompressorPreset('med')} className="flex-1 text-[10px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70">Med</button>
                            <button onClick={() => applyCompressorPreset('hard')} className="flex-1 text-[10px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70 font-bold text-red-300">Hard</button>
                        </div>
                        <Slider label="Thresh" min={-60} max={0} step={1} value={params.compressor?.threshold ?? -24} onChange={(v) => onEffectParamChange('compressor', 'threshold', v)} disabled={disabled} unit="dB" tooltip="Signal level above which compression starts" defaultValue={-24} />
                        <Slider label="Ratio" min={1} max={20} step={0.5} value={params.compressor?.ratio ?? 4} onChange={(v) => onEffectParamChange('compressor', 'ratio', v)} disabled={disabled} unit=":1" tooltip="Amount of compression applied" defaultValue={4} />
                    </EffectUnit>
                );
            case 'distortion':
                return (
                    <EffectUnit
                        key="distortion" id="distortion"
                        title="Distortion"
                        active={params.distortion?.isActive ?? false}
                        onToggle={() => onEffectParamChange('distortion', 'isActive', !params.distortion?.isActive)}
                        colorClass="text-plasma-pink"
                        info="Hard clipping distortion"
                        disabled={disabled}
                        onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                    >
                        <Slider label="Drive" min={0} max={1} step={0.01} value={params.distortion?.amount ?? 0} onChange={(v) => onEffectParamChange('distortion', 'amount', v)} disabled={disabled} tooltip="Amount of hard clipping distortion" defaultValue={0} />
                        <Slider label="Mix" min={0} max={1} step={0.01} value={params.distortion?.wet ?? 1} onChange={(v) => onEffectParamChange('distortion', 'wet', v)} disabled={disabled} tooltip="Dry/Wet mix for distortion" defaultValue={1} />
                    </EffectUnit>
                );
            case 'bitCrusher':
                return (
                    <EffectUnit
                        key="bitCrusher" id="bitCrusher"
                        title="BitCrush"
                        active={params.bitCrusher?.isActive ?? false}
                        onToggle={() => onEffectParamChange('bitCrusher', 'isActive', !params.bitCrusher?.isActive)}
                        colorClass="text-green-400"
                        info="Lo-fi bit reduction"
                        disabled={disabled}
                        onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                    >
                        <Slider label="Bits" min={1} max={16} step={1} value={params.bitCrusher?.bits ?? 8} onChange={(v) => onEffectParamChange('bitCrusher', 'bits', v)} disabled={disabled} tooltip="Bit depth reduction (Lower = Lo-fi)" defaultValue={4} />
                        <Slider label="Mix" min={0} max={1} step={0.01} value={params.bitCrusher?.wet ?? 0} onChange={(v) => onEffectParamChange('bitCrusher', 'wet', v)} disabled={disabled} tooltip="Dry/Wet mix for bitcrusher" defaultValue={1} />
                    </EffectUnit>
                );
            case 'filter':
                return (
                    <EffectUnit
                        key="filter" id="filter"
                        title="Mod Filter"
                        active={params.filter?.isActive ?? false}
                        onToggle={() => onEffectParamChange('filter', 'isActive', !params.filter?.isActive)}
                        colorClass="text-hyper-cyan"
                        info="Multi-mode filter with LFO"
                        disabled={disabled}
                        onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                    >
                        <div className="flex gap-1 mb-2">
                            <button onClick={() => applyFilterPreset('wah')} className="flex-1 text-[10px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70">Wah</button>
                            <button onClick={() => applyFilterPreset('quack')} className="flex-1 text-[10px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70 font-bold text-hyper-cyan">Quack</button>
                            <button onClick={() => applyFilterPreset('down')} className="flex-1 text-[10px] bg-white/5 hover:bg-white/10 rounded py-1 border border-white/10 text-white/70">Down</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Slider label="Freq" min={getSafeMinFrequency()} max={15000} step={1} value={params.filter?.frequency ?? 2000} onChange={(v) => onEffectParamChange('filter', 'frequency', v)} disabled={disabled} unit="" log tooltip="Base Cutoff Frequency" defaultValue={2000} />
                            <Slider label="Res" min={0.1} max={30} step={0.1} value={params.filter?.q ?? 1} onChange={(v) => onEffectParamChange('filter', 'q', v)} disabled={disabled} tooltip="Resonance (Q) - higher peaks" defaultValue={1} />
                        </div>
                        <div className="pt-2 border-t border-white/10">
                            <label className="text-[10px] font-bold text-star-dust/60 uppercase mb-1 block">Envelope</label>
                            <Slider label="Env Mod" min={-8000} max={8000} step={10} value={params.filter?.envDepth ?? 0} onChange={(v) => onEffectParamChange('filter', 'envDepth', v)} disabled={disabled} tooltip="Envelope Depth. Pos=Wah, Neg=Reverse Wah" defaultValue={0} />
                        </div>
                        <div className="pt-2 border-t border-white/10">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-bold text-star-dust/60 uppercase">LFO</label>
                                <Tooltip text="Sync LFO to BPM">
                                    <button onClick={() => onEffectParamChange('filter', 'isSynced', !params.filter?.isSynced)} disabled={disabled} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${params.filter?.isSynced ? 'bg-hyper-cyan text-deep-space border-hyper-cyan' : 'bg-transparent text-star-dust/40 border-star-dust/20'}`}>SYNC</button>
                                </Tooltip>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Slider label="Depth" min={0} max={3000} step={10} value={params.filter?.lfoDepth ?? 0} onChange={(v) => onEffectParamChange('filter', 'lfoDepth', v)} disabled={disabled} tooltip="LFO Modulation Amount" defaultValue={0} />
                                {params.filter?.isSynced ? (
                                    <select value={params.filter.syncValue} onChange={(e) => onEffectParamChange('filter', 'syncValue', e.target.value as NoteSubdivision)} disabled={disabled} className="w-full h-8 bg-nebula-blue text-[10px] text-white rounded border border-white/10 focus:border-hyper-cyan outline-none">
                                        {subdivisionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                ) : (
                                    <Slider label="Rate" min={0.1} max={10} step={0.1} value={params.filter?.lfoRate ?? 1} onChange={(v) => onEffectParamChange('filter', 'lfoRate', v)} disabled={disabled} unit="Hz" tooltip="LFO Rate" defaultValue={1} />
                                )}
                            </div>
                        </div>
                    </EffectUnit>
                );
            case 'delay':
                return (
                    <EffectUnit
                        key="delay" id="delay"
                        title="Delay"
                        active={params.delay?.isActive ?? false}
                        onToggle={() => onEffectParamChange('delay', 'isActive', !params.delay?.isActive)}
                        colorClass="text-hyper-cyan"
                        info="Feedback delay line"
                        disabled={disabled}
                        onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                    >
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-medium text-star-dust/80">Time</label>
                            <Tooltip text="Sync delay time to Master BPM">
                                <button onClick={() => onEffectParamChange('delay', 'isSynced', !params.delay?.isSynced)} disabled={disabled} className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors border ${params.delay?.isSynced ? 'bg-hyper-cyan text-deep-space border-hyper-cyan' : 'bg-transparent text-star-dust/50 border-star-dust/20'}`}>SYNC</button>
                            </Tooltip>
                        </div>
                        {params.delay?.isSynced ? (
                            <select value={params.delay.syncValue} onChange={(e) => onEffectParamChange('delay', 'syncValue', e.target.value as NoteSubdivision)} disabled={disabled} className="w-full h-6 bg-nebula-blue text-[10px] text-white rounded border border-white/10 focus:border-hyper-cyan outline-none mb-2">
                                {subdivisionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        ) : (
                            <Slider label="" min={0} max={1} step={0.01} value={params.delay?.delayTime ?? 0.375} onChange={(v) => onEffectParamChange('delay', 'delayTime', v)} disabled={disabled} unit="s" tooltip="Delay time in seconds" defaultValue={0.375} precision={3} />
                        )}
                        <Slider label="Fdbk" min={0} max={0.95} step={0.01} value={params.delay?.feedback ?? 0.2} onChange={(v) => onEffectParamChange('delay', 'feedback', v)} disabled={disabled} tooltip="Amount of signal fed back into delay" defaultValue={0.2} />
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/10">
                            <Slider label="Lo Cut" min={20} max={2000} step={10} value={params.delay?.lowCut ?? 20} onChange={(v) => onEffectParamChange('delay', 'lowCut', v)} disabled={disabled} unit="Hz" log tooltip="Highpass filter for wet signal" defaultValue={20} precision={0} />
                            <Slider label="Hi Cut" min={1000} max={20000} step={100} value={params.delay?.highCut ?? 20000} onChange={(v) => onEffectParamChange('delay', 'highCut', v)} disabled={disabled} unit="Hz" log tooltip="Lowpass filter for wet signal" defaultValue={20000} precision={0} />
                        </div>
                        <Slider label="Mix" min={0} max={1} step={0.01} value={params.delay?.wet ?? 0} onChange={(v) => onEffectParamChange('delay', 'wet', v)} disabled={disabled} tooltip="Volume of delayed signal" defaultValue={0} />
                    </EffectUnit>
                );
            case 'reverb':
                return (
                    <EffectUnit
                        key="reverb" id="reverb"
                        title="Reverb"
                        active={params.reverb?.isActive ?? false}
                        onToggle={() => onEffectParamChange('reverb', 'isActive', !params.reverb?.isActive)}
                        colorClass="text-hyper-cyan"
                        info="Algorithmic reverb"
                        disabled={disabled}
                        onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
                    >
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-medium text-star-dust/80">Decay</label>
                            <Tooltip text="Sync reverb decay to Master BPM">
                                <button onClick={() => onEffectParamChange('reverb', 'isSynced', !params.reverb?.isSynced)} disabled={disabled} className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors border ${params.reverb?.isSynced ? 'bg-hyper-cyan text-deep-space border-hyper-cyan' : 'bg-transparent text-star-dust/50 border-star-dust/20'}`}>SYNC</button>
                            </Tooltip>
                        </div>
                        {params.reverb?.isSynced ? (
                            <select value={params.reverb.syncValue} onChange={(e) => onEffectParamChange('reverb', 'syncValue', e.target.value as NoteSubdivision)} disabled={disabled} className="w-full h-6 bg-nebula-blue text-[10px] text-white rounded border border-white/10 focus:border-hyper-cyan outline-none mb-2">
                                {subdivisionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        ) : (
                            <Slider label="" min={0.1} max={10} step={0.1} value={params.reverb?.decay ?? 1.5} onChange={(v) => onEffectParamChange('reverb', 'decay', v)} disabled={disabled} unit="s" tooltip="Duration of reverb tail" defaultValue={1.5} />
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/10">
                            <Slider label="Lo Cut" min={20} max={2000} step={10} value={params.reverb?.lowCut ?? 20} onChange={(v) => onEffectParamChange('reverb', 'lowCut', v)} disabled={disabled} unit="Hz" log tooltip="Highpass filter for reverb tail" defaultValue={20} precision={0} />
                            <Slider label="Hi Cut" min={1000} max={20000} step={100} value={params.reverb?.highCut ?? 20000} onChange={(v) => onEffectParamChange('reverb', 'highCut', v)} disabled={disabled} unit="Hz" log tooltip="Lowpass filter for reverb tail" defaultValue={20000} precision={0} />
                        </div>
                        <Slider label="Mix" min={0} max={1} step={0.01} value={params.reverb?.wet ?? 0} onChange={(v) => onEffectParamChange('reverb', 'wet', v)} disabled={disabled} tooltip="Volume of reverb signal" defaultValue={0} />
                    </EffectUnit>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {(showSlices || showPattern || showEngine) && (
                <div className={`grid grid-cols-1 md:grid-cols-3 gap-6`}>
                    
                    {/* Slice Properties Section */}
                    {showSlices && (
                        <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-white/20 shadow-lg shadow-white/5 flex flex-col">
                             {/* ... (Existing Slice UI unchanged) ... */}
                             <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="text-white">◆</span> Slice Control
                                <InfoIcon text="Select a slice to edit its properties, type, and envelope. Drag graph handles for micro-control." className="ml-2" />
                            </h3>
                            {currentSlice && selectedSliceIndex !== null ? (
                                <div className="space-y-3 flex-1 flex flex-col">
                                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-hyper-cyan">Slice #{currentSlice.id}</span>
                                            <div className="flex bg-deep-space/50 rounded border border-white/10 overflow-hidden ml-2">
                                                <Tooltip text="Play Slice (Raw)">
                                                    <button onClick={() => onPlaySlice(selectedSliceIndex)} className="px-2 py-1 hover:bg-white/10 transition-colors text-white border-r border-white/10">
                                                         <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                                    </button>
                                                </Tooltip>
                                                <Tooltip text="Loop Slice">
                                                     <button onClick={() => onLoopSlice(selectedSliceIndex)} className={`px-2 py-1 transition-colors ${sliceLoopState.index === selectedSliceIndex && sliceLoopState.isLooping ? 'bg-plasma-pink text-white animate-pulse' : 'hover:bg-white/10 text-white/50'}`}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                    </button>
                                                </Tooltip>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => onSliceUpdate(selectedSliceIndex, { isActive: !currentSlice.isActive })} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border transition-colors ${currentSlice.isActive ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                                                {currentSlice.isActive ? 'ACTIVE' : 'MUTED'}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <SliceWaveformEditor audioBuffer={audioBuffer} slice={currentSlice} onUpdate={(changes) => onSliceUpdate(selectedSliceIndex, changes)} />

                                    <div className="grid grid-cols-5 gap-1">
                                        {(['kick', 'snare', 'hihat', 'perc'] as SliceType[]).map((t) => (
                                            <button key={t} onClick={() => updateSliceType(t)} className={`h-6 text-[10px] font-bold uppercase rounded border transition-all ${currentSlice.type === t ? 'bg-white text-deep-space border-white' : 'bg-transparent text-star-dust/50 border-white/10 hover:bg-white/5'}`}>
                                                {t === 'hihat' ? 'Hat' : t}
                                            </button>
                                        ))}
                                        <button onClick={() => onSliceUpdate(selectedSliceIndex, { reverse: !currentSlice.reverse })} className={`h-6 text-[10px] font-bold uppercase rounded border transition-all ${currentSlice.reverse ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-transparent text-star-dust/50 border-white/10 hover:bg-white/5'}`}>
                                            Rev
                                        </button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-star-dust/70 uppercase flex items-center gap-1">Start <InfoIcon text="Fine-tune slice start point" className="w-3 h-3 text-[10px]" /></label>
                                            <div className="flex gap-1">
                                                 <button onClick={() => nudgeSliceStart(-0.01)} className="flex-1 h-6 bg-nebula-blue hover:bg-white/20 rounded border border-white/10 text-white text-xs">{'<'}</button>
                                                 <button onClick={() => nudgeSliceStart(0.01)} className="flex-1 h-6 bg-nebula-blue hover:bg-white/20 rounded border border-white/10 text-white text-xs">{'>'}</button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-star-dust/70 uppercase flex items-center gap-1">Len <InfoIcon text="Fine-tune slice duration" className="w-3 h-3 text-[10px]" /></label>
                                            <div className="flex gap-1">
                                                 <button onClick={() => nudgeSliceDuration(-0.01)} className="flex-1 h-6 bg-nebula-blue hover:bg-white/20 rounded border border-white/10 text-white text-xs">{'<'}</button>
                                                 <button onClick={() => nudgeSliceDuration(0.01)} className="flex-1 h-6 bg-nebula-blue hover:bg-white/20 rounded border border-white/10 text-white text-xs">{'>'}</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                                        <Slider label="Fade In" min={0} max={0.2} step={0.001} value={currentSlice.fadeIn ?? params.attack} onChange={(v) => onSliceUpdate(selectedSliceIndex, { fadeIn: v })} disabled={disabled} unit="s" defaultValue={params.attack} precision={3} />
                                        <Slider label="Fade Out" min={0} max={0.5} step={0.001} value={currentSlice.fadeOut ?? params.release} onChange={(v) => onSliceUpdate(selectedSliceIndex, { fadeOut: v })} disabled={disabled} unit="s" defaultValue={params.release} precision={3} />
                                    </div>
                                     <Slider label="Level" min={0} max={3.2} step={0.01} value={currentSlice.level ?? 1.0} onChange={(v) => onSliceUpdate(selectedSliceIndex, { level: v })} disabled={disabled} unit="x" defaultValue={1.0} tooltip="Slice Gain (Max +10dB)" />
                                     <Slider label="Pitch" min={-24} max={24} step={1} value={currentSlice.pitch ?? 0} onChange={(v) => onSliceUpdate(selectedSliceIndex, { pitch: v })} disabled={disabled} unit="st" tooltip="Slice Pitch Shift (Semitones)" defaultValue={0} />
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-star-dust/40 italic text-sm">Select a slice to edit</div>
                            )}
                        </div>
                    )}

                    {/* AI Beat Generator Section (Pro) */}
                    {showPattern && (
                        <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-hyper-cyan/50 shadow-lg shadow-hyper-cyan/10">
                             {/* ... (Existing Pattern UI unchanged) ... */}
                             <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="text-hyper-cyan">⚡</span> Pattern Gen
                                <InfoIcon text="Algorithmic sequencer. Use the slider to shift probability from steady House beats to chaotic Glitch patterns." className="ml-2" />
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
                                            step="0.01" 
                                            value={aiComplexity} 
                                            onChange={(e) => setAiComplexity(parseFloat(e.target.value))} 
                                            style={{ background: `linear-gradient(to right, #60a5fa 0%, #c084fc 50%, #f472b6 100%)` }}
                                            className="w-full h-3 rounded-lg appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-deep-space [&::-webkit-slider-thumb]:shadow-lg hover:[&::-webkit-slider-thumb]:scale-110 transition-all" 
                                            onDoubleClick={() => setAiComplexity(0)} 
                                        />
                                    </Tooltip>
                                </div>
                                <Tooltip text="Generate a new sequence based on the complexity slider">
                                    <button onClick={() => generateAiBeat(aiComplexity)} disabled={disabled} className="w-full py-3 bg-gradient-to-r from-hyper-cyan to-blue-600 text-white font-bold text-sm rounded hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-blue-500/20">GENERATE</button>
                                </Tooltip>
                                 <div className="pt-3 border-t border-white/10">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-xs font-bold text-plasma-pink uppercase flex items-center gap-1">Glitch Chaos <InfoIcon text="Global probability settings for random glitch effects." className="w-3 h-3 text-[10px]" /></h4>
                                        <span className="text-[10px] text-star-dust/50">{Math.round((params.glitch?.chaos || 0) * 100)}%</span>
                                    </div>
                                    <Slider label="" min={0} max={1} step={0.01} value={params.glitch?.chaos || 0} onChange={(v) => onParamChange('glitch', { ...params.glitch, chaos: v })} disabled={disabled} tooltip="Probability of random variations occurring on each step" defaultValue={0} />
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <Tooltip text="Allow Random Repeats (Ratchet)">
                                            <button onClick={() => onParamChange('glitch', { ...params.glitch, allowRatchet: !params.glitch.allowRatchet })} className={`py-1 text-[10px] font-bold uppercase rounded border ${params.glitch.allowRatchet ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}>Ratchet</button>
                                        </Tooltip>
                                        <Tooltip text="Allow Random Reverse">
                                            <button onClick={() => onParamChange('glitch', { ...params.glitch, allowReverse: !params.glitch.allowReverse })} className={`py-1 text-[10px] font-bold uppercase rounded border ${params.glitch.allowReverse ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}>Rev</button>
                                        </Tooltip>
                                        <Tooltip text="Allow Random Octave Jumps (+/- 1200 cents)">
                                            <button onClick={() => onParamChange('glitch', { ...params.glitch, allowOctaveJump: !params.glitch.allowOctaveJump })} className={`py-1 text-[10px] font-bold uppercase rounded border ${params.glitch.allowOctaveJump ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}>Octave</button>
                                        </Tooltip>
                                        <Tooltip text="Allow Random Grain Size Modulation (Robotic/Formant Textures)">
                                            <button onClick={() => onParamChange('glitch', { ...params.glitch, allowFormant: !params.glitch.allowFormant })} className={`py-1 text-[10px] font-bold uppercase rounded border ${params.glitch.allowFormant ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}>Formant</button>
                                        </Tooltip>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between bg-deep-space/40 rounded px-2 py-1 border border-white/5">
                                        <span className="text-[10px] text-star-dust/60 font-bold uppercase">Pitch Mode</span>
                                        <Tooltip text="Pitch Shift: Random pitch changes preserve length (Detune). Tape Speed: Pitch changes affect speed/length (Rate).">
                                            <button onClick={() => onParamChange('glitch', { ...params.glitch, pitchShift: !params.glitch.pitchShift })} className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${params.glitch.pitchShift ? 'bg-hyper-cyan text-deep-space' : 'bg-white/10 text-star-dust'}`}>
                                                {params.glitch.pitchShift ? 'P.SHIFT (Fixed Len)' : 'TAPE (Var Len)'}
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* BPM & Engine & Global Controls */}
                    {showEngine && (
                        <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-white/10 shadow-lg space-y-4">
                             {/* ... (Existing Engine UI unchanged) ... */}
                             <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-2">
                                <span className="text-xl">⚙️</span>
                                <h3 className="text-lg font-bold text-white">Engine & Global</h3>
                                <InfoIcon text="Master Tempo and Granular Synthesis Engine Parameters" className="ml-2" />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
                                {/* BPM Removed from here, moved to Transport */}
                                
                                <Slider 
                                    label="Grain Size" 
                                    min={0.005} 
                                    max={0.5} 
                                    step={0.001} 
                                    value={params.grainSize ?? 0.06} 
                                    onChange={(v) => onParamChange('grainSize', v)} 
                                    disabled={disabled} 
                                    unit="s" 
                                    log={true}
                                    tooltip="Duration of each audio grain (Logarithmic scale)" 
                                    defaultValue={0.06} 
                                    precision={3}
                                />
                                
                                <Slider label="Overlap" min={0.01} max={0.5} step={0.001} value={params.overlap} onChange={(v) => onParamChange('overlap', v)} disabled={disabled} unit="s" log tooltip="Crossfade duration" defaultValue={0.04} precision={3} />
                                <Slider label="Detune" min={-1200} max={1200} step={1} value={params.detune} onChange={(v) => onParamChange('detune', v)} disabled={disabled} unit="cnt" tooltip="Pitch shift" defaultValue={0} />
                                <Slider label="Rate" min={0.1} max={4} step={0.01} value={params.playbackRate} onChange={(v) => onParamChange('playbackRate', v)} disabled={disabled} unit="x" tooltip="Playback Speed" defaultValue={1.0} />
                                <Slider label="Attack" min={0.001} max={1.0} step={0.001} value={params.attack} onChange={(v) => onParamChange('attack', v)} disabled={disabled} unit="s" log tooltip="Grain envelope attack" defaultValue={0.005} precision={3} />
                                <Slider label="Release" min={0.001} max={2.0} step={0.001} value={params.release} onChange={(v) => onParamChange('release', v)} disabled={disabled} unit="s" log tooltip="Grain envelope release" defaultValue={0.1} precision={3} />
                                <Slider label="Sustain" min={0} max={2.0} step={0.01} value={params.sustain} onChange={(v) => onParamChange('sustain', v)} disabled={disabled} unit="s" tooltip="Grain sustain length" defaultValue={0.5} />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Effects Rack */}
            {showEffects && (
                <div className="bg-deep-space/50 p-2 sm:p-4 rounded-lg ring-1 ring-white/10 space-y-6">
                    <EffectSection title="Effects Rack" info="Chain of audio effects. Drag to reorder the signal flow. Top is first, bottom is last.">
                         {/* Vertical Stack with Reorder Support */}
                         <div className="flex flex-col gap-2">
                             {(params.order || ['compressor', 'distortion', 'bitCrusher', 'filter', 'delay', 'reverb']).map((id) => renderEffect(id))}
                         </div>
                    </EffectSection>
                </div>
            )}
        </div>
    );
});

export default ControlPanel;
