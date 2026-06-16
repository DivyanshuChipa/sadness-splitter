# Project History & Milestones 📜

> [!IMPORTANT]
> **🤖 AI HANDOFF NOTES & CURRENT STATE**
> *Sadness Splitter 3000 is now fully scaffolded and functional as a standalone Tauri v2 application. The project is unique because it intentionally bypasses the Node.js/NPM ecosystem, utilizing Vanilla HTML/CSS/JS for the frontend to simplify the user's environment requirements. The core "Emotional Progress" logic is handled by a Rust-backend that streams FFmpeg stderr logs.*

**Project Persona**: Modern, glassmorphic video utility app with a quirky "Emotional Stages" theme for video processing.
**Tech Stack**: Tauri v2, Rust (Backend), Vanilla HTML/CSS/JS (Frontend - No Node.js).
**Design Language**: Glassmorphism, Dark Mode (#0f1115 base), Inter font, blur effects, and vibrant linear gradients for progress.
**Repository**: [Local Workspace] C:\Users\H tech\.gemini\antigravity\scratch\sadness-splitter

### 🛡️ Safety & Push Policy
- **Primary Remote**: [Not yet pushed to GitHub]
- **Ignore Files**: `.gitignore` created. `history/` and `src-tauri/target/` are ignored.
- **Secret Safety**: No API keys or environment variables currently in use.

### ✅ Verification Protocol
- **Linting**: Manual review of Rust and JS.
- **Build**: Verified via `cargo run`.
- **Visuals**: Confirmed premium dark mode UI with sidebar navigation.

### 📚 External Intelligence
- **Official Docs**: https://v2.tauri.app/

- [x] **Next Up**: Finalize "Batch Processor" logic in JS (UI exists, backend handles processing).

### 🏗️ Phase 0: Implementation Strategy
- **Vanilla Setup**: Bypassed `tauri-cli` global installation issues by creating standard directory structures manually and using `withGlobalTauri: true`.
- **Event Streaming**: Use Tauri's `Emitter` in Rust to stream progress from FFmpeg to the "Sadness Meter" in JS.
- **Modular Backend**: Rust command `process_video` accepts arbitrary FFmpeg arguments, allowing reuse for multiple tools.

### 📍 Current Architecture & Flow
1. **[Entry Point]**: `index.html` + `main.js` (using `window.__TAURI__.core.invoke` and `window.__TAURI__.event.listen`).
2. **[Core Logic]**: Rust backend (`main.rs`) spawns `ffmpeg` as a child process and pipes `stderr`.
3. **[Data Flow]**: `stderr` is parsed via Regex in Rust; percentage is emitted to JS; JS updates the "Sadness Meter" DOM.

### 🚧 What's In Progress
- [x] **Active Task**: All 13+ Video Tools fully functional.
- [x] **Next Up**: Resolution Scaling and legacy 3GP support.
- [ ] **Upcoming**: Integration with Social Media aspect ratio presets.

### 📉 Technical Debt & Gotchas
- **[Constraint]**: **No Node.js/NPM**. Do not add packages via `npm`. Use CDNs or native web APIs only.
- **[Prerequisite]**: Requires MSVC Build Tools on Windows (for `link.exe`).
- **[Known Issue]**: Icon generation manually fixed with 48px icons to prevent Tauri panic.

---

### 📝 Change Log (Git-Style)

- **feat(downloader & tags)**: [2026-06-16] Implemented **YouTube Downloader & Tags/Cover Editor with Audio Visualizer Damping** — Added a YouTube Downloader powered by `yt-dlp` supporting MP3/MP4 downloads, dynamic format fallbacks, real-time logging, and absolute `ffmpeg` path resolution with location configuration. Integrated a "Tags & Cover Editor" tab to edit metadata and embed album art into audio files. Added a green "Preview Work" play shortcut to load and autoplay the recently generated files instantly. Dampened visualizer jumps (smoothing `0.85`, multiplier `0.75`). Added mascot dialect speech lines for YouTube Downloader and Metadata Editor tab events across Hinglish, English, Sarcastic, Hacker, and Lazy personalities. Created dialogue directories in `src/emotive-ani-voice/`.
- **fix(playback)**: [2026-06-03] Resolved **Linux Bluetooth Audio & Video Playback Controls** — Fixed the video play/pause button toggle freeze by saving the paused state before stopping trim range playback. Solved Linux Web Audio API Bluetooth device locking by implementing a twin-audio element synchronization system (primary unmuted audio plays directly through system default outputs/Bluetooth, while a secondary silent audio feeds the visualizer canvas analyser). Implemented Warp `/app-assets` Tauri `AssetResolver` bridge to play embedded `.opus` emotive voices without GStreamer codec failures.
- **feat(linux)**: [2026-06-03] Implemented **Linux Platform Stabilization & Local Media Server** — Resolved WebKitGTK/GStreamer custom protocol audio/video range request failures on Linux by integrating a local Warp HTTP background server on an ephemeral port. Handled Radeon/NVIDIA hardware acceleration webview freezes via the `WEBKIT_DISABLE_DMABUF_RENDERER` check, restricted to Linux environments.
- **feat(persona)**: [2026-05-27] Implemented **Mascot Dynamic Voiceovers (Audio)** — Connected fully compressed Opus voiceover files across all 5 dialects and 27 events (successes, themes, panics). Configured build-time python auto-matching mapper `generate_audio_map.py` to compile dynamic `aura_audio_map.js` lookup tables recursively. Developed vanilla JS `playAuraVoice` player engine with full browser permissions auto-play bypass protections and rapid audio overlap suppression. Added voiceover audio settings toggle switch (`#settings-voiceovers-toggle`) inside General Settings modal panel.
- **feat(ui)**: [2026-05-24] Implemented **Fullscreen Drag & Drop Glass Overlay & Techy Core Console** — Added a beautiful glassmorphic fullscreen Drag & Drop blur overlay that transitions smoothly to load videos directly using Tauri's native file-drop streams. Integrated a geeks-only "Techy Core Console" Bento Box underneath the tools sidebar columns in the middle panel, controllable via a custom terminal toggle button in the Live Video Preview header. Streams real-time progress streams, system ticks, and raw FFmpeg CLI parameters to a retro monospace container. Created `aura_dialogues_script.md` containing a structured compilations dialogue sheet to allow offline voiceovers/AI audio recording in the future.
- **feat(persona)**: [2026-05-23] Implemented **Aura Dynamic Multi-Personality Dialect System** — Centralized all mascot speech and expressions into a structured dynamic dictionary `auraDialogues` in `main.js`. Added a new sleek "Aura Personality Dialect" dropdown under the settings modal's General tab, persisting selections inside `localStorage` (`settings-aura-language`). Aura dynamically loads and communicates in five unique dialects: Hinglish (Friendly/Desi), English (Standard/Polite), Sarcastic (Sassy/Memes), Hacker (Geek/Matrix), and Lazy (Sleepy/Bored). Updated all triggers (startup, success alerts, CPU metric panics, manual theme clicks, and retro preset selectors) to retrieve active translations dynamically. Handled Linux WebKitGTK literal color dropdown visibility guard for complete cross-platform compatibility.
- **feat(theme)**: [2026-05-23] Implemented **Visual Preset Coherence & Modern Theme Reversion** — Integrated default "Modern Glass" template preset card into the settings modal grid, allowing users to revert retro styles seamlessly. Synced sidebar coherence by smoothly fading out and hiding the "Aura Mood" color picker picker container whenever a retro theme (Win98, WinXP, Synth) is active, dynamically restoring it upon returning to the glassmorphic Modern layout.
- **feat(settings)**: [2026-05-21] Implemented **Premium Control Panel & Settings Hub** — Added a beautiful glassmorphic settings modal with dedicated columns for General, Themes & Nostalgia, and Engine. Integrates customizable local settings (Auto-Clear Logs, Developer/Debug Mode, Default Output Directory, Aura Speech bubble silence toggle) and a custom FFmpeg/FFprobe binary path override mapped to backend Rust executors.
- **feat(theme)**: [2026-05-21] Implemented **Step 1: Vintage Retro Presets** — Added pixel-perfect, custom-designed themes for **Windows 98** (teal background, outset 3D steel gray borders, Tahoma font), **Windows XP** (Luna blue window layout with orange accents), and **Synthwave** (neon pink/cyan borders with a scrolling perspective grid background). Wired up custom Hinglish mascot reactions and active state selectors.
- **feat(persona)**: [2026-05-20] Added **Contextual Tool Success Cheerleading** — Aura now responds with 13+ tailored cheerleading dialogues and expressions upon successful completion of specific tools.
- **feat(persona)**: [2026-05-20] Implemented **High CPU/RAM Load Warning** — Aura panics and switches to a red theme with 30s cooldown protection if system resource usage spikes above 85%.
- **feat(persona)**: [2026-05-20] Added **Manual Theme circles mascot reactions** — Aura reacts with tailored expressions and text lines whenever the user changes themes using the sidebar picker.
- **feat(persona)**: [2026-05-20] Implemented **Late-Night Sleepy Easter Egg** — automatically displays sleepy dialogue and custom expressions when launching the application between 11 PM and 6 AM.
- **feat(elite)**: [2026-05-20] Added **GIF Maker Trim Mechanism** — integrated Start Time (HH:MM:SS) and Duration (seconds) inputs into the GIF generator using fast-seeking FFmpeg parameters (`-ss` and `-t` before `-i`) for fast seek over long video files, with custom duration progress tracking.
- **feat(ui)**: [2026-05-20] Implemented **Smooth Real-time Preview Rotation** — added CSS transition transform effects on `#preview-video` player and hooked up automated tab changes and `#rotate-select` changes for live feedback.
- **feat(fix)**: [2026-05-20] Fixed **Contact Sheet Incomplete Grid** — replaced the frame-skipping static `thumbnail` filter with a mathematically-calculated dynamic `select` interval filter based on `videoDuration` and grid layout dimensions to ensure 100% complete PNG layouts for videos of any length.
- **feat(persona)**: [2026-05-20] Added **System Metrics Hover Spam Protection** — capped mascot reactions to 2 hovers max per session.
- **feat(ui)**: [2026-05-20] Styled **System Metrics Heading** — centered, capitalized, and glowing to match the About heading style.
- **feat(persona)**: [2026-05-20] Implemented **FFmpeg Absence crying reaction** — if FFmpeg is missing, mascot uses sad `face_depression.png` face, status changes to "Not Active", and displays a crying speech bubble plea to download the installer.
- **feat(persona)**: [2026-05-20] Added **Hover-to-Anger** mascot interaction — 5 hover streak (with 2s timeout reset) triggers anger mode independently from the existing click system.
- **feat(ui)**: [2026-05-20] Made **About Sadness Splitter** card collapsible by default with smooth chevron expand/collapse animation, saving vertical space in right panel.
- **feat(persona)**: [2026-05-20] Synced **Mascot Glow** with speech bubble auto-glow — both now glow together with accent drop-shadow and fade out simultaneously after 4 seconds.
- **fix(engine)**: [2026-05-20] Fixed **FFmpeg Progress Tracking** (now splits on carriage return `\r` and uses a more robust regex for varying millisecond formats) so progress updates smoothly instead of jumping from 0% to 100%.
- **fix(engine)**: [2026-05-20] Bound and rendered **FFmpeg Version** (created a new `get_ffmpeg_version` Tauri command and connected it to `#ffmpeg-version-text` DOM) so the engine status card no longer gets stuck on "checking...".
- **feat(persona)**: [2026-05-20] Added **Interactive Video Preview Suggestion Flow** with pulsing CSS glow, dynamic consent updates, and anti-spam protection (max 2 per run).
- **feat(ui)**: [2026-05-20] Relocated **Guide** button directly inside Compress header and cleaned up unused `#custom-modal` and JS handlers.
- **feat(ui)**: [2026-04-30] Polished Right Panel with a new **Hero Feature Card** and colorized Tech Stack icons.
- **fix(ui)**: [2026-04-30] Fixed Modal buttons (Tour, Emotional Mode, Skip) and consolidated event listeners.
- **feat(ui)**: [2026-04-30] Refined 3-column layout: Moved **Guided Tour** to Right Panel, restored **System Log** to main footer.
- **feat(links)**: [2026-04-30] Added Aura Creator's Artist ID (IbisPaint), Instagram, and YouTube links.
- **feat(engine)**: [2026-04-30] Integrated **FFmpeg Installer** link for easy setup if engine is missing.
- **feat(ui)**: [2026-04-30] Implemented a **3-Column Dashboard Layout** with a responsive Right Info Panel.
- **feat(engine)**: [2026-04-30] Added **FFmpeg Health Indicator** (Green/Red dot) with real-time backend verification.
- **feat(ui)**: [2026-04-30] Relocated status messages to a new **Aura Speech Bubble** in the sidebar for better interactivity.
- **feat(persona)**: [2026-04-30] Upgraded to **Aura Persona 2.0** with 25+ expressions and tool-specific contextual reactions.
- **fix(backend)**: [2026-04-27] Reverted smooth progress tracking to standard line-reader for maximum stability.
- **feat(persona)**: [2026-04-27] Added **Aura**, the reactive anime persona, with progress-based emotions and sassy hover interactions.
- **feat(resolution)**: [2026-04-27] Added Dynamic Resolution Scaling (1080p to 240p) and 3GP support.
- **feat(experience)**: [2026-04-27] Implemented Guided Tour and Emotional Visualizer with custom dialogs.
- **feat(ui-fix)**: [2026-04-27] Fixed layout scrolling issues and made Bento cards more compact.
- **feat(offline)**: [2026-04-27] Migrated to local Lucide icons for 100% offline functionality.
- **feat(elite)**: [2026-04-24] Added Video Stabilizer (Anti-Shake) and Thumbnail Contact Sheet generator.
- **feat(elite)**: [2026-04-24] Started Elite Plan: Added High-Quality GIF Maker and Video Merger tools.
- **feat(ffmpeg)**: [2026-04-24] Added support for FFmpeg Presets (Ultrafast to Veryslow) and H.265 (HEVC) Codec.
- **feat(tools)**: [2026-04-24] Fully implemented all 9 tools (Split, Trim, Rotate, Audio, Convert, Subtitle, Speed, Batch) in `main.js`.
- **feat(batch)**: [2026-04-24] Added "Add Folder" support for Batch Processor and fixed dialog permissions.
- **docs**: [2026-04-24] Created `history/history.md` for project continuity.
- **feat(project)**: [2026-04-23] Initial project scaffolding (Tauri v2 + Vanilla Web).
- **feat(ui)**: [2026-04-23] Implemented premium Glassmorphism UI with 9 video tools.
- **feat(backend)**: [2026-04-23] Rust FFmpeg controller with real-time progress parsing.
- **fix(build)**: [2026-04-23] Resolved MSVC linker errors and missing icon panics.
- **fix(dialog)**: [2026-04-23] Added `tauri-plugin-dialog` to fix "Browse" button functionality.

### 📅 Future Roadmap
- [ ] **v1.0**: Full implementation of all 9 tool argument-builders in `main.js`.
- [ ] **v1.1**: Add "Preset" support for different social media formats (TikTok, YouTube, etc.).
- [x] **v1.2 (Mascot Dynamic Voiceovers (Audio))**: Add settings toggle in General tab for enabling/disabling Aura Voiceovers and play dynamic audio streams based on dialects and keys (Completed).
- [x] **v2.0 (Dynamic Audio Suite & Mode Switcher)**:
  - [x] **Audio/Video Dual Mode Toggle**: Add a beautiful morphing toggle button in the sidebar under Aura Mood to switch the entire toolkit between "Video Mode" (standard tools) and "Audio Mode" (specialized sound utilities) (Completed).
  - [x] **Slowed + Reverb Engine**: Re-engineer FFmpeg audio filters using `-af "asetrate=44100*0.85,aresample=44100,aecho=0.8:0.8:60:0.5"` to pitch-down tracks and envelope them in deep space reverb (Completed).
  - [x] **Lofi Cassette & Analog Tape Simulator**: Custom low-res downsampling (`aresample=11025`), lowpass/highpass filtering, analog vibrato pitch wow-and-flutter, and mixed vinyl crackle (Completed).
  - [x] **Vocal Isolation & Solitude Karaoke**: Phase-cancellation filters (`-af "pan=stereo|c0=c0-c1|c1=c1-c0"`) to mute vocals (Completed).
  - [x] **Interactive Canvas Audio Visualizer**: A gorgeous real-time canvas spectrum (glow-in-the-dark sine wave and retro bouncing EQ bars) using native Web Audio API (`AudioContext`, `AnalyserNode`) inside the preview card when audio files are loaded (Completed).
  - [x] **Format Converter & Audio Demuxer**: Support local conversion between MP3, WAV, FLAC, AAC, OGG (Completed).
