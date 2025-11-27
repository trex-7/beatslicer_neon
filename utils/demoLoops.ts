
import type { DemoKit } from '../types';

export interface DemoLoop {
    name: string;
    url: string; 
}

export const DEMO_LOOPS: DemoLoop[] = [];

export const DEMO_KITS: DemoKit[] = [];

// Configuration for external library
// This assumes your library.json is at the root of your public audio folder
export const LIBRARY_INDEX_URL = './audio/library.json';

interface LibraryManifest {
    loops?: DemoLoop[];
    kits?: DemoKit[];
}

function resolveUrl(base: string, path: string): string {
    if (path.startsWith('http') || path.startsWith('//') || path.startsWith('data:')) return path;
    
    // Clean up base path: ensure no trailing slash
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    
    // Clean up path: remove leading slash or ./
    let cleanPath = path;
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
    if (cleanPath.startsWith('./')) cleanPath = cleanPath.substring(2);
    
    return `${cleanBase}/${cleanPath}`;
}

export async function fetchAudioLibrary(): Promise<LibraryManifest | null> {
    try {
        const response = await fetch(LIBRARY_INDEX_URL);
        if (!response.ok) {
            // Silently fail if 404 - we just use defaults
            return null;
        }

        const data = await response.json();
        const basePath = LIBRARY_INDEX_URL.substring(0, LIBRARY_INDEX_URL.lastIndexOf('/'));

        // Resolve relative paths in the manifest to full paths based on library location
        const resolvedLoops = data.loops?.map((loop: any) => ({
            ...loop,
            url: resolveUrl(basePath, loop.url)
        })) || [];

        const resolvedKits = data.kits?.map((kit: any) => ({
            ...kit,
            samples: kit.samples.map((sample: any) => ({
                ...sample,
                url: resolveUrl(basePath, sample.url)
            }))
        })) || [];

        return {
            loops: resolvedLoops,
            kits: resolvedKits
        };
    } catch (e) {
        console.warn("Could not load external library manifest:", e);
        return null;
    }
}
