
import React, { useState } from 'react';
import { uploadSampleToCloud, saveCloudPreset } from '../utils/db';
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
    getAudioWav: () => Promise<Blob | null>;
}

const ADMIN_EMAILS = ['sandromancino.sm@gmail.com'];

const SaveDialog: React.FC<SaveDialogProps> = ({ 
    isOpen, onClose, user, sampleName, params, sequencer, slices, currentSampleId, getAudioWav 
}) => {
    const [name, setName] = useState(sampleName);
    const [saveType, setSaveType] = useState<'preset' | 'sample'>('preset');
    const [isPublic, setIsPublic] = useState(false);
    const [isFactory, setIsFactory] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const isAdmin = user && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

    const handleSave = async () => {
        if (!user) return setError("You must be logged in to save.");
        setIsSaving(true);
        setError(null);

        try {
            const blob = await getAudioWav();
            if (!blob) throw new Error("No audio data available.");

            let finalSampleId = currentSampleId;

            // 1. Upload Sample if:
            // - We are saving JUST a sample
            // - OR We are saving a preset but the sample is local (no ID)
            // - OR We are forcing a factory/public upload which usually implies new resources
            // For simplicity: If no current ID, upload. If ID exists, reuse it (unless saving sample-only which implies new copy?)
            // Actually, "Save Loaded Sample" usually means "Save this audio file to my library".
            
            if (saveType === 'sample' || !finalSampleId) {
                const uploadResult = await uploadSampleToCloud(
                    blob, 
                    saveType === 'sample' ? name : `${name}_Audio`, // If preset, audio name might differ
                    user.id,
                    isFactory, // Factory flag
                    undefined, // Kit name
                    isPublic || isFactory // Public flag
                );

                if (!uploadResult) throw new Error("Failed to upload audio file.");
                finalSampleId = uploadResult.id;
                
                if (saveType === 'sample') {
                    // We are done!
                    alert("Sample saved successfully!");
                    onClose();
                    return;
                }
            }

            // 2. Save Preset
            if (saveType === 'preset') {
                const success = await saveCloudPreset(
                    name,
                    params,
                    sequencer,
                    slices,
                    user.id,
                    finalSampleId || undefined,
                    isFactory,
                    isPublic
                );

                if (!success) throw new Error("Failed to save preset to database.");
                alert("Preset saved successfully!");
                onClose();
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Save failed.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1a1f2b] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="text-hyper-cyan">💾</span> Save to Cloud
                </h2>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Name</label>
                        <input 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:border-hyper-cyan outline-none"
                            placeholder="My Awesome Sound"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Save Type</label>
                        <div className="flex bg-black/40 rounded p-1 border border-white/10">
                            <button 
                                onClick={() => setSaveType('preset')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${saveType === 'preset' ? 'bg-hyper-cyan text-deep-space' : 'text-star-dust hover:text-white'}`}
                            >
                                PRESET (Sound + Settings)
                            </button>
                            <button 
                                onClick={() => setSaveType('sample')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${saveType === 'sample' ? 'bg-plasma-pink text-white' : 'text-star-dust hover:text-white'}`}
                            >
                                SAMPLE ONLY (Audio)
                            </button>
                        </div>
                        <p className="text-[10px] text-white/40 mt-1">
                            {saveType === 'preset' 
                                ? "Saves current sequence, effects, and slices. References the audio." 
                                : "Saves only the current audio buffer as a WAV file to your library."}
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                className="w-4 h-4 rounded border-white/20 bg-black/40 checked:bg-hyper-cyan"
                            />
                            <span className="text-sm text-white group-hover:text-hyper-cyan transition-colors">Share with Community (Public)</span>
                        </label>

                        {isAdmin && (
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input 
                                    type="checkbox" 
                                    checked={isFactory}
                                    onChange={(e) => setIsFactory(e.target.checked)}
                                    className="w-4 h-4 rounded border-white/20 bg-black/40 checked:bg-yellow-500"
                                />
                                <span className="text-sm text-yellow-500 font-bold">Save as Factory Item</span>
                            </label>
                        )}
                    </div>

                    {error && (
                        <div className="p-2 bg-red-500/20 text-red-300 text-xs rounded border border-red-500/30">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button 
                            onClick={onClose}
                            className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded border border-white/5 transition-colors"
                        >
                            CANCEL
                        </button>
                        <button 
                            onClick={handleSave}
                            disabled={isSaving || !name.trim()}
                            className="flex-1 py-2 bg-hyper-cyan hover:bg-hyper-cyan/80 text-deep-space text-xs font-bold rounded transition-colors disabled:opacity-50"
                        >
                            {isSaving ? "SAVING..." : "SAVE CLOUD"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SaveDialog;
