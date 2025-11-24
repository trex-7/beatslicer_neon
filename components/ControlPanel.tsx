
import React, { useState } from 'react';
import type { AllParams, Slice, NoteSubdivision, SliceType } from '../types';
import Slider from './Slider';
import EffectSection from './EffectSection';
import Tooltip from './Tooltip';
import SliceWaveformEditor from './SliceWaveformEditor';

interface ControlPanelProps {
    params: AllParams;
    onParamChange: <K extends keyof AllParams>(key: K, value: AllParams[K]) => void;
    onEffectParamChange: <E extends keyof AllParams, P extends keyof AllParams[E]>(effect: E, param: P, value: AllParams[E][P]) => void;
    disabled: boolean;
    djActions: {
        triggerStutter: (subdivision: '4n' | '8n' | '16n' | '32n', active: boolean) => void;
        triggerTapeStop: (active: boolean) => void;
        triggerReverse: (active: boolean) => void;
        triggerFill: (type: 'scatter' | 'build' | 'break', active: boolean) => void;
    };
    generateAiBeat: (complexity: number) => void;
    slices: Slice[];
    selectedSliceIndex: number | null;
    onSliceUpdate: (index: number, changes: Partial<Slice>) => void;
    onPlaySlice: (index: number) => void;
    onLoopSlice: (index: number) => void;
    sliceLoopState: { index: number | null, isLooping: boolean };
    audioBuffer: any; // Tone.AudioBuffer or native
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

const ControlPanel: React.FC<ControlPanelProps> = ({ 
    params, 
    onParamChange, 
    onEffectParamChange, 
    disabled, 
    djActions, 
    generateAiBeat,
    slices,
    selectedSliceIndex,
    onSliceUpdate,
    onPlaySlice,
    onLoopSlice,
    sliceLoopState,
    audioBuffer
}) => {
    
    const [aiComplexity, setAiComplexity] = useState(0);

    const currentSlice = selectedSliceIndex !== null ? slices[selectedSliceIndex] : null;

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

    return (
        <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* DJ Performance Section */}
                <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-plasma-pink/50 shadow-lg shadow-plasma-pink/10">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-plasma-pink">●</span> Live FX
                            <InfoIcon text="Real-time DJ FX. Press and hold to freeze the sequencer step and apply effects. Release to resume sequence." />
                        </h3>
                        <div className="w-32">
                            <Slider label="BPM" min={60} max={200} step={1} value={params.bpm} onChange={(v) => onParamChange('bpm', v)} disabled={disabled} unit="" tooltip="Master Tempo" defaultValue={120} />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-1.5 mb-2">
                        <Tooltip text="Tape Stop">
                            <button 
                                onMouseDown={() => djActions.triggerTapeStop(true)} 
                                onMouseUp={() => djActions.triggerTapeStop(false)}
                                onMouseLeave={() => djActions.triggerTapeStop(false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerTapeStop(true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerTapeStop(false); }}
                                disabled={disabled}
                                className="w-full h-12 text-[10px] bg-gradient-to-br from-red-900 to-red-600 rounded font-bold text-white shadow-md active:scale-95 active:brightness-125 transition-all border-b-2 border-red-950 active:border-b-0 active:mt-0.5"
                            >
                                STOP
                            </button>
                        </Tooltip>
                        <Tooltip text="Reverse">
                            <button 
                                onMouseDown={() => djActions.triggerReverse(true)} 
                                onMouseUp={() => djActions.triggerReverse(false)}
                                onMouseLeave={() => djActions.triggerReverse(false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerReverse(true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerReverse(false); }}
                                disabled={disabled}
                                className="w-full h-12 text-[10px] bg-gradient-to-br from-yellow-700 to-yellow-500 rounded font-bold text-white shadow-md active:scale-95 active:brightness-125 transition-all border-b-2 border-yellow-900 active:border-b-0 active:mt-0.5"
                            >
                                REV
                            </button>
                        </Tooltip>
                        <Tooltip text="1/4 Stutter">
                            <button 
                                onMouseDown={() => djActions.triggerStutter('4n', true)}
                                onMouseUp={() => djActions.triggerStutter('4n', false)}
                                onMouseLeave={() => djActions.triggerStutter('4n', false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerStutter('4n', true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerStutter('4n', false); }}
                                disabled={disabled}
                                className="w-full h-12 text-[10px] bg-nebula-blue hover:bg-hyper-cyan/20 rounded font-mono text-hyper-cyan border border-hyper-cyan/30 active:bg-hyper-cyan active:text-black transition-all"
                            >
                                1/4
                            </button>
                        </Tooltip>
                        <Tooltip text="1/8 Stutter">
                            <button 
                                onMouseDown={() => djActions.triggerStutter('8n', true)}
                                onMouseUp={() => djActions.triggerStutter('8n', false)}
                                onMouseLeave={() => djActions.triggerStutter('8n', false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerStutter('8n', true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerStutter('8n', false); }}
                                disabled={disabled}
                                className="w-full h-12 text-[10px] bg-nebula-blue hover:bg-hyper-cyan/20 rounded font-mono text-hyper-cyan border border-hyper-cyan/30 active:bg-hyper-cyan active:text-black transition-all"
                            >
                                1/8
                            </button>
                        </Tooltip>
                        <Tooltip text="1/16 Stutter">
                            <button 
                                onMouseDown={() => djActions.triggerStutter('16n', true)}
                                onMouseUp={() => djActions.triggerStutter('16n', false)}
                                onMouseLeave={() => djActions.triggerStutter('16n', false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerStutter('16n', true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerStutter('16n', false); }}
                                disabled={disabled}
                                className="w-full h-12 text-[10px] bg-nebula-blue hover:bg-hyper-cyan/20 rounded font-mono text-hyper-cyan border border-hyper-cyan/30 active:bg-hyper-cyan active:text-black transition-all"
                            >
                                1/16
                            </button>
                        </Tooltip>
                         <Tooltip text="1/32 Stutter">
                            <button 
                                onMouseDown={() => djActions.triggerStutter('32n', true)}
                                onMouseUp={() => djActions.triggerStutter('32n', false)}
                                onMouseLeave={() => djActions.triggerStutter('32n', false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerStutter('32n', true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerStutter('32n', false); }}
                                disabled={disabled}
                                className="w-full h-12 text-[10px] bg-nebula-blue hover:bg-hyper-cyan/20 rounded font-mono text-hyper-cyan border border-hyper-cyan/30 active:bg-hyper-cyan active:text-black transition-all"
                            >
                                1/32
                            </button>
                        </Tooltip>
                    </div>

                    {/* Fills Section */}
                    <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                        <Tooltip text="Randomized Slices (Chaos)">
                            <button 
                                onMouseDown={() => djActions.triggerFill('scatter', true)}
                                onMouseUp={() => djActions.triggerFill('scatter', false)}
                                onMouseLeave={() => djActions.triggerFill('scatter', false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerFill('scatter', true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerFill('scatter', false); }}
                                disabled={disabled}
                                className="w-full h-8 text-[9px] bg-purple-900/50 hover:bg-purple-800 rounded font-bold text-purple-300 border border-purple-500/30 active:bg-purple-500 active:text-white transition-all uppercase"
                            >
                                Scatter
                            </button>
                        </Tooltip>
                        <Tooltip text="Rising Snare Roll">
                            <button 
                                onMouseDown={() => djActions.triggerFill('build', true)}
                                onMouseUp={() => djActions.triggerFill('build', false)}
                                onMouseLeave={() => djActions.triggerFill('build', false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerFill('build', true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerFill('build', false); }}
                                disabled={disabled}
                                className="w-full h-8 text-[9px] bg-purple-900/50 hover:bg-purple-800 rounded font-bold text-purple-300 border border-purple-500/30 active:bg-purple-500 active:text-white transition-all uppercase"
                            >
                                Build
                            </button>
                        </Tooltip>
                        <Tooltip text="Syncopated Breakbeat">
                            <button 
                                onMouseDown={() => djActions.triggerFill('break', true)}
                                onMouseUp={() => djActions.triggerFill('break', false)}
                                onMouseLeave={() => djActions.triggerFill('break', false)}
                                onTouchStart={(e) => { e.preventDefault(); djActions.triggerFill('break', true); }}
                                onTouchEnd={(e) => { e.preventDefault(); djActions.triggerFill('break', false); }}
                                disabled={disabled}
                                className="w-full h-8 text-[9px] bg-purple-900/50 hover:bg-purple-800 rounded font-bold text-purple-300 border border-purple-500/30 active:bg-purple-500 active:text-white transition-all uppercase"
                            >
                                Break
                            </button>
                        </Tooltip>
                    </div>
                </div>

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
                                    value={currentSlice.fadeIn ?? 0} 
                                    onChange={(v) => onSliceUpdate(selectedSliceIndex, { fadeIn: v })} 
                                    disabled={disabled} unit="s" defaultValue={0}
                                />
                                <Slider 
                                    label="Fade Out" min={0} max={0.5} step={0.001} 
                                    value={currentSlice.fadeOut ?? 0} 
                                    onChange={(v) => onSliceUpdate(selectedSliceIndex, { fadeOut: v })} 
                                    disabled={disabled} unit="s" defaultValue={0}
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
                                tooltip="Probability of random variations (Reverse, Octave Jumps) occurring on each step"
                                defaultValue={0}
                            />
                            <div className="flex gap-2 mt-2">
                                <button 
                                    onClick={() => onParamChange('glitch', { ...params.glitch, allowReverse: !params.glitch.allowReverse })}
                                    className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border ${params.glitch.allowReverse ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}
                                >
                                    Rev
                                </button>
                                <button 
                                    onClick={() => onParamChange('glitch', { ...params.glitch, allowOctaveJump: !params.glitch.allowOctaveJump })}
                                    className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border ${params.glitch.allowOctaveJump ? 'bg-plasma-pink/20 text-plasma-pink border-plasma-pink' : 'border-white/10 text-star-dust/40'}`}
                                >
                                    Octave
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Standard Controls */}
            <div className="bg-deep-space/50 p-4 rounded-lg ring-1 ring-white/10 space-y-6">
                <EffectSection title="Granular Engine" info="Controls how audio is chopped into grains. Size and Overlap determine texture density.">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                        <Slider label="Grain Size" min={0.01} max={0.5} step={0.01} value={params.grainSize} onChange={(v) => onParamChange('grainSize', v)} disabled={disabled} unit="s" tooltip="Duration of each audio grain. Smaller = choppy, Larger = smooth" defaultValue={0.1} />
                        <Slider label="Overlap" min={0.01} max={0.5} step={0.01} value={params.overlap} onChange={(v) => onParamChange('overlap', v)} disabled={disabled} unit="s" tooltip="Crossfade duration between grains" defaultValue={0.05} />
                        <Slider label="Detune" min={-1200} max={1200} step={1} value={params.detune} onChange={(v) => onParamChange('detune', v)} disabled={disabled} unit="cnt" tooltip="Pitch shift in cents (100 cents = 1 semitone)" defaultValue={0} />
                        <Slider label="Playback Rate" min={0.1} max={4} step={0.01} value={params.playbackRate} onChange={(v) => onParamChange('playbackRate', v)} disabled={disabled} unit="x" tooltip="Speed of grain playback. 1.0 is normal speed" defaultValue={1.0} />
                        
                        <Slider label="Attack" min={0.001} max={1.0} step={0.001} value={params.attack} onChange={(v) => onParamChange('attack', v)} disabled={disabled} unit="s" tooltip="Grain amplitude envelope attack time" defaultValue={0.005} />
                        <Slider label="Release" min={0.001} max={2.0} step={0.001} value={params.release} onChange={(v) => onParamChange('release', v)} disabled={disabled} unit="s" tooltip="Grain amplitude envelope release time" defaultValue={0.1} />
                    </div>
                </EffectSection>

                <EffectSection title="Effects Rack" info="Chain of audio effects for shaping tone, dynamics, and spatial ambience.">
                     <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                         {/* Vintage Tape Saturation */}
                         <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-orange-400 text-xs uppercase tracking-wider">Vintage Tape</h4>
                            <Slider label="Drive" min={0} max={1} step={0.01} value={params.tapeSaturation?.drive ?? 0} onChange={(v) => onEffectParamChange('tapeSaturation', 'drive', v)} disabled={disabled} tooltip="Input gain for tape saturation" defaultValue={0} />
                            <Slider label="Tone" min={500} max={20000} step={100} value={params.tapeSaturation?.tone ?? 20000} onChange={(v) => onEffectParamChange('tapeSaturation', 'tone', v)} disabled={disabled} unit="Hz" log tooltip="Low-pass cutoff to simulate tape warmth" defaultValue={20000} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.tapeSaturation?.wet ?? 0} onChange={(v) => onEffectParamChange('tapeSaturation', 'wet', v)} disabled={disabled} tooltip="Dry/Wet mix for tape effect" defaultValue={0} />
                        </div>

                        {/* Distortion */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-plasma-pink text-xs uppercase tracking-wider">Distortion</h4>
                            <Slider label="Drive" min={0} max={1} step={0.01} value={params.distortion.amount} onChange={(v) => onEffectParamChange('distortion', 'amount', v)} disabled={disabled} tooltip="Amount of hard clipping distortion" defaultValue={0} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.distortion.wet} onChange={(v) => onEffectParamChange('distortion', 'wet', v)} disabled={disabled} tooltip="Dry/Wet mix for distortion" defaultValue={0} />
                        </div>
                        
                         {/* BitCrusher */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-green-400 text-xs uppercase tracking-wider">BitCrush</h4>
                            <Slider label="Bits" min={1} max={16} step={1} value={params.bitCrusher?.bits ?? 8} onChange={(v) => onEffectParamChange('bitCrusher', 'bits', v)} disabled={disabled} tooltip="Bit depth reduction (Lower = Lo-fi)" defaultValue={8} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.bitCrusher?.wet ?? 0} onChange={(v) => onEffectParamChange('bitCrusher', 'wet', v)} disabled={disabled} tooltip="Dry/Wet mix for bitcrusher" defaultValue={0} />
                        </div>

                        {/* Filter */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-hyper-cyan text-xs uppercase tracking-wider">Filter</h4>
                            <Slider label="Freq" min={20} max={20000} step={1} value={params.filter.frequency} onChange={(v) => onEffectParamChange('filter', 'frequency', v)} disabled={disabled} unit="Hz" log tooltip="Filter cutoff frequency" defaultValue={20000} />
                            <Slider label="Res" min={0.1} max={20} step={0.1} value={params.filter.q} onChange={(v) => onEffectParamChange('filter', 'q', v)} disabled={disabled} tooltip="Filter resonance (Q factor)" defaultValue={1} />
                        </div>

                        {/* Delay */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                             <h4 className="font-bold text-hyper-cyan text-xs uppercase tracking-wider">Delay</h4>
                             
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
                                <Slider label="" min={0} max={1} step={0.01} value={params.delay.delayTime} onChange={(v) => onEffectParamChange('delay', 'delayTime', v)} disabled={disabled} unit="s" tooltip="Delay time in seconds" defaultValue={0.5} />
                             )}

                            <Slider label="Fdbk" min={0} max={0.95} step={0.01} value={params.delay.feedback} onChange={(v) => onEffectParamChange('delay', 'feedback', v)} disabled={disabled} tooltip="Amount of signal fed back into delay" defaultValue={0.3} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.delay.wet} onChange={(v) => onEffectParamChange('delay', 'wet', v)} disabled={disabled} tooltip="Volume of delayed signal" defaultValue={0} />
                        </div>

                         {/* Reverb */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-hyper-cyan text-xs uppercase tracking-wider">Reverb</h4>

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
};

export default ControlPanel;
