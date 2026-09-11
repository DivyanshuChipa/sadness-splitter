import { invoke, listen, tauriDialog } from './js/tauri.js';
import {
  auraDialogues,
  emotionalStages,
  toolReactions,
  updateStatus,
  setPersonaEmotion,
  updatePersonaFace,
  getAuraSpeech,
  setTheme,
  logToTechyConsole,
  initPersonaInteractions
} from './js/aura_persona.js';
import {
  initPreviewPlayer,
  updatePreviewRotation,
  stopTrimRangePlayback,
  formatTime,
  initPreviewControlsEvents,
  startFocusedPreviewTimer
} from './js/preview_player.js';
import { initSettingsModal } from './js/settings_modal.js';
import { checkEngineStatus, initFfmpegSetupControls } from './js/engine_status.js';
import {
  loadVideoFile,
  initToolsHandlers,
  setProgressSmooth,
  setProgressMode
} from './js/tools_handlers.js';

// Global state variables
window.isDemoMode = false;
window.globalInputPath = "";
window.globalOutputPath = "";
window.lastProcessedOutputPath = "";
window.selectedCoverImagePath = "";
window.selectedVideoThumbnailPath = "";
window.selectedWaveformBgPath = "";
window.videoDuration = 0;
window.formatTime = formatTime;

let previewPromptCount = 0;
let isWaitingForPreviewConsent = false;
let previewConsentTimer = null;
let lastActiveTabId = "compress";
let displayedProgress = 0;
let lastCpuWarningTime = 0;

function clearPreviewConsentState() {
  isWaitingForPreviewConsent = false;
  clearTimeout(previewConsentTimer);
  const previewSettingsItem = document.getElementById('preview-settings-item');
  if (previewSettingsItem) {
    previewSettingsItem.classList.remove('preview-pulse-highlight');
  }
}

function switchToolkitMode(mode) {
  const container = document.querySelector('.mode-switcher-container');
  const videoBtn = document.getElementById('mode-video-btn');
  const audioBtn = document.getElementById('mode-audio-btn');
  const videoNav = document.getElementById('video-nav-list');
  const audioNav = document.getElementById('audio-nav-list');

  if (!container || !videoBtn || !audioBtn || !videoNav || !audioNav) return;

  container.setAttribute('data-mode', mode);

  if (mode === 'audio') {
    videoBtn.classList.remove('active');
    audioBtn.classList.add('active');

    videoNav.classList.remove('active');
    setTimeout(() => {
      videoNav.style.display = 'none';
      audioNav.style.display = 'flex';
      void audioNav.offsetWidth;
      audioNav.classList.add('active');
    }, 200);

    const activeTabButton = audioNav.querySelector('.nav-btn');
    if (activeTabButton) activeTabButton.click();

    updateStatus("Audio Mode active! Aura is vibing... 🎧🎶");
    setPersonaEmotion('face_curious.png', "Audio Mode active! Aura is vibing... 🎧🎶");
  } else {
    audioBtn.classList.remove('active');
    videoBtn.classList.add('active');

    audioNav.classList.remove('active');
    setTimeout(() => {
      audioNav.style.display = 'none';
      videoNav.style.display = 'flex';
      void videoNav.offsetWidth;
      videoNav.classList.add('active');
    }, 200);

    const activeTabButton = videoNav.querySelector('.nav-btn');
    if (activeTabButton) activeTabButton.click();

    updateStatus("Ready to process emotional baggage.");
    setPersonaEmotion('face_neutral.png', "Ready to process emotional baggage.");
  }

  if (window.lucide) window.lucide.createIcons();
}
window.switchToolkitMode = switchToolkitMode;

function updateEmotionalToggleUI(isActive) {
  const input = document.getElementById('emotional-toggle-input');
  if (!input) return;
  input.checked = isActive;
}

function setMetricRing(el, value) {
  if (!el) return;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  el.style.setProperty('--metric-value', `${v}%`);
}

