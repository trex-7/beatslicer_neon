
import React from 'react';
import type { SequencerState, SequencerMode, SequencerStep } from '../types';

interface SequencerProps {
    sequencer: SequencerState;
    onStepChange: (index: number, changes: Partial<SequencerStep>) => void;
    onModeChange: (mode: SequencerMode) => void;
    onStepCountChange: (count: 8 | 16 | 32) => void;
    onRandomize: () => void;
    disabled: boolean;
    selectedSliceIndex: number | null;
}

const Sequencer: React.FC<SequencerProps> = ({ 
    sequencer, 
    onStepChange, 
    onModeChange, 
    onStepCountChange, 
    onRandomize,
    disabled,
    selectedSliceIndex
}) => {
    
    const modes: SequencerMode[] = ['forward', 'backward', 'pendulum', 'random'];

    const handleSliceAssign = (stepIndex: number) => {
        if (selectedSliceIndex !== null) {
            onStepChange(stepIndex, { sliceIndex: selectedSliceIndex });
        }
    };

    return (
        <div className="bg-deep-space/80 p-4 rounded-lg ring-1 ring-hyper-cyan/30 shadow-lg mt-4">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h3 className="text-lg font-bold text-hyper-cyan tracking-widest uppercase flex items-center gap-2">
                    <span className="w-3 h-3 bg-plasma-pink rounded-full animate-pulse"></span>
                    Sequencer
                </h3>
                
                <div className="flex gap-2 items-center flex-wrap">
                     {/* Step Count Selector */}
                     <div className="flex bg-nebula-blue/50 rounded-md p-1">
                        {[8, 16, 32].map((count) => (
                            <button
                                key={count}
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
                        ))}
                    </div>

                    {/* Mode Selector */}
                    <div className="flex bg-nebula-blue/50 rounded-md p-1">
                        {modes.map((m) => (
                            <button
                                key={m}
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
                        ))}
                    </div>

                    <button 
                        onClick={onRandomize}
                        disabled={disabled}
                        className="px-3 py-1 text-xs font-bold border border-hyper-cyan/50 text-hyper-cyan rounded hover:bg-hyper-cyan/20 transition-colors"
                    >
                        RND PATTERN
                    </button>
                </div>
            </div>

            {/* Steps Grid */}
            <div className={`grid gap-2 ${sequencer.stepCount === 32 ? 'grid-cols-16' : 'grid-cols-8'} overflow-x-auto pb-2`}>
                {sequencer.steps.map((step, index) => {
                    const isActiveStep = sequencer.currentStep === index;
                    return (
                        <div key={index} className={`flex flex-col items-center gap-1 min-w-[40px]`}>
                            {/* LED Indicator */}
                            <div className={`w-full h-1 rounded-full mb-1 transition-colors duration-75 ${isActiveStep ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-transparent'}`}></div>
                            
                            {/* Step Button */}
                            <button
                                onClick={() => onStepChange(index, { active: !step.active })}
                                disabled={disabled}
                                className={`w-full aspect-square rounded-md border-2 transition-all duration-150 flex items-center justify-center relative group ${
                                    step.active 
                                        ? 'bg-hyper-cyan border-hyper-cyan text-deep-space shadow-[0_0_10px_rgba(0,246,255,0.4)]' 
                                        : 'bg-deep-space border-white/20 text-transparent hover:border-white/40'
                                }`}
                            >
                                <div className={`w-2 h-2 rounded-full ${step.active ? 'bg-deep-space' : 'bg-white/10'}`}></div>
                            </button>
                            
                            {/* Slice Assignment Button */}
                            <button 
                                onClick={() => handleSliceAssign(index)}
                                disabled={disabled}
                                className={`w-full py-1 text-[10px] font-mono rounded border transition-colors 
                                    ${step.sliceIndex === selectedSliceIndex 
                                        ? 'bg-white/20 text-white border-white/50' 
                                        : 'bg-nebula-blue/30 text-white/50 border-white/5 hover:bg-white/10 hover:text-white'}
                                `}
                                title="Click to assign selected slice"
                            >
                                {step.sliceIndex}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Sequencer;
