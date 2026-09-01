# Audio Engine & DSP Architecture: Beat Slicer

Beat Slicer combines the **Web Audio API**, custom **AudioWorklet** nodes, and a **Tone.js** transport engine to achieve sample-accurate rhythm sequencing, granular synthesis, and real-time stochastic glitch manipulation.

---

## 1. Core Architecture Overview

```
[ Audio Source / Sample Buffer ]
               │
               ▼
   [ Slicer / Granular Node ]  ◄── [ 16-Step Sequencer & Probabilistic Glitch Engine ]
               │
               ▼
    [ Biquad Filter (LFO/Env) ]
               │
               ▼
    [ Distortion & Bitcrusher ]
               │
               ▼
       [ Delay (Tempo-Sync) ]
               │
               ▼
   [ Reverb (Convolver / Algorithmic) ]
               │
               ▼
    [ Master Dynamics & Limiter ]
               │
               ▼
   [ AudioContext.destination & Analyzer ]
```

---

## 2. Granular Synthesis & Slicing

### Transient Detection & Slice Generation
- **Energy Flux Analysis**: The engine analyzes amplitude derivatives across frequency sub-bands to detect percussive transients.
- **Dynamic Thresholding**: Adapts sensitivity according to the dynamic range of the audio buffer.
- **Slice Assignment**: Auto-slices are categorized into `kick`, `snare`, `hihat`, and `perc` based on spectral centroid calculations.

### Granular Engine Parameters
- **Grain Size**: Controls duration of individual audio micro-grains (10ms to 500ms).
- **Overlap**: Sets grain overlap density for ultra-smooth time stretching without pitch shifts.
- **Detune & Pitch**: Per-slice pitch shifting (-24 to +24 semitones) and grain detune randomization.
- **Attack & Decay**: Configurable micro-envelopes prevent zero-crossing clicks and pops.

---

## 3. 16-Step Sequencer & Playback Engine

### Step Matrix
Each step in the 16-step sequencer contains:
- `active` (boolean): Trigger status.
- `sliceIndex` (0–15): Assigned slice ID.
- `ratchet` (1–4): Note repeats / rolls within a single step subdivision.

### Playback Modes
- **Forward**: Sequential 1 → 16.
- **Backward**: Reverse order 16 → 1.
- **Pendulum**: Bounces forward and backward (1 → 16 → 1).
- **Random**: Non-deterministic step selection.

### Groove & Swing
- Adjustable swing factor (0% to 100%) delaying even-numbered 16th subdivisions for authentic human feel.

---

## 4. Probabilistic Glitch & Stochastic DSP

The Glitch module applies real-time stochastic transforms during playback:
- **Chaos Factor**: Master probability control (0% to 100%).
- **Reverse Chance**: Randomly reverses slice audio playback buffer.
- **Octave Jumps**: Transposes individual slice playback up or down by 12/24 semitones.
- **Ratchet Rolls**: Spontaneously doubles or quadruples step subdivision triggers.
- **Formant Shifts**: Modulates filter resonance and formant frequencies for robotic vocalization effects.

---

## 5. Web MIDI API Integration

### Input Mapping
- Slices 1 through 16 are mapped to standard MIDI note numbers (`C1` = 36 to `D#2` = 51).
- Supports velocity-sensitive triggering and external drum pad controllers.

### MIDI Clock Sync Output
- Transmits 24 PPQ (Pulses Per Quarter Note) MIDI Clock ticks (`0xF8`).
- Sends MIDI Start (`0xFA`), Continue (`0xFB`), and Stop (`0xFC`) commands to synchronize external hardware synthesizers and grooveboxes.
- **Latency Compensation**: Microsecond-accurate clock offset adjustment (+/- 50ms) to compensate for audio driver and hardware interface delays.

---

## 6. Real-Time Audio Monitoring & Diagnostics

The built-in **System Monitor** tracks:
- `AudioContext.sampleRate` & `AudioContext.state` (suspended, running, closed).
- Total active audio nodes and voice allocation counts.
- Buffer load status and memory consumption.
- MIDI transmission buffer telemetry and dropped clock frame counts.
