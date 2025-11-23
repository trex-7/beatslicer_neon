import type { SliceType } from '../types';

/**
 * Performs a Radix-2 DIT FFT on a Float32Array.
 * Input must be a power of 2 length.
 */
function fft(input: Float32Array): { real: Float32Array, imag: Float32Array } {
    const N = input.length;
    const logN = Math.log2(N);
    
    if (Math.floor(logN) !== logN) throw new Error("FFT size must be power of 2");

    const real = new Float32Array(input);
    const imag = new Float32Array(N).fill(0);

    // Bit Reversal Permutation
    let j = 0;
    for (let i = 0; i < N - 1; i++) {
        if (i < j) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
        let k = N / 2;
        while (k <= j) {
            j -= k;
            k /= 2;
        }
        j += k;
    }

    // Butterfly Operations
    for (let s = 1; s <= logN; s++) {
        const m = 1 << s;        // 2, 4, 8...
        const m2 = m >> 1;       // 1, 2, 4...
        const wmReal = Math.cos(Math.PI / m2); // Rotational factor (real)
        const wmImag = -Math.sin(Math.PI / m2); // Rotational factor (imag)

        for (let k = 0; k < N; k += m) {
            let wReal = 1.0;
            let wImag = 0.0;
            for (let j = 0; j < m2; j++) {
                const tReal = wReal * real[k + j + m2] - wImag * imag[k + j + m2];
                const tImag = wReal * imag[k + j + m2] + wImag * real[k + j + m2];
                const uReal = real[k + j];
                const uImag = imag[k + j];

                real[k + j] = uReal + tReal;
                imag[k + j] = uImag + tImag;
                real[k + j + m2] = uReal - tReal;
                imag[k + j + m2] = uImag - tImag;

                // Rotate w
                const newWReal = wReal * wmReal - wImag * wmImag;
                const newWImag = wReal * wmImag + wImag * wmReal;
                wReal = newWReal;
                wImag = newWImag;
            }
        }
    }
    
    return { real, imag };
}

/**
 * Advanced AI-based Transient Detection using Spectral Flux.
 * This is much more accurate than RMS amplitude for detecting onset of sounds.
 */
export function findTransients(buffer: AudioBuffer, startTime: number, endTime: number): number[] {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.min(data.length, Math.floor(endTime * sampleRate));
    
    // Working with a slice of the buffer
    const fragment = data.slice(startSample, endSample);
    
    const windowSize = 1024;
    const hopSize = 512;
    const numFrames = Math.floor((fragment.length - windowSize) / hopSize);
    
    // If region is too small, just return start
    if (numFrames < 1) return [startTime];

    const spectralFlux = new Float32Array(numFrames);
    let prevMag = new Float32Array(windowSize/2).fill(0);
    
    // 1. Calculate Spectral Flux
    for(let i=0; i<numFrames; i++) {
         const offset = i * hopSize;
         const frame = new Float32Array(windowSize);
         
         // Apply Hann Window
         for(let j=0; j<windowSize; j++) {
             const val = fragment[offset + j] || 0;
             frame[j] = val * (0.5 * (1 - Math.cos(2 * Math.PI * j / (windowSize - 1))));
         }
         
         const { real, imag } = fft(frame);
         const mag = new Float32Array(windowSize/2);
         let flux = 0;
         
         // Half-Wave Rectified Spectral Flux
         for(let j=0; j<windowSize/2; j++) {
             mag[j] = Math.sqrt(real[j]**2 + imag[j]**2);
             const diff = mag[j] - prevMag[j];
             if (diff > 0) flux += diff;
         }
         
         spectralFlux[i] = flux;
         prevMag = mag;
    }
    
    // 2. Adaptive Peak Picking
    const onsets: number[] = [];
    
    // Normalize Flux
    let maxFlux = 0;
    for(let i=0; i<spectralFlux.length; i++) if(spectralFlux[i] > maxFlux) maxFlux = spectralFlux[i];
    
    if (maxFlux < 0.001) return [startTime]; // Silence detection

    const threshold = maxFlux * 0.15; // 15% of max flux in region
    const minDistFrames = Math.floor(0.05 * sampleRate / hopSize); // Minimum 50ms between onsets
    
    let lastOnsetFrame = -minDistFrames;
    
    // Look for local maxima above threshold
    for(let i=1; i<spectralFlux.length-1; i++) {
        if (spectralFlux[i] > threshold && 
            spectralFlux[i] > spectralFlux[i-1] && 
            spectralFlux[i] > spectralFlux[i+1] &&
            (i - lastOnsetFrame) > minDistFrames) {
                
            const onsetTime = startTime + (i * hopSize) / sampleRate;
            // Adjust back slightly to catch the attack
            onsets.push(Math.max(startTime, onsetTime - 0.01));
            lastOnsetFrame = i;
        }
    }
    
    // Ensure the start of the selection is included if no onsets found nearby
    if (onsets.length === 0) {
        onsets.push(startTime);
    } else if (onsets[0] - startTime > 0.1) {
        onsets.unshift(startTime);
    }
    
    return onsets;
}

