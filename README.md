
# Granular Synth FX - Beta User Guide

**Granular Synth FX** is an advanced browser-based granular synthesizer and effects processor. It uses `AudioWorklet` technology for sample-accurate timing and low-latency performance.

## 🚀 Getting Started

1.  **Launch the App**: Open the application in a modern browser (Chrome, Edge, or Firefox recommended for Web MIDI/AudioWorklet support).
2.  **Audio Context**: Click anywhere or press `Space` to initialize the audio engine.
3.  **Load Sound**: By default, an empty state is shown.
    *   **Simple Mode**: Use the "Load From..." buttons in the Transport bar.
    *   **Pro Mode**: Use **File > Browse Database** or drag-and-drop an audio file onto the window.

---

## 🎮 Interface Modes

### 1. Simple Mode (Play) (🚧 Beta / WIP)
Designed for performance and quick inspiration. **Note: This mode is currently under active development and features may change.**
*   **Macros**: Five large sliders control complex underlying parameters (Texture, Space, Echo, Grit, Glitch).
*   **Magic Pattern Gen**: Generates beats automatically based on genres (House, Break, Chaos).
*   **Visuals**: Large waveform display and simplified sequencer.

### 2. Pro Mode (Edit)
A full DAW-style interface for deep sound design.
*   **Waveform Editor**: Drag to create custom slices. Zoom in/out. Double-click slices to mute.
*   **Sequencer**: 16-step sequencer with "Ratchet" (note repeat) support.
*   **FX Rack**: A re-orderable chain of effects. Drag effect modules up/down to change signal flow.
*   **Slice Properties**: Fine-tune pitch, gain, reverse, and envelopes for every individual slice.

---

## ☁️ Cloud Library & Database

The app connects to a cloud database for saving your creations and sharing samples.

### Login
*   Click the **Cloud Login** button in the top right (or "Auth" in the header).
*   You can browse public content without logging in, but you must log in to **Save** or **Upload**.

### Saving Presets
*   **Preset**: Saves your parameter settings, sequencer pattern, and slice definitions.
*   **Sample**: Uploads raw audio only.
*   **Kit**: When uploading multiple files, you can group them as a "Kit" which creates a playable preset automatically.

### Upload Limits (Beta)
*   **Max File Size**: 30MB per file.
*   **Max Kit Size**: 16 files or 100MB total.
*   **Audio Format**: WAV/MP3 supported. Files are converted to WAV upon upload.

---

## 🎹 MIDI Integration

Granular Synth FX supports Web MIDI API for hardware integration.

**Setup:**
1.  Connect your MIDI device.
2.  In **Pro Mode**, click the **MIDI** button in the Transport section.
3.  **Input**: Select your MIDI controller to trigger slices (Notes C1-D#2 map to Slices 1-16).
4.  **Sync (Clock)**:
    *   **Send Clock**: Sends MIDI Clock to external hardware (e.g., drum machines, synths) to sync them to the app's BPM.
    *   **Sync Shift**: Adjust latency compensation (+/- ms) if your hardware lags behind the browser audio.

---

## 🛠️ Advanced Features

*   **Auto-Slice**: Automatically detects transients in the audio file to create slices.
*   **Glitch Engine**: A probabilistic chaos engine.
    *   *Ratchet*: Random note repeats.
    *   *Reverse*: Random slice reversal.
    *   *Octave*: Random pitch jumps (+/- 1200 cents).
    *   *Formant*: Random grain size modulation.
*   **Audio Export**: Go to **File > Export WAV** to render the current buffer output, or **Export Project ZIP** to bundle the audio + JSON data.

---

## 🐛 Beta Testing Notes

*   **Browser Compatibility**: Please test on Chrome/Edge for best results. Safari typically blocks AudioWorklets in strict modes.
*   **Reporting Issues**: Click **Help > Report Issue** in Pro Mode, the feedback link in the Simple Mode header, or email **support@granularfx.com**.
*   **Resource Usage**: The Granular Engine is CPU intensive. If audio crackles, try increasing the buffer size or closing other tabs.

---

## 📦 Deployment (For Developers)

To make your own folders and files appear in the application pulldowns automatically without a database:

1.  Create an `audio` folder in the public web root.
2.  Add a `library.json` file inside `audio`:

```json
{
  "loops": [
    { "name": "Cool Loop", "url": "loops/cool.mp3" }
  ],
  "kits": [
    {
      "name": "My Drum Kit",
      "samples": [
        { "name": "Kick", "url": "kits/kick.wav", "type": "kick" }
      ]
    }
  ]
}
```
