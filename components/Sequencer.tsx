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
}

const Sequencer: React.FC<SequencerProps> = ({ 
    sequencer, 
    onStepChange, 
    onModeChange, 
    onStepCountChange, 
    onRandomize,
    onEditModeToggle,
    disabled,
    selectedSliceIndex
}) => {
    
    const modes: SequencerMode[] = ['forward', 'backward', 'pendulum', 'random'];
    
    // Safe fallback
    const currentEditMode = sequencer.editMode || 'trigger';

    const handleStepClick = (index: number, currentStep: SequencerStep) => {
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
        <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-hyper-cyan/30 shadow-lg mt-4">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-bold text-hyper-cyan tracking-widest uppercase flex items-center gap-2">
                        <span className="w-3 h-3 bg-plasma-pink rounded-full animate-pulse"></span>
                        Sequencer
                        <Tooltip text="Step sequencer grid. Click steps to trigger slices. Use 'Ratchet' mode to add rapid retriggering for rolls." position="right">
                            <div className="w-4 h-4 rounded-full border border-hyper-cyan/50 text-hyper-cyan/50 flex items-center justify-center text-[10px] cursor-help hover:text-white hover:border-white transition-colors font-serif italic">
                                i
                            </div>
                        </Tooltip>
                    </h3>
                    
                    {/* Edit Mode Toggle */}
                    <div className="flex bg-deep-space rounded border border-white/20 overflow-hidden">
                         <Tooltip text="Click steps to toggle On/Off">
                            <button 
                                onClick={() => onEditModeToggle('trigger')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${currentEditMode === 'trigger' ? 'bg-hyper-cyan text-deep-space' : 'text-star-dust hover:bg-white/10'}`}
                            >
                                Trigger
                            </button>
                        </Tooltip>
                        <Tooltip text="Click steps to set Retriggers (1x, 2x, 3x, 4x)">
                            <button 
                                onClick={() => onEditModeToggle('ratchet')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${currentEditMode === 'ratchet' ? 'bg-plasma-pink text-white' : 'text-star-dust hover:bg-white/10'}`}
                            >
                                Ratchet
                            </button>
                         </Tooltip>
                    </div>
                </div>
                
                <div className="flex gap-2 items-center flex-wrap">
                     {/* Step Count Selector */}
                     <div className="flex bg-nebula-blue/50 rounded-md p-1">
                        {[8, 16, 32].map((count) => (
                            <Tooltip key={count} text={`Set sequence length to ${count} steps`}>
                                <button
                                    onClick={() => onStepCountChange(count as 8|16|32)}
                                    disabled={disabled}
                                    className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
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

                    {/* Mode Selector */}
                    <div className="flex bg-nebula-blue/50 rounded-md p-1">
                        {modes.map((m) => (
                             <Tooltip key={m} text={`Set playback direction: ${m}`}>
                                <button
                                    onClick={() => onModeChange(m)}
                                    disabled={disabled}
                                    className={`px-3 py-1 text-xs font-bold uppercase rounded transition-colors ${
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

                    <Tooltip text="Randomize step activity and slice assignments">
                        <button 
                            onClick={onRandomize}
                            disabled={disabled}
                            className="px-3 py-1 text-xs font-bold border border-hyper-cyan/50 text-hyper-cyan rounded hover:bg-hyper-cyan/20 transition-colors"
                        >
                            RND PATTERN
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Steps Grid */}
            <div className={`grid gap-2 grid-cols-4 sm:grid-cols-8 overflow-x-auto pb-2`}>
                {sequencer.steps.map((step, index) => {
                    const isActiveStep = sequencer.currentStep === index;
                    return (
                        <div key={index} className={`flex flex-col items-center gap-1 min-w-[40px]`}>
                            {/* LED Indicator */}
                            <div className={`w-full h-1 rounded-full mb-1 transition-colors duration-75 ${isActiveStep ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-transparent'}`}></div>
                            
                            {/* Step Button */}
                            <Tooltip text={currentEditMode === 'ratchet' ? `Ratchets: ${step.ratchet || 1}x` : `Toggle step ${index + 1}`}>
                                <button
                                    onClick={() => handleStepClick(index, step)}
                                    disabled={disabled}
                                    className={`w-full aspect-square rounded-md border-2 transition-all duration-150 flex items-center justify-center relative group ${
                                        step.active 
                                            ? 'bg-hyper-cyan border-hyper-cyan text-deep-space shadow-[0_0_10px_rgba(0,246,255,0.4)]' 
                                            : 'bg-deep-space border-white/20 text-transparent hover:border-white/40'
                                    }`}
                                >
                                    <div className={`w-2 h-2 rounded-full ${step.active ? 'bg-deep-space' : 'bg-white/10'}`}></div>
                                    
                                    {/* Ratchet Indicator Overlay */}
                                    {step.active && step.ratchet && step.ratchet > 1 && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="text-[10px] font-bold text-deep-space bg-white/80 px-1 rounded">x{step.ratchet}</span>
                                        </div>
                                    )}
                                </button>
                            </Tooltip>
                            
                            {/* Slice Assignment Button */}
                            <Tooltip text={`Assign selected slice to step ${index + 1}`}>
                                <button 
                                    onClick={() => handleSliceAssign(index)}
                                    disabled={disabled}
                                    className={`w-full py-1 text-[10px] font-mono rounded border transition-colors 
                                        ${step.sliceIndex === selectedSliceIndex 
                                            ? 'bg-white/20 text-white border-white/50' 
                                            : 'bg-nebula-blue/30 text-white/50 border-white/5 hover:bg-white/10 hover:text-white'}
                                    `}
                                >
                                    {step.sliceIndex}
                                </button>
                            </Tooltip>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Sequencer;