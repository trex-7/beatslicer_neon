import React, { useRef } from 'react';
import Tooltip from './Tooltip';

interface FileLoaderProps {
    onFileLoad: (file: File) => void;
    onDefaultLoad: () => void;
    isLoading: boolean;
}

const FileLoader: React.FC<FileLoaderProps> = ({ onFileLoad, onDefaultLoad, isLoading }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileLoad(file);
        }
    };

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="bg-deep-space/50 p-6 rounded-lg ring-1 ring-white/10">
            <div className="flex items-center justify-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-star-dust">Load Audio Sample</h2>
                <Tooltip text="Upload audio files (.mp3, .wav) to be analyzed and sliced by the engine.">
                     <div className="w-4 h-4 rounded-full border border-star-dust/50 text-star-dust/50 flex items-center justify-center text-[10px] cursor-help hover:text-hyper-cyan hover:border-hyper-cyan transition-colors font-serif italic">
                        i
                    </div>
                </Tooltip>
            </div>
            <div className="space-y-4">
                <Tooltip text="Upload your own audio file (.mp3, .wav) to granularize">
                    <button
                        onClick={handleButtonClick}
                        disabled={isLoading}
                        className="w-full bg-nebula-blue hover:bg-nebula-blue/80 text-star-dust font-semibold py-3 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isLoading ? 'Loading...' : 'Upload File'}
                    </button>
                </Tooltip>
                <input
                    type="file"
                    accept="audio/*"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                />
                <Tooltip text="Load the built-in 'Gong' sample for testing">
                    <button
                        onClick={onDefaultLoad}
                        disabled={isLoading}
                        className="w-full bg-transparent border border-hyper-cyan/50 hover:bg-hyper-cyan/10 text-hyper-cyan font-semibold py-3 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isLoading ? 'Loading...' : 'Load Default Gong'}
                    </button>
                </Tooltip>
            </div>
        </div>
    );
};

export default FileLoader;