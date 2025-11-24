
# Granular Synth FX

## Deployment & Hosting

This application is configured for deployment on GitHub Pages or any static web host.

### Using the External Library

To make your own folders and files appear in the application pulldowns automatically:

1.  **Structure your audio files** in a folder named `audio` in your public web root.
2.  **Create a `library.json` file** inside the `audio` folder.
3.  **Populate `library.json`** with the following structure:

```json
{
  "loops": [
    {
      "name": "My Cool Loop 120bpm",
      "url": "loops/cool_loop.mp3"
    },
    {
      "name": "Ambient Texture",
      "url": "loops/ambient.wav"
    }
  ],
  "kits": [
    {
      "name": "My Drum Kit",
      "samples": [
        { "name": "Kick", "url": "kits/mykit/kick.wav", "type": "kick" },
        { "name": "Snare", "url": "kits/mykit/snare.wav", "type": "snare" },
        { "name": "Hat", "url": "kits/mykit/hat.wav", "type": "hihat" }
      ]
    }
  ]
}
```

The application will automatically fetch this file from `./audio/library.json` on startup. If found, your files will appear at the top of the "Load Loop" and "Load Kit" dropdowns.

### Directory Example

```
/ (public root)
  index.html
  /audio
     library.json
     /loops
        cool_loop.mp3
     /kits
        /mykit
           kick.wav
           ...
```
