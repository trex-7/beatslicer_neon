
import React, { useEffect, useState } from 'react';

declare const Tone: any;

interface SystemMonitorProps {
    isOpen: boolean;
    onClose: () => void;
    stats: Record<string, any>;
}

const SystemMonitor: React.FC<SystemMonitorProps> = ({ isOpen, onClose, stats }) => {
    const [fps, setFps] = useState(0);
    const [memory, setMemory] = useState<any>(null);
    const [audioState, setAudioState] = useState<string>('suspended');
    const [wasmSupported, setWasmSupported] = useState(false);
    const [workletSupport, setWorkletSupport] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        // Check Capabilities
        setWasmSupported(typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function');
        setWorkletSupport(!!(window.AudioContext && window.AudioContext.prototype.audioWorklet));

        let frameCount = 0;
        let lastTime = performance.now();
        let animationFrameId: number;

        const updateStats = () => {
            const now = performance.now();
            frameCount++;
            if (now - lastTime >= 1000) {
                setFps(Math.round((frameCount * 1000) / (now - lastTime)));
                frameCount = 0;
                lastTime = now;
                
                // Audio State
                if (typeof Tone !== 'undefined' && Tone.context) {
                    setAudioState(Tone.context.state);
                }

                // Memory (Chrome only)
                if ((performance as any).memory) {
                    setMemory((performance as any).memory);
                }
            }
            animationFrameId = requestAnimationFrame(updateStats);
        };

        updateStats();

        return () => cancelAnimationFrame(animationFrameId);
    }, [isOpen]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(stats, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy state:', err);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
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
                                    {memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : 'N/A'} <span className="text-sm text-white/50">MB</span>
                                </div>
                                <div className="text-[10px] text-star-dust uppercase">JS Heap</div>
                            </div>
                        </div>
                    </div>

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
                            <pre>{JSON.stringify(stats, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemMonitor;
