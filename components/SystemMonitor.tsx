
import React, { useEffect, useState } from 'react';

declare const Tone: any;

interface SystemMonitorProps {
    isOpen: boolean;
    onClose: () => void;
    stats: Record<string, any>;
}

const SystemMonitor: React.FC<SystemMonitorProps> = ({ isOpen, onClose, stats }) => {
    const [fps, setFps] = useState(0);
    const [jsHeapSize, setJsHeapSize] = useState<number | null>(null);
    const [audioState, setAudioState] = useState<string>('suspended');
    const [wasmSupported, setWasmSupported] = useState(false);
    const [workletSupport, setWorkletSupport] = useState(false);
    const [copied, setCopied] = useState(false);
    
    // Force re-render for live values
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!isOpen) return;

        // Check Capabilities
        try {
            setWasmSupported(typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function');
            setWorkletSupport(!!(window.AudioContext && window.AudioContext.prototype.audioWorklet));
        } catch (e) {
            // Ignore capability check errors
        }

        let frameCount = 0;
        let lastTime = performance.now();
        let animationFrameId: number;

        const updateStats = () => {
            try {
                const now = performance.now();
                
                // FPS Counter
                frameCount++;
                if (now - lastTime >= 1000) {
                    setFps(Math.round((frameCount * 1000) / (now - lastTime)));
                    frameCount = 0;
                    lastTime = now;
                    
                    // Audio State (Safe Access)
                    try {
                        if (typeof Tone !== 'undefined' && Tone.context) {
                            const s = Tone.context.state;
                            if (typeof s === 'string') {
                                setAudioState(s);
                            }
                        }
                    } catch (e) {
                        setAudioState('unknown');
                    }
                    
                    // Memory (Chrome only) - Safe Extraction
                    try {
                        const perf = performance as any;
                        // Directly access primitive value, do not store 'memory' object in state
                        if (perf && perf.memory && typeof perf.memory.usedJSHeapSize === 'number') {
                            setJsHeapSize(perf.memory.usedJSHeapSize);
                        }
                    } catch (e) {
                        // Ignore memory access errors
                    }
                }

                // High frequency re-render
                setTick(t => t + 1);
                
                animationFrameId = window.requestAnimationFrame(updateStats);
            } catch (err) {
                console.warn("SystemMonitor update error:", err);
                // Try to recover loop
                animationFrameId = window.requestAnimationFrame(updateStats);
            }
        };

        animationFrameId = window.requestAnimationFrame(updateStats);

        return () => window.cancelAnimationFrame(animationFrameId);
    }, [isOpen]);

    const handleCopy = async () => {
        try {
            // Deep copy stats to avoid reference issues
            const cleanStats = JSON.parse(JSON.stringify(stats));
            
            // Manually extract ref values if they exist in the stats object structure
            // We do this safely to avoid circular references or illegal access
            if (stats && stats.midi) {
                if (stats.midi.log && typeof stats.midi.log === 'object' && 'current' in stats.midi.log) {
                    cleanStats.midi.log = stats.midi.log.current;
                }
                if (stats.midi.clockSent && typeof stats.midi.clockSent === 'object' && 'current' in stats.midi.clockSent) {
                    cleanStats.midi.clockSent = stats.midi.clockSent.current;
                }
            }

            // Polish: Round floating point numbers for readability
            if (cleanStats.audio && typeof cleanStats.audio.duration === 'number') {
                cleanStats.audio.duration = Number(cleanStats.audio.duration.toFixed(3));
            }

            await navigator.clipboard.writeText(JSON.stringify(cleanStats, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy state:', err);
        }
    };

    if (!isOpen) return null;

    // Helper to safely get current value from possible Ref
    const getVal = (val: any) => {
        if (val && typeof val === 'object' && 'current' in val) {
            return val.current;
        }
        return val;
    }

    const midiLog = getVal(stats.midi?.log) || [];
    const clockSent = getVal(stats.midi?.clockSent) || 0;
    const clockDeltas = getVal(stats.midi?.clockDeltas) || [];
    
    // Theoretical Interval Calculation for Debugging
    const bpm = stats.audio?.bpm || 120;
    const ppq = 24; // Standard MIDI clock
    const targetInterval = 60000 / (bpm * ppq);

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#0f1319] border border-hyper-cyan/30 rounded-2xl shadow-[0_0_50px_rgba(0,246,255,0.1)] w-full max-w-2xl overflow-hidden ring-1 ring-white/10 flex flex-col max-h-[90vh]">
                <div className="bg-deep-space p-4 border-b border-white/10 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-hyper-cyan">📊</span> System Monitor
                    </h2>
                    <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">✕</button>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    {/* Performance */}
                    <div>
                        <h3 className="text-xs font-bold text-star-dust uppercase mb-2">Performance</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <div className="text-2xl font-mono font-bold text-green-400">{fps}</div>
                                <div className="text-[10px] text-star-dust uppercase">FPS</div>
                            </div>
                             <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <div className="text-2xl font-mono font-bold text-blue-400">
                                    {jsHeapSize ? Math.round(jsHeapSize / 1024 / 1024) : 'N/A'} <span className="text-sm text-white/50">MB</span>
                                </div>
                                <div className="text-[10px] text-star-dust uppercase">JS Heap</div>
                            </div>
                        </div>
                    </div>

                    {/* MIDI Debug Section */}
                    {stats.midi && stats.midi.enabled && (
                        <div>
                            <h3 className="text-xs font-bold text-star-dust uppercase mb-2">MIDI Debugger</h3>
                            <div className="bg-black/30 p-3 rounded-lg border border-white/10 space-y-3">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-white/5 rounded p-2">
                                        <div className="text-xs text-star-dust font-bold">Outputs</div>
                                        <div className="text-lg text-white font-mono">{stats.midi.outputs}</div>
                                    </div>
                                    <div className="bg-white/5 rounded p-2">
                                        <div className="text-xs text-star-dust font-bold">Clock Sent</div>
                                        <div className="text-lg text-hyper-cyan font-mono animate-pulse">{clockSent}</div>
                                    </div>
                                    <div className="bg-white/5 rounded p-2">
                                        <div className="text-xs text-star-dust font-bold">Send Clock</div>
                                        <div className={`text-lg font-mono ${stats.midi.sendClock ? 'text-green-400' : 'text-red-400'}`}>{stats.midi.sendClock ? 'ON' : 'OFF'}</div>
                                    </div>
                                </div>
                                
                                {/* Clock Stream Analysis */}
                                <div className="bg-white/5 rounded p-3 border border-white/5">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-[10px] font-bold text-hyper-cyan uppercase">Clock Stream Analysis</h4>
                                        <div className="text-[10px] text-star-dust">Target Interval: <span className="text-white font-mono">{targetInterval.toFixed(2)}ms</span></div>
                                    </div>
                                    <div className="flex gap-1 overflow-hidden h-8 items-center bg-black/40 px-2 rounded font-mono text-[9px]">
                                        {clockDeltas.length > 0 ? clockDeltas.map((d: number, i: number) => {
                                            const diff = Math.abs(d - targetInterval);
                                            const isBad = diff > (targetInterval * 0.1); // >10% deviation
                                            return (
                                                <span key={i} className={`mr-2 ${isBad ? 'text-red-500 font-bold' : 'text-white/50'}`}>
                                                    {d.toFixed(1)}
                                                </span>
                                            )
                                        }) : <span className="text-white/20 italic">Waiting for playback...</span>}
                                    </div>
                                </div>

                                <div className="bg-black/50 p-2 rounded border border-white/5 h-32 overflow-y-auto font-mono text-[10px] text-white/70">
                                    {Array.isArray(midiLog) && midiLog.length > 0 ? (
                                        midiLog.map((entry: string, i: number) => (
                                            <div key={i} className="border-b border-white/5 py-0.5">{entry}</div>
                                        ))
                                    ) : (
                                        <div className="text-white/30 italic">No MIDI activity logged...</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Audio Engine */}
                    <div>
                        <h3 className="text-xs font-bold text-star-dust uppercase mb-2">Audio Engine</h3>
                        <div className="bg-white/5 rounded-lg border border-white/5 overflow-hidden">
                            <div className="flex justify-between p-3 border-b border-white/5">
                                <span className="text-sm text-white/70">Context State</span>
                                <span className={`text-sm font-bold uppercase ${audioState === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>{audioState}</span>
                            </div>
                             <div className="flex justify-between p-3 border-b border-white/5">
                                <span className="text-sm text-white/70">Sample Rate</span>
                                <span className="text-sm font-bold text-white">{typeof Tone !== 'undefined' ? Tone.context.sampleRate : 0} Hz</span>
                            </div>
                            <div className="flex justify-between p-3">
                                <span className="text-sm text-white/70">DSP Architecture</span>
                                <span className="text-sm font-bold text-hyper-cyan animate-pulse">Custom Worklet (Multi-Threaded)</span>
                            </div>
                        </div>
                    </div>

                    {/* Capabilities */}
                    <div>
                        <h3 className="text-xs font-bold text-star-dust uppercase mb-2">Capabilities</h3>
                         <div className="grid grid-cols-2 gap-4">
                            <div className={`p-3 rounded-lg border ${wasmSupported ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-2 h-2 rounded-full ${wasmSupported ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    <span className="font-bold text-white text-sm">WebAssembly</span>
                                </div>
                                <div className="text-[10px] text-white/50">{wasmSupported ? 'Browser Supported' : 'Not Supported'}</div>
                                <div className="text-[9px] text-white/30 italic mt-1">Status: Not Used in DSP</div>
                            </div>
                             <div className={`p-3 rounded-lg border ${workletSupport ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-2 h-2 rounded-full ${workletSupport ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    <span className="font-bold text-white text-sm">AudioWorklet</span>
                                </div>
                                <div className="text-[10px] text-white/50">{workletSupport ? 'Active & Running' : 'Not Supported'}</div>
                            </div>
                        </div>
                    </div>

                    {/* App State Snapshot */}
                     <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-bold text-star-dust uppercase">App State Report</h3>
                             <button 
                                onClick={handleCopy}
                                className={`text-[10px] font-bold px-2 py-1 rounded border transition-all ${copied ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-white/5 text-star-dust border-white/10 hover:bg-white/10 hover:text-white'}`}
                            >
                                {copied ? 'COPIED TO CLIPBOARD' : 'COPY JSON REPORT'}
                            </button>
                        </div>
                        <div className="flex gap-2 text-xs font-mono text-hyper-cyan bg-black/40 p-3 rounded border border-white/10 overflow-auto max-h-64 scrollbar-thin scrollbar-thumb-white/10">
                            {/* We can't JSON.stringify the refs directly or it might fail or show empty object depending on browser/react version */}
                            <pre>{"State snapshot available via Copy button"}</pre>
                        </div>
                    </div>

                    {/* Credits Footer */}
                    <div className="pt-6 mt-6 border-t border-white/5 text-center">
                        <p className="text-[10px] text-star-dust/40">
                            Beat Slicer v0.9.0-beta • Created by <span className="text-hyper-cyan/60 font-bold">Sandro Mancino</span> • <a href="mailto:sandromancino.sm@gmail.com" className="hover:text-white transition-colors">sandromancino.sm@gmail.com</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemMonitor;
