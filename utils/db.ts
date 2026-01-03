
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
    isPublic?: boolean;
    _userId?: string;
}

export interface FeedbackItem {
    id: string;
    user_id: string;
    message: string;
    category: 'bug' | 'feature' | 'other';
    created_at: string;
    profiles?: { username: string; email?: string }; // Joined data
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
        // We split the query into two parts to ensure robust fetching regardless of complex OR filter limitations or RLS quirks on mixed conditions.
        
        // 1. Fetch Public & Factory Items (Visible to everyone)
        const publicPresetsPromise = supabase
            .from('presets')
            .select(`
                id, name, user_id, parameters, sequencer_data, slices_data, sample_id, is_public, is_factory, created_at,
                profiles(username),
                samples(url, title)
            `)
            .or('is_public.eq.true,is_factory.eq.true')
            .order('created_at', { ascending: false });

        const publicSamplesPromise = supabase
            .from('samples')
            .select('id, title, url, user_id, is_public, is_factory, profiles(username)')
            .or('is_public.eq.true,is_factory.eq.true')
            .order('created_at', { ascending: false });

        // 2. Fetch User Items (If logged in) - Explicitly fetch by user_id to guarantee owner visibility
        let userPresetsPromise = Promise.resolve({ data: [], error: null } as any);
        let userSamplesPromise = Promise.resolve({ data: [], error: null } as any);

        if (userId) {
            userPresetsPromise = supabase
                .from('presets')
                .select(`
                    id, name, user_id, parameters, sequencer_data, slices_data, sample_id, is_public, is_factory, created_at,
                    profiles(username),
                    samples(url, title)
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            userSamplesPromise = supabase
                .from('samples')
                .select('id, title, url, user_id, is_public, is_factory, profiles(username)')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
        }

        const [publicPresetsRes, publicSamplesRes, userPresetsRes, userSamplesRes] = await Promise.all([
            publicPresetsPromise,
            publicSamplesPromise,
            userPresetsPromise,
            userSamplesPromise
        ]);

        if (publicPresetsRes.error) console.warn("Public Presets Error:", publicPresetsRes.error);
        if (userPresetsRes.error) console.warn("User Presets Error:", userPresetsRes.error);

        // Helper to map DB row to CloudItem
        const mapPreset = (p: any): CloudItem => ({
            id: p.id,
            label: p.name || 'Untitled Preset',
            type: 'preset',
            author: p.profiles?.username || (p.user_id ? `User ${p.user_id.slice(0,6)}` : 'Anon'),
            _userId: p.user_id,
            isFactory: p.is_factory,
            isPublic: p.is_public,
            data: {
                params: p.parameters || {},
                sequencer: p.sequencer_data || { steps: [], stepCount: 16, mode: 'forward' },
                slices: p.slices_data || [],
                sampleUrl: p.samples?.url || '',
                sampleName: p.samples?.title || 'Unknown Sample',
                sampleId: p.sample_id
            }
        });

        const mapSample = (s: any): CloudItem => ({
            id: s.id,
            label: s.title || 'Untitled Sample',
            type: 'sample',
            url: s.url,
            author: s.profiles?.username || (s.user_id ? `User ${s.user_id.slice(0,6)}` : 'Anon'),
            _userId: s.user_id,
            isFactory: s.is_factory,
            isPublic: s.is_public
        });

        // Combine and Deduplicate
        // Use a Map to ensure unique items by ID (if an item is both Public AND Mine, it appears in both queries)
        const presetMap = new Map<string, CloudItem>();
        (publicPresetsRes.data || []).forEach((p: any) => presetMap.set(p.id, mapPreset(p)));
        (userPresetsRes.data || []).forEach((p: any) => presetMap.set(p.id, mapPreset(p)));

        const sampleMap = new Map<string, CloudItem>();
        (publicSamplesRes.data || []).forEach((s: any) => sampleMap.set(s.id, mapSample(s)));
        (userSamplesRes.data || []).forEach((s: any) => sampleMap.set(s.id, mapSample(s)));

        const allPresets = Array.from(presetMap.values());
        const allSamples = Array.from(sampleMap.values());

        // 5. Categorize for UI
        const factoryPresets = allPresets.filter(p => p.isFactory);
        const factorySamples = allSamples.filter(s => s.isFactory);

        // User lists contain items OWNED by the user (excluding factory items they might own technically, though rare)
        const userPresets = userId ? allPresets.filter(p => p._userId === userId && !p.isFactory) : [];
        const userSamples = userId ? allSamples.filter(s => s._userId === userId && !s.isFactory) : [];

        // Public lists contain items NOT factory, and NOT owned by current user (to avoid duplication in the UI lists)
        const publicPresets = allPresets.filter(p => !p.isFactory && (!userId || p._userId !== userId));
        const publicSamples = allSamples.filter(s => !s.isFactory && (!userId || s._userId !== userId));

        return {
            userPresets,
            publicPresets,
            factoryPresets,
            userSamples,
            publicSamples,
            factorySamples
        };

    } catch (e: any) {
        console.error("Critical error fetching library:", e);
        return { publicPresets: [], publicSamples: [], userPresets: [], userSamples: [], factoryPresets: [], factorySamples: [] };
    }
};

// --- Feedback ---

export const submitFeedback = async (userId: string | undefined, message: string, category: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabase) return { success: false, error: "Database not configured" };
    try {
        const { error } = await supabase.from('feedback').insert({
            user_id: userId || null, // Allow anonymous feedback if table supports nullable
            message,
            category
        });
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error("Error submitting feedback:", e.message || e);
        return { success: false, error: e.message || "Unknown database error" };
    }
};

export const fetchAllFeedback = async (): Promise<FeedbackItem[]> => {
    if (!supabase) return [];
    try {
        const { data, error } = await supabase
            .from('feedback')
            .select(`
                id, user_id, message, category, created_at,
                profiles ( username )
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data as unknown as FeedbackItem[];
    } catch (e) {
        console.error("Error fetching feedback:", e);
        return [];
    }
};

// --- Saving & Updating ---

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
            is_public: isPublic || isFactory, // Force public if factory
            is_factory: isFactory
        });

        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error saving preset:", e);
        return false;
    }
};

