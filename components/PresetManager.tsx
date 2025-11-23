import React, { useState, useRef } from 'react';
import Tooltip from './Tooltip';

interface PresetManagerProps {
    onExport: (name: string) => Promise<string>;
    onImport: (json: string) => Promise<void>;
    disabled: boolean;
}

const PresetManager: React.FC<PresetManagerProps> = ({ onExport, onImport, disabled }) => {
    const [presetName, setPresetName] = useState("My Groove");
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = async () => {
        if (!presetName) return;
        setIsProcessing(true);
        try {
            const json = await onExport(presetName);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${presetName.replace(/\s+/g, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert("Failed to save preset");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsProcessing(true);
        try {
            const text = await file.text();
            await onImport(text);
        } catch (e) {
            console.error(e);
            alert("Failed to load preset");
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex items-center gap-3 bg-deep-space/40 p-1.5 rounded-lg border border-white/10 w-full h-full">
            <div className="text-[10px] font-bold text-star-dust/50 uppercase tracking-wider hidden sm:flex items-center px-2 border-r border-white/10 h-full">
                Preset
            </div>
            <div className="flex gap-2 flex-1 items-center">
                 <input 
                    type="text" 
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Name"
                    disabled={disabled}
                    className="w-16 sm:w-24 flex-1 bg-deep-space/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none"
                 />
                 <Tooltip text="Save JSON">
                    <button 
                        onClick={handleSave}
                        disabled={disabled || isProcessing}
                        className="bg-hyper-cyan/80 hover:bg-hyper-cyan text-deep-space text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1.5 rounded disabled:opacity-50 transition-all"
                    >
                        SAVE
                    </button>
                 </Tooltip>
                 <Tooltip text="Load JSON">
                     <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || isProcessing}
                        className="bg-nebula-blue hover:bg-nebula-blue/80 text-star-dust text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1.5 rounded disabled:opacity-50 transition-all border border-white/5"
                    >
                        LOAD
                    </button>
                </Tooltip>
                <input 
                    type="file" 
                    accept=".json" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                />
            </div>
        </div>
    );
};

export default PresetManager;