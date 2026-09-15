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
    let token = localStorage.getItem('neon_auth_token') || localStorage.getItem('auth_token') || '';
    if (!token) {
        const storedUser = localStorage.getItem('neon_auth_user');
        if (storedUser) {
            try {
                const u = JSON.parse(storedUser);
                if (u && (u.email || u.uid || u.id)) {
                    token = 'tok_' + btoa(JSON.stringify({ uid: u.uid || u.id, email: u.email || '' }));
                }
            } catch {}
        }
    }
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
            console.warn(`Library endpoint returned status ${response.status} (${contentType || 'non-json'}).`);
            return {
                publicPresets: [],
                publicSamples: [],
                userPresets: [],
                userSamples: [],
                factoryPresets: [],
                factorySamples: [],
            };
        }

        const data = await response.json();
        return {
            publicPresets: Array.isArray(data.publicPresets) ? data.publicPresets : [],
            publicSamples: Array.isArray(data.publicSamples) ? data.publicSamples : [],
            userPresets: Array.isArray(data.userPresets) ? data.userPresets : [],
            userSamples: Array.isArray(data.userSamples) ? data.userSamples : [],
            factoryPresets: Array.isArray(data.factoryPresets) ? data.factoryPresets : [],
            factorySamples: Array.isArray(data.factorySamples) ? data.factorySamples : [],
        };
    } catch (e: any) {
        console.warn("Notice: Fetching library from Neon DB returned error:", e.message || e);
        return {
            publicPresets: [],
            publicSamples: [],
            userPresets: [],
            userSamples: [],
            factoryPresets: [],
            factorySamples: [],
        };
    }
};

export const resetLibraryDatabase = async (clearFactory: boolean = false): Promise<boolean> => {
    try {
        const response = await fetch('/api/library/reset', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ clearFactory }),
        });
        return response.ok;
    } catch (e) {
        console.error('Failed to reset library database:', e);
        return false;
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

export interface StorageObjectItem {
    key: string;
    size: number;
    lastModified?: string;
    url: string;
}

// --- Deletion & Helpers ---

export const deleteCloudPreset = async (id: string, url?: string, deleteFiles: boolean = true): Promise<DeleteResult> => {
    try {
        const response = await fetch(`/api/presets/${id}?deleteFiles=${deleteFiles}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ url, deleteFiles }),
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

export const deleteCloudKit = async (id: string, deleteFiles: boolean = true): Promise<DeleteResult> => {
    try {
        const response = await fetch(`/api/kits/${id}?deleteFiles=${deleteFiles}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ deleteFiles }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return { success: false, error: errData.error || `HTTP ${response.status}` };
        }

        return { success: true };
    } catch (e: any) {
        console.error("Error deleting kit:", e);
        return { success: false, error: e.message || "Unknown error" };
    }
};

