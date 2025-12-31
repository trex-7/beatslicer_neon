
import React from 'react';
import Tooltip from './Tooltip';
import Auth from './Auth';
import InfoIcon from './InfoIcon';

interface HeaderProps {
    isProMode: boolean;
    onToggleMode: (isPro: boolean) => void;
    onShowMonitor: () => void;
    user: any;
}

const Header: React.FC<HeaderProps> = ({ isProMode, onToggleMode, onShowMonitor, user }) => {
    return (
        <header className="relative flex items-center justify-between py-4 mb-4 bg-deep-space/30 rounded-2xl px-6 border border-white/5 shadow-lg">
            {/* Left: Logo */}
            <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-hyper-cyan to-plasma-pink tracking-tight drop-shadow-sm select-none">
                    GRANULAR FX
                </h1>
                <InfoIcon text="Granular Synthesizer & Effect Processor. Switch between Play mode for performance and Pro mode for deep editing." position="right" />
            </div>
            
            {/* Center: Mode Switcher (Always Visible) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="flex items-center bg-black/40 p-1.5 rounded-full border border-white/10 shadow-xl backdrop-blur-md">
                    <Tooltip text="Simple Mode: Macros and Game-like interface">
                        <button
                            onClick={() => onToggleMode(false)}
                            className={`
                                flex items-center gap-2 px-6 py-2 rounded-full text-sm md:text-base font-black tracking-wide transition-all duration-300
                                ${!isProMode 
                                    ? 'bg-hyper-cyan text-deep-space shadow-[0_0_20px_rgba(0,246,255,0.4)] scale-105' 
                                    : 'text-star-dust hover:text-white hover:bg-white/5'
                                }
                            `}
                        >
                            <span className="text-lg">🕹️</span> PLAY
                        </button>
                    </Tooltip>
                    <Tooltip text="Pro Mode: Full parameter access and deep editing">
                        <button
                            onClick={() => onToggleMode(true)}
                            className={`
                                flex items-center gap-2 px-6 py-2 rounded-full text-sm md:text-base font-black tracking-wide transition-all duration-300
                                ${isProMode 
                                    ? 'bg-plasma-pink text-white shadow-[0_0_20px_rgba(255,0,170,0.4)] scale-105' 
                                    : 'text-star-dust hover:text-white hover:bg-white/5'
                                }
                            `}
                        >
                            <span className="text-lg">🎛️</span> PRO
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Right: Tools & Auth (Hidden in Pro Mode as they are in Sidebar) */}
            {!isProMode && (
                <div className="flex items-center gap-3 animate-in fade-in duration-300">
                     <Auth user={user} />
                     
                     <div className="hidden md:block text-[10px] text-white/30 font-mono text-right mr-2 leading-tight border-l border-white/10 pl-3">
                        v2.4.0<br/>
                        BETA
                    </div>
                    <Tooltip text="System Monitor & Specs">
                        <button 
                            onClick={onShowMonitor}
                            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-star-dust hover:text-hyper-cyan hover:border-hyper-cyan hover:bg-white/10 transition-all shadow-md active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </button>
                    </Tooltip>
                </div>
            )}
            
            {/* Spacer for Pro Mode to balance the flex layout if needed, though mostly handled by justify-between */}
            {isProMode && <div className="w-10"></div>}
        </header>
    );
};

export default Header;
