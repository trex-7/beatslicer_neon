
import { classifySlice } from './audioAnalysis';
import type { Slice } from '../types';

declare const Tone: any;

const SILENCE_THRESHOLD = 0.002; 

// Finds the "valley" or noise floor immediately preceding a peak.
export const backtrackToSilence = (channelData: Float32Array, peakIndex: number, sampleRate: number): number => {
    const scanWindow = Math.floor(sampleRate * 0.015); // Look back 15ms max
    const startIndex = Math.max(0, peakIndex - scanWindow);
    
    let lowestAmp = 10.0;
    let bestIndex = peakIndex;

    for (let i = peakIndex; i >= startIndex; i--) {
        const amp = Math.abs(channelData[i]);
        if (amp < lowestAmp) {
            lowestAmp = amp;
            bestIndex = i;
        }
        if (amp < 0.001) return i;
    }
    return bestIndex;
};

// Detects transients based on energy rise
const findTransients = (audioBuffer: AudioBuffer, startTime: number, endTime: number): number[] => {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.min(channelData.length, Math.floor(endTime * sampleRate));
    
    const windowSize = 512; 
    const stepSize = 128; 
    const minDistance = Math.floor(sampleRate * 0.06); 
    
    const transients: number[] = [];
    let lastTransientSample = -minDistance;
    let prevEnergy = 0;
    
    for (let i = startSample; i < endSample - windowSize; i += stepSize) {
        let currentEnergy = 0;
        for (let j = 0; j < windowSize; j++) {
            const sample = channelData[i + j];
            currentEnergy += sample * sample;
        }
        currentEnergy = Math.sqrt(currentEnergy / windowSize);
        
        if (currentEnergy > 0.015 && currentEnergy > prevEnergy * 1.4) {
             if (i - lastTransientSample > minDistance) {
                 const preciseStart = backtrackToSilence(channelData, i, sampleRate);
                 const time = preciseStart / sampleRate;
                 if (time >= startTime) {
                     transients.push(time);
                     lastTransientSample = preciseStart;
                 }
             }
        }
        prevEnergy = Math.max(currentEnergy, 0.005); 
    }
    
    if (transients.length === 0) transients.push(startTime);
    else if (transients[0] - startTime > 0.1) transients.unshift(startTime);

    return transients;
};

export const trimSilence = (buffer: AudioBuffer, start: number, end: number): { duration: number, isSilent: boolean } => {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const sIx = Math.floor(start * sampleRate);
    const eIx = Math.min(channelData.length, Math.floor(end * sampleRate));
    
    if (eIx - sIx < 500) return { duration: 0, isSilent: true };

    let sum = 0;
    const step = 4;
    for (let i = sIx; i < eIx; i+=step) sum += channelData[i] * channelData[i];
    const rms = Math.sqrt(sum / ((eIx - sIx)/step));
    
    if (rms < SILENCE_THRESHOLD) return { duration: 0, isSilent: true };

    const windowSize = Math.floor(sampleRate * 0.01);
    let scanIx = eIx;
    const limitIx = sIx + Math.floor(sampleRate * 0.05);

    while (scanIx > limitIx) {
        let wSum = 0;
        for (let j = 0; j < windowSize; j++) {
            const val = channelData[scanIx - 1 - j];
            wSum += val * val;
        }
        const wRms = Math.sqrt(wSum / windowSize);
        if (wRms < SILENCE_THRESHOLD) scanIx -= windowSize;
        else {
            scanIx = Math.min(eIx, scanIx + Math.floor(sampleRate * 0.05));
            break;
        }
    }

    const finalDuration = (scanIx - sIx) / sampleRate;
    return { duration: finalDuration, isSilent: finalDuration < 0.01 };
};

export const removeLeadingSilence = (buffer: AudioBuffer): AudioBuffer => {
    const threshold = 0.005; 
    const channelData = buffer.getChannelData(0);
    let startIndex = 0;
    
    for (let i = 0; i < channelData.length; i++) {
        if (Math.abs(channelData[i]) > threshold) {
            startIndex = i;
            break;
        }
    }

    if (startIndex < buffer.sampleRate * 0.01) return buffer;

    startIndex = backtrackToSilence(channelData, startIndex, buffer.sampleRate);
    
    const newLength = buffer.length - startIndex;
    const newBuffer = Tone.context.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);
    
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        newBuffer.getChannelData(c).set(buffer.getChannelData(c).subarray(startIndex));
    }
    return newBuffer;
};

export const generateTransientSlices = (buffer: any, bpm: number, startTime: number = 0, endTime: number | null = null): Slice[] => {
    const audioBuffer = buffer.get(); 
    const end = endTime !== null ? endTime : audioBuffer.duration;
    const duration = end - startTime;
    
    if (duration <= 0) return [];

    let slicePoints = findTransients(audioBuffer, startTime, end);
    const maxSlices = 32;
    if (slicePoints.length > maxSlices) slicePoints = slicePoints.slice(0, maxSlices);

    const newSlices: Slice[] = [];
    for (let i = 0; i < slicePoints.length; i++) {
        const currentStart = slicePoints[i];
        const nextStart = (i < slicePoints.length - 1) ? slicePoints[i+1] : end;
        const { duration, isSilent } = trimSilence(audioBuffer, currentStart, nextStart);

        if (!isSilent && duration > 0.01) {
            const type = classifySlice(audioBuffer, currentStart, duration);
            newSlices.push({
                id: newSlices.length,
                offset: currentStart,
                duration: duration,
                isActive: true,
                type: type,
                level: 1.0,
                pitch: 0
            });
        }
    }
    return newSlices;
};
