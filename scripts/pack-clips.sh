#!/usr/bin/env bash
# Pack matted RGBA PNG frames into a packed-alpha H.264 clip Pawse can play.
#
#   pack-clips.sh <matted_frames_dir> <out.mp4> [start_frame] [num_frames] [--pingpong]
#
# The output packs color (left) and the alpha matte (right) side by side;
# see ui/videodog.js for the shader that recomposites it.
#
# To put YOUR OWN dog in Pawse:
#   1. Film your dog against any plainish background (1080p, a few seconds:
#      one calm sitting loop, one excited moment, one head-tilt).
#   2. Extract frames:   ffmpeg -i mydog.mp4 -vf "crop=...,scale=1266:900" f/%04d.png
#   3. Matte them:       pip install rembg onnxruntime pillow
#                        python scripts/matte.py isnet-general-use f matted
#   4. Pack each clip:   scripts/pack-clips.sh matted idle.mp4 1 195 --pingpong
#                        scripts/pack-clips.sh matted happy.mp4 200 90
#                        scripts/pack-clips.sh matted sad.mp4 300 75
#   5. Drop idle.mp4 / happy.mp4 / sad.mp4 into:
#        macOS:   ~/Library/Application Support/com.anishfyi.pawse/dogclips/
#        Windows: %APPDATA%\com.anishfyi.pawse\dogclips\
set -euo pipefail

SRC="$1"; OUT="$2"; START="${3:-1}"; COUNT="${4:-9999}"; PP="${5:-}"
FPS="30000/1001"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# stage the frame range (and mirror it for a seamless ping-pong loop)
n=1
files=$(ls "$SRC"/*.png | sed -n "${START},$((START + COUNT - 1))p")
for f in $files; do
  ln -s "$(cd "$(dirname "$f")" && pwd)/$(basename "$f")" "$TMP/$(printf '%05d' $n).png"
  n=$((n + 1))
done
reverse_lines() { if command -v tac >/dev/null; then tac; else tail -r; fi; }

if [ "$PP" = "--pingpong" ]; then
  for f in $(echo "$files" | reverse_lines | sed -n "2,\$p"); do
    ln -s "$(cd "$(dirname "$f")" && pwd)/$(basename "$f")" "$TMP/$(printf '%05d' $n).png"
    n=$((n + 1))
  done
fi

# read frame size from the first staged frame
IFS=, read -r W H < <(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "$TMP/00001.png")

ffmpeg -y -v error -framerate "$FPS" -i "$TMP/%05d.png" -filter_complex \
  "[0:v]format=rgba,split[c0][a0];color=black:s=${W}x${H}:r=${FPS}[bg];\
[bg][c0]overlay=shortest=1:format=auto,format=yuv420p[c];\
[a0]alphaextract,format=yuv420p[a];[c][a]hstack[out]" \
  -map "[out]" -c:v libx264 -crf 23 -preset slow -movflags +faststart -pix_fmt yuv420p "$OUT"

echo "packed $((n - 1)) frames -> $OUT"
