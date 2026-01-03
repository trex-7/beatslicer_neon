
import { Slice } from "../types";

export const MAX_FILE_SIZE_MB = 30;
export const MAX_KIT_FILES = 16;
export const MAX_KIT_TOTAL_MB = 100;

export const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return `File "${file.name}" exceeds the ${MAX_FILE_SIZE_MB}MB limit.`;
    }
    return null;
};

// Convert AudioBuffer to WAV Blob
export function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
  
    let result: Float32Array;
    if (numChannels === 2) {
      result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
      result = buffer.getChannelData(0);
    }
  
    return encodeWAV(result, numChannels, sampleRate, format, bitDepth);
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
  
  function encodeWAV(samples: Float32Array, numChannels: number, sampleRate: number, format: number, bitDepth: number): Blob {
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
  
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);
  
    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, format, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * bytesPerSample, true);
  
    if (bitDepth === 16) {
        floatTo16BitPCM(view, 44, samples);
    } else {
        floatTo32BitPCM(view, 44, samples);
    }
  
    return new Blob([view], { type: 'audio/wav' });
  }
  
  function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }
  
  function floatTo32BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 4) {
      output.setFloat32(offset, input[i], true);
    }
  }
  
  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  export function blobToBase64(blob: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
              const result = reader.result as string;
              // Remove Data-URL declaration (e.g. "data:audio/wav;base64,") to just get raw base64
              const base64 = result.split(',')[1];
              resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
      });
  }

  export function base64ToBlob(base64: string, type: string = 'audio/wav'): Blob {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type });
  }

  export async function stitchAudioFiles(files: File[]): Promise<{ blob: Blob, slices: Slice[] }> {
    // Create context to decode audio data
    // We use a temporary context here to avoid messing with the main Tone.js context state
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    try {
        const buffers: { buffer: AudioBuffer, name: string }[] = [];
        
        // Decode all
        for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            buffers.push({ buffer: audioBuffer, name: file.name });
        }
        
        // Calculate total length
        const padding = 0.1; // seconds
        const totalDuration = buffers.reduce((acc, b) => acc + b.buffer.duration + padding, 0);
        const sampleRate = ctx.sampleRate;
        const lengthSamples = Math.ceil(totalDuration * sampleRate);
        
        const outputBuffer = ctx.createBuffer(2, lengthSamples, sampleRate); // Stereo
        
        const slices: Slice[] = [];
        let offset = 0;
        
        for (let i = 0; i < buffers.length; i++) {
            const { buffer, name } = buffers[i];
            const startSample = Math.floor(offset * sampleRate);
            
            // Copy channels
            for (let c = 0; c < buffer.numberOfChannels; c++) {
                const inputData = buffer.getChannelData(c);
                const outputData = outputBuffer.getChannelData(c);
                
                // Limit copy to output length to be safe
                const len = Math.min(inputData.length, outputData.length - startSample);
                if (c < 2) { // Only Copy first 2 channels
                    for(let j=0; j<len; j++) {
                        outputData[startSample+j] = inputData[j];
                    }
                }
            }
            // If input mono, copy ch0 to ch1 of output
            if (buffer.numberOfChannels === 1) {
                const inputData = buffer.getChannelData(0);
                const outputData = outputBuffer.getChannelData(1);
                const len = Math.min(inputData.length, outputData.length - startSample);
                for(let j=0; j<len; j++) {
                    outputData[startSample+j] = inputData[j];
                }
            }

            // Determine Type
            let type: any = 'perc';
            const lower = name.toLowerCase();
            if (lower.includes('kick') || lower.includes('bd')) type = 'kick';
            else if (lower.includes('snare') || lower.includes('sd')) type = 'snare';
            else if (lower.includes('hat') || lower.includes('hh')) type = 'hihat';

            slices.push({
                id: i,
                offset: offset,
                duration: buffer.duration,
                isActive: true,
                type: type,
                level: 1.0,
                pitch: 0
            });
            
            offset += buffer.duration + padding;
        }
        
        const blob = audioBufferToWav(outputBuffer);
        return { blob, slices };
    } finally {
        // CRITICAL: Close the context to prevent "Too many AudioContexts" error
        // Browsers typically limit this to 6.
        if (ctx && ctx.state !== 'closed') {
            await ctx.close();
        }
    }
}
