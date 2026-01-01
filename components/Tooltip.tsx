
import React from 'react';

interface TooltipProps {
    text: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top' }) => {
    const positionClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    };

    const arrowClasses = {
        top: 'bottom-[-4px] left-1/2 -translate-x-1/2 border-r border-b',
        bottom: 'top-[-4px] left-1/2 -translate-x-1/2 border-l border-t',
        left: 'right-[-4px] top-1/2 -translate-y-1/2 border-t border-r',
        right: 'left-[-4px] top-1/2 -translate-y-1/2 border-b border-l',
    };

    return (
        <div className="group relative flex flex-col items-center">
            {children}
            <div className={`absolute ${positionClasses[position]} hidden sm:group-hover:block w-max max-w-[200px] p-2 bg-deep-space border border-hyper-cyan/40 text-star-dust text-xs rounded shadow-[0_0_15px_rgba(0,246,255,0.15)] z-50 pointer-events-none text-center backdrop-blur-sm`}>
                {text}
                <div className={`absolute w-2 h-2 bg-deep-space border-hyper-cyan/40 transform rotate-45 ${arrowClasses[position]}`}></div>
            </div>
        </div>
    );
};

export default Tooltip;