function startSystemMetrics() {
  const ramRing = document.getElementById('ram-ring');
  const cpuRing = document.getElementById('cpu-ring');
  const gpuRing = document.getElementById('gpu-ring');
  const ramValue = document.getElementById('ram-value');
  const cpuValue = document.getElementById('cpu-value');
  const gpuValue = document.getElementById('gpu-value');

  const setUnavailable = (ring, valueEl) => {
    if (valueEl) valueEl.textContent = 'N/A';
    if (ring) {
      ring.style.setProperty('--metric-value', '0%');
      ring.classList.add('metric-unavailable');
    }
  };

  const poll = async () => {
    try {
      const metrics = await invoke('get_system_metrics');
      const ram = Number(metrics?.ram_percent);
      const cpu = Number(metrics?.cpu_percent);
      const gpu = Number(metrics?.gpu_percent);

      if (Number.isFinite(ram) && Number.isFinite(cpu)) {
        const now = Date.now();
        if ((cpu > 85 || ram > 85) && (now - lastCpuWarningTime > 180000)) {
          lastCpuWarningTime = now;
          const speech = getAuraSpeech('cpu_panic');
          setPersonaEmotion(speech.face, speech.msg);
          const isEmotional = typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive();
          if (isEmotional) {
            setTheme('theme-red');
          }
        }
      }

      if (Number.isFinite(ram)) {
        ramRing?.classList.remove('metric-unavailable');
        setMetricRing(ramRing, ram);
        if (ramValue) ramValue.textContent = `${Math.round(ram)}%`;
      } else {
        setUnavailable(ramRing, ramValue);
      }

      if (Number.isFinite(cpu)) {
        cpuRing?.classList.remove('metric-unavailable');
        setMetricRing(cpuRing, cpu);
        if (cpuValue) cpuValue.textContent = `${Math.round(cpu)}%`;
      } else {
        setUnavailable(cpuRing, cpuValue);
      }

      if (Number.isFinite(gpu)) {
        gpuRing?.classList.remove('metric-unavailable');
        setMetricRing(gpuRing, gpu);
        if (gpuValue) gpuValue.textContent = `${Math.round(gpu)}%`;
      } else {
        setUnavailable(gpuRing, gpuValue);
      }
    } catch (error) {
      console.warn('System metrics unavailable:', error);
      setUnavailable(ramRing, ramValue);
      setUnavailable(cpuRing, cpuValue);
      setUnavailable(gpuRing, gpuValue);
    }
  };

  poll();
  setInterval(poll, 1500);
}

// Navigation setup
const navBtns = document.querySelectorAll('.nav-btn');
const toolViews = document.querySelectorAll('.tool-view');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    startFocusedPreviewTimer(targetId);

    navBtns.forEach(b => b.classList.remove('active'));
    toolViews.forEach(v => {
      v.classList.remove('active');
      v.style.display = 'none';
    });

    btn.classList.add('active');
    const targetView = document.getElementById(targetId);
    if (targetView) {
      targetView.classList.add('active');
      targetView.style.display = 'block';
    }

    if (targetId !== 'youtube-downloader') {
      lastActiveTabId = targetId;
    }

    const ytdlpToggle = document.getElementById('settings-ytdlp-toggle');
    if (ytdlpToggle) {
      ytdlpToggle.checked = false;
    }

    const previewTrimPlayBtn = document.getElementById('preview-trim-play-btn');
    if (previewTrimPlayBtn) {
      previewTrimPlayBtn.style.display = (targetId === 'trim') ? 'flex' : 'none';
    }

    const reactionKey = 'interact_tab_' + targetId;
    const currentLang = localStorage.getItem('settings-aura-language') || 'hinglish';
    const dialect = auraDialogues[currentLang] || auraDialogues['hinglish'];
    if (dialect[reactionKey]) {
      const speech = getAuraSpeech(reactionKey);
      setPersonaEmotion(speech.face, speech.msg);
    } else {
      const reaction = toolReactions[targetId];
      if (reaction) {
        setPersonaEmotion(reaction.face, reaction.msg);
      }
    }

    const previewToggleInput = document.getElementById('preview-toggle-input');
    const previewSettingsItem = document.getElementById('preview-settings-item');
    if ((targetId === 'trim' || targetId === 'split') && previewToggleInput && !previewToggleInput.checked && previewPromptCount < 2) {
      clearPreviewConsentState();

      previewPromptCount++;
      isWaitingForPreviewConsent = true;

      setTimeout(() => {
        if (isWaitingForPreviewConsent) {
          const speech = getAuraSpeech('interact_preview_hover');
          setPersonaEmotion(speech.face, speech.msg);
          if (previewSettingsItem) {
            previewSettingsItem.classList.add('preview-pulse-highlight');
          }

          previewConsentTimer = setTimeout(() => {
            if (isWaitingForPreviewConsent) {
              clearPreviewConsentState();
              setPersonaEmotion('face_neutral.png', "Ok, as you wish. 💛");
            }
          }, 12000);
        }
      }, 900);
    } else {
      if (targetId !== 'trim' && targetId !== 'split') {
        clearPreviewConsentState();
      }
    }

    updatePreviewRotation();

    if (window.lucide) window.lucide.createIcons();
  });
});

