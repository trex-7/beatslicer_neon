
import React, { useState, useRef } from 'react';
import Tooltip from './Tooltip';
import { FACTORY_PRESETS } from '../utils/factoryPresets';

interface PresetManagerProps {
    onExport: (name: string) => Promise<string>;
    onImport: (json: string) => Promise<void>;
    disabled: boolean;
    onLoadPreset?: (preset: any) => void; // New prop for loading direct objects
}

const PresetManager: React.FC<PresetManagerProps> = ({ onExport, onImport, disabled, onLoadPreset }) => {
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

    const handleFactorySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        if (!id) return;
        const preset = FACTORY_PRESETS.find(p => p.id === id);
        if (preset && onLoadPreset) {
            onLoadPreset(preset);
            // Reset selector so we can re-select if needed
            e.target.value = ""; 
        }
    };

    return (
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-deep-space/40 p-1.5 rounded-lg border border-white/10 w-full h-full">
            <div className="text-[10px] font-bold text-star-dust/50 uppercase tracking-wider hidden sm:flex items-center px-2 border-r border-white/10 h-full">
                Quick Preset
            </div>
            
            <div className="flex gap-2 flex-1 items-center w-full sm:w-auto">
                 {/* Factory Preset Dropdown */}
                 {onLoadPreset && (
                    <div className="relative flex-1 sm:flex-none">
                         <select 
                            onChange={handleFactorySelect}
                            disabled={disabled}
                            className="w-full sm:w-32 bg-deep-space/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-hyper-cyan outline-none appearance-none cursor-pointer hover:bg-white/5"
                            defaultValue=""
                         >
                            <option value="" disabled>Load Demo...</option>
                            {FACTORY_PRESETS.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                         </select>
                         <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-star-dust/50 text-[10px]">▼</div>
                    </div>
                 )}

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