export const updateCloudPreset = async (
    id: string,
    name: string,
    params: AllParams,
    sequencer: any,
    slices: Slice[],
    isPublic: boolean
): Promise<boolean> => {
    if (!supabase) return false;

    try {
        const { error } = await supabase
            .from('presets')
            .update({
                name: name,
                parameters: params,
                sequencer_data: sequencer,
                slices_data: slices,
                is_public: isPublic,
                created_at: new Date().toISOString() // Update timestamp
            })
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error updating preset:", e);
        return false;
    }
};

export const renameCloudItem = async (type: 'preset' | 'sample' | 'kit', id: string, newName: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const table = type === 'preset' ? 'presets' : 'samples';
        const col = type === 'preset' ? 'name' : 'title';
        
        const { error } = await supabase
            .from(table)
            .update({ [col]: newName })
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (e) {
        console.error(`Error renaming ${type}:`, e);
        return false;
    }
}

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
    
    // IMPORTANT: Delete from Database FIRST.
    // If DB delete fails (e.g. Constraint Error because a Preset uses this Sample),
    // we MUST NOT delete the file from Storage.
    // If DB delete succeeds, the row is gone, so safe to remove file.

    let dbSuccess = false;

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
             return { success: false, error: "Database Permission Denied or Item Not Found" };
        }
    } catch (e: any) {
        return { success: false, error: e.message || "DB Error" };
    }

    // Database row deleted successfully, now clean up storage
    if (dbSuccess && url) {
        const storagePath = getStoragePathFromUrl(url);
        if (storagePath) {
            const { error: storageError } = await supabase.storage
                .from('audio-assets')
                .remove([storagePath]);
            
            if (storageError) {
                console.warn("Storage delete failed (Orphaned file):", storageError.message);
                // We still return success for the operation because the item is removed from the user's library view
            }
        }
    }

    return { success: true };
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
                upsert: true,
                contentType: 'audio/wav', // Explicitly force WAV content type for predictable playback
                cacheControl: '3600'
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