window.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  const xpIconMap = {
    compress: 'Zip folder.png',
    split: 'Cut.png',
    trim: 'Checklist.png',
    rotate: 'Display Properties.png',
    audio: 'Volume.png',
    convert: 'Synchronize.png',
    subtitle: 'Fonts.png',
    speed: 'Performance.png',
    gif: 'GIF.png',
    merger: 'Bridged Connection.png',
    stabilize: 'Battery Backup.png',
    contact: 'Icon View.png',
    batch: 'Command Prompt.png',
    'video-thumbnail': 'My Pictures.png',
    ytdlp: 'youtube_logo.png',
    'slowed-reverb': 'Generic Audio.png',
    'lofi-cassette': 'Hearts.png',
    'vocal-isolation': 'Mute.png',
    nightcore: 'Antenna.png',
    'audio-extractor': 'Volume.png',
    'audio-convert': 'Synchronize.png',
    'metadata-editor': 'Notepad.png',
    'mode-video-btn': 'Generic Media.png',
    'mode-audio-btn': 'Generic Audio.png',
    'settings-trigger-btn': 'Tweak UI.png',
    'browse-input-btn': 'Generic Media.png',
    'browse-output-btn': 'Folder Opened.png',
    waveform: 'Audio CD.png',
    'retro-filters': 'Windows Media Encoder.png'
  };

  navBtns.forEach(btn => {
    const targetId = btn.dataset.target;
    if (targetId && xpIconMap[targetId]) {
      const img = document.createElement('img');
      img.className = 'retro-icon';
      img.src = `theme-asset-xp-98/xp_iconpack/${xpIconMap[targetId]}`;
      img.style.width = '22px';
      img.style.height = '22px';
      img.style.marginRight = '8px';
      img.style.display = 'none';
      img.alt = targetId;
      btn.insertBefore(img, btn.firstChild);
    }
  });

  const extraRetroElements = [
    { el: document.getElementById('mode-video-btn'), id: 'mode-video-btn' },
    { el: document.getElementById('mode-audio-btn'), id: 'mode-audio-btn' },
    { el: document.getElementById('settings-trigger-btn'), id: 'settings-trigger-btn' },
    { el: document.getElementById('browse-input-btn'), id: 'browse-input-btn' },
    { el: document.getElementById('browse-output-btn'), id: 'browse-output-btn' }
  ];

  extraRetroElements.forEach(item => {
    if (item.el && xpIconMap[item.id]) {
      const img = document.createElement('img');
      img.className = 'retro-icon';
      img.src = `theme-asset-xp-98/xp_iconpack/${xpIconMap[item.id]}`;
      img.style.width = '22px';
      img.style.height = '22px';
      img.style.marginRight = '8px';
      img.style.display = 'none';
      img.alt = item.id;
      item.el.insertBefore(img, item.el.firstChild);
    }
  });

  const xpKeyIconMap = {
    'console-bento-header': 'Command Prompt.png',
    'live-preview-header': 'Generic Media.png',
    'play-icon': 'Play.png',
    'play-circle-icon': 'Play.png',
    'modes-header': 'Appearance.png',
    'emotional-icon': 'Hearts.png',
    'video-preview-icon': 'Generic Media.png',
    'console-logs-icon': 'Command Prompt.png',
    'yt-downloader-icon': 'youtube_logo.png',
    'image-select-icon': 'My Pictures.png'
  };

  const retroKeyElements = document.querySelectorAll('[data-retro-key]');
  retroKeyElements.forEach(el => {
    const key = el.getAttribute('data-retro-key');
    if (key && xpKeyIconMap[key]) {
      const img = document.createElement('img');
      img.className = 'retro-icon';
      img.src = `theme-asset-xp-98/xp_iconpack/${xpKeyIconMap[key]}`;
      img.style.width = '18px';
      img.style.height = '18px';
      img.style.marginRight = '8px';
      img.style.display = 'none';
      img.alt = key;
      el.parentNode.insertBefore(img, el);
    }
  });

  initSettingsModal();
  initFfmpegSetupControls();
  initPersonaInteractions();
  initPreviewControlsEvents();
  initToolsHandlers();
  checkEngineStatus();

  if (window.__TAURI__ && window.__TAURI__.core) {
    invoke('get_media_server_port').then(port => {
      window.MEDIA_PORT = port;
      logToTechyConsole(`Media Server active on port: ${port}`, "system");
    }).catch(e => console.error("Failed to get media port:", e));
  }

  if (localStorage.getItem('settings-notifications-active') !== 'false') {
    if (window.Notification && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  const restartTourBtn = document.getElementById('restart-tour-btn');
  if (restartTourBtn) {
    restartTourBtn.addEventListener('click', () => {
      if (typeof window.startTour === 'function') {
        window.startTour();
      }
    });
  }

  const nextTourBtn = document.getElementById('tour-next-btn');
  if (nextTourBtn) {
    nextTourBtn.addEventListener('click', () => {
      if (typeof window.nextTourStep === 'function') window.nextTourStep();
    });
  }

  const emotionalToggleInput = document.getElementById('emotional-toggle-input');
  window.onEmotionalModeChange = updateEmotionalToggleUI;
  updateEmotionalToggleUI(typeof window.isEmotionalModeActive === 'function' ? window.isEmotionalModeActive() : false);

  if (emotionalToggleInput) {
    emotionalToggleInput.addEventListener('change', () => {
      const isActive = typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive();
      if (isActive) window.stopEmotionalMode?.();
      else window.startEmotionalMode?.();
    });
  }

  const previewToggleInput = document.getElementById('preview-toggle-input');
  const livePreviewCard = document.getElementById('live-preview-card');

  if (previewToggleInput && livePreviewCard) {
    const showPreview = localStorage.getItem('show-video-preview') !== 'false';
    previewToggleInput.checked = showPreview;
    livePreviewCard.style.display = showPreview ? 'flex' : 'none';

    previewToggleInput.addEventListener('change', (e) => {
      if (e.target.checked) {
        livePreviewCard.style.display = 'flex';
        localStorage.setItem('show-video-preview', 'true');

        if (isWaitingForPreviewConsent) {
          clearPreviewConsentState();
          setTimeout(() => {
            setPersonaEmotion('face_exicited.png', "Yay! Now you can see exactly where you are cutting! 🎬✨");
          }, 300);
        }

        if (window.lucide) window.lucide.createIcons();
      } else {
        livePreviewCard.style.display = 'none';
        localStorage.setItem('show-video-preview', 'false');

        stopTrimRangePlayback();
      }
    });
  }

  startSystemMetrics();

  const aboutCardToggle = document.getElementById('about-card-toggle');
  const aboutCardEl = document.getElementById('about-card');
  const aboutBodyEl = document.getElementById('about-body');
  if (aboutCardToggle && aboutCardEl && aboutBodyEl) {
    aboutCardToggle.addEventListener('click', () => {
      const isExpanded = aboutCardEl.classList.contains('expanded');
      if (isExpanded) {
        aboutBodyEl.style.display = 'none';
        aboutCardEl.classList.remove('expanded');
      } else {
        aboutBodyEl.style.display = 'flex';
        aboutCardEl.classList.add('expanded');
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  const consoleToggleInput = document.getElementById('settings-console-toggle');
  const consoleBento = document.getElementById('techy-console-bento');

  if (consoleToggleInput && consoleBento) {
    const showConsole = localStorage.getItem('settings-techy-console') === 'true';
    consoleToggleInput.checked = showConsole;
    consoleBento.style.display = showConsole ? 'block' : 'none';

    consoleToggleInput.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      if (isChecked) {
        consoleBento.style.display = 'block';
        localStorage.setItem('settings-techy-console', 'true');
        logToTechyConsole("Console Logs active. Real-time operations stream online.", "system");

        const consoleLogs = document.getElementById('techy-console-logs');
        if (consoleLogs) consoleLogs.scrollTop = consoleLogs.scrollHeight;
      } else {
        consoleBento.style.display = 'none';
        localStorage.setItem('settings-techy-console', 'false');
      }
    });
  }

  const dragOverlay = document.getElementById('drag-drop-overlay');

  if (dragOverlay) {
    listen('tauri://drag-enter', () => {
      dragOverlay.style.display = 'flex';
      void dragOverlay.offsetWidth;
      dragOverlay.classList.add('active');
      setPersonaEmotion('face_surprised.png', "Oye! Drop your video file right here! 📂✨");
      logToTechyConsole("Native drag-enter event intercepted.", "system");
    });

    listen('tauri://drag-leave', () => {
      dragOverlay.classList.remove('active');
      setTimeout(() => {
        if (!dragOverlay.classList.contains('active')) {
          dragOverlay.style.display = 'none';
        }
      }, 300);
      logToTechyConsole("Native drag-leave event intercepted.", "system");
    });

    listen('tauri://drag-drop', async (event) => {
      dragOverlay.classList.remove('active');
      setTimeout(() => {
        dragOverlay.style.display = 'none';
      }, 300);

      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        const file = paths[0];
        const ext = file.split('.').pop().toLowerCase();
        if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) {
          logToTechyConsole(`Native file drop success: ${file}`, "system");
          await loadVideoFile(file);
        } else {
          setPersonaEmotion('face_anger.png', "Oye! Sirf audio/video media files (.mp4, .mp3, .wav, etc.) support hoty hain! 😡");
          logToTechyConsole(`Dropped invalid file: ${file}. Unsupported extension.`, "error");
        }
      }
    });
  }

  document.getElementById('browse-input-btn')?.addEventListener('click', async () => {
    try {
      const file = await tauriDialog.open({
        filters: [{ name: 'Media Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'] }]
      });
      if (file) {
        await loadVideoFile(file);
      }
    } catch (e) {
      console.error("Dialog error:", e);
      updateStatus("Failed to open file dialog. Check permissions.");
    }
  });

  document.getElementById('browse-output-btn')?.addEventListener('click', async () => {
    try {
      const folder = await tauriDialog.open({ directory: true });
      if (folder) {
        window.globalOutputPath = folder;
        document.getElementById('global-output-path').value = folder;
        updateStatus(`Output folder set: ${folder}`);
      }
    } catch (e) {
      console.error("Dialog error:", e);
      updateStatus("Failed to open folder dialog.");
    }
  });

  const modeVideoBtn = document.getElementById('mode-video-btn');
  const modeAudioBtn = document.getElementById('mode-audio-btn');
  if (modeVideoBtn) {
    modeVideoBtn.addEventListener('click', () => switchToolkitMode('video'));
  }
  if (modeAudioBtn) {
    modeAudioBtn.addEventListener('click', () => switchToolkitMode('audio'));
  }

  const ytdlpToggle = document.getElementById('settings-ytdlp-toggle');
  if (ytdlpToggle) {
    ytdlpToggle.addEventListener('change', () => {
      if (ytdlpToggle.checked) {
        startFocusedPreviewTimer('youtube-downloader');
        navBtns.forEach(b => b.classList.remove('active'));
        toolViews.forEach(v => {
          v.classList.remove('active');
          v.style.display = 'none';
        });

        const targetView = document.getElementById('youtube-downloader');
        if (targetView) {
          targetView.classList.add('active');
          targetView.style.display = 'block';
        }

        const speech = getAuraSpeech('interact_tab_youtube-downloader');
        if (speech) {
          setPersonaEmotion(speech.face, speech.msg);
        }
      } else {
        const lastBtn = Array.from(navBtns).find(b => b.dataset.target === lastActiveTabId);
        if (lastBtn) {
          lastBtn.click();
        }
      }
    });
  }

  const savedTheme = localStorage.getItem('app-theme') || 'theme-blue';
  setTheme(savedTheme);
});

