
import { supabase } from './supabaseClient';
import type { Preset, AllParams, SequencerState, Slice } from '../types';

export interface CloudItem {
    id: string;
    label: string;
    type: 'preset' | 'sample' | 'kit';
    data?: any;
    url?: string;
    author?: string;
}

export interface LibraryData {
    publicPresets: CloudItem[];
    publicSamples: CloudItem[];
    userPresets: CloudItem[];
    userSamples: CloudItem[];
}

// --- Fetching ---

export const fetchLibrary = async (userId?: string): Promise<LibraryData> => {
    if (!supabase) return { publicPresets: [], publicSamples: [], userPresets: [], userSamples: [] };

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
            label: p.name,
            type: 'preset',
            author: p.profiles?.username || 'Anon',
            // Helper property to check ownership
            _userId: p.user_id,
            data: {
                params: p.parameters,
                sequencer: p.sequencer_data,
                slices: p.slices_data,
                sampleUrl: p.samples?.url,
                sampleName: p.samples?.title
            }
        }));

        // 4. Process Samples
        const allSamples: CloudItem[] = (samplesRaw as any[] || []).map(s => ({
            id: s.id,
            label: s.title,
            type: 'sample',
            url: s.url,
            author: s.profiles?.username || 'Anon',
            _userId: s.user_id,
        }));

        // 5. Categorize
        // "User" items are those created by the current user
        // "Public" items are those created by others (or factory) that are public
        
        const userPresets = userId ? allPresets.filter((p: any) => p._userId === userId) : [];
        const publicPresets = allPresets.filter((p: any) => !userId || p._userId !== userId);

        const userSamples = userId ? allSamples.filter((s: any) => s._userId === userId) : [];
        const publicSamples = allSamples.filter((s: any) => !userId || s._userId !== userId);

        return {
            userPresets,
            publicPresets,
            userSamples,
            publicSamples
        };

    } catch (e) {
        console.error("Error fetching library:", e);
        return { publicPresets: [], publicSamples: [], userPresets: [], userSamples: [] };
    }
};

// --- Saving ---

export const saveCloudPreset = async (
    name: string,
    params: AllParams,
    sequencer: any,
    slices: Slice[],
    userId: string,
    sampleId?: string
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
            is_public: false, // Private by default
            is_factory: false
        });

        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error saving preset:", e);
        return false;
    }
};

// --- Storage ---

export const uploadSampleToCloud = async (file: File | Blob, fileName: string, userId: string): Promise<{ publicUrl: string, id: string } | null> => {
    if (!supabase) return null;

    try {
        const fileExt = fileName.split('.').pop() || 'wav';
        const storagePath = `${userId}/${Date.now()}.${fileExt}`;

        // 1. Upload to Storage
        const { error: uploadError } = await supabase.storage
            .from('audio-assets')
            .upload(storagePath, file);

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data } = supabase.storage.from('audio-assets').getPublicUrl(storagePath);
        const publicUrl = data.publicUrl;

        // 3. Insert Record
        const { data: sampleData, error: dbError } = await supabase.from('samples').insert({
            user_id: userId,
            title: fileName,
            url: publicUrl,
            is_public: false,
            is_factory: false
        }).select('id').single();

        if (dbError) throw dbError;

        return { publicUrl, id: sampleData.id };
    } catch (e) {
        console.error("Error uploading sample:", e);
        return null;
    }
};
