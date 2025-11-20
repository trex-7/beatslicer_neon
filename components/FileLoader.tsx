
import React, { useRef } from 'react';

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
            <h2 className="text-lg font-bold text-center mb-4 text-star-dust">Load Audio Sample</h2>
            <div className="space-y-4">
                <button
                    onClick={handleButtonClick}
                    disabled={isLoading}
                    className="w-full bg-nebula-blue hover:bg-nebula-blue/80 text-star-dust font-semibold py-3 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-wait"
                >
                    {isLoading ? 'Loading...' : 'Upload File'}
                </button>
                <input
                    type="file"
                    accept="audio/*"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                />
                <button
                    onClick={onDefaultLoad}
                    disabled={isLoading}
                    className="w-full bg-transparent border border-hyper-cyan/50 hover:bg-hyper-cyan/10 text-hyper-cyan font-semibold py-3 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-wait"
                >
                    {isLoading ? 'Loading...' : 'Load Default Gong'}
                </button>
            </div>
        </div>
    );
};

export default FileLoader;
