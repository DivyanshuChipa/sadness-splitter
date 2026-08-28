# Tauri Sidecar Binaries Guide

This directory is designated for external portable binaries (sidecars) such as `ffmpeg`, `ffprobe`, and `yt-dlp`. 

## 📦 How Packaging Works

Tauri uses a conditional build system. When you compile the app:
1. **Standalone/Portable Installer (e.g. 70MB-100MB)**:
   - If sidecar files are placed in this folder and configured in `tauri.conf.json`, Tauri automatically bundles them into your `.msi`, `.exe`, or `.deb` installer.
   - When the user runs the installer, these binaries are unpacked into their app resource folder. The app runs completely self-contained (zero external dependencies!).
2. **Lightweight Installer (e.g. 5MB)**:
   - If you want a small installer size, simply leave this folder empty (or disable sidecars in `tauri.conf.json`). 
   - The app will automatically fall back to using system-installed `ffmpeg` / `ffprobe` / `yt-dlp` from the user's `PATH`.

      "binaries/ffmpeg",
      "binaries/ffprobe",
      "binaries/yt-dlp"

---

## 🏷️ Naming Convention

Tauri requires sidecar binaries to be suffixed with the target platform's **target triple**. You can find your current target triple by running `rustc -Vv` in the terminal and looking for `host`.

Here are the naming conventions for common architectures:

### 1. Windows (64-bit)
Rename your `.exe` binaries to match this format:
- `ffmpeg-x86_64-pc-windows-msvc.exe`
- `ffprobe-x86_64-pc-windows-msvc.exe`
- `yt-dlp-x86_64-pc-windows-msvc.exe`

### 2. macOS
- **Intel (x64)**:
  - `ffmpeg-x86_64-apple-darwin`
  - `ffprobe-x86_64-apple-darwin`
  - `yt-dlp-x86_64-apple-darwin`
- **Apple Silicon (M1/M2/M3)**:
  - `ffmpeg-aarch64-apple-darwin`
  - `ffprobe-aarch64-apple-darwin`
  - `yt-dlp-aarch64-apple-darwin`

### 3. Linux (64-bit)
- `ffmpeg-x86_64-unknown-linux-gnu`
- `ffprobe-x86_64-unknown-linux-gnu`
- `yt-dlp-x86_64-unknown-linux-gnu`
