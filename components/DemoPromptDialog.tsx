import React from 'react';

interface DemoPromptDialogProps {
    isOpen: boolean;
    onWatchDemo: () => void;
    onSkip: () => void;
}

const DemoPromptDialog: React.FC<DemoPromptDialogProps> = ({ isOpen, onWatchDemo, onSkip }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-[#12161d] border border-white/10 rounded-xl shadow-2xl p-6 max-w-md w-full text-center ring-1 ring-white/5 animate-in zoom-in-95 duration-300">
                <div className="text-4xl mb-4">🎥</div>
                <h2 className="text-xl font-bold text-white mb-2">Welcome to Beat Slicer!</h2>
                <p className="text-star-dust mb-6 text-sm">
                    Would you like to watch a quick demo video to get started?
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={onWatchDemo}
                        className="px-6 py-2 bg-hyper-cyan text-deep-space font-bold rounded-lg hover:bg-cyan-300 transition-colors"
                    >
                        Yes, Watch Demo
                    </button>
                    <button
                        onClick={onSkip}
                        className="px-6 py-2 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-colors"
                    >
                        No, Skip
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DemoPromptDialog;