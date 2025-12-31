
import React from 'react';
import type { SequencerState, SequencerMode, SequencerStep } from '../types';
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
    isProMode
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
        return 'grid-cols-8 lg:grid-cols-16 gap-1.5'; 
    };

    return (
        <div className="bg-deep-space/60 p-3 sm:p-5 rounded-xl border border-white/5 shadow-2xl relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-hyper-cyan/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

            {/* Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 z-10 relative">
                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    <h3 className="text-xs font-bold text-hyper-cyan tracking-widest uppercase flex items-center gap-2">
                        <span className="w-2 h-2 bg-hyper-cyan rounded-full animate-pulse shadow-[0_0_8px_rgba(0,246,255,0.8)]"></span>
                        Sequencer
                        <InfoIcon text="16-step sequencer. Left-click to toggle steps. In Pro mode, use Edit Mode to switch between Triggers (On/Off) and Ratchets (Note Repeats)." className="ml-1" />
                    </h3>
                    
                    {isProMode && (
                        <div className="flex gap-2 items-center">
                            {/* Edit Mode Toggle */}
                            <div className="flex bg-[#0a0d14] rounded-lg border border-white/10 overflow-hidden shadow-inner scale-90 sm:scale-100 p-0.5">
                                 <Tooltip text="Trigger Mode: Click steps to toggle On/Off">
                                    <button 
                                        onClick={() => onEditModeToggle('trigger')}
                                        className={`px-3 py-1 text-[10px] font-bold uppercase transition-all rounded ${currentEditMode === 'trigger' ? 'bg-white/10 text-white shadow-sm' : 'text-star-dust/50 hover:text-white hover:bg-white/5'}`}
                                    >
                                        Trig
                                    </button>
                                </Tooltip>
                                <Tooltip text="Ratchet Mode: Click steps to add rolls (2x, 3x, 4x)">
                                    <button 
                                        onClick={() => onEditModeToggle('ratchet')}
                                        className={`px-3 py-1 text-[10px] font-bold uppercase transition-all rounded ${currentEditMode === 'ratchet' ? 'bg-plasma-pink/20 text-plasma-pink shadow-sm' : 'text-star-dust/50 hover:text-white hover:bg-white/5'}`}
                                    >
                                        Roll
                                    </button>
                                 </Tooltip>
                            </div>
                            
                            {/* Playback Behavior Toggle (Added) */}
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
                                    className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors ${
                                        sequencer.stepCount === count 
                                        ? 'bg-nebula-blue text-white shadow-sm' 
                                        : 'text-star-dust/50 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {count}
                                </button>
                            ))}
                            <div className="ml-1"><InfoIcon text="Set sequence length" className="w-3 h-3 text-[8px]" /></div>
                        </div>
                     )}

                    {isProMode && (
                        <div className="flex bg-[#0a0d14] rounded-lg p-0.5 border border-white/10 scale-90 sm:scale-100 items-center">
                            {modes.map((m) => (
                                <button
                                    key={m}
                                    onClick={() => onModeChange(m)}
                                    disabled={disabled}
                                    className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${
                                        sequencer.mode === m
                                        ? 'bg-plasma-pink/20 text-plasma-pink shadow-sm' 
                                        : 'text-star-dust/50 hover:text-white hover:bg-white/5'
                                    }`}
                                    title={`Mode: ${m}`}
                                >
                                    {m.substring(0, 3)}
                                </button>
                            ))}
                            <div className="ml-1"><InfoIcon text="Playback direction" className="w-3 h-3 text-[8px]" /></div>
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

            {/* Steps Grid - Compact Sequencer Style */}
            <div className={`grid ${getGridClass()}`}>
                {sequencer.steps.map((step, index) => {
                    const isActiveStep = sequencer.currentStep === index;
                    return (
                        <div key={index} className="flex flex-col gap-1 relative group">
                            <button
                                onClick={() => handleStepClick(index, step)}
                                disabled={disabled}
                                className={`
                                    w-full h-12 sm:h-14 rounded-md border transition-all duration-100 flex flex-col items-center justify-between py-1.5 relative touch-manipulation active:scale-95 overflow-hidden
                                    ${step.active 
                                        ? 'bg-hyper-cyan border-hyper-cyan text-deep-space shadow-[0_0_15px_rgba(0,246,255,0.4)] z-10' 
                                        : 'bg-[#151921] border-white/5 hover:border-white/20 hover:bg-white/5 shadow-inner'
                                    }
                                    ${isActiveStep ? 'ring-2 ring-white ring-offset-2 ring-offset-deep-space brightness-125 z-20' : ''}
                                `}
                            >
                                {/* Step Number */}
                                <span className={`text-xs font-mono font-bold ${step.active ? 'text-deep-space/60' : 'text-white/20 group-hover:text-white/40'}`}>
                                    {index + 1}
                                </span>

                                {/* Center LED / Indicator */}
                                <div className={`w-8 h-1.5 rounded-full transition-all duration-150 ${
                                    step.active 
                                    ? 'bg-deep-space/80 w-8' 
                                    : (isActiveStep ? 'bg-white w-full' : 'bg-black/30 w-1.5')
                                }`}></div>

                                {/* Ratchet Indicator (Overlaid) */}
                                {isProMode && step.active && step.ratchet && step.ratchet > 1 && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/10">
                                        <span className="text-[10px] font-black text-white drop-shadow-md">x{step.ratchet}</span>
                                    </div>
                                )}
                            </button>
                            
                            {/* Slice Assign (Mini Button) */}
                            {isProMode && (
                                <button 
                                    onClick={() => handleSliceAssign(index)}
                                    disabled={disabled}
                                    className={`w-full py-0.5 text-[7px] font-bold font-mono rounded border transition-colors truncate
                                        ${step.sliceIndex === selectedSliceIndex 
                                            ? 'bg-white/20 text-white border-white/50' 
                                            : 'bg-nebula-blue/10 text-white/20 border-white/5 hover:bg-white/5 hover:text-white/50'}
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
