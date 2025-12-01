
import React from 'react';
import type { SequencerState, SequencerMode, SequencerStep } from '../types';
import Tooltip from './Tooltip';

interface SequencerProps {
    sequencer: SequencerState;
    onStepChange: (index: number, changes: Partial<SequencerStep>) => void;
    onModeChange: (mode: SequencerMode) => void;
    onStepCountChange: (count: 8 | 16 | 32) => void;
    onRandomize: () => void;
    onEditModeToggle: (mode: 'trigger' | 'ratchet') => void;
    disabled: boolean;
    selectedSliceIndex: number | null;
    isProMode: boolean;
}

const Sequencer: React.FC<SequencerProps> = ({ 
    sequencer, 
    onStepChange, 
    onModeChange, 
    onStepCountChange, 
    onRandomize,
    onEditModeToggle,
    disabled,
    selectedSliceIndex,
    isProMode
}) => {
    
    const modes: SequencerMode[] = ['forward', 'backward', 'pendulum', 'random'];
    
    // Safe fallback
    const currentEditMode = sequencer.editMode || 'trigger';

    const handleStepClick = (index: number, currentStep: SequencerStep) => {
        if (!isProMode) {
            // Simple mode: Always toggle Trigger
             onStepChange(index, { active: !currentStep.active });
             return;
        }

        if (currentEditMode === 'trigger') {
            onStepChange(index, { active: !currentStep.active });
        } else {
            // Cycle ratchets: 1 -> 2 -> 3 -> 4 -> 1
            let nextRatchet = (currentStep.ratchet || 1) + 1;
            if (nextRatchet > 4) nextRatchet = 1;
            // Ensure step is active if we are ratcheting
            onStepChange(index, { ratchet: nextRatchet, active: true });
        }
    };

    const handleSliceAssign = (stepIndex: number) => {
        if (selectedSliceIndex !== null) {
            onStepChange(stepIndex, { sliceIndex: selectedSliceIndex });
        }
    };

    return (
        <div className="bg-deep-space/80 p-3 rounded-lg ring-1 ring-hyper-cyan/30 shadow-lg">
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-hyper-cyan tracking-widest uppercase flex items-center gap-2">
                        <span className="w-2 h-2 bg-plasma-pink rounded-full animate-pulse"></span>
                        Sequencer
                    </h3>
                    
                    {/* Edit Mode Toggle - ONLY IN PRO MODE */}
                    {isProMode && (
                        <div className="flex bg-deep-space rounded border border-white/20 overflow-hidden">
                             <Tooltip text="Click steps to toggle On/Off">
                                <button 
                                    onClick={() => onEditModeToggle('trigger')}
                                    className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-colors ${currentEditMode === 'trigger' ? 'bg-hyper-cyan text-deep-space' : 'text-star-dust hover:bg-white/10'}`}
                                >
                                    Trigger
                                </button>
                            </Tooltip>
                            <Tooltip text="Click steps to set Retriggers (1x, 2x, 3x, 4x)">
                                <button 
                                    onClick={() => onEditModeToggle('ratchet')}
                                    className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-colors ${currentEditMode === 'ratchet' ? 'bg-plasma-pink text-white' : 'text-star-dust hover:bg-white/10'}`}
                                >
                                    Ratchet
                                </button>
                             </Tooltip>
                        </div>
                    )}
                </div>
                
                <div className="flex gap-2 items-center flex-wrap">
                     {/* Step Count Selector - ONLY IN PRO MODE */}
                     {isProMode && (
                         <div className="flex bg-nebula-blue/50 rounded-md p-0.5">
                            {[8, 16, 32].map((count) => (
                                <Tooltip key={count} text={`Set sequence length to ${count} steps`}>
                                    <button
                                        onClick={() => onStepCountChange(count as 8|16|32)}
                                        disabled={disabled}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                                            sequencer.stepCount === count 
                                            ? 'bg-hyper-cyan text-deep-space' 
                                            : 'text-star-dust hover:bg-white/10'
                                        }`}
                                    >
                                        {count}
                                    </button>
                                </Tooltip>
                            ))}
                        </div>
                     )}

                    {/* Mode Selector - ONLY IN PRO MODE */}
                    {isProMode && (
                        <div className="flex bg-nebula-blue/50 rounded-md p-0.5">
                            {modes.map((m) => (
                                 <Tooltip key={m} text={`Set playback direction: ${m}`}>
                                    <button
                                        onClick={() => onModeChange(m)}
                                        disabled={disabled}
                                        className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded transition-colors ${
                                            sequencer.mode === m
                                            ? 'bg-plasma-pink text-white' 
                                            : 'text-star-dust hover:bg-white/10'
                                        }`}
                                    >
                                        {m}
                                    </button>
                                </Tooltip>
                            ))}
                        </div>
                    )}

                    <Tooltip text="Randomize step activity and slice assignments">
                        <button 
                            onClick={onRandomize}
                            disabled={disabled}
                            className="px-2 py-0.5 text-[10px] font-bold border border-hyper-cyan/50 text-hyper-cyan rounded hover:bg-hyper-cyan/20 transition-colors"
                        >
                            RND
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Steps Grid */}
            <div className={`grid gap-1.5 grid-cols-8 ${sequencer.stepCount > 16 ? 'sm:grid-cols-16' : 'sm:grid-cols-8 md:grid-cols-16'} pb-1`}>
                {sequencer.steps.map((step, index) => {
                    const isActiveStep = sequencer.currentStep === index;
                    return (
                        <div key={index} className={`flex flex-col items-center gap-0.5 min-w-[20px]`}>
                            {/* LED Indicator */}
                            <div className={`w-full h-1 rounded-full mb-0.5 transition-colors duration-75 ${isActiveStep ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-transparent'}`}></div>
                            
                            {/* Step Button */}
                            <Tooltip text={isProMode && currentEditMode === 'ratchet' ? `Ratchets: ${step.ratchet || 1}x` : `Toggle step ${index + 1}`}>
                                <button
                                    onClick={() => handleStepClick(index, step)}
                                    disabled={disabled}
                                    className={`w-full aspect-square rounded-sm border transition-all duration-150 flex items-center justify-center relative group ${
                                        step.active 
                                            ? 'bg-hyper-cyan border-hyper-cyan text-deep-space shadow-[0_0_8px_rgba(0,246,255,0.3)]' 
                                            : 'bg-deep-space border-white/10 text-transparent hover:border-white/30'
                                    }`}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full ${step.active ? 'bg-deep-space' : 'bg-white/10'}`}></div>
                                    
                                    {/* Ratchet Indicator Overlay */}
                                    {isProMode && step.active && step.ratchet && step.ratchet > 1 && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="text-[9px] font-bold text-deep-space bg-white/90 px-0.5 rounded leading-none">x{step.ratchet}</span>
                                        </div>
                                    )}
                                </button>
                            </Tooltip>
                            
                            {/* Slice Assignment Button - ONLY PRO MODE */}
                            {isProMode && (
                                <Tooltip text={`Assign selected slice to step ${index + 1}`}>
                                    <button 
                                        onClick={() => handleSliceAssign(index)}
                                        disabled={disabled}
                                        className={`w-full py-0.5 text-[9px] font-mono rounded border transition-colors 
                                            ${step.sliceIndex === selectedSliceIndex 
                                                ? 'bg-white/20 text-white border-white/50' 
                                                : 'bg-nebula-blue/30 text-white/50 border-white/5 hover:bg-white/10 hover:text-white'}
                                        `}
                                    >
                                        {step.sliceIndex}
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Sequencer;
