# Sadness Splitter - Fun Facts & Dev Stories 💡

## 🦉 1. How We Tricked the Web Browser (Tauri Environment Mocking)

**Story**: When we wanted to preview and test our beautiful retro user interfaces (Modern Glass, Windows 98, Windows XP themes) directly in a standard web browser (Chrome, Edge, or automation tools), the frontend crashed instantly. This was because standard web browsers do not have the desktop-native `window.__TAURI__` object injected, leading to a fatal crash on startup.

Instead of rewriting the entire app, we decided to **trick (ullu &nbsp;bana &nbsp;diya)** the browser! 

We created a mock environment detection layer at the very top of `main.js`. If the app detects that it is running inside a browser (where `window.__TAURI__` is undefined), it silently swaps out the real Tauri backend invocations with fully simulated mockup functions. Now, the browser happily thinks it's running inside Tauri, and we can preview the entire interface and themes seamlessly!

### ❌ The Old Crashing Code (Tauri Only)
```javascript
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const tauriDialog = window.__TAURI__?.dialog || window.__TAURI__?.pluginDialog || window.__TAURI__?.plugin?.dialog;
```

### 🧠 The New Smart Mocking Code (Browser-Safe!)
```javascript
const isTauriEnv = typeof window !== 'undefined' && window.__TAURI__ !== undefined;
const invoke = isTauriEnv 
  ? window.__TAURI__.core.invoke 
  : async (cmd, args) => {
      console.log("[Mock Invoke]", cmd, args);
      if (cmd === 'get_ffmpeg_status' || cmd === 'check_ffmpeg') return { available: true, version: "6.0" };
      if (cmd === 'get_ytdlp_status') return { available: true, version: "2024.08.06" };
      if (cmd === 'get_system_metrics') return { cpuUsage: 12, ramUsage: 45 };
      return {};
    };
const listen = isTauriEnv 
  ? window.__TAURI__.event.listen 
  : async (event, cb) => {
      console.log("[Mock Listen]", event);
      return () => {};
    };
const tauriDialog = isTauriEnv 
  ? (window.__TAURI__?.dialog || window.__TAURI__?.pluginDialog || window.__TAURI__?.plugin?.dialog)
  : null;
```

Now developers can test UI designs and themes on Chrome/Edge, and the desktop users get secure, native Rust integrations!
