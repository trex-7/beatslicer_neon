
/**
 * Advanced BPM detection algorithm for Web Audio API.
 * Analyzes peaks and calculates interval histograms to find the tempo.
 */
export async function detectBPM(buffer: AudioBuffer): Promise<number> {
    return new Promise((resolve) => {
        // Run in a microtask to not block immediately
        setTimeout(() => {
            try {
                const channelData = buffer.getChannelData(0);
                const sampleRate = buffer.sampleRate;

                // Safety check for empty buffers
                if (channelData.length === 0) {
                    console.warn("Empty buffer provided to BPM detector");
                    resolve(120);
                    return;
                }
                
                // 1. Downsample to speed up processing
                // We only need low resolution for BPM (~10-12kHz is fine)
                const step = 4; 
                const downsampledLength = Math.floor(channelData.length / step);
                const data = new Float32Array(downsampledLength);
                
                let maxVol = 0;
                for (let i = 0; i < downsampledLength; i++) {
                    data[i] = channelData[i * step];
                    if (Math.abs(data[i]) > maxVol) maxVol = Math.abs(data[i]);
                }

                // Normalize
                if (maxVol > 0) {
                    for (let i = 0; i < downsampledLength; i++) {
                        data[i] = data[i] / maxVol;
                    }
                }

                // 2. Peak Detection
                // Simple volume threshold approach
                const peaks: number[] = [];
                const threshold = 0.6; // High threshold to catch kicks/snares
                // Minimum distance between peaks in samples (0.25s at 44.1k/4 => ~150ms lockout)
                const minPeakDist = (0.15 * sampleRate) / step; 
                
                for (let i = 0; i < data.length - 1; i++) {
                    if (data[i] > threshold && data[i] > data[i-1] && data[i] > data[i+1]) {
                        // Local maxima above threshold
                        if (peaks.length === 0 || (i - peaks[peaks.length - 1]) > minPeakDist) {
                            peaks.push(i);
                        }
                    }
                }

                if (peaks.length < 8) {
                    // Not enough peaks, return safe default or estimate
                    resolve(120); 
                    return;
                }

                // 3. Interval Calculation
                // Calculate distances between every peak and its neighbors
                const intervals: { [key: string]: number } = {};
                
                // Look ahead at next 10 peaks
                for (let i = 0; i < peaks.length; i++) {
                    for (let j = i + 1; j < Math.min(i + 10, peaks.length); j++) {
                        const dist = peaks[j] - peaks[i];
                        
                        // Convert distance to BPM
                        // dist is in downsampled samples. 
                        // Time = dist * step / sampleRate
                        const time = (dist * step) / sampleRate;
                        
                        // Filter for realistic BPM range (roughly 60 to 200)
                        if (time > 0.3 && time < 1.0) {
                             const bpmCandidate = 60 / time;
                             const roundedBpm = Math.round(bpmCandidate);
                             intervals[roundedBpm] = (intervals[roundedBpm] || 0) + 1;
                        }
                    }
                }

                // 4. Find the consensus
                let bestBpm = 120;
                let maxCount = 0;

                // We look for the highest count, but also check neighbors
                // (e.g. if 120 has 50 votes, 121 has 40 votes, they reinforce each other)
                const sortedBpms = Object.keys(intervals).map(Number).sort((a, b) => a - b);
                
                for (let i = 0; i < sortedBpms.length; i++) {
                    const bpm = sortedBpms[i];
                    const count = intervals[bpm];
                    
                    // Add weight from immediate neighbors to handle jitter
                    let neighborWeight = 0;
                    if (intervals[bpm-1]) neighborWeight += intervals[bpm-1] * 0.5;
                    if (intervals[bpm+1]) neighborWeight += intervals[bpm+1] * 0.5;
                    
                    const totalScore = count + neighborWeight;

                    if (totalScore > maxCount) {
                        maxCount = totalScore;
                        bestBpm = bpm;
                    }
                }

                // 5. Final Constraint Check
                // Adjust ranges to prevent "cut time" (half speed) feel.
                // Trap/Dubstep is often detected as 70 but felt as 140.
                // DnB is ~174.
                // HipHop ~90.
                
                // Force double if detected < 95 (e.g. 70 -> 140, 90 -> 180)
                // This assumes users prefer double-time resolution for slow beats (32nd notes become 16th steps)
                if (bestBpm < 95) bestBpm *= 2;
                
                // If it ends up absurdly high (> 195), halve it (e.g. spurious double detection)
                while (bestBpm > 195) bestBpm /= 2;

                resolve(Math.round(bestBpm));
            } catch (e) {
                console.error("BPM detection error:", e);
                resolve(120); // Safe fallback
            }
        }, 0);
    });
}
