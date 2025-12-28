
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
    
    const currentEditMode = sequencer.editMode || 'trigger';

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

    const handleSliceAssign = (stepIndex: number) => {
        if (selectedSliceIndex !== null) {
            onStepChange(stepIndex, { sliceIndex: selectedSliceIndex });
        }
    };

    // SEQUENCER LAYOUT STRATEGY:
    // User wants standard sequencer steps (smaller, more linear).
    // Mobile: 8 columns (2+ rows)
    // Desktop: 16 columns (Linear 16-step view)
    const getGridClass = () => {
        return 'grid-cols-8 lg:grid-cols-16 gap-1'; 
    };

    return (
        <div className="bg-deep-space/80 p-3 sm:p-4 rounded-xl ring-1 ring-hyper-cyan/30 shadow-xl">
            {/* Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    <h3 className="text-xs font-bold text-hyper-cyan tracking-widest uppercase flex items-center gap-2">
                        <span className="w-2 h-2 bg-plasma-pink rounded-full animate-pulse shadow-[0_0_8px_rgba(255,0,170,0.8)]"></span>
                        Sequencer
                    </h3>
                    
                    {isProMode && (
                        <div className="flex bg-deep-space rounded border border-white/20 overflow-hidden ml-auto sm:ml-0 shadow-inner scale-90 sm:scale-100 origin-right sm:origin-left">
                             <Tooltip text="Trigger Mode: Click steps to toggle On/Off">
                                <button 
                                    onClick={() => onEditModeToggle('trigger')}
                                    className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${currentEditMode === 'trigger' ? 'bg-hyper-cyan text-deep-space' : 'text-star-dust hover:bg-white/10'}`}
                                >
                                    Trig
                                </button>
                            </Tooltip>
                            <Tooltip text="Ratchet Mode: Click steps to add rolls (2x, 3x, 4x)">
                                <button 
                                    onClick={() => onEditModeToggle('ratchet')}
                                    className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${currentEditMode === 'ratchet' ? 'bg-plasma-pink text-white' : 'text-star-dust hover:bg-white/10'}`}
                                >
                                    Roll
                                </button>
                             </Tooltip>
                        </div>
                    )}
                </div>
                
                <div className="flex gap-2 items-center flex-wrap w-full sm:w-auto justify-end">
                     {isProMode && (
                         <div className="flex bg-nebula-blue/50 rounded p-0.5 border border-white/5 scale-90 sm:scale-100">
                            {[8, 16, 32].map((count) => (
                                <button
                                    key={count}
                                    onClick={() => onStepCountChange(count as 8|16|32)}
                                    disabled={disabled}
                                    className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors ${
                                        sequencer.stepCount === count 
                                        ? 'bg-hyper-cyan text-deep-space shadow-sm' 
                                        : 'text-star-dust hover:bg-white/10'
                                    }`}
                                >
                                    {count}
                                </button>
                            ))}
                        </div>
                     )}

                    {isProMode && (
                        <div className="flex bg-nebula-blue/50 rounded p-0.5 border border-white/5 scale-90 sm:scale-100">
                            {modes.map((m) => (
                                <button
                                    key={m}
                                    onClick={() => onModeChange(m)}
                                    disabled={disabled}
                                    className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${
                                        sequencer.mode === m
                                        ? 'bg-plasma-pink text-white shadow-sm' 
                                        : 'text-star-dust hover:bg-white/10'
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
                            className="px-3 py-1 text-[10px] font-bold border border-hyper-cyan/50 text-hyper-cyan rounded hover:bg-hyper-cyan/20 transition-colors shadow-[0_0_10px_rgba(0,246,255,0.1)]"
                        >
                            🎲 RND
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Steps Grid - Compact Sequencer Style */}
            <div className={`grid ${getGridClass()}`}>
                {sequencer.steps.map((step, index) => {
                    const isActiveStep = sequencer.currentStep === index;
                    return (
                        <div key={index} className="flex flex-col gap-1 relative">
                            <button
                                onClick={() => handleStepClick(index, step)}
                                disabled={disabled}
                                className={`
                                    w-full h-10 sm:h-12 rounded border transition-all duration-75 flex flex-col items-center justify-between py-1 relative group touch-manipulation active:scale-95
                                    ${step.active 
                                        ? 'bg-hyper-cyan border-hyper-cyan text-deep-space shadow-[0_0_12px_rgba(0,246,255,0.3)] z-10' 
                                        : 'bg-[#151921] border-white/10 hover:border-white/30 hover:bg-white/5'
                                    }
                                    ${isActiveStep ? 'ring-1 ring-white ring-offset-1 ring-offset-deep-space brightness-125 z-20' : ''}
                                `}
                            >
                                {/* LED Indicator */}
                                <div className={`w-3/4 h-1 rounded-full transition-all duration-150 ${
                                    step.active 
                                    ? 'bg-deep-space/50' 
                                    : (isActiveStep ? 'bg-white' : 'bg-black/40')
                                }`}></div>
                                
                                {/* Step Number */}
                                <span className={`text-[9px] font-mono font-bold ${step.active ? 'text-deep-space' : 'text-white/20'}`}>
                                    {index + 1}
                                </span>

                                {/* Ratchet Indicator (Overlaid) */}
                                {isProMode && step.active && step.ratchet && step.ratchet > 1 && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="text-[10px] font-black text-white bg-black/60 px-1 rounded backdrop-blur-[1px]">x{step.ratchet}</span>
                                    </div>
                                )}
                            </button>
                            
                            {/* Slice Assign (Mini Button) */}
                            {isProMode && (
                                <button 
                                    onClick={() => handleSliceAssign(index)}
                                    disabled={disabled}
                                    className={`w-full py-0.5 text-[8px] font-bold font-mono rounded border transition-colors truncate
                                        ${step.sliceIndex === selectedSliceIndex 
                                            ? 'bg-white/20 text-white border-white/50' 
                                            : 'bg-nebula-blue/20 text-white/30 border-white/5 hover:bg-white/10 hover:text-white'}
                                    `}
                                    title={`Assign Slice ${step.sliceIndex}`}
                                >
                                    S:{step.sliceIndex}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Sequencer;
