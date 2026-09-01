import type { Slice } from '../types';

export const MAX_KIT_FILES = 16;
export const MAX_KIT_TOTAL_MB = 50;

/**
 * Validates audio file types and size limits
 */
export function validateFile(file: File): { isValid: boolean; error?: string } {
    const validExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff', '.aac', '.m4a'];
    const validMimes = [
        'audio/wav', 'audio/x-wav', 'audio/wave',
        'audio/mpeg', 'audio/mp3',
        'audio/ogg', 'audio/flac', 'audio/x-flac',
        'audio/aiff', 'audio/x-aiff',
        'audio/aac', 'audio/m4a', 'audio/x-m4a'
    ];

    const fileName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext));
    const hasValidMime = validMimes.includes(file.type.toLowerCase()) || file.type.startsWith('audio/');

    if (!hasValidExt && !hasValidMime) {
        return {
            isValid: false,
            error: `Unsupported audio format "${file.name}". Please upload WAV, MP3, OGG, FLAC, or AIFF.`
        };
    }

    const maxSizeMB = 50;
    if (file.size > maxSizeMB * 1024 * 1024) {
        return {
            isValid: false,
            error: `File "${file.name}" exceeds maximum allowed size of ${maxSizeMB}MB.`
        };
    }

    return { isValid: true };
}

/**
 * Encodes an AudioBuffer into standard 16-bit PCM WAV Blob
 */
export function audioBufferToWav(buffer: AudioBuffer, opt?: { float32?: boolean }): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = opt?.float32 ? 3 : 1; // 3 = IEEE float, 1 = PCM 16-bit
    const bitDepth = format === 3 ? 32 : 16;

    let result: Float32Array;
    if (numChannels === 2) {
        result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
        result = buffer.getChannelData(0);
    }

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const wavBuffer = new ArrayBuffer(44 + result.length * bytesPerSample);
    const view = new DataView(wavBuffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + result.length * bytesPerSample, true);
    writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, result.length * bytesPerSample, true);

    if (format === 1) {
        floatTo16BitPCM(view, 44, result);
    } else {
        writeFloat32(view, 44, result);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
}

function writeFloat32(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 4) {
        output.setFloat32(offset, input[i], true);
    }
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;

    while (index < length) {
        result[index++] = inputL[inputIndex];
        result[index++] = inputR[inputIndex];
        inputIndex++;
    }
    return result;
}

/**
 * Converts a Blob to a base64 encoded string
 */
export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Converts a base64 data URL string into a Blob
 */
export function base64ToBlob(base64Data: string, contentType: string = 'audio/wav'): Blob {
    const parts = base64Data.split(';base64,');
    const raw = parts.length > 1 ? atob(parts[1]) : atob(parts[0]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
}

/**
 * Stitches multiple audio files into a single composite AudioBuffer and generates slice boundaries
 */
export async function stitchAudioFiles(
    files: File[],
    audioContext?: AudioContext
): Promise<{ buffer: AudioBuffer; slices: Slice[]; blob: Blob }> {
    const ctx = audioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffers: AudioBuffer[] = [];

    for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        buffers.push(decoded);
    }

    if (buffers.length === 0) {
        throw new Error('No valid audio files provided to stitch');
    }

    const sampleRate = buffers[0].sampleRate;
    const numChannels = Math.max(...buffers.map(b => b.numberOfChannels));
    const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0);

    const stitched = ctx.createBuffer(numChannels, totalSamples, sampleRate);
    const slices: Slice[] = [];

    let currentSampleOffset = 0;
    const totalDurationSec = totalSamples / sampleRate;

    buffers.forEach((b, idx) => {
        for (let ch = 0; ch < numChannels; ch++) {
            const destChannelData = stitched.getChannelData(ch);
            const srcChannelData = b.getChannelData(ch % b.numberOfChannels);
            destChannelData.set(srcChannelData, currentSampleOffset);
        }

        const startSec = currentSampleOffset / sampleRate;
        const durSec = b.duration;
        const startRatio = totalDurationSec > 0 ? startSec / totalDurationSec : 0;
        const durRatio = totalDurationSec > 0 ? durSec / totalDurationSec : 1;

        slices.push({
            id: idx + 1,
            offset: startRatio,
            duration: durRatio,
            isActive: true,
            type: idx === 0 ? 'kick' : idx === 1 ? 'snare' : idx === 2 ? 'hihat' : 'perc',
            level: 1.0,
            reverse: false,
            pitch: 0
        });

        currentSampleOffset += b.length;
    });

    return { buffer: stitched, slices, blob: audioBufferToWav(stitched) };
}
