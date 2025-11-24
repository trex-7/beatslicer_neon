
import type { DemoKit } from '../types';

export interface DemoLoop {
    name: string;
    url: string; 
}

// Updated with Google Drive Direct Link
// ID extracted from: https://drive.google.com/file/d/1XXMMntYiC7AwcQikURuBcFw9JXMj0MdG/view?usp=drive_link
export const DEMO_LOOPS: DemoLoop[] = [
    {
        name: "Demo Loop (Google Drive)",
        url: "https://drive.google.com/uc?export=download&id=1XXMMntYiC7AwcQikURuBcFw9JXMj0MdG"
    }
];

export const DEMO_KITS: DemoKit[] = [
    {
        name: "Drive Kit 1",
        samples: [
            { name: "Sample 1 (Kick)", url: "https://drive.google.com/uc?export=download&id=1iptAmb-lnHkBJUFAuNpQZuU0_0Qu_7in", type: 'kick' },
            { name: "Sample 2 (Snare)", url: "https://drive.google.com/uc?export=download&id=1SViBm6xibJ8riQLNA8CiobgZDUP-t4XH", type: 'snare' },
            { name: "Sample 3 (Hat)", url: "https://drive.google.com/uc?export=download&id=1_9LUdAdtODrAxZSWDy0xpPecUAIZbPN_", type: 'hihat' },
            { name: "Sample 4 (Perc)", url: "https://drive.google.com/uc?export=download&id=1sR6Djrrg_Y3L8wGwk2jwVXxYmQaH3Arj", type: 'perc' },
            { name: "Sample 5 (Perc)", url: "https://drive.google.com/uc?export=download&id=1K3SspfUmAFEpuSnLb_OBpSwpAC-ue2A7", type: 'perc' },
            { name: "Sample 6 (Perc)", url: "https://drive.google.com/uc?export=download&id=1HvYm7CNFYgq4zhlFmi4iJLz16hoXVc76", type: 'perc' },
            { name: "Sample 7 (Perc)", url: "https://drive.google.com/uc?export=download&id=1W_C_n6CiI9wYz-kPDl7h-gbxcgroboLL", type: 'perc' }
        ]
    }
];

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