export const listStorageObjects = async (prefix: string = ''): Promise<{ success: boolean; objects: StorageObjectItem[]; error?: string }> => {
    try {
        const response = await fetch(`/api/storage/objects?prefix=${encodeURIComponent(prefix)}`, {
            method: 'GET',
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return { success: false, objects: [], error: errData.error || `HTTP ${response.status}` };
        }

        const data = await response.json();
        return { success: true, objects: data.objects || [] };
    } catch (e: any) {
        console.error("Error listing storage objects:", e);
        return { success: false, objects: [], error: e.message || "Failed to list objects" };
    }
};

export const deleteStorageObject = async (keyOrUrl: string): Promise<DeleteResult> => {
    try {
        const response = await fetch('/api/storage/delete-object', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ key: keyOrUrl, url: keyOrUrl }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return { success: false, error: errData.error || `HTTP ${response.status}` };
        }

        const data = await response.json();
        return { success: data.success || true };
    } catch (e: any) {
        console.error("Error deleting storage object:", e);
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
    let title = fileName;
    if (kitName && !skipPrefix) {
        title = `[Kit: ${kitName}] ${fileName}`;
    }

    const token = localStorage.getItem('neon_auth_token') || localStorage.getItem('auth_token') || '';
    const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        authHeaders['Authorization'] = `Bearer ${token}`;
    }

    const log = (window as any).logDbg || ((tag: string, msg: string, type: string) => console.log(`[${tag}] [${type}] ${msg}`));

    // 1. Try Direct Presigned S3 Upload (High Performance, No Serverless Body Limit)
    try {
        const mimeType = file.type || 'audio/wav';
        log('UPLOAD', `Requesting presigned upload URL for "${fileName}" (${mimeType})...`, 'info');
        const presignedRes = await fetch('/api/storage/presigned-url', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                filename: fileName,
                contentType: mimeType,
            }),
        });

        if (presignedRes.ok) {
            const presignedData = await presignedRes.json();
            if (presignedData?.uploadUrl && presignedData?.publicUrl) {
                log('UPLOAD', `Uploading binary data directly to S3 bucket Key: "${presignedData.key || 'unknown'}"...`, 'info');
                // Upload directly to S3 via PUT
                const uploadRes = await fetch(presignedData.uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': mimeType,
                    },
                    body: file,
                });

                if (uploadRes.ok) {
                    log('UPLOAD', `Direct S3 PUT successful! Registering sample record in Neon DB...`, 'success');
                    // Register sample in database
                    const regRes = await fetch('/api/samples', {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify({
                            title,
                            url: presignedData.publicUrl,
                            isPublic: isPublic || isFactory,
                            isFactory,
                        }),
                    });

                    if (regRes.ok) {
                        const sampleData = await regRes.json();
                        log('UPLOAD', `Sample registered in database successfully! ID: ${sampleData.id}`, 'success');
                        return {
                            publicUrl: sampleData.url || presignedData.publicUrl,
                            id: sampleData.id,
                        };
                    } else {
                        log('UPLOAD_ERROR', `Failed to register S3 sample in database (HTTP ${regRes.status})`, 'error');
                    }
                } else {
                    log('UPLOAD_ERROR', `Direct S3 PUT upload failed (HTTP ${uploadRes.status})`, 'error');
                }
            } else {
                log('UPLOAD_WARN', `Server response did not include S3 uploadUrl / publicUrl`, 'warn');
            }
        } else {
            const errorText = await presignedRes.text().catch(() => '');
            log('UPLOAD_WARN', `Presigned URL generation returned HTTP ${presignedRes.status}. Fallback to multipart. Details: ${errorText.slice(0, 100)}`, 'warn');
        }
    } catch (presignedErr: any) {
        log('UPLOAD_WARN', `Presigned S3 upload skipped/failed, falling back to standard upload: ${presignedErr?.message || presignedErr}`, 'warn');
        console.warn("[Upload] Presigned upload skipped/failed, falling back to standard upload:", presignedErr);
    }

    // 2. Fallback: Standard Multipart Upload (/api/samples/upload)
    try {
        log('UPLOAD', `Attempting standard multipart server upload as fallback...`, 'info');
        const formData = new FormData();
        formData.append('file', file, fileName);
        formData.append('title', title);
        formData.append('isPublic', String(isPublic || isFactory));
        formData.append('isFactory', String(isFactory));

        const uploadHeaders: Record<string, string> = {};
        if (token) {
            uploadHeaders['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/samples/upload', {
            method: 'POST',
            headers: uploadHeaders,
            body: formData,
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error || `Upload failed (HTTP ${response.status})`;
            log('UPLOAD_ERROR', `Multipart upload failed: ${errMsg}`, 'error');
            throw new Error(errMsg);
        }

        const data = await response.json();
        log('UPLOAD', `Multipart upload successful! Registered ID: ${data.id}, URL: ${data.publicUrl}`, 'success');
        return {
            publicUrl: data.publicUrl,
            id: data.id,
        };
    } catch (e: any) {
        log('UPLOAD_ERROR', `All cloud upload attempts failed: ${e?.message || e}`, 'error');
        console.error("[Upload] Error uploading sample to Storage:", e);
        return null;
    }
};

export const sendFeedback = async (message: string, category: string = 'general'): Promise<boolean> => {
    try {
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ message, category }),
        });
        return response.ok;
    } catch (e) {
        console.error("Error sending feedback:", e);
        return false;
    }
};

