<<<<<<< HEAD
import { getStoredAuthToken } from '../src/lib/neon-auth';
import type { AllParams, Slice } from '../types';

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
  description?: string;
  imageUrl?: string;
}

export interface FeedbackItem {
  id: string;
  user_id: string;
  message: string;
  category: 'bug' | 'feature' | 'other';
  created_at: string;
  profiles?: { username: string; email?: string };
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

// Helper to get auth header
async function getAuthHeader(): Promise<Record<string, string>> {
  const token = getStoredAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
=======

import { supabase } from './supabaseClient';
import type { Preset, AllParams, SequencerState, Slice } from '../types';

export interface CloudItem {
    id: string;
    label: string;
    type: 'preset' | 'sample' | 'kit';
    data?: any; // For kits, this can contain { items: CloudItem[] }
    url?: string;
    author?: string;
    isFactory?: boolean;
    isPublic?: boolean;
    _userId?: string;
    description?: string;
    imageUrl?: string;
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
>>>>>>> old-slicer/ai-beat-patterns
}

// --- Fetching ---

<<<<<<< HEAD
export const fetchLibrary = async (_userId?: string): Promise<LibraryData> => {
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/library', {
      headers: {
        ...authHeaders,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch library: ${res.statusText}`);
    }

    const data: LibraryData = await res.json();
    return data;
  } catch (e: any) {
    console.error('Critical error fetching library from server:', e);
    return {
      publicPresets: [],
      publicSamples: [],
      userPresets: [],
      userSamples: [],
      factoryPresets: [],
      factorySamples: [],
    };
  }
=======
export const fetchLibrary = async (userId?: string): Promise<LibraryData> => {
    if (!supabase) return { publicPresets: [], publicSamples: [], userPresets: [], userSamples: [], factoryPresets: [], factorySamples: [] };

    try {
        // 1. Fetch Presets (Public/Factory)
        const publicPresetsPromise = supabase
            .from('presets')
            .select(`
                id, name, user_id, parameters, sequencer_data, slices_data, sample_id, is_public, is_factory, created_at,
                profiles(username),
                samples(url, title)
            `)
            .or('is_public.eq.true,is_factory.eq.true')
            .order('created_at', { ascending: false });

        // 2. Fetch Samples (Public/Factory)
        const publicSamplesPromise = supabase
            .from('samples')
            .select('id, title, url, user_id, is_public, is_factory, profiles(username)')
            .or('is_public.eq.true,is_factory.eq.true')
            .order('created_at', { ascending: false });

        // 3. Fetch Kits (Public/Factory) with nested samples
        const publicKitsPromise = supabase
            .from('kits')
            .select(`
                id, name, description, cover_image_url, user_id, is_public, is_factory, created_at, profiles(username),
                kit_samples (
                    sample:samples (id, title, url, user_id, is_public, is_factory)
                )
            `)
            .or('is_public.eq.true,is_factory.eq.true')
            .order('created_at', { ascending: false });

        // 4. User Items (If logged in)
        let userPresetsPromise = Promise.resolve({ data: [], error: null } as any);
        let userSamplesPromise = Promise.resolve({ data: [], error: null } as any);
        let userKitsPromise = Promise.resolve({ data: [], error: null } as any);

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

            userKitsPromise = supabase
                .from('kits')
                .select(`
                    id, name, description, cover_image_url, user_id, is_public, is_factory, created_at, profiles(username),
                    kit_samples (
                        sample:samples (id, title, url, user_id, is_public, is_factory)
                    )
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
        }

        const [publicPresetsRes, publicSamplesRes, publicKitsRes, userPresetsRes, userSamplesRes, userKitsRes] = await Promise.all([
            publicPresetsPromise,
            publicSamplesPromise,
            publicKitsPromise,
            userPresetsPromise,
            userSamplesPromise,
            userKitsPromise
        ]);

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

        const mapKit = (k: any): CloudItem => {
            // Map the nested join structure back to flat CloudItems for the kit children
            const children = (k.kit_samples || [])
                .map((ks: any) => ks.sample)
                .filter((s: any) => !!s)
                .map((s: any) => mapSample(s));

            return {
                id: k.id,
                label: k.name,
                type: 'kit',
                author: k.profiles?.username || 'Anon',
                _userId: k.user_id,
                isFactory: k.is_factory,
                isPublic: k.is_public,
                description: k.description,
                imageUrl: k.cover_image_url,
                data: { items: children }
            };
        };

        // Combine and Deduplicate
        const presetMap = new Map<string, CloudItem>();
        (publicPresetsRes.data || []).forEach((p: any) => presetMap.set(p.id, mapPreset(p)));
        (userPresetsRes.data || []).forEach((p: any) => presetMap.set(p.id, mapPreset(p)));

        const sampleMap = new Map<string, CloudItem>();
        (publicSamplesRes.data || []).forEach((s: any) => sampleMap.set(s.id, mapSample(s)));
        (userSamplesRes.data || []).forEach((s: any) => sampleMap.set(s.id, mapSample(s)));

        const kitMap = new Map<string, CloudItem>();
        (publicKitsRes.data || []).forEach((k: any) => kitMap.set(k.id, mapKit(k)));
        (userKitsRes.data || []).forEach((k: any) => kitMap.set(k.id, mapKit(k)));

        const allPresets = Array.from(presetMap.values());
        const allSamples = Array.from(sampleMap.values());
        const allKits = Array.from(kitMap.values());

        // Categorize
        const factoryPresets = allPresets.filter(p => p.isFactory);
        const factorySamples = [...allKits.filter(k => k.isFactory), ...allSamples.filter(s => s.isFactory)];

        const userPresets = userId ? allPresets.filter(p => p._userId === userId && !p.isFactory) : [];
        const userSamples = userId ? [...allKits.filter(k => k._userId === userId && !k.isFactory), ...allSamples.filter(s => s._userId === userId && !s.isFactory)] : [];

        const publicPresets = allPresets.filter(p => !p.isFactory && (!userId || p._userId !== userId));
        const publicSamples = [...allKits.filter(k => !k.isFactory && (!userId || k._userId !== userId)), ...allSamples.filter(s => !s.isFactory && (!userId || s._userId !== userId))];

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
>>>>>>> old-slicer/ai-beat-patterns
};

// --- Kit Management ---

<<<<<<< HEAD
export const createKit = async (
  userId: string,
  kitName: string,
  isFactory: boolean,
  isPublic: boolean,
  description: string = '',
  coverImageUrl: string = ''
): Promise<string | null> => {
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/kits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        name: kitName,
        description,
        coverImageUrl,
        isFactory,
        isPublic,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create kit');
    }

    const kit = await res.json();
    return kit.id;
  } catch (e: any) {
    console.error('Error creating kit:', e);
    throw e;
  }
};

