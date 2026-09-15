import React, { useRef, useEffect, useState, memo, useMemo } from 'react';
import { 
    Cloud, 
    Upload, 
    Play, 
    Square, 
    Folder, 
    FolderOpen, 
    Package, 
    Disc, 
    Sliders, 
    Sparkles, 
    Trash2, 
    Check, 
    Search, 
    X, 
    Plus, 
    Lock, 
    Globe, 
    ShieldCheck, 
    AlertCircle, 
    Music, 
    Layers, 
    RefreshCw, 
    HardDrive,
    Database,
    ArrowLeft,
    FileAudio,
    Tag
} from 'lucide-react';
import Tooltip from './Tooltip';
import Auth from './Auth';
import { 
    fetchLibrary, 
    saveCloudPreset, 
    uploadSampleToCloud, 
    deleteCloudPreset, 
    deleteCloudSample, 
    deleteCloudKit,
    listStorageObjects,
    deleteStorageObject,
    fetchAllFeedback,
    createKit,
    linkSamplesToKit,
    resetLibraryDatabase,
    type CloudItem,
    type DeleteResult,
    type FeedbackItem,
    type StorageObjectItem,
} from '../utils/db';
import type { KitSample, Preset } from '../types';
import { stitchAudioFiles, validateFile, resolveAudioUrl, MAX_KIT_FILES, MAX_KIT_TOTAL_MB } from '../utils/audioHelpers';

interface LibraryManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onFileLoad: (file: File) => void;
    onKitLoad: (files: File[] | KitSample[], name: string) => void;
    onDemoLoad: (url: string, name: string) => void;
    onExport: (name: string) => Promise<string>;
    onImport: (json: string) => Promise<void>;
    onLoadPreset: (preset: Preset) => void;
    getAudioWav: () => Promise<Blob | null>;
    isLoading: boolean;
    sampleName: string;
    user: any;
}

const ADMIN_EMAILS = [
    ((import.meta as any).env?.VITE_ADMIN_EMAIL || '').toLowerCase().trim(),
    'sandromancino.sm@gmail.com',
    'admin@example.com',
].filter(Boolean);

type FilterCategory = 'all' | 'samples' | 'kits' | 'presets' | 'factory' | 'my-uploads';
type UploadMode = 'sample' | 'kit' | 'preset';

