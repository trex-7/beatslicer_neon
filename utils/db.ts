
import { supabase } from './supabaseClient';
import type { Preset, AllParams, SequencerState, Slice } from '../types';

export interface CloudItem {
    id: string;
    label: string;
    type: 'preset' | 'sample' | 'kit';
    data?: any;
    url?: string;
    author?: string;
    isFactory?: boolean;
    _userId?: string;
}

export interface LibraryData {
    publicPresets: CloudItem[];
    publicSamples: CloudItem[];
    userPresets: CloudItem[];
    userSamples: CloudItem[];
    factoryPresets: CloudItem[];
    factorySamples: CloudItem[];
}

// --- Fetching ---

export const fetchLibrary = async (userId?: string): Promise<LibraryData> => {
    if (!supabase) return { publicPresets: [], publicSamples: [], userPresets: [], userSamples: [], factoryPresets: [], factorySamples: [] };

    try {
        // Construct filter: Public/Factory OR Owned by User
        const filter = userId 
            ? `is_public.eq.true,is_factory.eq.true,user_id.eq.${userId}` 
            : `is_public.eq.true,is_factory.eq.true`;

        // 1. Fetch Presets
        const { data: presetsRaw, error: presetError } = await supabase
            .from('presets')
            .select(`
                id, 
                name, 
                user_id, 
                parameters, 
                sequencer_data, 
                slices_data, 
                sample_id,
                is_public,
                is_factory,
                created_at,
                profiles(username),
                samples(url, title)
            `)
            .or(filter)
            .order('created_at', { ascending: false });

        if (presetError) throw presetError;

        // 2. Fetch Samples
        const { data: samplesRaw, error: sampleError } = await supabase
            .from('samples')
            .select('id, title, url, user_id, is_public, is_factory, profiles(username)')
            .or(filter)
            .order('created_at', { ascending: false });

        if (sampleError) throw sampleError;

        // 3. Process Presets
        const allPresets: CloudItem[] = (presetsRaw as any[] || []).map(p => ({
            id: p.id,
            label: p.name || 'Untitled Preset',
            type: 'preset',
            author: p.profiles?.username || 'Anon',
            // Helper property to check ownership
            _userId: p.user_id,
            isFactory: p.is_factory,
            data: {
                // FALLBACKS ADDED HERE TO PREVENT CRASHES
                params: p.parameters || {},
                sequencer: p.sequencer_data || { steps: [], stepCount: 16, mode: 'forward' },
                slices: p.slices_data || [],
                sampleUrl: p.samples?.url || '',
                sampleName: p.samples?.title || 'Unknown Sample'
            }
        }));

        // 4. Process Samples
        const allSamples: CloudItem[] = (samplesRaw as any[] || []).map(s => ({
            id: s.id,
            label: s.title || 'Untitled Sample',
            type: 'sample',
            url: s.url,
            author: s.profiles?.username || 'Anon',
            _userId: s.user_id,
            isFactory: s.is_factory
        }));

        // 5. Categorize
        
        // Factory Content (Global)
        const factoryPresets = allPresets.filter(p => p.isFactory);
        const factorySamples = allSamples.filter(s => s.isFactory);

        // User Content (Private)
        const userPresets = userId ? allPresets.filter((p: any) => p._userId === userId && !p.isFactory) : [];
        const userSamples = userId ? allSamples.filter((s: any) => s._userId === userId && !s.isFactory) : [];

        // Community Content (Public but not Factory, and not mine)
        const publicPresets = allPresets.filter((p: any) => !p.isFactory && (!userId || p._userId !== userId));
        const publicSamples = allSamples.filter((s: any) => !s.isFactory && (!userId || s._userId !== userId));

        return {
            userPresets,
            publicPresets,
            factoryPresets,
            userSamples,
            publicSamples,
            factorySamples
        };

    } catch (e) {
        console.error("Error fetching library:", e);
        return { publicPresets: [], publicSamples: [], userPresets: [], userSamples: [], factoryPresets: [], factorySamples: [] };
    }
};

// --- Saving ---

export const saveCloudPreset = async (
    name: string,
    params: AllParams,
    sequencer: any,
    slices: Slice[],
    userId: string,
    sampleId?: string,
    isFactory: boolean = false
): Promise<boolean> => {
    if (!supabase) return false;

    try {
        const { error } = await supabase.from('presets').insert({
            user_id: userId,
            name: name,
            parameters: params,
            sequencer_data: sequencer,
            slices_data: slices,
            sample_id: sampleId, // Link to the audio file
            is_public: isFactory, // Factory presets are public by default
            is_factory: isFactory
        });

        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error saving preset:", e);
        return false;
    }
};

// --- Deletion ---

export const deleteCloudPreset = async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error, count } = await supabase.from('presets').delete({ count: 'exact' }).eq('id', id);
        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error deleting preset:", e);
        return false;
    }
};

export const deleteCloudSample = async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error, count } = await supabase.from('samples').delete({ count: 'exact' }).eq('id', id);
        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error deleting sample:", e);
        return false;
    }
};

export const deleteBulkPresets = async (ids: string[]): Promise<boolean> => {
    if (!supabase || ids.length === 0) return false;
    try {
        const { error, count } = await supabase.from('presets').delete({ count: 'exact' }).in('id', ids);
        if (error) throw error;
        console.log(`Deleted ${count} presets`);
        return true;
    } catch (e) {
        console.error("Error bulk deleting presets:", e);
        return false;
    }
};

export const deleteBulkSamples = async (ids: string[]): Promise<boolean> => {
    if (!supabase || ids.length === 0) return false;
    try {
        const { error, count } = await supabase.from('samples').delete({ count: 'exact' }).in('id', ids);
        if (error) throw error;
        console.log(`Deleted ${count} samples`);
        return true;
    } catch (e) {
        console.error("Error bulk deleting samples:", e);
        return false;
    }
};


// --- Storage ---

export const uploadSampleToCloud = async (file: File | Blob, fileName: string, userId: string, isFactory: boolean = false): Promise<{ publicUrl: string, id: string } | null> => {
    if (!supabase) {
        console.error("Supabase not initialized");
        return null;
    }

    try {
        // Create unique path to prevent collisions
        // e.g. factory/1700000_abcd_filename.wav
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const prefix = isFactory ? 'factory' : userId;
        const cleanName = fileName.replace(/[^a-z0-9.]/gi, '_');
        const storagePath = `${prefix}/${Date.now()}_${randomSuffix}_${cleanName}`;

        console.log(`[Upload] Starting storage upload for ${fileName} to ${storagePath}`);

        // 1. Upload to Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('audio-assets')
            .upload(storagePath, file);

        if (uploadError) {
            console.error("[Upload] Storage Error:", uploadError.message);
            throw uploadError;
        }

        // 2. Get Public URL
        const { data } = supabase.storage.from('audio-assets').getPublicUrl(storagePath);
        const publicUrl = data.publicUrl;

        console.log(`[Upload] File stored. Public URL: ${publicUrl}`);

        // 3. Insert Record
        const { data: sampleData, error: dbError } = await supabase.from('samples').insert({
            user_id: userId,
            title: fileName,
            url: publicUrl,
            is_public: isFactory, // Factory samples are public by default
            is_factory: isFactory
        }).select('id').single();

        if (dbError) {
            console.error("[Upload] Database Insert Error:", dbError.message);
            throw dbError;
        }

        console.log(`[Upload] Success! Sample ID: ${sampleData.id}`);
        return { publicUrl, id: sampleData.id };
    } catch (e) {
        console.error("[Upload] Critical Error uploading sample:", e);
        return null;
    }
};
