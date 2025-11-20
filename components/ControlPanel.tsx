
import React from 'react';
import type { AllParams } from '../types';
import Slider from './Slider';
import EffectSection from './EffectSection';

interface ControlPanelProps {
    params: AllParams;
    onParamChange: <K extends keyof AllParams>(key: K, value: AllParams[K]) => void;
    onEffectParamChange: <E extends keyof AllParams, P extends keyof AllParams[E]>(effect: E, param: P, value: AllParams[E][P]) => void;
    disabled: boolean;
    djActions: {
        triggerStutter: (subdivision: '4n' | '8n' | '16n' | '32n', active: boolean) => void;
        triggerTapeStop: (active: boolean) => void;
        triggerReverse: () => void;
    };
}

const ControlPanel: React.FC<ControlPanelProps> = ({ params, onParamChange, onEffectParamChange, disabled, djActions }) => {
    return (
        <div className="space-y-6">
            
            {/* DJ Performance Section */}
            <div className="bg-deep-space/80 p-6 rounded-lg ring-1 ring-plasma-pink/50 shadow-lg shadow-plasma-pink/10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span className="text-plasma-pink">●</span> Live Performance
                    </h3>
                    <div className="w-full md:w-64 bg-nebula-blue/40 p-3 rounded-lg border border-white/10">
                        <Slider label="Master BPM" min={60} max={200} step={1} value={params.bpm} onChange={(v) => onParamChange('bpm', v)} disabled={disabled} unit="BPM" />
                    </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <button 
                        onMouseDown={() => djActions.triggerTapeStop(true)} 
                        onMouseUp={() => djActions.triggerTapeStop(false)}
                        onMouseLeave={() => djActions.triggerTapeStop(false)}
                        onTouchStart={(e) => { e.preventDefault(); djActions.triggerTapeStop(true); }}
                        onTouchEnd={(e) => { e.preventDefault(); djActions.triggerTapeStop(false); }}
                        disabled={disabled}
                        className="h-24 bg-gradient-to-br from-red-900 to-red-600 rounded-lg font-bold text-white text-lg shadow-md active:scale-95 active:brightness-125 transition-all border-b-4 border-red-950 active:border-b-0 active:mt-1"
                    >
                        TAPE STOP
                    </button>
                    <button 
                        onClick={() => djActions.triggerReverse()}
                        disabled={disabled}
                        className="h-24 bg-gradient-to-br from-yellow-700 to-yellow-500 rounded-lg font-bold text-white text-lg shadow-md active:scale-95 active:brightness-125 transition-all border-b-4 border-yellow-900 active:border-b-0 active:mt-1"
                    >
                        REVERSE ⟲
                    </button>
                    <button 
                        onMouseDown={() => djActions.triggerStutter('4n', true)}
                        onMouseUp={() => djActions.triggerStutter('4n', false)}
                        onMouseLeave={() => djActions.triggerStutter('4n', false)}
                         onTouchStart={(e) => { e.preventDefault(); djActions.triggerStutter('4n', true); }}
                        onTouchEnd={(e) => { e.preventDefault(); djActions.triggerStutter('4n', false); }}
                        disabled={disabled}
                        className="h-24 bg-nebula-blue hover:bg-hyper-cyan/20 rounded-lg font-mono text-hyper-cyan border border-hyper-cyan/30 active:bg-hyper-cyan active:text-black transition-all"
                    >
                        1/4 LOOP
                    </button>
                     <button 
                        onMouseDown={() => djActions.triggerStutter('8n', true)}
                        onMouseUp={() => djActions.triggerStutter('8n', false)}
                        onMouseLeave={() => djActions.triggerStutter('8n', false)}
                        onTouchStart={(e) => { e.preventDefault(); djActions.triggerStutter('8n', true); }}
                        onTouchEnd={(e) => { e.preventDefault(); djActions.triggerStutter('8n', false); }}
                        disabled={disabled}
                        className="h-24 bg-nebula-blue hover:bg-hyper-cyan/20 rounded-lg font-mono text-hyper-cyan border border-hyper-cyan/30 active:bg-hyper-cyan active:text-black transition-all"
                    >
                        1/8 LOOP
                    </button>
                     <button 
                        onMouseDown={() => djActions.triggerStutter('16n', true)}
                        onMouseUp={() => djActions.triggerStutter('16n', false)}
                        onMouseLeave={() => djActions.triggerStutter('16n', false)}
                        onTouchStart={(e) => { e.preventDefault(); djActions.triggerStutter('16n', true); }}
                        onTouchEnd={(e) => { e.preventDefault(); djActions.triggerStutter('16n', false); }}
                        disabled={disabled}
                        className="h-24 bg-nebula-blue hover:bg-hyper-cyan/20 rounded-lg font-mono text-hyper-cyan border border-hyper-cyan/30 active:bg-hyper-cyan active:text-black transition-all"
                    >
                        1/16 LOOP
                    </button>
                </div>
            </div>

            {/* Standard Controls */}
            <div className="bg-deep-space/50 p-6 rounded-lg ring-1 ring-white/10 space-y-8">
                <EffectSection title="Granular Engine">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                        <Slider label="Grain Size" min={0.01} max={0.5} step={0.01} value={params.grainSize} onChange={(v) => onParamChange('grainSize', v)} disabled={disabled} unit="s" />
                        <Slider label="Overlap" min={0.01} max={0.5} step={0.01} value={params.overlap} onChange={(v) => onParamChange('overlap', v)} disabled={disabled} unit="s" />
                        <Slider label="Detune" min={-1200} max={1200} step={1} value={params.detune} onChange={(v) => onParamChange('detune', v)} disabled={disabled} unit="cnt" />
                        <Slider label="Playback Rate" min={0.1} max={4} step={0.01} value={params.playbackRate} onChange={(v) => onParamChange('playbackRate', v)} disabled={disabled} unit="x" />
                        
                        {/* New Envelope Controls */}
                        <Slider label="Attack" min={0.001} max={1.0} step={0.001} value={params.attack} onChange={(v) => onParamChange('attack', v)} disabled={disabled} unit="s" />
                        <Slider label="Release" min={0.001} max={2.0} step={0.001} value={params.release} onChange={(v) => onParamChange('release', v)} disabled={disabled} unit="s" />
                    </div>
                </EffectSection>

                <EffectSection title="Effects Rack">
                     <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                         {/* BitCrusher (New) */}
                         <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-plasma-pink text-sm uppercase tracking-wider">BitCrush</h4>
                            <Slider label="Bits" min={1} max={8} step={1} value={params.bitCrusher.bits} onChange={(v) => onEffectParamChange('bitCrusher', 'bits', v)} disabled={disabled} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.bitCrusher.wet} onChange={(v) => onEffectParamChange('bitCrusher', 'wet', v)} disabled={disabled} />
                        </div>

                        {/* Distortion */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-plasma-pink text-sm uppercase tracking-wider">Distortion</h4>
                            <Slider label="Drive" min={0} max={1} step={0.01} value={params.distortion.amount} onChange={(v) => onEffectParamChange('distortion', 'amount', v)} disabled={disabled} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.distortion.wet} onChange={(v) => onEffectParamChange('distortion', 'wet', v)} disabled={disabled} />
                        </div>

                        {/* Filter */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-hyper-cyan text-sm uppercase tracking-wider">Filter</h4>
                            <Slider label="Freq" min={20} max={20000} step={1} value={params.filter.frequency} onChange={(v) => onEffectParamChange('filter', 'frequency', v)} disabled={disabled} unit="Hz" log />
                            <Slider label="Res" min={0.1} max={20} step={0.1} value={params.filter.q} onChange={(v) => onEffectParamChange('filter', 'q', v)} disabled={disabled} />
                        </div>

                        {/* Delay */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                             <h4 className="font-bold text-hyper-cyan text-sm uppercase tracking-wider">Delay</h4>
                            <Slider label="Time" min={0} max={1} step={0.01} value={params.delay.delayTime} onChange={(v) => onEffectParamChange('delay', 'delayTime', v)} disabled={disabled} unit="s" />
                            <Slider label="Fdbk" min={0} max={0.95} step={0.01} value={params.delay.feedback} onChange={(v) => onEffectParamChange('delay', 'feedback', v)} disabled={disabled} />
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.delay.wet} onChange={(v) => onEffectParamChange('delay', 'wet', v)} disabled={disabled} />
                        </div>

                         {/* Reverb */}
                        <div className="space-y-3 p-3 bg-nebula-blue/30 rounded-md border border-white/5">
                            <h4 className="font-bold text-hyper-cyan text-sm uppercase tracking-wider">Reverb</h4>
                            <Slider label="Decay" min={0.1} max={10} step={0.1} value={params.reverb.decay} onChange={(v) => onEffectParamChange('reverb', 'decay', v)} disabled={disabled} unit="s"/>
                            <Slider label="Mix" min={0} max={1} step={0.01} value={params.reverb.wet} onChange={(v) => onEffectParamChange('reverb', 'wet', v)} disabled={disabled} />
                        </div>
                    </div>
                </EffectSection>
            </div>
        </div>
    );
};

export default ControlPanel;
