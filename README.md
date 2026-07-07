# Pawse 🐕

**The pomeranian that makes you take breaks.**

Every so often (you decide when), a fluffy pomeranian takes over your
screen, tells you to take a walk and drink some water, counts down 30 seconds,
asks if you're happy, and leaves. That's it. That's the app.

The dog is **real**, actual pomeranian footage (CC-BY, see [ASSETS.md](ASSETS.md))
with the background matted out, played as transparent video. Prefer the built-in
procedural **3D dog** instead? One toggle in Settings. Want *your own dog* on
screen? See [Put your own dog in Pawse](#put-your-own-dog-in-pawse).

- 🪶 **Lightweight**, Tauri app: ~10–15 MB installer, ~40 MB RAM, near-zero CPU while idle
- 🔒 **Super safe**, no network access *at all* (there is no HTTP capability compiled in),
  no accounts, no analytics. Settings and mood logs live only on your device.
- 🎨 **Highly customizable**, interval or fixed daily times, break length, the messages
  the dog says, sound, coat color, dog name, hard mode, launch at login
- 🖥️ **Cross-platform**, macOS (`.dmg`) and Windows (`.exe`), covers every monitor
- 🧡 **Open source**, MIT

## How a break works

1. At your chosen time, **Biscuit** (rename him!) trots onto every screen.
2. The screen is blocked for 30 s (configurable): *"Woof! Time to stretch those legs,
   take a little walk. 🐾"* A countdown ring ticks down while the dog sits, pants,
   blinks, and wags.
3. When the countdown ends, the dog asks: **"Are you happy?"**
   - **Yes** → happy hops, a spin, floating hearts 💛
   - **Not really** → a sympathetic head-tilt and a paw hug
4. The dog leaves, you get back to work. Your answer is stored in a local mood log
   (visible in Settings, it never leaves your machine).

**Emergency escape:** hold <kbd>ESC</kbd> for 3 seconds to skip a break (in a meeting,
on a call…). You can disable this in Settings for hard mode. Pawse deliberately does
not fight OS-level force-quit, it's a break reminder, not a jail.

## Install

**macOS, the easy way (no warnings):** Homebrew strips the download quarantine for you, so it just works.

```sh
brew tap anishfyi/tap
brew install --cask pawse
```

**Or download directly** from **[Releases](../../releases/latest)**:

| Platform | File |
|---|---|
| macOS (Intel + Apple Silicon) | `Pawse_x.y.z_universal.dmg` |
| Windows | `Pawse_x.y.z_x64-setup.exe` |

The downloads are **not signed with a paid developer certificate**, so the OS shows a
warning on first launch. This is expected, not a virus.

### macOS says *"Pawse is damaged and can't be opened"*

This is macOS Gatekeeper reacting to the download quarantine on an unsigned app, not
actual damage. Any one of these fixes it:

- **Best:** install via Homebrew (above) — it never happens.
- Or, after dragging Pawse to Applications, run once in Terminal:
  ```sh
  xattr -cr /Applications/Pawse.app
  ```
  then open it normally.
- Or: System Settings → Privacy & Security → scroll down → **Open Anyway**.

### Windows says *"Windows protected your PC"*

Click **More info → Run anyway**.

Pawse lives in your menu bar / system tray: take a break now, pause for an hour,
open the Control Panel, or quit.

## Customize

Open **Settings** from the tray icon:

| Setting | Default | Meaning |
|---|---|---|
| Break every | 45 min | Interval between breaks |
| Fixed times | (none) | e.g. `10:30`, `15:00`, when set, these replace the interval |
| Break length | 30 s | The countdown |
| Messages | 3 built-ins | One per line; the dog rotates through them |
| Emergency escape | on | Hold ESC to skip; turn off for hard mode |
| Sound | on | Soft synthesized chime + woof (no audio files) |
| Dog name / coat | Biscuit / golden | Coat colors apply to the 3D dog |
| Dog style | Auto | Real (video) when clips exist, or the procedural 3D dog |
| Launch at login | off | Start Pawse with your computer |

Settings are plain JSON at:

- macOS: `~/Library/Application Support/com.anishfyi.pawse/settings.json`
- Windows: `%APPDATA%\com.anishfyi.pawse\settings.json`

## Build from source

Prereqs: [Rust](https://rustup.rs), Node 20+.

```sh
npm install
npm run dev     # run in dev mode
npm run build   # produce the installer for your OS
```

Releases are built by CI (`.github/workflows/release.yml`): push a `v*` tag and it
produces the macOS universal DMG and the Windows NSIS installer as a draft release.

## Put your own dog in Pawse

The real-dog engine plays three packed-alpha clips: `idle.mp4` (loops during the
break), `happy.mp4` (you said yes), `sad.mp4` (you said not really). Pawse looks for
them first in your config dir, so you can replace the bundled pomeranian with your dog:

1. Film your dog against a plainish background (1080p; a calm sitting take, an
   excited take, a head-tilt take).
2. Run the documented pipeline in `scripts/pack-clips.sh` (ffmpeg + rembg, the
   exact commands are in the script header).
3. Drop the three files into:
   - macOS: `~/Library/Application Support/com.anishfyi.pawse/dogclips/`
   - Windows: `%APPDATA%\com.anishfyi.pawse\dogclips\`

Packed-alpha video (color left, alpha matte right, recomposited by a WebGL shader)
is used because it is the only transparent-video approach that behaves identically
in both the macOS and Windows webviews.

## The 3D dog

The fallback/alternative dog is built procedurally from three.js primitives
(`ui/dog.js`), spheres, capsules, and a chained-segment tail. No model files, and
every part of the dog (coat color, wag speed, ear droop, blink timing) is one line
of code away from being yours.

## License

MIT, see [LICENSE](LICENSE).