export function classifySlice(buffer: AudioBuffer, start: number, duration: number): SliceType {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const startIndex = Math.floor(start * sampleRate);
    
    // We analyze the first ~46ms (2048 samples at 44.1k) which contains the attack transient
    const fftSize = 2048;
    const input = new Float32Array(fftSize);
    
    // Copy and Apply Hamming Window
    for (let i = 0; i < fftSize; i++) {
        if (startIndex + i < channelData.length) {
            const raw = channelData[startIndex + i];
            // Hamming Window Equation
            const win = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
            input[i] = raw * win;
        } else {
            input[i] = 0; // Zero padding if slice is short
        }
    }

    // Compute FFT
    const { real, imag } = fft(input);
    const magnitudes = new Float32Array(fftSize / 2);
    
    // Compute Magnitude Spectrum
    for (let i = 0; i < fftSize / 2; i++) {
        magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    // --- Feature Extraction ---
    const binSize = sampleRate / fftSize; // Hz per bin
    let sumMag = 0;
    let sumFreqMag = 0;
    let sumLogMag = 0;
    
    // Frequency Bands
    let subEnergy = 0;     // 0 - 120 Hz (Sub/Kick)
    let bassEnergy = 0;    // 120 - 400 Hz (Bass/Body)
    let midEnergy = 0;     // 400 - 2500 Hz (Snare/Vocal/Melodic)
    let highEnergy = 0;    // 2500 - Nyquist (Cymbals/Detail)

    // RMS Energy of the window to filter silence/noise
    let timeSumSq = 0;
    for(let i=0; i<fftSize; i++) timeSumSq += input[i]*input[i];
    const rms = Math.sqrt(timeSumSq/fftSize);

    // Threshold for silence
    if (rms < 0.005) return 'perc'; 

    for (let i = 0; i < magnitudes.length; i++) {
        const mag = magnitudes[i];
        const freq = i * binSize;

        sumMag += mag;
        sumFreqMag += freq * mag;
        sumLogMag += Math.log(mag + 1e-7); // Avoid log(0)

        if (freq <= 120) subEnergy += mag;
        else if (freq <= 400) bassEnergy += mag;
        else if (freq <= 2500) midEnergy += mag;
        else highEnergy += mag;
    }

    const spectralCentroid = sumMag > 0 ? sumFreqMag / sumMag : 0;
    const totalSpecEnergy = subEnergy + bassEnergy + midEnergy + highEnergy;
    
    const subRatio = totalSpecEnergy > 0 ? subEnergy / totalSpecEnergy : 0;
    const bassRatio = totalSpecEnergy > 0 ? bassEnergy / totalSpecEnergy : 0;
    const midRatio = totalSpecEnergy > 0 ? midEnergy / totalSpecEnergy : 0;
    const highRatio = totalSpecEnergy > 0 ? highEnergy / totalSpecEnergy : 0;

    // Spectral Flatness (Wiener Entropy)
    // High (~1) = Noise (Snares, Hats)
    // Low (~0) = Tone (Kicks, Toms, Bass, Synths)
    const geomMean = Math.exp(sumLogMag / (fftSize / 2));
    const arithMean = sumMag / (fftSize / 2);
    const flatness = arithMean > 0 ? geomMean / arithMean : 0;

    // Zero Crossing Rate (Time Domain Check for Noisiness)
    let zcr = 0;
    for (let i = 1; i < fftSize; i++) {
        if ((input[i] >= 0 && input[i-1] < 0) || (input[i] < 0 && input[i-1] >= 0)) {
            zcr++;
        }
    }
    const zcrRate = zcr / fftSize;

    // --- Classification Expert System (Updated for more types) ---

    // 1. Kick Detection
    // Dominant sub energy, very low flatness (tonal thud), low centroid
    if (subRatio > 0.4 || (subRatio > 0.3 && flatness < 0.2)) {
        return 'kick';
    }

    // 2. Hi-Hat Detection
    // Dominant highs, high ZCR (noise), high flatness
    if (highRatio > 0.4 || spectralCentroid > 5000 || (zcrRate > 0.3 && flatness > 0.3)) {
        return 'hihat';
    }

    // 3. Bass Detection
    // High low-mid energy (120-400), Tonal (Low Flatness)
    // Differentiated from Kick by having less Sub and more Low-Mid/Mid presence
    if (bassRatio > 0.35 && flatness < 0.15) {
        return 'bass';
    }

    // 4. Snare Detection
    // Strong Mids (400-2500), Noisy (High Flatness), Transient
    if (midRatio > 0.35 && (flatness > 0.2 || zcrRate > 0.15)) {
        return 'snare';
    }

    // 5. Vocal Detection
    // Strong Mids, but Tonal/Harmonic (Low Flatness compared to snare)
    // Often has a specific range of ZCR (not too high, not too low)
    if (midRatio > 0.4 && flatness < 0.15 && zcrRate < 0.15) {
        return 'vocal';
    }

    // 6. Melodic / Synth Detection
    // Balanced Mids/Highs, Very Tonal (Low Flatness)
    // If it hasn't been caught by Bass/Vocal but is tonal
    if (flatness < 0.1) {
        return 'melodic';
    }

    // 7. Fallback / Percussion
    // Anything else (usually quiet, or mixed spectrum transients)
    return 'perc';
}