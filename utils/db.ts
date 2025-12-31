
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

export interface DeleteResult {
    success: boolean;
    error?: string;
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

        if (presetError) {
             console.warn("Error fetching presets:", presetError);
        }

        // 2. Fetch Samples
        const { data: samplesRaw, error: sampleError } = await supabase
            .from('samples')
            .select('id, title, url, user_id, is_public, is_factory, profiles(username)')
            .or(filter)
            .order('created_at', { ascending: false });

        if (sampleError) {
            console.warn("Error fetching samples:", sampleError);
        }

        // 3. Process Presets
        const allPresets: CloudItem[] = (presetsRaw as any[] || []).map(p => ({
            id: p.id,
            label: p.name || 'Untitled Preset',
            type: 'preset',
            author: p.profiles?.username || 'Anon',
            _userId: p.user_id,
            isFactory: p.is_factory,
            data: {
                params: p.parameters || {},
                sequencer: p.sequencer_data || { steps: [], stepCount: 16, mode: 'forward' },
                slices: p.slices_data || [],
                sampleUrl: p.samples?.url || '',
                sampleName: p.samples?.title || 'Unknown Sample',
                sampleId: p.sample_id
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
        const factoryPresets = allPresets.filter(p => p.isFactory);
        const factorySamples = allSamples.filter(s => s.isFactory);

        const userPresets = userId ? allPresets.filter((p: any) => p._userId === userId && !p.isFactory) : [];
        const userSamples = userId ? allSamples.filter((s: any) => s._userId === userId && !s.isFactory) : [];

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

    } catch (e: any) {
        const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
        console.error("Critical error fetching library:", msg);
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
    isFactory: boolean = false,
    isPublic: boolean = false
): Promise<boolean> => {
    if (!supabase) return false;

    try {
        const { error } = await supabase.from('presets').insert({
            user_id: userId,
            name: name,
            parameters: params,
            sequencer_data: sequencer,
            slices_data: slices,
            sample_id: sampleId,
            is_public: isPublic,
            is_factory: isFactory
        });

        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error saving preset:", e);
        return false;
    }
};

// --- Deletion & Helpers ---

const getStoragePathFromUrl = (fullUrl: string): string | null => {
    try {
        const marker = '/audio-assets/';
        if (fullUrl.includes(marker)) {
            const parts = fullUrl.split(marker);
            if (parts.length > 1) return decodeURIComponent(parts[1]);
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const updateSampleTitle = async (id: string, newTitle: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error } = await supabase
            .from('samples')
            .update({ title: newTitle })
            .eq('id', id);
        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error updating sample title:", e);
        return false;
    }
};

export const deleteCloudPreset = async (id: string): Promise<DeleteResult> => {
    if (!supabase) return { success: false, error: "Database not configured" };
    try {
        const { error, count } = await supabase
            .from('presets')
            .delete({ count: 'exact' })
            .eq('id', id);

        if (error) throw error;

        if (count === null || count === 0) {
            return { success: false, error: "Permission Denied or Not Found. (Row count: 0)" };
        }
        
        return { success: true };
    } catch (e: any) {
        console.error("Error deleting preset:", e);
        return { success: false, error: e.message || "Unknown error" };
    }
};

export const deleteCloudSample = async (id: string, url?: string): Promise<DeleteResult> => {
    if (!supabase) return { success: false, error: "Database not configured" };
    
    let dbSuccess = false;
    let storageSuccess = false;
    let errors: string[] = [];

    if (url) {
        const storagePath = getStoragePathFromUrl(url);
        if (storagePath) {
            const { error: storageError } = await supabase.storage
                .from('audio-assets')
                .remove([storagePath]);
            
            if (storageError) {
                console.warn("Storage delete failed:", storageError.message);
            } else {
                storageSuccess = true;
            }
        }
    }

    try {
        const { error, count } = await supabase
            .from('samples')
            .delete({ count: 'exact' })
            .eq('id', id);

        if (error) {
            if (error.code === '23503') { 
                throw new Error("Cannot delete: This sample is used by existing presets.");
            }
            throw error;
        }

        if (count !== null && count > 0) {
            dbSuccess = true;
        } else {
             errors.push("Database Permission Denied (0 rows)");
        }
    } catch (e: any) {
        errors.push(e.message || "DB Error");
    }

    if (dbSuccess) return { success: true };

    return { 
        success: false, 
        error: errors.join(", ") 
    };
};

export const deleteBulkPresets = async (ids: string[]): Promise<boolean> => {
    if (!supabase || ids.length === 0) return false;
    try {
        const { error, count } = await supabase
            .from('presets')
            .delete({ count: 'exact' })
            .in('id', ids);
            
        if (error) throw error;
        return !!count && count > 0;
    } catch (e) {
        console.error("Error bulk deleting presets:", e);
        return false;
    }
};

export const deleteBulkSamples = async (ids: string[]): Promise<boolean> => {
    if (!supabase || ids.length === 0) return false;
    try {
        const { error, count } = await supabase
            .from('samples')
            .delete({ count: 'exact' })
            .in('id', ids);

        if (error) throw error;
        return !!count && count > 0;
    } catch (e) {
        console.error("Error bulk deleting samples:", e);
        return false;
    }
};

// --- Storage ---

export const uploadSampleToCloud = async (
    file: File | Blob, 
    fileName: string, 
    userId: string, 
    isFactory: boolean = false,
    kitName?: string,
    isPublic: boolean = false
): Promise<{ publicUrl: string, id: string } | null> => {
    if (!supabase) {
        console.error("Supabase not initialized");
        return null;
    }

    try {
        const prefix = isFactory ? 'factory' : userId;
        const cleanName = fileName.replace(/[^a-z0-9.]/gi, '_');
        
        let storagePath = '';
        let title = fileName;

        if (kitName) {
            const cleanKitName = kitName.replace(/[^a-z0-9.]/gi, '_');
            storagePath = `${prefix}/kits/${cleanKitName}/${cleanName}`;
            title = `${kitName} - ${fileName}`;
        } else {
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            storagePath = `${prefix}/${Date.now()}_${randomSuffix}_${cleanName}`;
        }

        console.log(`[Upload] Starting storage upload for ${fileName} to ${storagePath}`);

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('audio-assets')
            .upload(storagePath, file, {
                upsert: true
            });

        if (uploadError) {
            console.error("[Upload] Storage Error:", uploadError.message);
            throw uploadError;
        }

        const { data } = supabase.storage.from('audio-assets').getPublicUrl(storagePath);
        const publicUrl = data.publicUrl;

        // Create Database Entry
        const { data: sampleData, error: dbError } = await supabase.from('samples').insert({
            user_id: userId,
            title: title,
            url: publicUrl,
            is_public: isPublic || isFactory,
            is_factory: isFactory
        }).select('id').single();

        if (dbError) {
            console.error("[Upload] Database Insert Error:", dbError.message);
            throw dbError;
        }

        return { publicUrl, id: sampleData.id };
    } catch (e) {
        console.error("[Upload] Critical Error uploading sample:", e);
        return null;
    }
};
