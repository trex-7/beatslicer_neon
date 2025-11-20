
import React from 'react';

interface EffectSectionProps {
    title: string;
    children: React.ReactNode;
}

const EffectSection: React.FC<EffectSectionProps> = ({ title, children }) => {
    return (
        <div>
            <h3 className="text-2xl font-bold mb-4 text-star-dust border-b-2 border-plasma-pink/50 pb-2">{title}</h3>
            <div className="mt-4">
                {children}
            </div>
        </div>
    );
};

export default EffectSection;
