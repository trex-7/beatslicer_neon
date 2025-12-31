
import React, { useState, useEffect } from 'react';
import { uploadSampleToCloud, saveCloudPreset, updateCloudPreset } from '../utils/db';
import type { AllParams, SequencerState, Slice } from '../types';

interface SaveDialogProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    sampleName: string;
    params: AllParams;
    sequencer: SequencerState;
    slices: Slice[];
    currentSampleId: string | null;
    currentPresetId?: string | null;
    getAudioBlob: () => Promise<Blob | null>;
}

const ADMIN_EMAILS = ['sandromancino.sm@gmail.com'];

const SaveDialog: React.FC<SaveDialogProps> = ({ 
    isOpen, onClose, user, sampleName, params, sequencer, slices, currentSampleId, currentPresetId, getAudioBlob 
}) => {
    const [name, setName] = useState(sampleName);
    const [saveType, setSaveType] = useState<'preset' | 'sample'>('preset');
    const [isPublic, setIsPublic] = useState(false);
    const [isFactory, setIsFactory] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset name when dialog opens or sampleName changes
    useEffect(() => {
        if (isOpen) {
            setName(sampleName);
            setSaveType('preset');
            setError(null);
            // Reset flags, but keep logic consistent
            setIsFactory(false);
            setIsPublic(false);
        }
    }, [isOpen, sampleName]);

    const handleFactoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setIsFactory(checked);
        if (checked) {
            setIsPublic(true);
        }
    };

    if (!isOpen) return null;

    // --- GUEST BLOCKER ---
    if (!user) {
        return (
             <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95">
                <div className="bg-[#1a1f2b] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🔒</div>
                    <h2 className="text-xl font-bold text-white mb-2">Login Required</h2>
                    <p className="text-star-dust text-sm mb-6 leading-relaxed">
                        You must be logged in to contribute to the community database. 
                        <br/>Please sign in using the button in the top bar.
                    </p>
                    <button 
                        onClick={onClose} 
                        className="w-full py-3 bg-hyper-cyan hover:bg-hyper-cyan/80 text-deep-space font-bold text-sm rounded transition-colors"
                    >
                        Got it
                    </button>
                </div>
            </div>
        );
    }

    const isAdmin = user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

    const handleSave = async (overwrite: boolean = false) => {
        setIsSaving(true);
        setError(null);

        try {
            // Retrieve raw audio data
            const blob = await getAudioBlob();
            if (!blob) throw new Error("No audio data available.");

            let finalSampleId = currentSampleId;

            // LOGIC:
            // If saving a SAMPLE: Upload to storage -> Insert into 'samples' table.
            // If saving a PRESET: 
            //    1. Ensure audio exists in 'samples' table (Upload if new).
            //    2. Insert or Update into 'presets' table.

            if (saveType === 'sample' || !finalSampleId) {
                // If this is a Preset save but audio is new, tag it for clarity
                const audioTitle = saveType === 'sample' ? name : `${name} (Source)`;
                
                // Samples are typically immutable or appended. Overwriting actual audio blob is complex due to browser caching.
                // So we always treat audio uploads as new entries for safety unless we implement deep file updating logic.
                const uploadResult = await uploadSampleToCloud(
                    blob, 
                    audioTitle, 
                    user.id,
                    isFactory, // Factory flag
                    undefined, // No kit grouping
                    isPublic || isFactory // Public flag
                );

                if (!uploadResult) throw new Error("Failed to upload to 'samples' table.");
                finalSampleId = uploadResult.id;
                
                if (saveType === 'sample') {
                    alert("Saved to 'samples' table successfully!");
                    onClose();
                    return;
                }
            }

            if (saveType === 'preset') {
                if (overwrite && currentPresetId) {
                    // UPDATE EXISTING
                     const success = await updateCloudPreset(
                        currentPresetId,
                        name,
                        params,
                        sequencer,
                        slices,
                        isPublic || isFactory // Ensure logic holds for updates too
                    );
                    if (!success) throw new Error("Failed to update preset.");
                    alert("Preset updated successfully!");
                } else {
                    // SAVE AS NEW
                    const success = await saveCloudPreset(
                        name,
                        params,
                        sequencer,
                        slices,
                        user.id,
                        finalSampleId || undefined,
                        isFactory,
                        isPublic // saveCloudPreset now handles forcing this true if isFactory is true
                    );
                    if (!success) throw new Error("Failed to save to 'presets' table.");
                    alert("Preset saved successfully!");
                }
                onClose();
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Save failed.");
        } finally {
            setIsSaving(false);
        }
    };

    const canOverwrite = saveType === 'preset' && !!currentPresetId;

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1a1f2b] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="text-hyper-cyan">💾</span> Save to Database
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Entry Name</label>
                        <input 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:border-hyper-cyan outline-none"
                            placeholder="Name..."
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Table Target</label>
                        <div className="flex bg-black/40 rounded p-1 border border-white/10">
                            <button 
                                onClick={() => setSaveType('preset')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${saveType === 'preset' ? 'bg-hyper-cyan text-deep-space' : 'text-star-dust hover:text-white'}`}
                            >
                                PRESET
                            </button>
                            <button 
                                onClick={() => setSaveType('sample')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${saveType === 'sample' ? 'bg-plasma-pink text-white' : 'text-star-dust hover:text-white'}`}
                            >
                                SAMPLE
                            </button>
                        </div>
                        <p className="text-[10px] text-white/40 mt-1 font-mono">
                            {saveType === 'preset' 
                                ? "Table: presets (Stores settings + link to sample)" 
                                : "Table: samples (Stores audio file only)"}
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                        {/* Public Checkbox */}
                        <label className={`flex items-center gap-2 cursor-pointer group ${isFactory ? 'opacity-50 pointer-events-none' : ''}`}>
                            <input 
                                type="checkbox" 
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                disabled={isFactory} // Disable if Factory is checked
                                className="w-4 h-4 rounded border-white/20 bg-black/40 checked:bg-hyper-cyan disabled:checked:bg-white/30"
                            />
                            <span className="text-sm text-white group-hover:text-hyper-cyan transition-colors">
                                Public {isFactory ? '(Forced by Factory)' : '(Visible to everyone)'}
                            </span>
                        </label>

                        {/* Admin Factory Checkbox */}
                        {isAdmin && (
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input 
                                    type="checkbox" 
                                    checked={isFactory}
                                    onChange={handleFactoryChange}
                                    className="w-4 h-4 rounded border-white/20 bg-black/40 checked:bg-yellow-500"
                                />
                                <span className="text-sm text-yellow-500 font-bold">Factory Item</span>
                            </label>
                        )}
                    </div>

                    {error && (
                        <div className="p-2 bg-red-500/20 text-red-300 text-xs rounded border border-red-500/30">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2">
                        <div className="flex gap-2">
                            <button 
                                onClick={onClose}
                                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded border border-white/5 transition-colors"
                            >
                                CANCEL
                            </button>
                            <button 
                                onClick={() => handleSave(false)}
                                disabled={isSaving || !name.trim()}
                                className="flex-[2] py-2 bg-hyper-cyan hover:bg-hyper-cyan/80 text-deep-space text-xs font-bold rounded transition-colors disabled:opacity-50"
                            >
                                {isSaving ? "SAVING..." : (canOverwrite ? "SAVE AS NEW" : "CONFIRM SAVE")}
                            </button>
                        </div>
                        
                        {canOverwrite && (
                            <button 
                                onClick={() => handleSave(true)}
                                disabled={isSaving}
                                className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded border border-white/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <span>🔄</span> OVERWRITE EXISTING
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SaveDialog;
