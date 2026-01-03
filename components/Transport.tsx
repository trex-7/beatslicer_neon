
import React, { useState, useRef, useEffect } from 'react';
import type { MidiConfig, MidiDevice } from '../types';
import Tooltip from './Tooltip';

interface TransportProps {
    isPlaying: boolean;
    isLooping: boolean;
    bpm: number;
    currentStep: number;
    onTogglePlay: () => void;
    onToggleLoop: () => void;
    onStepForward: () => void;
    onStepBackward: () => void;
    onBpmChange: (bpm: number) => void;
    disabled: boolean;
    midiConfig: MidiConfig;
    midiInputs: MidiDevice[];
    midiOutputs: MidiDevice[];
    onMidiConfigChange: (config: Partial<MidiConfig>) => void;
}

const Transport: React.FC<TransportProps> = ({
    isPlaying,
    isLooping,
    bpm,
    currentStep,
    onTogglePlay,
    onToggleLoop,
    onStepForward,
    onStepBackward,
    onBpmChange,
    disabled,
    midiConfig,
    midiInputs,
    midiOutputs,
    onMidiConfigChange
}) => {
    const [showMidi, setShowMidi] = useState(false);
    const midiRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (midiRef.current && !midiRef.current.contains(event.target as Node)) {
                setShowMidi(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // BPM Drag Logic
    const handleBpmMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startBpm = bpm;

        const handleMouseMove = (ev: MouseEvent) => {
            const diff = startY - ev.clientY;
            const newBpm = Math.max(20, Math.min(300, Math.round(startBpm + diff)));
            onBpmChange(newBpm);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className="w-full bg-[#12161d] rounded-xl border border-white/10 shadow-2xl flex flex-col md:flex-row lg:flex-col items-center p-2 gap-4 select-none relative z-40 transition-all">
            
            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5 w-full md:w-auto lg:w-full">
                <Tooltip text="Step Back">
                    <button 
                        onClick={onStepBackward}
                        disabled={disabled}
                        className="w-10 h-10 flex items-center justify-center text-star-dust hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-30"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                    </button>
                </Tooltip>

                <Tooltip text={isPlaying ? "Stop (Space)" : "Play (Space)"}>
                    <button 
                        onClick={onTogglePlay}
                        disabled={disabled}
                        className={`w-14 h-10 flex items-center justify-center rounded transition-all shadow-inner disabled:opacity-30 ${isPlaying ? 'bg-plasma-pink text-white shadow-[0_0_10px_rgba(255,0,170,0.4)]' : 'bg-hyper-cyan/10 text-hyper-cyan hover:bg-hyper-cyan/20 border border-hyper-cyan/30'}`}
                    >
                        {isPlaying ? (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        )}
                    </button>
                </Tooltip>

                <Tooltip text="Step Forward">
                    <button 
                        onClick={onStepForward}
                        disabled={disabled}
                        className="w-10 h-10 flex items-center justify-center text-star-dust hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-30"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                    </button>
                </Tooltip>

                <div className="w-px h-6 bg-white/10 mx-1"></div>

                <Tooltip text={isLooping ? "Looping Active" : "Play Once"}>
                    <button 
                        onClick={onToggleLoop}
                        disabled={disabled}
                        className={`w-10 h-10 flex items-center justify-center rounded transition-colors disabled:opacity-30 ${isLooping ? 'text-hyper-cyan bg-hyper-cyan/10' : 'text-star-dust hover:text-white hover:bg-white/10'}`}
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v3a3 3 0 003 3h10a3 3 0 003-3v-3m-6-3l3 3m0 0l-3 3m3-3H7" /></svg>
                    </button>
                </Tooltip>
            </div>

            {/* LCD Display Section */}
            <div className="flex-1 flex items-center justify-center gap-4 bg-black/60 p-2 rounded-lg border border-white/10 shadow-inner min-w-[200px] w-full md:w-auto lg:w-full font-mono text-hyper-cyan">
                {/* BPM */}
                <div className="flex flex-col items-center group cursor-ns-resize" onMouseDown={handleBpmMouseDown}>
                    <span className="text-[10px] text-hyper-cyan/50 font-bold uppercase tracking-widest group-hover:text-hyper-cyan transition-colors">BPM</span>
                    <span className="text-2xl font-bold leading-none tracking-tighter">{Math.round(bpm)}</span>
                </div>

                <div className="w-px h-8 bg-hyper-cyan/20"></div>

                {/* Step Position */}
                <div className="flex flex-col items-center">
                    <span className="text-[10px] text-hyper-cyan/50 font-bold uppercase tracking-widest">STEP</span>
                    <span className="text-2xl font-bold leading-none tracking-tighter">
                        {(currentStep + 1).toString().padStart(2, '0')}
                    </span>
                </div>
            </div>

            {/* MIDI Controls */}
            <div className="relative w-full md:w-auto lg:w-full" ref={midiRef}>
                <button 
                    onClick={() => setShowMidi(!showMidi)}
                    className={`h-10 px-4 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all w-full ${midiConfig.enabled ? 'bg-hyper-cyan/10 text-hyper-cyan border-hyper-cyan/50 shadow-[0_0_10px_rgba(0,246,255,0.1)]' : 'bg-black/40 text-star-dust border-white/10 hover:border-white/30'}`}
                >
                    <span className="text-lg">🎹</span> MIDI
                    {midiConfig.enabled && isPlaying && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-auto"></span>}
                </button>

                {showMidi && (
                    <div className="absolute left-0 top-full mt-2 w-full md:w-72 bg-[#1a1f2b] border border-white/20 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                MIDI Config
                                <span className={`text-[10px] px-1.5 rounded uppercase ${midiConfig.enabled ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/30'}`}>{midiConfig.enabled ? 'Active' : 'Off'}</span>
                            </h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={midiConfig.enabled} onChange={(e) => onMidiConfigChange({ enabled: e.target.checked })} className="sr-only peer" />
                                <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-hyper-cyan"></div>
                            </label>
                        </div>

                        <div className={`space-y-4 ${!midiConfig.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            {/* Inputs */}
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-bold text-star-dust flex items-center gap-1">
                                    <span>⬇️</span> Input Device (Control)
                                </label>
                                <select 
                                    value={midiConfig.inputPortId} 
                                    onChange={(e) => onMidiConfigChange({ inputPortId: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-hyper-cyan"
                                >
                                    <option value="">None</option>
                                    {midiInputs.map(input => (
                                        <option key={input.id} value={input.id}>{input.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="pt-2 border-t border-white/5 space-y-1">
                                <label className="text-[10px] uppercase font-bold text-star-dust flex items-center gap-1">
                                    <span>⬆️</span> Sync Target (Output)
                                </label>
                                <select 
                                    value={midiConfig.outputPortId} 
                                    onChange={(e) => onMidiConfigChange({ outputPortId: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-hyper-cyan"
                                >
                                    <option value="">All Connected Devices</option>
                                    {midiOutputs.map(output => (
                                        <option key={output.id} value={output.id}>{output.name}</option>
                                    ))}
                                </select>
                                <div className="text-[10px] text-white/30 px-1">Sends Clock & Transport</div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-star-dust">Clock Rate (PPQ)</label>
                                    <select 
                                        value={midiConfig.ppq} 
                                        onChange={(e) => onMidiConfigChange({ ppq: parseInt(e.target.value) })}
                                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-hyper-cyan"
                                    >
                                        <option value="12">12 (Half)</option>
                                        <option value="24">24 (Standard)</option>
                                        <option value="48">48 (Double)</option>
                                        <option value="96">96 (Quad)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold text-star-dust">Sync Mode</label>
                                    <select 
                                        value={midiConfig.clockSource} 
                                        onChange={(e) => onMidiConfigChange({ clockSource: e.target.value as any })}
                                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-hyper-cyan"
                                    >
                                        <option value="internal">Master (Send)</option>
                                        <option value="external" disabled>Slave (Receive)</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="pt-2 border-t border-white/5 space-y-1">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] uppercase font-bold text-star-dust">Sync Shift</label>
                                    <span className="text-[10px] font-mono text-hyper-cyan">{midiConfig.clockOffset > 0 ? '+' : ''}{midiConfig.clockOffset}ms</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="-200" 
                                    max="200" 
                                    step="1" 
                                    value={midiConfig.clockOffset || 0}
                                    onChange={(e) => onMidiConfigChange({ clockOffset: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-black/40 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                                    onDoubleClick={() => onMidiConfigChange({ clockOffset: 0 })}
                                />
                                <div className="text-[10px] text-white/30 px-1 flex justify-between">
                                    <span>Eariler</span>
                                    <span>Later</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 mt-3 pt-2 border-t border-white/5 bg-black/20 p-2 rounded">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={midiConfig.sendClock} onChange={(e) => onMidiConfigChange({ sendClock: e.target.checked })} className="w-3 h-3 rounded bg-black/40 border-white/30 checked:bg-hyper-cyan appearance-none border checked:border-hyper-cyan" />
                                    <span className="text-xs text-white font-bold">Send Clock (0xF8)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={midiConfig.sendTransport} onChange={(e) => onMidiConfigChange({ sendTransport: e.target.checked })} className="w-3 h-3 rounded bg-black/40 border-white/30 checked:bg-hyper-cyan appearance-none border checked:border-hyper-cyan" />
                                    <span className="text-xs text-white font-bold">Send Transport (Start/Stop)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Transport;
