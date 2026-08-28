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
function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('neon_auth_token') || localStorage.getItem('auth_token') || '';
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// --- Fetching ---

export const fetchLibrary = async (userId?: string): Promise<LibraryData> => {
    try {
        const response = await fetch('/api/library', {
            method: 'GET',
            headers: getAuthHeaders(),
        });

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
            console.warn(`Library endpoint returned status ${response.status} (${contentType || 'non-json'}). Using local fallback.`);
            return {
                publicPresets: [],
                publicSamples: [],
                userPresets: [],
                userSamples: [],
                factoryPresets: [],
                factorySamples: [
                    { id: 'synth_block_a_hi', label: 'Synth Block A (Hi)', type: 'sample', url: '/Audio/Synth_Block_A_hi.wav', isFactory: true, isPublic: true },
                    { id: 'synth_block_a_lo', label: 'Synth Block A (Lo)', type: 'sample', url: '/Audio/Synth_Block_A_lo.wav', isFactory: true, isPublic: true },
                    { id: 'noise_16_16', label: 'Noise 16/16', type: 'sample', url: '/Audio/Noise_16_16.wav', isFactory: true, isPublic: true },
                ],
            };
        }

        const data = await response.json();
        return {
            publicPresets: Array.isArray(data.publicPresets) ? data.publicPresets : [],
            publicSamples: Array.isArray(data.publicSamples) ? data.publicSamples : [],
            userPresets: Array.isArray(data.userPresets) ? data.userPresets : [],
            userSamples: Array.isArray(data.userSamples) ? data.userSamples : [],
            factoryPresets: Array.isArray(data.factoryPresets) ? data.factoryPresets : [],
            factorySamples: Array.isArray(data.factorySamples) && data.factorySamples.length > 0 ? data.factorySamples : [
                { id: 'synth_block_a_hi', label: 'Synth Block A (Hi)', type: 'sample', url: '/Audio/Synth_Block_A_hi.wav', isFactory: true, isPublic: true },
                { id: 'synth_block_a_lo', label: 'Synth Block A (Lo)', type: 'sample', url: '/Audio/Synth_Block_A_lo.wav', isFactory: true, isPublic: true },
                { id: 'noise_16_16', label: 'Noise 16/16', type: 'sample', url: '/Audio/Noise_16_16.wav', isFactory: true, isPublic: true },
            ],
        };
    } catch (e: any) {
        console.warn("Notice: Fetching library from Neon DB returned error, using factory defaults:", e.message || e);
        return {
            publicPresets: [],
            publicSamples: [],
            userPresets: [],
            userSamples: [],
            factoryPresets: [],
            factorySamples: [
                { id: 'synth_block_a_hi', label: 'Synth Block A (Hi)', type: 'sample', url: '/Audio/Synth_Block_A_hi.wav', isFactory: true, isPublic: true },
                { id: 'synth_block_a_lo', label: 'Synth Block A (Lo)', type: 'sample', url: '/Audio/Synth_Block_A_lo.wav', isFactory: true, isPublic: true },
                { id: 'noise_16_16', label: 'Noise 16/16', type: 'sample', url: '/Audio/Noise_16_16.wav', isFactory: true, isPublic: true },
            ],
        };
    }
};

// --- Kit Management ---

export const createKit = async (
    userId: string,
    kitName: string,
    isFactory: boolean,
    isPublic: boolean,
    description: string = "",
    coverImageUrl: string = ""
): Promise<string | null> => {
    try {
        const response = await fetch('/api/kits', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                name: kitName,
                description: description || null,
                coverImageUrl: coverImageUrl || null,
                isPublic: isPublic || isFactory,
                isFactory,
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to create kit (HTTP ${response.status})`);
        }

        const data = await response.json();
        return data.id;
    } catch (e: any) {
        console.error("Error creating kit:", e);
        throw e;
    }
};

export const linkSamplesToKit = async (kitId: string, sampleIds: string[]): Promise<boolean> => {
    if (sampleIds.length === 0) return true;
    try {
        const response = await fetch(`/api/kits/${kitId}/samples`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ sampleIds }),
        });

        if (!response.ok) {
            throw new Error(`Failed to link samples to kit (HTTP ${response.status})`);
        }
        return true;
    } catch (e) {
        console.error("Error linking samples to kit:", e);
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
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                message,
                category: category || 'other',
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
        }

        return { success: true };
    } catch (e: any) {
        console.error("Error submitting feedback:", e.message || e);
        return { success: false, error: e.message || "Unknown error" };
    }
};

export const fetchAllFeedback = async (): Promise<FeedbackItem[]> => {
    try {
        const response = await fetch('/api/feedback', {
            method: 'GET',
            headers: getAuthHeaders(),
        });

        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
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
    try {
        const response = await fetch('/api/presets', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                name,
                parameters: params,
                sequencerData: sequencer,
                slicesData: slices,
                sampleId,
                isPublic: isPublic || isFactory,
                isFactory,
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to save preset (HTTP ${response.status})`);
        }

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
    try {
        const response = await fetch(`/api/presets/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                name,
                parameters: params,
                sequencerData: sequencer,
                slicesData: slices,
                isPublic,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to update preset (HTTP ${response.status})`);
        }

        return true;
    } catch (e) {
        console.error("Error updating preset:", e);
        return false;
    }
};

export const renameCloudItem = async (
    type: 'preset' | 'sample' | 'kit',
    id: string,
    newName: string
): Promise<boolean> => {
    try {
        const response = await fetch(`/api/items/${type}/${id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ name: newName }),
        });

        return response.ok;
    } catch (e) {
        console.error(`Error renaming ${type}:`, e);
        return false;
    }
};

// --- Deletion & Helpers ---

export const deleteCloudPreset = async (id: string): Promise<DeleteResult> => {
    try {
        const response = await fetch(`/api/presets/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return { success: false, error: errData.error || `HTTP ${response.status}` };
        }

        return { success: true };
    } catch (e: any) {
        console.error("Error deleting preset:", e);
        return { success: false, error: e.message || "Unknown error" };
    }
};

export const deleteCloudSample = async (id: string, url?: string): Promise<DeleteResult> => {
    try {
        const response = await fetch(`/api/samples/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return { success: false, error: errData.error || `HTTP ${response.status}` };
        }

        return { success: true };
    } catch (e: any) {
        console.error("Error deleting sample:", e);
        return { success: false, error: e.message || "Unknown error" };
    }
};

// --- Storage Upload (Neon S3-Compatible Storage / Server Storage) ---

export const uploadSampleToCloud = async (
    file: File | Blob, 
    fileName: string, 
    userId: string, 
    isFactory: boolean = false,
    kitName?: string, 
    isPublic: boolean = false,
    skipPrefix: boolean = false
): Promise<{ publicUrl: string, id: string } | null> => {
    try {
        let title = fileName;
        if (kitName && !skipPrefix) {
            title = `[Kit: ${kitName}] ${fileName}`;
        }

        const formData = new FormData();
        formData.append('file', file, fileName);
        formData.append('title', title);
        formData.append('isPublic', String(isPublic || isFactory));
        formData.append('isFactory', String(isFactory));

        const token = localStorage.getItem('neon_auth_token') || localStorage.getItem('auth_token') || '';
        const headers: Record<string, string> = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/samples/upload', {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Upload failed (HTTP ${response.status})`);
        }

        const data = await response.json();
        return {
            publicUrl: data.publicUrl,
            id: data.id,
        };
    } catch (e) {
        console.error("[Upload] Error uploading sample to Neon Storage:", e);
        return null;
    }
};
