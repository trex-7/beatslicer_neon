import React from 'react';
import Tooltip from './Tooltip';

interface EffectSectionProps {
    title: string;
    info?: string;
    children: React.ReactNode;
}

const EffectSection: React.FC<EffectSectionProps> = ({ title, info, children }) => {
    return (
        <div>
            <div className="flex items-center gap-3 mb-4 border-b-2 border-plasma-pink/50 pb-2">
                <h3 className="text-2xl font-bold text-star-dust">{title}</h3>
                {info && (
                    <Tooltip text={info} position="right">
                        <div className="w-5 h-5 rounded-full border border-star-dust/50 text-star-dust/50 flex items-center justify-center text-xs cursor-help hover:text-hyper-cyan hover:border-hyper-cyan transition-colors font-serif italic">
                            i
                        </div>
                    </Tooltip>
                )}
            </div>
            <div className="mt-4">
                {children}
            </div>
        </div>
    );
};

export default EffectSection;