
import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-hyper-cyan to-plasma-pink pb-2">
                Granular Synth FX
            </h1>
            <p className="text-star-dust/80 max-w-3xl mx-auto mt-2 text-sm sm:text-base">
                An interactive granular synthesizer and effects processor. Load an audio file or use the default sample to sculpt unique soundscapes and textures in real-time.
            </p>
        </header>
    );
};

export default Header;