listen('progress', (event) => {
  const percent = event.payload.percentage;
  const progressFill = document.getElementById('progress-fill');
  if (progressFill) progressFill.classList.remove('indeterminate');
  setProgressSmooth(percent);
  logToTechyConsole(`Progress update: ${percent.toFixed(1)}% complete.`, "info");

  const stage = emotionalStages.find(s => percent >= s.min && percent < s.max);
  if (stage) {
    updateStatus(`Sadness Meter: ${stage.msg}`);
    updatePersonaFace(percent);
  }
});

listen('backend-log', (event) => {
  const payload = event.payload;
  logToTechyConsole(payload.message, payload.type || "info");
});

listen('finished', (event) => {
  const progressFill = document.getElementById('progress-fill');
  if (progressFill) progressFill.classList.remove('indeterminate');
  const activeTab = document.querySelector('.nav-btn.active')?.dataset.target;

  if (event.payload.success) {
    logToTechyConsole(`Task finished successfully. Stream compile return OK.`, "system");
    displayedProgress = Math.max(displayedProgress, 99);
    setProgressSmooth(100);

    if (event.payload.outputPath || event.payload.output_path) {
      window.lastProcessedOutputPath = event.payload.outputPath || event.payload.output_path;
    }

    const previewOutBtn = document.getElementById('preview-output-btn');
    if (previewOutBtn && window.lastProcessedOutputPath) {
      previewOutBtn.style.display = 'inline-flex';
    }

    const reaction = getAuraSpeech('success_' + activeTab);
    if (reaction && reaction.msg !== "Ready to process emotional baggage.") {
      setPersonaEmotion(reaction.face, reaction.msg);
    } else {
      updateStatus(emotionalStages[4].msg);
      updatePersonaFace(100);
    }

    if (!document.hasFocus() && localStorage.getItem('settings-notifications-active') !== 'false') {
      const taskName = activeTab ? activeTab.charAt(0).toUpperCase() + activeTab.slice(1) : "Video";
      invoke('send_native_notification', {
        title: "Sadness Splitter 3000",
        body: `Hello bhai! Video ${taskName.toLowerCase()} ho gayi hai, jaldi se dekh lo! 🎬✨`
      }).catch(err => console.error("Notification error:", err));
    }
  } else {
    const errorMsg = "Error processing emotional baggage. FFmpeg failed.";
    logToTechyConsole(`Compilation error: FFmpeg execution process failed.`, "error");
    setPersonaEmotion('face_anger.png', errorMsg);

    if (!document.hasFocus() && localStorage.getItem('settings-notifications-active') !== 'false') {
      invoke('send_native_notification', {
        title: "Sadness Splitter 3000",
        body: `Oye! Video processing me error aa gaya hai! 😰❌`
      }).catch(err => console.error("Notification error:", err));
    }
  }

  const progressContainer = document.getElementById('progress-container');
  setTimeout(() => {
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressFill) progressFill.classList.remove('indeterminate');
    if (event.payload.success) {
      setTimeout(() => updatePersonaFace(0), 10000);
    }

    if (localStorage.getItem('settings-autoclear-logs') === 'true') {
      setTimeout(() => {
        updateStatus("Ready to process emotional baggage.");
        const auraStatusVal = document.getElementById('aura-status-val');
        if (auraStatusVal) auraStatusVal.textContent = "Ready";
        updatePersonaFace(0);
      }, 3000);
    }
  }, 5000);
});
