import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="flex items-center justify-between py-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-hyper-cyan to-plasma-pink tracking-tight drop-shadow-sm">
                Granular Synth FX
            </h1>
        </header>
    );
};

export default Header;