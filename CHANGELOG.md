# Changelog

All notable changes to Pawse are listed here.

## 0.2.6 (2026-09-30)

Documentation and metadata release. The app itself is unchanged from 0.2.5.

- Documentation moved to https://velofy.co/pawse/. The old GitHub Pages site now forwards there.
- README: Homebrew tap is now `velofy/tap`, and the multi-monitor claim was corrected to primary display only.
- Package metadata (`package.json`, `src-tauri/Cargo.toml`) points at the new docs and at `github.com/velofy/pawse`.
- Release workflow: the release text now names the right dog, drops the emoji, and gives the current macOS first-launch steps.

## 0.2.5 (2026-07-07)

- The macOS app bundle is ad-hoc signed.
- A break takes over the primary display only, as one window.
- The Control Panel hides during a break and returns after.
