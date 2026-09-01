import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    icon?: React.ReactNode;
    defaultOpen?: boolean;
    headerExtra?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    id?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    icon,
    defaultOpen = true,
    headerExtra,
    children,
    className = '',
    id
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div id={id} className={`bg-neutral-900/90 border border-neutral-800 rounded-xl overflow-hidden shadow-lg ${className}`}>
            <div 
                className="flex items-center justify-between px-4 py-3 bg-neutral-850/80 cursor-pointer select-none hover:bg-neutral-800/80 transition-colors border-b border-neutral-800/60"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2.5">
                    <button 
                        type="button" 
                        aria-label={`Toggle ${title}`} 
                        className="text-neutral-400 hover:text-white transition-colors p-0.5"
                    >
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    {icon && <span className="text-cyan-400">{icon}</span>}
                    <h3 className="text-sm font-semibold text-neutral-200 tracking-wide">{title}</h3>
                </div>
                {headerExtra && (
                    <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                        {headerExtra}
                    </div>
                )}
            </div>
            {isOpen && (
                <div className="p-4">
                    {children}
                </div>
            )}
        </div>
    );
};

export default CollapsibleSection;
