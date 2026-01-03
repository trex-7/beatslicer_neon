
import React from 'react';
import type { SequencerState, SequencerMode, SequencerStep, Slice } from '../types';
import Tooltip from './Tooltip';
import InfoIcon from './InfoIcon';

interface SequencerProps {
    sequencer: SequencerState;
    onStepChange: (index: number, changes: Partial<SequencerStep>) => void;
    onModeChange: (mode: SequencerMode) => void;
    onStepCountChange: (count: 8 | 16 | 32) => void;
    onRandomize: () => void;
    onEditModeToggle: (mode: 'trigger' | 'ratchet') => void;
    onPlaybackBehaviorChange?: (behavior: 'reset' | 'continue') => void;
    disabled: boolean;
    selectedSliceIndex: number | null;
    isProMode: boolean;
    slices?: Slice[];
}

const Sequencer: React.FC<SequencerProps> = ({ 
    sequencer, 
    onStepChange, 
    onModeChange, 
    onStepCountChange, 
    onRandomize,
    onEditModeToggle,
    onPlaybackBehaviorChange,
    disabled,
    selectedSliceIndex,
    isProMode,
    slices = []
}) => {
    
    const modes: SequencerMode[] = ['forward', 'backward', 'pendulum', 'random'];
    
    const currentEditMode = sequencer.editMode || 'trigger';
    const currentBehavior = sequencer.playbackBehavior || 'reset';

    const handleStepClick = (index: number, currentStep: SequencerStep) => {
        if (!isProMode) {
             onStepChange(index, { active: !currentStep.active });
             return;
        }

        if (currentEditMode === 'trigger') {
            onStepChange(index, { active: !currentStep.active });
        } else {
            let nextRatchet = (currentStep.ratchet || 1) + 1;
            if (nextRatchet > 4) nextRatchet = 1;
            onStepChange(index, { ratchet: nextRatchet, active: true });
        }
    };

    const handleSliceAssign = (stepIndex: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedSliceIndex !== null) {
            onStepChange(stepIndex, { sliceIndex: selectedSliceIndex });
        }
    };

    // Helper to get color class based on slice type
    const getStepColorClass = (sliceIndex: number): string => {
        const slice = slices[sliceIndex];
        if (!slice) return 'bg-slate-500 border-slate-400';
        
        switch (slice.type) {
            case 'kick': return 'bg-red-500 border-red-400';
            case 'snare': return 'bg-yellow-500 border-yellow-400 text-deep-space';
            case 'hihat': return 'bg-hyper-cyan border-cyan-200 text-deep-space';
            case 'perc': return 'bg-purple-500 border-purple-400';
            default: return 'bg-slate-500 border-slate-400';
        }
    };

    const getStepShadow = (sliceIndex: number): string => {
        const slice = slices[sliceIndex];
        if (!slice) return '';
        
        switch (slice.type) {
            case 'kick': return 'shadow-[0_0_15px_rgba(239,68,68,0.6)]';
            case 'snare': return 'shadow-[0_0_15px_rgba(234,179,8,0.6)]';
            case 'hihat': return 'shadow-[0_0_15px_rgba(0,246,255,0.6)]';
            case 'perc': return 'shadow-[0_0_15px_rgba(168,85,247,0.6)]';
            default: return '';
        }
    }

    const getGridClass = () => {
        return 'grid-cols-8 lg:grid-cols-16 gap-2'; 
    };

    return (
        <div className="bg-deep-space/60 p-4 rounded-xl border border-white/5 shadow-2xl relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-hyper-cyan/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

            {/* Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 z-10 relative">
                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    <h3 className="text-xs font-bold text-hyper-cyan tracking-widest uppercase flex items-center gap-2">
                        <span className="w-2 h-2 bg-hyper-cyan rounded-full animate-pulse shadow-[0_0_8px_rgba(0,246,255,0.8)]"></span>
                        Sequencer
                        <InfoIcon text="Left-click pads to toggle. Bottom bar sets slice." className="ml-1" />
                    </h3>
                    
                    {isProMode && (
                        <div className="flex gap-2 items-center">
                            {/* Edit Mode Toggle */}
                            <div className="flex bg-[#0a0d14] rounded-lg border border-white/10 overflow-hidden shadow-inner scale-90 sm:scale-100 p-0.5">
                                 <Tooltip text="Trigger Mode: Click pads to toggle On/Off">
                                    <button 
                                        onClick={() => onEditModeToggle('trigger')}
                                        className={`px-3 py-1 text-[10px] font-bold uppercase transition-all rounded ${currentEditMode === 'trigger' ? 'bg-white/10 text-white shadow-sm' : 'text-star-dust/50 hover:text-white hover:bg-white/5'}`}
                                    >
                                        Trig
                                    </button>
                                </Tooltip>
                                <Tooltip text="Ratchet Mode: Click pads to add rolls (2x, 3x, 4x)">
                                    <button 
                                        onClick={() => onEditModeToggle('ratchet')}
                                        className={`px-3 py-1 text-[10px] font-bold uppercase transition-all rounded ${currentEditMode === 'ratchet' ? 'bg-plasma-pink/20 text-plasma-pink shadow-sm' : 'text-star-dust/50 hover:text-white hover:bg-white/5'}`}
                                    >
                                        Roll
                                    </button>
                                 </Tooltip>
                            </div>
                            
                            {/* Playback Behavior Toggle */}
                            {onPlaybackBehaviorChange && (
                                <div className="flex bg-[#0a0d14] rounded-lg border border-white/10 overflow-hidden shadow-inner scale-90 sm:scale-100 p-0.5">
                                    <Tooltip text="Reset: Start from Step 1 every time">
                                        <button 
                                            onClick={() => onPlaybackBehaviorChange('reset')}
                                            className={`px-2 py-1 text-[10px] font-bold uppercase transition-all rounded ${currentBehavior === 'reset' ? 'bg-hyper-cyan/20 text-hyper-cyan shadow-sm' : 'text-star-dust/50 hover:text-white hover:bg-white/5'}`}
                                        >
                                            ⏮ 1
                                        </button>
                                    </Tooltip>
                                    <Tooltip text="Continue: Resume playback from last position">
                                        <button 
                                            onClick={() => onPlaybackBehaviorChange('continue')}
                                            className={`px-2 py-1 text-[10px] font-bold uppercase transition-all rounded ${currentBehavior === 'continue' ? 'bg-hyper-cyan/20 text-hyper-cyan shadow-sm' : 'text-star-dust/50 hover:text-white hover:bg-white/5'}`}
                                        >
                                            ⏯ &gt;
                                        </button>
                                    </Tooltip>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="flex gap-2 items-center flex-wrap w-full sm:w-auto justify-end">
                     {isProMode && (
                         <div className="flex bg-[#0a0d14] rounded-lg p-0.5 border border-white/10 scale-90 sm:scale-100 items-center">
                            {[8, 16, 32].map((count) => (
                                <button
                                    key={count}
                                    onClick={() => onStepCountChange(count as 8|16|32)}
                                    disabled={disabled}
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                                        sequencer.stepCount === count 
                                        ? 'bg-nebula-blue text-white shadow-sm' 
                                        : 'text-star-dust/50 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {count}
                                </button>
                            ))}
                        </div>
                     )}

                    {isProMode && (
                        <div className="flex bg-[#0a0d14] rounded-lg p-0.5 border border-white/10 scale-90 sm:scale-100 items-center">
                            {modes.map((m) => (
                                <button
                                    key={m}
                                    onClick={() => onModeChange(m)}
                                    disabled={disabled}
                                    className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded transition-colors ${
                                        sequencer.mode === m
                                        ? 'bg-plasma-pink/20 text-plasma-pink shadow-sm' 
                                        : 'text-star-dust/50 hover:text-white hover:bg-white/5'
                                    }`}
                                    title={`Mode: ${m}`}
                                >
                                    {m.substring(0, 3)}
                                </button>
                            ))}
                        </div>
                    )}

                    <Tooltip text="Randomize Pattern">
                        <button 
                            onClick={onRandomize}
                            disabled={disabled}
                            className="px-3 py-1 text-[10px] font-bold border border-hyper-cyan/30 text-hyper-cyan/80 rounded hover:bg-hyper-cyan/10 hover:text-hyper-cyan transition-colors shadow-[0_0_10px_rgba(0,246,255,0.05)] hover:shadow-[0_0_15px_rgba(0,246,255,0.2)]"
                        >
                            🎲 RND
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Steps Grid - Redesigned Pads */}
            <div className={`grid ${getGridClass()}`}>
                {sequencer.steps.map((step, index) => {
                    const isActiveStep = sequencer.currentStep === index;
                    const colorClass = getStepColorClass(step.sliceIndex);
                    const shadowClass = getStepShadow(step.sliceIndex);
                    
                    return (
                        <div key={index} className={`flex flex-col h-20 bg-[#12161d] rounded-lg border border-white/5 overflow-hidden relative group transition-all duration-100 ${isActiveStep ? 'ring-2 ring-white ring-offset-2 ring-offset-deep-space z-20 scale-105' : ''}`}>
                            
                            {/* Main Pad Area (Trigger) */}
                            <button
                                onClick={() => handleStepClick(index, step)}
                                disabled={disabled}
                                className={`flex-1 w-full flex items-center justify-center relative transition-all duration-100 outline-none
                                    ${step.active 
                                        ? `${colorClass} border-b-0 text-white ${shadowClass}` 
                                        : 'bg-white/5 hover:bg-white/10 text-white/20'
                                    }
                                `}
                            >
                                {/* Step Number (Subtle) */}
                                <span className={`absolute top-1 left-2 text-xs font-mono font-bold ${step.active ? 'opacity-90 mix-blend-screen' : 'opacity-40'}`}>
                                    {index + 1}
                                </span>

                                {/* Center Indicator */}
                                {step.active ? (
                                    step.ratchet && step.ratchet > 1 ? (
                                        <span className="text-base font-black drop-shadow-md">x{step.ratchet}</span>
                                    ) : (
                                        <div className="w-2 h-2 bg-white rounded-full opacity-80 shadow-sm"></div>
                                    )
                                ) : (
                                    <div className="w-1.5 h-1.5 bg-black/40 rounded-full"></div>
                                )}
                            </button>
                            
                            {/* Slice Assignment Bar (Bottom) */}
                            {isProMode && (
                                <div 
                                    onClick={(e) => handleSliceAssign(index, e)}
                                    className={`
                                        h-6 w-full flex items-center justify-center border-t cursor-pointer transition-colors
                                        ${step.active ? `border-black/10 ${colorClass} brightness-90` : 'border-white/5 bg-black/40 hover:bg-white/10'}
                                    `}
                                    title={`Current Slice: ${step.sliceIndex}. Click to assign selected slice.`}
                                >
                                    {/* Highlight if this step matches current global selection */}
                                    {selectedSliceIndex !== null && step.sliceIndex === selectedSliceIndex && (
                                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white animate-pulse"></div>
                                    )}
                                    
                                    <span className={`text-[10px] font-bold font-mono uppercase tracking-tight ${step.active ? 'opacity-100 mix-blend-hard-light' : 'text-star-dust/60'}`}>
                                        SLICE {step.sliceIndex}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Sequencer;
