# Bundled assets & attribution

## Real-dog video clips (`src-tauri/clips/`)

`idle.mp4`, `happy.mp4`, `sad.mp4` are derived from:

- **Source video:** "Golden Retriever | Dog Breeds | Pet | HD no copyright video"
  by **CurioWorld**, https://www.youtube.com/watch?v=HeWxFLFqQ2c
- **License:** Creative Commons Attribution (CC BY), as declared on YouTube.
- **Modifications:** cropped to the studio segment (~46.5s–58.0s), background
  removed with rembg (ISNet), repacked as packed-alpha H.264 (color left,
  alpha matte right), split into three behavior clips.

The pipeline that produced them is `scripts/matte.py` + `scripts/pack-clips.sh`.

## Everything else

- App icon: original SVG in `src-tauri/icons/source.svg` (MIT, this repo).
- 3D dog: procedural three.js code in `ui/dog.js` (MIT, this repo), no model files.
- Sounds: synthesized at runtime with WebAudio, no audio files.
- three.js (`ui/vendor/`): MIT, © three.js authors.
