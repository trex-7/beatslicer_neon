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
}

// --- Fetching ---

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
};

// --- Kit Management ---

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
};

// --- Storage ---

export const uploadSampleToCloud = async (
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
};
