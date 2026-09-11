export const isTauriEnv = typeof window !== 'undefined' && window.__TAURI__ !== undefined;

export const invoke = isTauriEnv
  ? window.__TAURI__.core.invoke
  : async (cmd, args) => {
    console.log("[Mock Invoke]", cmd, args);
    if (cmd === 'get_ffmpeg_status' || cmd === 'check_ffmpeg') return { available: true, version: "6.0" };
    if (cmd === 'get_ytdlp_status') return { available: true, version: "2024.08.06" };
    if (cmd === 'get_system_metrics') return { cpuUsage: 12, ramUsage: 45 };
    return {};
  };

export const listen = isTauriEnv
  ? window.__TAURI__.event.listen
  : async (event, cb) => {
    console.log("[Mock Listen]", event);
    return () => { };
  };

export const tauriDialog = isTauriEnv
  ? (window.__TAURI__?.dialog || window.__TAURI__?.pluginDialog || window.__TAURI__?.plugin?.dialog)
  : null;