export const linkSamplesToKit = async (kitId: string, sampleIds: string[]): Promise<boolean> => {
  if (!sampleIds.length) return true;
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch(`/api/kits/${kitId}/samples`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ sampleIds }),
    });

    if (!res.ok) {
      throw new Error('Failed to link samples to kit');
    }

    return true;
  } catch (e) {
    console.error('Error linking samples to kit:', e);
    throw e;
  }
};

// --- Feedback ---

export const submitFeedback = async (
  userId: string | undefined,
  message: string,
  category: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        message,
        category,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'Database error' };
    }

    return { success: true };
  } catch (e: any) {
    console.error('Error submitting feedback:', e);
    return { success: false, error: e.message || 'Unknown database error' };
  }
};

export const fetchAllFeedback = async (): Promise<FeedbackItem[]> => {
  try {
    const res = await fetch('/api/feedback');
    if (!res.ok) throw new Error('Failed to fetch feedback');
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Error fetching feedback:', e);
    return [];
  }
=======
export const createKit = async (userId: string, kitName: string, isFactory: boolean, isPublic: boolean, description: string = "", coverImageUrl: string = ""): Promise<string | null> => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from('kits').insert({
            user_id: userId,
            name: kitName, 
            description: description || null,
            cover_image_url: coverImageUrl || null,
            is_factory: isFactory,
            is_public: isPublic || isFactory
        }).select('id').single();

        if (error) {
            console.error("Supabase Create Kit Error:", error);
            if (error.code === '42501') {
                throw new Error("Permission Denied (RLS). Please run the SQL Fix in README.md on your Supabase dashboard.");
            }
            throw new Error(error.message || "Database Error");
        }
        return data.id;
    } catch (e: any) {
        // Re-throw so the UI can alert the specific message
        console.error("Error creating kit:", e);
        throw e;
    }
}

export const linkSamplesToKit = async (kitId: string, sampleIds: string[]): Promise<boolean> => {
    if (!supabase || sampleIds.length === 0) return true;
    try {
        const rows = sampleIds.map(sid => ({ kit_id: kitId, sample_id: sid }));
        const { error } = await supabase.from('kit_samples').insert(rows);
        if (error) {
            console.error("Link Samples Error:", error);
            throw error;
        }
        return true;
    } catch (e) {
        console.error("Error linking samples to kit:", e);
        throw e;
    }
}

// --- Feedback ---

