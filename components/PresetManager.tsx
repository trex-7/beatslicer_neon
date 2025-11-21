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

    const handleImportClick = () => fileInputRef.current?.click();

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
        <div className="bg-deep-space/50 p-6 rounded-lg ring-1 ring-white/10">
            <div className="flex items-center justify-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-star-dust">Preset Management</h2>
                <Tooltip text="Export your current state (including audio) to JSON or load a previous session.">
                     <div className="w-4 h-4 rounded-full border border-star-dust/50 text-star-dust/50 flex items-center justify-center text-[10px] cursor-help hover:text-hyper-cyan hover:border-hyper-cyan transition-colors font-serif italic">
                        i
                    </div>
                </Tooltip>
            </div>
            <div className="space-y-4">
                <div className="flex gap-2">
                     <input 
                        type="text" 
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Preset Name"
                        disabled={disabled}
                        className="flex-1 bg-nebula-blue/50 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-hyper-cyan outline-none"
                     />
                     <Tooltip text="Save current settings and audio as a .json file">
                        <button 
                            onClick={handleSave}
                            disabled={disabled || isProcessing}
                            className="bg-hyper-cyan text-deep-space font-bold px-4 py-2 rounded hover:brightness-110 disabled:opacity-50 disabled:cursor-wait transition-all"
                        >
                            {isProcessing ? '...' : 'SAVE'}
                        </button>
                     </Tooltip>
                </div>

                <div className="border-t border-white/10 pt-4">
                    <Tooltip text="Load a previously saved .json preset file">
                         <button 
                            onClick={handleImportClick}
                            disabled={disabled || isProcessing}
                            className="w-full bg-nebula-blue hover:bg-nebula-blue/80 text-star-dust font-semibold py-3 px-4 rounded-md transition duration-200 disabled:opacity-50"
                        >
                            {isProcessing ? 'Loading...' : 'Load Preset File'}
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
                
                <p className="text-xs text-star-dust/40 text-center italic">
                    Presets include all settings, sequencer patterns, and the full audio file.
                </p>
            </div>
        </div>
    );
};

export default PresetManager;