const LibraryManager: React.FC<LibraryManagerProps> = memo(({ 
    isOpen, onClose, onFileLoad, onKitLoad, onDemoLoad, onExport, onImport, onLoadPreset, getAudioWav, sampleName, user
}) => {
    // Hidden standard file pickers
    const directLocalAudioRef = useRef<HTMLInputElement>(null);
    const presetImportInputRef = useRef<HTMLInputElement>(null);

    // Upload & Browser View Mode: 'browse' | 'upload' | 'admin'
    const [viewMode, setViewMode] = useState<'browse' | 'upload' | 'admin'>('browse');
    const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
    const [searchTerm, setSearchTerm] = useState("");

    // Database items state
    const [publicPresets, setPublicPresets] = useState<CloudItem[]>([]);
    const [publicSamples, setPublicSamples] = useState<CloudItem[]>([]);
    const [factoryPresets, setFactoryPresets] = useState<CloudItem[]>([]);
    const [factorySamples, setFactorySamples] = useState<CloudItem[]>([]);
    const [userPresets, setUserPresets] = useState<CloudItem[]>([]);
    const [userSamples, setUserSamples] = useState<CloudItem[]>([]);
    const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);

    // Kit UI expanded state
    const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set());

    // Audio preview state
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const [errorId, setErrorId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // ==========================================
    // UPLOAD FORM STATES
    // ==========================================
    const [uploadMode, setUploadMode] = useState<UploadMode>('sample');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState("");
    const [uploadProgressMsg, setUploadProgressMsg] = useState("");

    // 1. Single Sample / Loop upload state
    const [singleFiles, setSingleFiles] = useState<File[]>([]);
    const [singleTitle, setSingleTitle] = useState("");
    const [singleTag, setSingleTag] = useState<'loop' | 'oneshot' | 'stem' | 'fx'>('loop');
    const [singleIsPublic, setSingleIsPublic] = useState(true);
    const [singleIsFactory, setSingleIsFactory] = useState(false);

    // 2. Multi-Sample Kit upload state
    const [kitFiles, setKitFiles] = useState<File[]>([]);
    const [kitTitle, setKitTitle] = useState("");
    const [kitDescription, setKitDescription] = useState("");
    const [kitAutoStitch, setKitAutoStitch] = useState(true);
    const [kitIsPublic, setKitIsPublic] = useState(true);
    const [kitIsFactory, setKitIsFactory] = useState(false);

    // 3. Preset save state
    const [presetTitle, setPresetTitle] = useState(sampleName || "My Slicer Preset");
    const [presetIsPublic, setPresetIsPublic] = useState(true);
    const [presetIsFactory, setPresetIsFactory] = useState(false);

    // Storage Admin & Purge State
    const [storageObjects, setStorageObjects] = useState<StorageObjectItem[]>([]);
    const [isLoadingStorage, setIsLoadingStorage] = useState(false);
    const [storageSearch, setStorageSearch] = useState("");
    const [storageStatus, setStorageStatus] = useState<any>(null);
    const [manualDeleteTarget, setManualDeleteTarget] = useState("");
    const [isDeletingStorage, setIsDeletingStorage] = useState(false);
    const [isResettingDb, setIsResettingDb] = useState(false);
    const [storageActionMsg, setStorageActionMsg] = useState<{ text: string; success: boolean } | null>(null);

    // Supabase to Neon Migration State
    const [supabaseUrlInput, setSupabaseUrlInput] = useState("");
    const [supabaseKeyInput, setSupabaseKeyInput] = useState("");
    const [supabaseBucketInput, setSupabaseBucketInput] = useState("samples");
    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationResult, setMigrationResult] = useState<any>(null);

    const isAdmin = Boolean(
        !user || // Default workspace admin permissions
        (user.email && ADMIN_EMAILS.some((a) => a.toLowerCase().trim() === String(user.email).toLowerCase().trim()))
    );

    const loadLibraryData = async () => {
        try {
            const data = await fetchLibrary(user?.id);
            setPublicPresets(data.publicPresets);
            setPublicSamples(data.publicSamples);
            setFactoryPresets(data.factoryPresets);
            setFactorySamples(data.factorySamples);
            setUserPresets(data.userPresets);
            setUserSamples(data.userSamples);
        } catch (err) {
            console.error('Failed to load library:', err);
        }
    };

    const loadStorageInfo = async () => {
        setIsLoadingStorage(true);
        try {
            const statusRes = await fetch('/api/storage/status');
            const statusData = await statusRes.json();
            setStorageStatus(statusData);

            const objectsRes = await listStorageObjects();
            if (objectsRes.success) {
                setStorageObjects(objectsRes.objects);
            }
        } catch (e) {
            console.error('Error loading storage info:', e);
        } finally {
            setIsLoadingStorage(false);
        }
    };

    const loadFeedback = async () => {
        if (isAdmin) {
            const data = await fetchAllFeedback();
            setFeedbackItems(data);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadLibraryData();
            setViewMode('browse');
            setFilterCategory('all');
            setSearchTerm("");
            setPresetTitle(sampleName || "My Slicer Preset");
        } else {
            stopPreview();
        }
    }, [user, isOpen, sampleName]);

    useEffect(() => {
        if (isOpen && viewMode === 'admin' && isAdmin) {
            loadFeedback();
            loadStorageInfo();
        }
    }, [isOpen, viewMode, isAdmin]);

    useEffect(() => {
        return () => stopPreview();
    }, []);

    const stopPreview = () => {
        if (audioPreviewRef.current) {
            audioPreviewRef.current.pause();
            audioPreviewRef.current = null;
        }
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        setPreviewingId(null);
    };

    const togglePreview = async (item: CloudItem) => {
        if (item.type !== 'sample' || !item.url) return;

        if (previewingId === item.id) {
            stopPreview();
        } else {
            stopPreview(); 
            if (errorId === item.id) setErrorId(null);
            setPreviewingId(item.id); 

            try {
                const streamUrl = resolveAudioUrl(item.url);
                const response = await fetch(streamUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const wavBlob = new Blob([blob], { type: 'audio/wav' });
                const blobUrl = URL.createObjectURL(wavBlob);
                audioUrlRef.current = blobUrl;

                const audio = new Audio(blobUrl);
                audioPreviewRef.current = audio;
                audio.volume = 0.65;
                audio.onended = () => {
                    setPreviewingId(null);
                };
                audio.onerror = (e) => {
                    console.error("Preview failed for", streamUrl, e);
                    setPreviewingId(null);
                    setErrorId(item.id);
                };
                
                await audio.play();
            } catch (e) {
                console.error("Preview playback failed:", e);
                setPreviewingId(null);
                setErrorId(item.id);
            }
        }
    };

    const toggleKitExpansion = (kitIdOrName: string) => {
        setExpandedKits(prev => {
            const next = new Set(prev);
            if (next.has(kitIdOrName)) next.delete(kitIdOrName);
            else next.add(kitIdOrName);
            return next;
        });
    };

    const loadCloudItem = (item: CloudItem) => {
        stopPreview();
        
        if (item.type === 'kit' && item.data && item.data.items) {
            const children = item.data.items as CloudItem[];
            const kitSamples: KitSample[] = children.map(c => ({
                name: c.label,
                url: resolveAudioUrl(c.url || '')
            })).filter(c => c.url);
            
            if (kitSamples.length > 0) {
                onKitLoad(kitSamples, item.label);
                onClose();
            }
            return;
        }

        if (item.type === 'preset' && item.data) {
             const fullPreset: Preset = {
                 id: item.id,
                 name: item.label,
                 date: Date.now(),
                 params: item.data.params,
                 sequencer: item.data.sequencer,
                 slices: item.data.slices || [],
                 sampleName: item.data.sampleName || 'Cloud Preset',
                 sampleUrl: resolveAudioUrl(item.data.sampleUrl)
             };
             onLoadPreset(fullPreset);
        } else if (item.type === 'sample' && item.url) {
             onDemoLoad(resolveAudioUrl(item.url), item.label);
        }
        onClose();
    };

    const handleDelete = async (item: CloudItem) => {
        if (deletingId) return; 

        const isKitItem = item.type === 'kit' || Boolean(item.data?.items) || (item.type !== 'preset' && item.label && item.label.startsWith('[Kit:'));

        if (item.type === 'kit' || (isKitItem && item.type !== 'preset' && item.type !== 'sample')) {
            const confirmed = window.confirm(`⚠️ Delete kit "${item.label}"? This will permanently delete the kit and its audio files.`);
            if (!confirmed) return;

            setDeletingId(item.id);
            const result = await deleteCloudKit(item.id, true);
            if (!result.success) {
                alert(`Delete kit failed: ${result.error}`);
            } else {
                await loadLibraryData();
            }
            setDeletingId(null);
            return;
        }

        if (item.type === 'preset') {
            const confirmed = window.confirm(`⚠️ Delete preset "${item.label}"?`);
            if (!confirmed) return;
        } else if (item.type === 'sample') {
            const confirmed = window.confirm(`⚠️ Delete sample "${item.label}"?`);
            if (!confirmed) return;
        }

        setDeletingId(item.id);

        let result: DeleteResult = { success: false };
        if (item.type === 'preset') {
            result = await deleteCloudPreset(item.id, item.url, true);
        } else if ((item.type as string) === 'kit') {
            result = await deleteCloudKit(item.id, true);
        } else {
            result = await deleteCloudSample(item.id, item.url);
        }

        if (!result.success) {
            alert(`Delete failed: ${result.error || 'Unknown error'}`);
        } else {
            await loadLibraryData();
        }
        setDeletingId(null);
    };

    // ==========================================
    // UPLOAD HANDLERS
    // ==========================================

    // 1. Single Sample / Loop Upload Action
    const handleUploadSingleSample = async () => {
        if (singleFiles.length === 0) {
            alert("Please select an audio file first.");
            return;
        }
        const file = singleFiles[0];
        const valErr = validateFile(file);
        if (valErr) {
            alert(valErr);
            return;
        }

        const effectiveUserId = user?.id || 'admin_user';
        const rawTitle = (singleTitle.trim() || file.name.replace(/\.[^/.]+$/, "")).trim();
        const tagPrefix = singleTag === 'loop' ? '[Loop]' : singleTag === 'oneshot' ? '[One-Shot]' : singleTag === 'stem' ? '[Stem]' : '[FX]';
        const finalTitle = rawTitle.startsWith('[') ? rawTitle : `${tagPrefix} ${rawTitle}`;

        setIsUploading(true);
        setUploadStatus("Uploading audio to cloud storage...");
        setUploadProgressMsg(file.name);

        try {
            const res = await uploadSampleToCloud(
                file,
                finalTitle,
                effectiveUserId,
                singleIsFactory,
                undefined,
                singleIsPublic || singleIsFactory,
                true
            );

            if (res) {
                await loadLibraryData();
                setSingleFiles([]);
                setSingleTitle("");
                setViewMode('browse');
                alert(`"${finalTitle}" uploaded successfully!`);
            } else {
                throw new Error("Failed to upload audio sample.");
            }
        } catch (err: any) {
            console.error('Upload single sample error:', err);
            alert(`Upload failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsUploading(false);
            setUploadStatus("");
            setUploadProgressMsg("");
        }
    };

    // 2. Multi-Sample Kit Upload Action
    const handleUploadKit = async () => {
        if (kitFiles.length === 0) {
            alert("Please select at least 2 audio files for the kit.");
            return;
        }
        if (!kitTitle.trim()) {
            alert("Please provide a name for this Kit / Pack.");
            return;
        }
        if (kitFiles.length > MAX_KIT_FILES) {
            alert(`Maximum kit size is ${MAX_KIT_FILES} audio files.`);
            return;
        }

        const totalMB = kitFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
        if (totalMB > MAX_KIT_TOTAL_MB) {
            alert(`Total kit upload size exceeds ${MAX_KIT_TOTAL_MB}MB limit.`);
            return;
        }

        for (const file of kitFiles) {
            const err = validateFile(file);
            if (err) {
                alert(`File "${file.name}" error: ${err}`);
                return;
            }
        }

        const effectiveUserId = user?.id || 'admin_user';
        const name = kitTitle.trim();
        const desc = kitDescription.trim();

        setIsUploading(true);
        setUploadStatus(`Creating Kit "${name}"...`);

        try {
            // 1. Create Kit DB Record
            const kitId = await createKit(effectiveUserId, name, kitIsPublic || kitIsFactory, kitIsFactory, desc);
            if (!kitId) throw new Error("Failed to initialize kit in database.");

            // 2. Upload Individual Samples
            const sampleIds: string[] = [];
            for (let i = 0; i < kitFiles.length; i++) {
                const f = kitFiles[i];
                setUploadStatus(`Uploading kit sample ${i + 1}/${kitFiles.length}...`);
                setUploadProgressMsg(f.name);

                const uploadRes = await uploadSampleToCloud(
                    f,
                    f.name,
                    effectiveUserId,
                    kitIsFactory,
                    name,
                    kitIsPublic || kitIsFactory,
                    true
                );
                if (uploadRes) sampleIds.push(uploadRes.id);
            }

            // 3. Link Samples to Kit
            setUploadStatus("Linking samples into kit pack...");
            await linkSamplesToKit(kitId, sampleIds);

            // 4. Stitched Master Preset (if auto-stitch enabled)
            if (kitAutoStitch && kitFiles.length > 0) {
                setUploadStatus("Stitching samples into Playable Slice Master...");
                const { blob: masterBlob, slices } = await stitchAudioFiles(kitFiles);

                setUploadStatus("Uploading stitched Master Audio...");
                const masterUpload = await uploadSampleToCloud(
                    masterBlob,
                    `${name} (Master).wav`,
                    effectiveUserId,
                    kitIsFactory,
                    name,
                    kitIsPublic || kitIsFactory,
                    true
                );

                if (masterUpload) {
                    setUploadStatus("Saving Playable Preset...");
                    const defaultParams = {
                        grainSize: 0.09, overlap: 0.03, detune: 0, playbackRate: 1, bpm: 120,
                        attack: 0.001, release: 0.01, sustain: 0.5,
                        reverb: { isActive: false, decay: 1.5, wet: 0, isSynced: false, syncValue: '2n', lowCut: 20, highCut: 20000 },
                        delay: { isActive: false, delayTime: 0.375, feedback: 0.2, wet: 0, isSynced: true, syncValue: '8n', lowCut: 20, highCut: 20000 },
                        filter: { isActive: false, frequency: 20000, q: 1, type: 'lowpass', envDepth: 0, lfoDepth: 0, lfoRate: 1, isSynced: true, syncValue: '4n' },
                        distortion: { isActive: false, amount: 1.0, wet: 0.04 },
                        compressor: { isActive: true, threshold: -24, ratio: 4, attack: 0.01, release: 0.1 },
                        bitCrusher: { isActive: false, bits: 8, wet: 0 },
                        glitch: { chaos: 0, allowReverse: false, allowOctaveJump: true, allowRatchet: true, pitchShift: true, allowFormant: true },
                        order: ['compressor', 'distortion', 'bitCrusher', 'filter', 'delay', 'reverb']
                    };

                    const defaultSequencer = {
                        steps: Array(32).fill(0).map((_, i) => ({ active: i % 2 === 0, sliceIndex: i % slices.length, ratchet: 1 })),
                        stepCount: 32, mode: 'forward', currentStep: -1, isPlaying: false, isLooping: true, editMode: 'trigger', playbackBehavior: 'reset'
                    };

                    await saveCloudPreset(
                        name,
                        defaultParams as any,
                        defaultSequencer,
                        slices,
                        effectiveUserId,
                        masterUpload.id,
                        kitIsFactory,
                        kitIsPublic || kitIsFactory
                    );
                }
            }

            await loadLibraryData();
            setKitFiles([]);
            setKitTitle("");
            setKitDescription("");
            setViewMode('browse');
            alert(`Kit "${name}" with ${sampleIds.length} samples created successfully!`);

        } catch (err: any) {
            console.error('Kit upload error:', err);
            alert(`Failed to create kit: ${err.message || 'Unknown error'}`);
        } finally {
            setIsUploading(false);
            setUploadStatus("");
            setUploadProgressMsg("");
        }
    };

    // 3. Current Slicer Session Preset Save Action
    const handleSaveCurrentPreset = async () => {
        if (!presetTitle.trim()) {
            alert("Please enter a name for the Preset.");
            return;
        }

        setIsUploading(true);
        setUploadStatus("Exporting current audio and slice layout...");

        try {
            const wavBlob = await getAudioWav();
            const effectiveUserId = user?.id || 'admin_user';
            let audioSampleId: string | undefined = undefined;

            if (wavBlob) {
                setUploadStatus("Uploading source audio to cloud storage...");
                const audioTitle = `${presetTitle.trim()} (Source).wav`;
                const uploadRes = await uploadSampleToCloud(
                    wavBlob,
                    audioTitle,
                    effectiveUserId,
                    presetIsFactory,
                    undefined,
                    presetIsPublic || presetIsFactory,
                    true
                );
                if (uploadRes) {
                    audioSampleId = uploadRes.id;
                }
            }

            // Export current state
            const exportedJson = await onExport(presetTitle.trim());
            const parsed = JSON.parse(exportedJson);

            setUploadStatus("Registering Preset in database...");
            const saved = await saveCloudPreset(
                presetTitle.trim(),
                parsed.params,
                parsed.sequencer,
                parsed.slices || [],
                effectiveUserId,
                audioSampleId,
                presetIsFactory,
                presetIsPublic || presetIsFactory
            );

            if (saved) {
                await loadLibraryData();
                setViewMode('browse');
                alert(`Preset "${presetTitle.trim()}" saved to Cloud!`);
            } else {
                throw new Error("Failed to save preset record.");
            }
        } catch (err: any) {
            console.error('Preset save error:', err);
            alert(`Save failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsUploading(false);
            setUploadStatus("");
        }
    };

    // ==========================================
    // ADMIN TOOLS ACTIONS
    // ==========================================
    const handleDeleteStorageObject = async (keyOrUrl: string) => {
        if (!window.confirm(`⚠️ Permanently delete "${keyOrUrl}" from S3 Object Storage?`)) return;
        setIsDeletingStorage(true);
        setStorageActionMsg(null);
        try {
            const res = await deleteStorageObject(keyOrUrl);
            if (res.success) {
                setStorageActionMsg({ text: `Successfully deleted: ${keyOrUrl}`, success: true });
                await loadStorageInfo();
                await loadLibraryData();
            } else {
                setStorageActionMsg({ text: `Failed to delete: ${res.error || 'Unknown error'}`, success: false });
            }
        } catch (err: any) {
            setStorageActionMsg({ text: `Error: ${err.message || 'Delete failed'}`, success: false });
        } finally {
            setIsDeletingStorage(false);
        }
    };

    const handleResetDatabase = async (clearFactory: boolean = false) => {
        if (!window.confirm(clearFactory ? "⚠️ PURGE ALL library items (including factory defaults)?" : "⚠️ Clear all non-factory presets, samples, and kits?")) {
            return;
        }
        setIsResettingDb(true);
        try {
            const ok = await resetLibraryDatabase(clearFactory);
            if (ok) {
                setStorageActionMsg({ text: 'Database purged successfully. Starting clean!', success: true });
                await loadLibraryData();
            } else {
                setStorageActionMsg({ text: 'Failed to reset database.', success: false });
            }
        } catch (err: any) {
            setStorageActionMsg({ text: `Error: ${err.message || 'Reset failed'}`, success: false });
        } finally {
            setIsResettingDb(false);
        }
    };

    const handleRunSupabaseMigration = async () => {
        setIsMigrating(true);
        setMigrationResult(null);
        try {
            const res = await fetch('/api/storage/migrate-from-supabase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supabaseUrl: supabaseUrlInput.trim() || undefined,
                    supabaseServiceKey: supabaseKeyInput.trim() || undefined,
                    sourceBucket: supabaseBucketInput.trim() || undefined,
                    destinationPrefix: 'samples/',
                    updateDatabaseUrls: true,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Migration request failed');

            setMigrationResult(data);
            await loadLibraryData();
            alert(data.message || 'Migration completed successfully!');
        } catch (err: any) {
            setMigrationResult({ success: false, error: err.message });
            alert('Migration failed: ' + err.message);
        } finally {
            setIsMigrating(false);
        }
    };

    // ==========================================
    // FILTERED ITEMS CALCULATION
    // ==========================================
    const allItems = useMemo(() => {
        const list: CloudItem[] = [];
        const seenIds = new Set<string>();

        const addUnique = (item: CloudItem) => {
            if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                list.push(item);
            }
        };

        // User items
        userPresets.forEach(addUnique);
        userSamples.forEach(addUnique);

        // Factory items
        factoryPresets.forEach(addUnique);
        factorySamples.forEach(addUnique);

        // Community Public items
        publicPresets.forEach(addUnique);
        publicSamples.forEach(addUnique);

        return list;
    }, [userPresets, userSamples, factoryPresets, factorySamples, publicPresets, publicSamples]);

    const filteredItems = useMemo(() => {
        let items = allItems;

        // Apply category filter
        if (filterCategory === 'samples') {
            items = items.filter(i => i.type === 'sample' && !i.label.startsWith('[Kit:') && !i.label.includes('(Master)'));
        } else if (filterCategory === 'kits') {
            items = items.filter(i => i.type === 'kit' || i.label.startsWith('[Kit:'));
        } else if (filterCategory === 'presets') {
            items = items.filter(i => i.type === 'preset');
        } else if (filterCategory === 'factory') {
            items = items.filter(i => i.isFactory);
        } else if (filterCategory === 'my-uploads') {
            items = items.filter(i => user && i._userId === user.id);
        }

        // Apply search term
        if (searchTerm.trim()) {
            const query = searchTerm.toLowerCase().trim();
            items = items.filter(i => 
                i.label.toLowerCase().includes(query) || 
                (i.author && i.author.toLowerCase().includes(query)) ||
                (i.description && i.description.toLowerCase().includes(query))
            );
        }

        return items;
    }, [allItems, filterCategory, searchTerm, user]);

    // Counts for tabs
    const counts = useMemo(() => {
        return {
            all: allItems.length,
            samples: allItems.filter(i => i.type === 'sample' && !i.label.startsWith('[Kit:') && !i.label.includes('(Master)')).length,
            kits: allItems.filter(i => i.type === 'kit' || i.label.startsWith('[Kit:')).length,
            presets: allItems.filter(i => i.type === 'preset').length,
            factory: allItems.filter(i => i.isFactory).length,
            myUploads: user ? allItems.filter(i => i._userId === user.id).length : 0
        };
    }, [allItems, user]);

    // Group items for Kits vs loose items
    const { explicitKits, legacyKitGroups, standaloneItems } = useMemo(() => {
        const kits: CloudItem[] = [];
        const legacy: Record<string, CloudItem[]> = {};
        const standalone: CloudItem[] = [];

        filteredItems.forEach(item => {
            if (item.type === 'kit') {
                kits.push(item);
            } else if (item.label.startsWith('[Kit:')) {
                const match = item.label.match(/^\[Kit: (.*?)\]/);
                const kName = match ? match[1] : 'Kit';
                if (!legacy[kName]) legacy[kName] = [];
                legacy[kName].push(item);
            } else {
                standalone.push(item);
            }
        });

        return { explicitKits: kits, legacyKitGroups: legacy, standaloneItems: standalone };
    }, [filteredItems]);

    // ==========================================
    // RENDER HELPERS
    // ==========================================
    const renderItemCard = (item: CloudItem, isKitChild: boolean = false) => {
        const isBroken = errorId === item.id;
        const isMine = user && item._userId === user.id;
        const isMaster = item.label.includes('(Master)');
        const cleanLabel = item.label.replace(/^\[Kit: .*?\]\s*/, '');
        const isPlaying = previewingId === item.id;

        return (
            <div 
                key={item.id} 
                className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all ${
                    deletingId === item.id ? 'opacity-40 pointer-events-none' : ''
                } ${
                    isKitChild 
                        ? 'bg-black/30 border-white/5 hover:border-white/10 hover:bg-black/40' 
                        : 'bg-[#151a23]/70 hover:bg-[#181f2b] border-white/5 hover:border-white/15 shadow-sm'
                } ${isBroken ? 'border-red-500/30 bg-red-950/20' : ''}`}
            >
                {/* Left: Icon & Meta */}
                <div 
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => loadCloudItem(item)}
                >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                        item.type === 'preset'
                            ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                            : item.type === 'kit'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            : 'bg-pink-500/10 text-pink-400 border-pink-500/20'
                    }`}>
                        {item.type === 'preset' ? <Sliders className="w-4 h-4" /> : item.type === 'kit' ? <Package className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                                {cleanLabel}
                            </span>

                            {item.isFactory && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">
                                    <Sparkles className="w-2.5 h-2.5" /> Factory Demo
                                </span>
                            )}

                            {isMaster && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    Master Slices
                                </span>
                            )}

                            {isMine && !item.isFactory && (
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                    item.isPublic ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-white/10 text-white/60 border border-white/10'
                                }`}>
                                    {item.isPublic ? 'Public' : 'Private'}
                                </span>
                            )}
                        </div>

                        <div className="text-[11px] text-white/40 flex items-center gap-2 mt-0.5">
                            <span className="capitalize">{item.type}</span>
                            <span>•</span>
                            <span className={isMine ? 'text-cyan-400 font-medium' : ''}>
                                by {item.author || (item.isFactory ? 'Factory' : 'Community')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.type === 'sample' && item.url && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); togglePreview(item); }}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${
                                isPlaying 
                                    ? 'bg-cyan-500 text-black border-cyan-400 shadow-md shadow-cyan-500/20 animate-pulse' 
                                    : 'bg-white/5 hover:bg-white/15 text-white/80 hover:text-white border-white/10'
                            }`}
                            title={isPlaying ? "Stop Preview" : "Preview Audio"}
                        >
                            {isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => loadCloudItem(item)}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-black font-bold text-xs border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-sm"
                    >
                        LOAD
                    </button>

                    {(isMine || isAdmin) && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                            disabled={deletingId === item.id}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                            title="Delete item"
                        >
                            {deletingId === item.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            {/* Hidden Direct File Pickers */}
            <input 
                type="file" 
                accept="audio/*" 
                ref={directLocalAudioRef} 
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFileLoad(f);
                    onClose();
                    e.target.value = '';
                }} 
                className="hidden" 
            />
            <input 
                type="file" 
                accept=".json" 
                ref={presetImportInputRef} 
                onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                        try {
                            const text = await f.text();
                            await onImport(text);
                            onClose();
                        } catch (err) {
                            alert("Failed to import preset file.");
                        }
                    }
                    e.target.value = '';
                }} 
                className="hidden" 
            />

            {/* Modal Card */}
            <div className="w-full max-w-5xl h-[88vh] bg-[#0c1017] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5">
                
                {/* 1. TOP MAIN HEADER */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#121722]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-black">
                            <Cloud className="w-5 h-5 text-black" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white flex items-center gap-2">
                                Cloud Audio Hub
                                {isAdmin && (
                                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 px-1.5 py-0.2 rounded font-mono uppercase">
                                        Admin
                                    </span>
                                )}
                            </h2>
                            <p className="text-[11px] text-white/50">
                                Browse, preview, and load community or factory demo sounds
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        {/* Direct Local Audio Button */}
                        <button 
                            type="button"
                            onClick={() => directLocalAudioRef.current?.click()}
                            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-white/80 hover:text-white transition-colors"
                            title="Load local WAV/MP3 straight into slicer"
                        >
                            <FileAudio className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Load Local</span>
                        </button>

                        {/* Top View Mode Switcher */}
                        {viewMode === 'browse' ? (
                            <button
                                type="button"
                                onClick={() => setViewMode('upload')}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black font-bold text-xs rounded-lg transition-all shadow-md shadow-cyan-500/20"
                            >
                                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Upload / Save</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setViewMode('browse')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-medium text-xs rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>Browse Library</span>
                            </button>
                        )}

                        {/* Admin Tools Toggle */}
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={() => setViewMode(viewMode === 'admin' ? 'browse' : 'admin')}
                                className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                                    viewMode === 'admin' 
                                        ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' 
                                        : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-yellow-400 border-white/10'
                                }`}
                                title="Admin Storage & Tools"
                            >
                                <HardDrive className="w-4 h-4" />
                            </button>
                        )}

                        <div className="h-5 w-px bg-white/10 mx-1" />

                        {/* User Profile / Auth */}
                        <Auth user={user} onOpenAdmin={() => setViewMode('admin')} />

                        {/* Close Modal */}
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors ml-1"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* 2. MAIN BODY */}
                <div className="flex-1 bg-[#090d14] relative overflow-hidden flex flex-col">
                    
                    {/* Global Uploading Overlay */}
                    {isUploading && (
                        <div className="absolute inset-0 bg-black/85 z-50 flex flex-col items-center justify-center text-white p-6 backdrop-blur-sm">
                            <div className="w-12 h-12 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
                            <h3 className="text-base font-bold text-white mb-1">{uploadStatus}</h3>
                            {uploadProgressMsg && (
                                <p className="text-xs text-cyan-300 font-mono max-w-md truncate">{uploadProgressMsg}</p>
                            )}
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* MODE 1: BROWSE & LOAD LIBRARY */}
                    {/* ======================================================== */}
                    {viewMode === 'browse' && (
                        <div className="flex-1 flex flex-col min-h-0">
                            {/* Search & Filter Toolbar */}
                            <div className="px-5 py-3 border-b border-white/10 bg-[#0e131d] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                                {/* Category Filter Pills */}
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
                                    <button
                                        type="button"
                                        onClick={() => setFilterCategory('all')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                            filterCategory === 'all'
                                                ? 'bg-cyan-500 text-black shadow-sm'
                                                : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                                        }`}
                                    >
                                        All ({counts.all})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterCategory('samples')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                            filterCategory === 'samples'
                                                ? 'bg-pink-500 text-white shadow-sm'
                                                : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                                        }`}
                                    >
                                        Loops & Samples ({counts.samples})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterCategory('kits')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                            filterCategory === 'kits'
                                                ? 'bg-purple-500 text-white shadow-sm'
                                                : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                                        }`}
                                    >
                                        Sample Kits ({counts.kits})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterCategory('presets')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                            filterCategory === 'presets'
                                                ? 'bg-cyan-500 text-black shadow-sm'
                                                : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                                        }`}
                                    >
                                        Presets ({counts.presets})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterCategory('factory')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                                            filterCategory === 'factory'
                                                ? 'bg-yellow-500 text-black shadow-sm'
                                                : 'bg-white/5 hover:bg-white/10 text-yellow-400/80 hover:text-yellow-300'
                                        }`}
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        <span>Factory Demo ({counts.factory})</span>
                                    </button>
                                    {user && (
                                        <button
                                            type="button"
                                            onClick={() => setFilterCategory('my-uploads')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                                filterCategory === 'my-uploads'
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'bg-white/5 hover:bg-white/10 text-blue-400/80 hover:text-blue-300'
                                            }`}
                                        >
                                            My Uploads ({counts.myUploads})
                                        </button>
                                    )}
                                </div>

                                {/* Search Bar */}
                                <div className="relative w-full sm:w-56 shrink-0">
                                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                                    <input
                                        type="text"
                                        placeholder="Search library..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400 transition-colors"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => setSearchTerm("")}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Content List Area */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                                {filteredItems.length === 0 ? (
                                    <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 mb-3">
                                            <Disc className="w-6 h-6" />
                                        </div>
                                        <h4 className="text-sm font-bold text-white mb-1">No items found</h4>
                                        <p className="text-xs text-white/40 max-w-sm mb-4">
                                            {searchTerm 
                                                ? `No audio matching "${searchTerm}" in this category.` 
                                                : "There are no sounds in this section yet."}
                                        </p>
                                        <button
                                            onClick={() => setViewMode('upload')}
                                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                                        >
                                            <Upload className="w-3.5 h-3.5" />
                                            <span>Upload First Sound</span>
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {/* 1. Explicit Kit Packs */}
                                        {explicitKits.map((kit) => {
                                            const isExpanded = expandedKits.has(kit.id);
                                            const children = (kit.data?.items || []) as CloudItem[];
                                            const isMine = user && kit._userId === user.id;

                                            return (
                                                <div key={kit.id} className="border border-white/10 rounded-xl overflow-hidden bg-[#131822]/80 shadow-md">
                                                    <div 
                                                        className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-white/5 transition-colors select-none"
                                                        onClick={() => toggleKitExpansion(kit.id)}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <button 
                                                                type="button"
                                                                className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0"
                                                            >
                                                                {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                                                            </button>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-white uppercase tracking-wide truncate">
                                                                        {kit.label}
                                                                    </span>
                                                                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                                                                        {children.length} Samples
                                                                    </span>
                                                                    {kit.isFactory && (
                                                                        <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                                                                            ⭐ Factory Kit
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {kit.description && (
                                                                    <p className="text-[11px] text-white/50 truncate mt-0.5">
                                                                        {kit.description}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0 ml-3">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); loadCloudItem(kit); }}
                                                                className="px-3 py-1.5 bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
                                                            >
                                                                LOAD KIT
                                                            </button>
                                                            {(isMine || isAdmin) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(kit); }}
                                                                    disabled={deletingId === kit.id}
                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                                    title="Delete Kit"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="border-t border-white/5 p-3 space-y-2 bg-black/40">
                                                            {children.length > 0 ? (
                                                                children.map(child => renderItemCard(child, true))
                                                            ) : (
                                                                <div className="text-xs text-white/40 italic p-2 text-center">Empty kit pack</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* 2. Legacy Grouped Kits */}
                                        {Object.entries(legacyKitGroups).map(([kitName, groupItems]) => {
                                            const isExpanded = expandedKits.has(kitName);
                                            const isMine = user && groupItems.length > 0 && groupItems[0]._userId === user.id;

                                            return (
                                                <div key={`legacy-${kitName}`} className="border border-white/10 rounded-xl overflow-hidden bg-[#131822]/80">
                                                    <div 
                                                        className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-white/5 transition-colors select-none"
                                                        onClick={() => toggleKitExpansion(kitName)}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
                                                                {isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-white uppercase tracking-wide truncate">
                                                                        {kitName}
                                                                    </span>
                                                                    <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded font-bold">
                                                                        {groupItems.length} Files
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span className="text-xs text-white/40 font-mono">
                                                            {isExpanded ? 'Hide Samples ▲' : 'Show Samples ▼'}
                                                        </span>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="border-t border-white/5 p-3 space-y-2 bg-black/40">
                                                            {groupItems.map(item => renderItemCard(item, true))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* 3. Standalone Items (Samples & Presets) */}
                                        <div className="grid grid-cols-1 gap-2.5">
                                            {standaloneItems.map(item => renderItemCard(item, false))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* MODE 2: STREAMLINED UPLOAD & SAVE CENTER */}
                    {/* ======================================================== */}
                    {viewMode === 'upload' && (
                        <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full custom-scrollbar">
                            <div className="mb-6 text-center">
                                <h3 className="text-xl font-bold text-white mb-1">Upload & Save to Cloud</h3>
                                <p className="text-xs text-white/50">
                                    Upload loops, one-shots, entire sample kits, or save your active slicer layout
                                </p>
                            </div>

                            {/* Upload Type Tabs */}
                            <div className="grid grid-cols-3 gap-2 p-1 bg-black/40 border border-white/10 rounded-xl mb-6">
                                <button
                                    type="button"
                                    onClick={() => setUploadMode('sample')}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                        uploadMode === 'sample' 
                                            ? 'bg-pink-500 text-white shadow-md' 
                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Disc className="w-3.5 h-3.5" />
                                    <span>Single Audio / Loop</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setUploadMode('kit')}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                        uploadMode === 'kit' 
                                            ? 'bg-purple-500 text-white shadow-md' 
                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Package className="w-3.5 h-3.5" />
                                    <span>Sample Kit / Pack</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setUploadMode('preset')}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                        uploadMode === 'preset' 
                                            ? 'bg-cyan-500 text-black shadow-md' 
                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    <Sliders className="w-3.5 h-3.5" />
                                    <span>Current Preset</span>
                                </button>
                            </div>

                            {/* ---------------------------------------------------- */}
                            {/* TAB A: SINGLE SAMPLE / LOOP */}
                            {/* ---------------------------------------------------- */}
                            {uploadMode === 'sample' && (
                                <div className="bg-[#121722] border border-white/10 rounded-2xl p-6 space-y-5 shadow-xl">
                                    {/* File Dropzone */}
                                    <div>
                                        <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-2">
                                            Select Audio File (WAV, MP3, FLAC, AIFF, OGG)
                                        </label>
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                if (files.length > 0) {
                                                    setSingleFiles(files);
                                                    if (!singleTitle) {
                                                        setSingleTitle(files[0].name.replace(/\.[^/.]+$/, ""));
                                                    }
                                                }
                                                e.target.value = '';
                                            }}
                                            className="block w-full text-xs text-white/70 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-pink-500 file:text-white hover:file:bg-pink-400 file:cursor-pointer bg-black/40 border border-white/10 rounded-xl p-2 cursor-pointer"
                                        />
                                        {singleFiles.length > 0 && (
                                            <div className="mt-2 text-xs text-pink-300 flex items-center gap-2">
                                                <Check className="w-3.5 h-3.5" />
                                                <span>Selected: <strong>{singleFiles[0].name}</strong> ({(singleFiles[0].size / 1024 / 1024).toFixed(2)} MB)</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Title */}
                                    <div>
                                        <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-1.5">
                                            Sample / Loop Title
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Vintage 808 Hip Hop Break 90BPM"
                                            value={singleTitle}
                                            onChange={(e) => setSingleTitle(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-pink-500 transition-colors font-medium"
                                        />
                                    </div>

                                    {/* Tag Selector */}
                                    <div>
                                        <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-2">
                                            Audio Category / Tag
                                        </label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {(['loop', 'oneshot', 'stem', 'fx'] as const).map((t) => (
                                                <button
                                                    key={t}
                                                    type="button"
                                                    onClick={() => setSingleTag(t)}
                                                    className={`py-2 text-xs font-bold rounded-lg uppercase tracking-wider border transition-all ${
                                                        singleTag === t 
                                                            ? 'bg-pink-500/20 text-pink-300 border-pink-500/60 shadow-sm' 
                                                            : 'bg-black/30 text-white/50 border-white/5 hover:border-white/20'
                                                    }`}
                                                >
                                                    {t === 'loop' ? 'Loop' : t === 'oneshot' ? 'One-Shot' : t === 'stem' ? 'Stem' : 'FX'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Options & Admin Toggle */}
                                    <div className="pt-2 border-t border-white/5 space-y-3">
                                        <label className="flex items-center gap-3 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={singleIsPublic}
                                                onChange={(e) => setSingleIsPublic(e.target.checked)}
                                                className="w-4 h-4 rounded text-pink-500 bg-black/40 border-white/20 focus:ring-0"
                                            />
                                            <span className="text-xs text-white/80 font-medium">
                                                Share in Community Library (Public)
                                            </span>
                                        </label>

                                        {isAdmin && (
                                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <Sparkles className="w-4 h-4 text-yellow-400" />
                                                    <div>
                                                        <div className="text-xs font-bold text-yellow-300">Admin: Save as Factory Demo Content</div>
                                                        <div className="text-[11px] text-yellow-300/70">Seeds this sample into the official Factory Library for all users.</div>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={singleIsFactory}
                                                    onChange={(e) => setSingleIsFactory(e.target.checked)}
                                                    className="w-4 h-4 rounded text-yellow-500 bg-black/40 border-yellow-500/40 focus:ring-0 cursor-pointer"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        type="button"
                                        onClick={handleUploadSingleSample}
                                        disabled={singleFiles.length === 0 || isUploading}
                                        className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <Upload className="w-4 h-4" />
                                        <span>Upload & Save Sample</span>
                                    </button>
                                </div>
                            )}

                            {/* ---------------------------------------------------- */}
                            {/* TAB B: MULTI-SAMPLE KIT / PACK */}
                            {/* ---------------------------------------------------- */}
                            {uploadMode === 'kit' && (
                                <div className="bg-[#121722] border border-white/10 rounded-2xl p-6 space-y-5 shadow-xl">
                                    {/* Multi-file Dropzone */}
                                    <div>
                                        <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-2">
                                            Select Multiple Audio Files (Up to {MAX_KIT_FILES} samples)
                                        </label>
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            multiple
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                if (files.length > 0) {
                                                    setKitFiles(files);
                                                    if (!kitTitle) {
                                                        setKitTitle("My Sound Kit");
                                                    }
                                                }
                                                e.target.value = '';
                                            }}
                                            className="block w-full text-xs text-white/70 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-500 file:text-white hover:file:bg-purple-400 file:cursor-pointer bg-black/40 border border-white/10 rounded-xl p-2 cursor-pointer"
                                        />
                                        {kitFiles.length > 0 && (
                                            <div className="mt-2 text-xs text-purple-300 flex items-center justify-between">
                                                <span>✓ Selected <strong>{kitFiles.length}</strong> audio files</span>
                                                <span className="text-white/40">Total: {(kitFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)} MB</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Kit Name */}
                                    <div>
                                        <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-1.5">
                                            Kit / Pack Title
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Neo-Soul Trap Kit Vol 1"
                                            value={kitTitle}
                                            onChange={(e) => setKitTitle(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500 transition-colors font-medium"
                                        />
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-1.5">
                                            Description (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 12 punchy acoustic kicks, snares and percussion loops"
                                            value={kitDescription}
                                            onChange={(e) => setKitDescription(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-purple-500 transition-colors"
                                        />
                                    </div>

                                    {/* Kit Options */}
                                    <div className="space-y-3 pt-2 border-t border-white/5">
                                        <label className="flex items-center gap-3 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={kitAutoStitch}
                                                onChange={(e) => setKitAutoStitch(e.target.checked)}
                                                className="w-4 h-4 rounded text-purple-500 bg-black/40 border-white/20 focus:ring-0"
                                            />
                                            <span className="text-xs text-white/80 font-medium">
                                                Auto-create Playable Slice Master Preset (recommended)
                                            </span>
                                        </label>

                                        <label className="flex items-center gap-3 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={kitIsPublic}
                                                onChange={(e) => setKitIsPublic(e.target.checked)}
                                                className="w-4 h-4 rounded text-purple-500 bg-black/40 border-white/20 focus:ring-0"
                                            />
                                            <span className="text-xs text-white/80 font-medium">
                                                Make Kit Public in Community Library
                                            </span>
                                        </label>

                                        {isAdmin && (
                                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <Sparkles className="w-4 h-4 text-yellow-400" />
                                                    <div>
                                                        <div className="text-xs font-bold text-yellow-300">Admin: Save as Factory Demo Kit</div>
                                                        <div className="text-[11px] text-yellow-300/70">Seeds this kit pack into the official Factory Library for demo purposes.</div>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={kitIsFactory}
                                                    onChange={(e) => setKitIsFactory(e.target.checked)}
                                                    className="w-4 h-4 rounded text-yellow-500 bg-black/40 border-yellow-500/40 focus:ring-0 cursor-pointer"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        type="button"
                                        onClick={handleUploadKit}
                                        disabled={kitFiles.length === 0 || !kitTitle.trim() || isUploading}
                                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <Package className="w-4 h-4" />
                                        <span>Create & Upload Kit Pack</span>
                                    </button>
                                </div>
                            )}

                            {/* ---------------------------------------------------- */}
                            {/* TAB C: SAVE CURRENT SLICER PRESET */}
                            {/* ---------------------------------------------------- */}
                            {uploadMode === 'preset' && (
                                <div className="bg-[#121722] border border-white/10 rounded-2xl p-6 space-y-5 shadow-xl">
                                    <div>
                                        <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-1.5">
                                            Preset Title
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Futuristic Cyber Glitch Beat"
                                            value={presetTitle}
                                            onChange={(e) => setPresetTitle(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-cyan-400 transition-colors font-medium"
                                        />
                                    </div>

                                    <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-2 text-xs text-white/60">
                                        <div className="font-bold text-white flex items-center gap-2">
                                            <Sliders className="w-4 h-4 text-cyan-400" />
                                            <span>Current Session Data:</span>
                                        </div>
                                        <div>• Source Audio: <strong>{sampleName || 'Custom Audio'}</strong></div>
                                        <div>• Includes full FX chain, filters, granular parameters, and 32-step sequencer pattern.</div>
                                    </div>

                                    <div className="space-y-3 pt-2 border-t border-white/5">
                                        <label className="flex items-center gap-3 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={presetIsPublic}
                                                onChange={(e) => setPresetIsPublic(e.target.checked)}
                                                className="w-4 h-4 rounded text-cyan-500 bg-black/40 border-white/20 focus:ring-0"
                                            />
                                            <span className="text-xs text-white/80 font-medium">
                                                Share in Community Presets (Public)
                                            </span>
                                        </label>

                                        {isAdmin && (
                                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <Sparkles className="w-4 h-4 text-yellow-400" />
                                                    <div>
                                                        <div className="text-xs font-bold text-yellow-300">Admin: Save as Factory Demo Preset</div>
                                                        <div className="text-[11px] text-yellow-300/70">Seeds this preset into the Factory Presets list for all demo users.</div>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={presetIsFactory}
                                                    onChange={(e) => setPresetIsFactory(e.target.checked)}
                                                    className="w-4 h-4 rounded text-yellow-500 bg-black/40 border-yellow-500/40 focus:ring-0 cursor-pointer"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleSaveCurrentPreset}
                                        disabled={!presetTitle.trim() || isUploading}
                                        className="w-full py-3 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black font-bold text-sm rounded-xl transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <Sliders className="w-4 h-4 text-black" />
                                        <span>Save Slicer Preset to Cloud</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* MODE 3: ADMIN TOOLS & STORAGE PURGE */}
                    {/* ======================================================== */}
                    {viewMode === 'admin' && isAdmin && (
                        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6 custom-scrollbar">
                            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <HardDrive className="w-5 h-5 text-yellow-400" />
                                        <span>Admin Tools & Object Storage</span>
                                    </h3>
                                    <p className="text-xs text-white/50">Manage S3 bucket assets, purge files, and review database status</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleResetDatabase(true)}
                                        disabled={isResettingDb}
                                        className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60 rounded-lg text-xs font-bold transition-colors"
                                        title="Wipe database records to match empty bucket"
                                    >
                                        {isResettingDb ? 'Purging...' : '⚠️ Purge Database (Clean Start)'}
                                    </button>
                                    <button
                                        onClick={loadStorageInfo}
                                        disabled={isLoadingStorage}
                                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStorage ? 'animate-spin' : ''}`} />
                                        <span>Refresh</span>
                                    </button>
                                </div>
                            </div>

                            {storageActionMsg && (
                                <div className={`text-xs px-3.5 py-2.5 rounded-xl border ${storageActionMsg.success ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}`}>
                                    {storageActionMsg.text}
                                </div>
                            )}

                            {/* Bucket Status */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/40 p-4 rounded-xl border border-white/5 text-xs">
                                <div>
                                    <div className="text-[10px] text-white/50 uppercase font-bold">Storage State</div>
                                    <div className="font-mono font-bold text-emerald-400">● S3 Connected</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-white/50 uppercase font-bold">Bucket</div>
                                    <div className="font-mono text-white truncate">{storageStatus?.bucket || 'Default'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-white/50 uppercase font-bold">Region</div>
                                    <div className="font-mono text-white">{storageStatus?.region || 'auto'}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-white/50 uppercase font-bold">Objects</div>
                                    <div className="font-mono text-cyan-400 font-bold">{storageObjects.length} files</div>
                                </div>
                            </div>

                            {/* Direct Purge Input */}
                            <div className="bg-[#121722] p-4 rounded-xl border border-red-500/20 space-y-2">
                                <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Direct Object Purge by Key / URL:</span>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="samples/xyz_kick.wav OR full URL..."
                                        value={manualDeleteTarget}
                                        onChange={(e) => setManualDeleteTarget(e.target.value)}
                                        className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-red-500"
                                    />
                                    <button
                                        onClick={() => {
                                            if (manualDeleteTarget.trim()) {
                                                handleDeleteStorageObject(manualDeleteTarget.trim());
                                                setManualDeleteTarget("");
                                            }
                                        }}
                                        disabled={!manualDeleteTarget.trim() || isDeletingStorage}
                                        className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {isDeletingStorage ? 'Purging...' : 'Purge Object'}
                                    </button>
                                </div>
                            </div>

                            {/* Storage Files List */}
                            <div className="bg-[#121722] p-4 rounded-xl border border-white/10 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white/70 uppercase tracking-wider">
                                        Stored S3 Files ({storageObjects.filter(o => o.key.toLowerCase().includes(storageSearch.toLowerCase())).length})
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Filter files..."
                                        value={storageSearch}
                                        onChange={(e) => setStorageSearch(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1 text-xs text-white outline-none focus:border-cyan-400 w-44"
                                    />
                                </div>

                                <div className="max-h-60 overflow-y-auto bg-black/40 rounded-lg border border-white/5 divide-y divide-white/5 custom-scrollbar">
                                    {isLoadingStorage ? (
                                        <div className="p-4 text-center text-white/40 text-xs italic">Loading storage objects...</div>
                                    ) : storageObjects.length === 0 ? (
                                        <div className="p-4 text-center text-white/40 text-xs italic">No storage files in bucket.</div>
                                    ) : (
                                        storageObjects
                                            .filter(o => o.key.toLowerCase().includes(storageSearch.toLowerCase()))
                                            .map((obj) => (
                                                <div key={obj.key} className="p-2.5 flex items-center justify-between hover:bg-white/5 text-xs gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-mono text-white truncate">{obj.key.split('/').pop() || obj.key}</div>
                                                        <div className="text-[10px] text-white/40 font-mono">{(obj.size / 1024).toFixed(1)} KB</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => togglePreview({ id: obj.key, label: obj.key, type: 'sample', url: obj.url, isPublic: true })}
                                                            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs"
                                                        >
                                                            {previewingId === obj.key ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteStorageObject(obj.key)}
                                                            className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-[11px] rounded"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>

                            {/* Supabase Migration */}
                            <div className="bg-[#121722] p-5 rounded-xl border border-white/10 space-y-4">
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Package className="w-4 h-4 text-cyan-400" />
                                    <span>Supabase Storage to Neon S3 Migration Tool</span>
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <input
                                        type="text"
                                        placeholder="Supabase URL (optional)"
                                        value={supabaseUrlInput}
                                        onChange={(e) => setSupabaseUrlInput(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none"
                                    />
                                    <input
                                        type="password"
                                        autoComplete="off"
                                        placeholder="Service Role / Anon Key"
                                        value={supabaseKeyInput}
                                        onChange={(e) => setSupabaseKeyInput(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Bucket (default: samples)"
                                        value={supabaseBucketInput}
                                        onChange={(e) => setSupabaseBucketInput(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleRunSupabaseMigration}
                                    disabled={isMigrating}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>{isMigrating ? 'Migrating files...' : 'Start Migration to Neon'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default LibraryManager;
