
import React from 'react';
import Tooltip from './Tooltip';

interface InfoIconProps {
    text: string;
    className?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const InfoIcon: React.FC<InfoIconProps> = ({ text, className = "", position = "top" }) => (
    <Tooltip text={text} position={position}>
        <div className={`w-4 h-4 rounded-full border border-white/20 text-white/40 flex items-center justify-center text-[10px] cursor-help hover:text-hyper-cyan hover:border-hyper-cyan hover:bg-white/5 transition-colors font-serif italic select-none ${className}`}>
            i
        </div>
    </Tooltip>
);

export default InfoIcon;