export const submitFeedback = async (userId: string | undefined, message: string, category: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabase) return { success: false, error: "Database not configured" };
    try {
        const { error } = await supabase.from('feedback').insert({
            user_id: userId || null, 
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
>>>>>>> old-slicer/ai-beat-patterns
};

// --- Saving & Updating ---

export const saveCloudPreset = async (
<<<<<<< HEAD
  name: string,
  params: AllParams,
  sequencer: any,
  slices: Slice[],
  userId: string,
  sampleId?: string,
  isFactory: boolean = false,
  isPublic: boolean = false
): Promise<boolean> => {
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        name,
        parameters: params,
        sequencerData: sequencer,
        slicesData: slices,
        sampleId,
        isFactory,
        isPublic: isPublic || isFactory,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Save preset failed:', err);
      return false;
    }

    return true;
  } catch (e) {
    console.error('Error saving preset:', e);
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
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch(`/api/presets/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        name,
        parameters: params,
        sequencerData: sequencer,
        slicesData: slices,
        isPublic,
      }),
    });

    if (!res.ok) {
      return false;
    }

    return true;
  } catch (e) {
    console.error('Error updating preset:', e);
    return false;
  }
};

export const renameCloudItem = async (
  type: 'preset' | 'sample' | 'kit',
  id: string,
  newName: string
): Promise<boolean> => {
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch(`/api/items/${type}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ name: newName }),
    });

    if (!res.ok) return false;
    return true;
  } catch (e) {
    console.error(`Error renaming ${type}:`, e);
    return false;
  }
};

// --- Deletion & Helpers ---

export const deleteCloudPreset = async (id: string): Promise<DeleteResult> => {
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch(`/api/presets/${id}`, {
      method: 'DELETE',
      headers: {
        ...authHeaders,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'Failed to delete preset' };
    }

    return { success: true };
  } catch (e: any) {
    console.error('Error deleting preset:', e);
    return { success: false, error: e.message || 'Unknown error' };
  }
};

export const deleteCloudSample = async (id: string, url?: string): Promise<DeleteResult> => {
  try {
    const authHeaders = await getAuthHeader();
    const res = await fetch(`/api/samples/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'Failed to delete sample' };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'DB Error' };
  }
=======
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
            is_public: isPublic || isFactory,
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
                created_at: new Date().toISOString()
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
        const table = type === 'preset' ? 'presets' : (type === 'kit' ? 'kits' : 'samples');
        // Preset and Kit use 'name', samples use 'title'
        const column = (type === 'preset' || type === 'kit') ? 'name' : 'title';
        
        const { error } = await supabase
            .from(table)
            .update({ [column]: newName })
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
    
    let dbSuccess = false;

    try {
        const { error, count } = await supabase
            .from('samples')
            .delete({ count: 'exact' })
            .eq('id', id);

        if (error) {
            if (error.code === '23503') { 
                throw new Error("Cannot delete: This sample is used by existing presets or kits.");
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

    if (dbSuccess && url) {
        const storagePath = getStoragePathFromUrl(url);
        if (storagePath) {
            const { error: storageError } = await supabase.storage
                .from('audio-assets')
                .remove([storagePath]);
            
            if (storageError) {
                console.warn("Storage delete failed (Orphaned file):", storageError.message);
            }
        }
    }

    return { success: true };
>>>>>>> old-slicer/ai-beat-patterns
};

// --- Storage ---

export const uploadSampleToCloud = async (
<<<<<<< HEAD
  file: File | Blob,
  fileName: string,
  userId: string,
  isFactory: boolean = false,
  kitName?: string,
  isPublic: boolean = false,
  skipPrefix: boolean = false
): Promise<{ publicUrl: string; id: string } | null> => {
  try {
    const authHeaders = await getAuthHeader();
    const formData = new FormData();
    formData.append('file', file, fileName);

    let title = fileName;
    if (kitName && !skipPrefix) {
      title = `[Kit: ${kitName}] ${fileName}`;
    }
    formData.append('title', title);
    formData.append('isPublic', String(isPublic || isFactory));
    formData.append('isFactory', String(isFactory));

    const res = await fetch('/api/samples/upload', {
      method: 'POST',
      headers: {
        ...authHeaders,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload sample');
    }

    const data = await res.json();
    return {
      publicUrl: data.publicUrl,
      id: data.id,
    };
  } catch (e) {
    console.error('[Upload] Critical Error uploading sample:', e);
    return null;
  }
=======
    file: File | Blob, 
    fileName: string, 
    userId: string, 
    isFactory: boolean = false,
    kitName?: string, 
    isPublic: boolean = false,
    skipPrefix: boolean = false
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
            // If skipping prefix, we rely on relational link, otherwise legacy bracket notation
            if (!skipPrefix) {
                title = `[Kit: ${kitName}] ${fileName}`;
            }
        } else {
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            storagePath = `${prefix}/${Date.now()}_${randomSuffix}_${cleanName}`;
        }

        console.log(`[Upload] Starting storage upload for ${fileName} to ${storagePath}`);

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('audio-assets')
            .upload(storagePath, file, {
                upsert: true,
                contentType: 'audio/wav',
                cacheControl: '3600'
            });

        if (uploadError) {
            console.error("[Upload] Storage Error:", uploadError.message);
            throw uploadError;
        }

        const { data } = supabase.storage.from('audio-assets').getPublicUrl(storagePath);
        const publicUrl = data.publicUrl;

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
>>>>>>> old-slicer/ai-beat-patterns
};
