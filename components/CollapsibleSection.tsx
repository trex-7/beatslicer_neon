
import React, { useState } from 'react';

interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    className?: string;
    icon?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = true, className = "", icon }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={`bg-[#12161d] rounded-xl border border-white/5 overflow-hidden shadow-lg transition-all duration-300 ${className}`}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-colors group text-left"
            >
                <div className="flex items-center gap-3">
                    <span className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-90 text-hyper-cyan' : 'text-white/30'}`}>
                        ▶
                    </span>
                    <span className="text-xs font-bold text-white uppercase tracking-widest group-hover:text-hyper-cyan transition-colors flex items-center gap-2">
                        {icon && <span className="opacity-70">{icon}</span>}
                        {title}
                    </span>
                </div>
                <div className="h-px bg-white/5 flex-1 mx-4 opacity-50"></div>
                <span className="text-[10px] text-white/20 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    {isOpen ? 'COLLAPSE' : 'EXPAND'}
                </span>
            </button>
            
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="p-4 border-t border-white/5">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default CollapsibleSection;
