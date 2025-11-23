import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="flex items-center justify-between py-2 mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-hyper-cyan to-plasma-pink tracking-tight">
                Granular Synth FX
            </h1>
            <p className="text-star-dust/60 text-xs font-mono hidden sm:block">
                Web Audio Granular Engine
            </p>
        </header>
    );
};

export default Header;