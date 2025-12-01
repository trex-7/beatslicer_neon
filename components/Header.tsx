
import React from 'react';
import Tooltip from './Tooltip';

interface HeaderProps {
    isProMode: boolean;
    onToggleMode: (isPro: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ isProMode, onToggleMode }) => {
    return (
        <header className="flex items-center justify-between py-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-hyper-cyan to-plasma-pink tracking-tight drop-shadow-sm">
                Granular Synth FX
            </h1>
            
            <div className="flex items-center gap-3 bg-deep-space/50 p-1 rounded-full border border-white/10">
                <Tooltip text="Simple Mode: Macros and Game-like interface">
                    <button
                        onClick={() => onToggleMode(false)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${!isProMode ? 'bg-hyper-cyan text-deep-space shadow-[0_0_15px_rgba(0,246,255,0.4)]' : 'text-star-dust hover:text-white'}`}
                    >
                        🕹️ PLAY
                    </button>
                </Tooltip>
                <Tooltip text="Pro Mode: Full parameter access and deep editing">
                    <button
                        onClick={() => onToggleMode(true)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${isProMode ? 'bg-plasma-pink text-white shadow-[0_0_15px_rgba(255,0,170,0.4)]' : 'text-star-dust hover:text-white'}`}
                    >
                        🎛️ PRO
                    </button>
                </Tooltip>
            </div>
        </header>
    );
};

export default Header;
