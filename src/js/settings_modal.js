import { tauriDialog, invoke, listen } from './tauri.js';
import { updateStatus, setPersonaEmotion, getAuraSpeech, setTheme } from './aura_persona.js';
import { checkEngineStatus, checkYtdlpStatus } from './engine_status.js';

export function initSettingsModal() {
  const triggerBtn = document.getElementById('settings-trigger-btn');
  const closeBtn = document.getElementById('settings-close-btn');
  const saveBtn = document.getElementById('settings-save-btn');
  const modal = document.getElementById('settings-modal');

  const tabBtns = document.querySelectorAll('.settings-tab-btn');
  const panels = document.querySelectorAll('.settings-panel-view');

  const dirDisplay = document.getElementById('settings-default-dir-display');
  const changeDirBtn = document.getElementById('settings-change-dir-btn');
  const autoclearToggle = document.getElementById('settings-autoclear-toggle');
  const debugToggle = document.getElementById('settings-debug-toggle');
  const auraLanguageSelect = document.getElementById('settings-aura-language');
  const notificationsToggle = document.getElementById('settings-notifications-toggle');
  const voiceoversToggle = document.getElementById('settings-voiceovers-toggle');

  const auraToggle = document.getElementById('settings-aura-toggle');
  const previewCards = document.querySelectorAll('.theme-preview-card');

  const ffmpegPathInput = document.getElementById('settings-ffmpeg-path');
  const browseFfmpegBtn = document.getElementById('settings-browse-ffmpeg-btn');
  const clearFfmpegBtn = document.getElementById('settings-clear-ffmpeg-btn');
  const forceCheckBtn = document.getElementById('settings-force-check-btn');

  const savedDir = localStorage.getItem('settings-default-dir') || "";
  if (dirDisplay) {
    dirDisplay.textContent = savedDir ? savedDir.split(/[\/\\]/).pop() || savedDir : "No default path set";
    dirDisplay.title = savedDir;
  }

  if (savedDir && !window.globalOutputPath) {
    window.globalOutputPath = savedDir;
    const outInput = document.getElementById('global-output-path');
    if (outInput) outInput.value = savedDir;
  }

  if (autoclearToggle) {
    autoclearToggle.checked = localStorage.getItem('settings-autoclear-logs') === 'true';
  }

  if (debugToggle) {
    debugToggle.checked = localStorage.getItem('settings-debug-mode') === 'true';
  }

  if (auraLanguageSelect) {
    auraLanguageSelect.value = localStorage.getItem('settings-aura-language') || 'hinglish';
  }

  if (notificationsToggle) {
    notificationsToggle.checked = localStorage.getItem('settings-notifications-active') !== 'false';
  }

  if (voiceoversToggle) {
    voiceoversToggle.checked = localStorage.getItem('settings-voiceovers-active') !== 'false';
  }

  if (auraToggle) {
    auraToggle.checked = localStorage.getItem('settings-aura-silenced') !== 'true';
  }

  const customFfmpegPath = localStorage.getItem('ffmpeg-custom-path') || "";
  if (ffmpegPathInput) {
    ffmpegPathInput.value = customFfmpegPath;
  }

  const ytdlpPathInput = document.getElementById('settings-ytdlp-path');
  const customYtdlpPath = localStorage.getItem('ytdlp-custom-path') || "";
  if (ytdlpPathInput) {
    ytdlpPathInput.value = customYtdlpPath;
  }

  const cookiesBrowserSelect = document.getElementById('settings-ytdlp-cookies-browser');
  if (cookiesBrowserSelect) {
    cookiesBrowserSelect.value = localStorage.getItem('settings-ytdlp-cookies-browser') || 'none';
    cookiesBrowserSelect.addEventListener('change', () => {
      localStorage.setItem('settings-ytdlp-cookies-browser', cookiesBrowserSelect.value);
      updateStatus(`Cookies browser source set to: ${cookiesBrowserSelect.value}`);
    });
  }

  const auraSpeechContainer = document.getElementById('aura-speech-container');
  const reactiveFace = document.getElementById('reactive-face');
  if (localStorage.getItem('settings-aura-silenced') === 'true') {
    if (auraSpeechContainer) auraSpeechContainer.style.display = 'none';
    if (reactiveFace) reactiveFace.src = 'emotive-ani-character/face_neutral.png';
  } else {
    if (auraSpeechContainer) auraSpeechContainer.style.display = 'block';
  }

  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      if (modal) {
        modal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
        const currentTheme = localStorage.getItem('app-theme') || 'theme-blue';
        setTheme(currentTheme);
        checkEngineStatus();
      }
    });
  }

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      closeModal();
    }
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });

      btn.classList.add('active');
      const targetPanelId = `settings-${btn.dataset.tab}-panel`;
      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.add('active');
        targetPanel.style.display = 'block';
      }
    });
  });

  if (changeDirBtn) {
    changeDirBtn.addEventListener('click', async () => {
      try {
        const folder = await tauriDialog.open({ directory: true });
        if (folder) {
          localStorage.setItem('settings-default-dir', folder);
          if (dirDisplay) {
            dirDisplay.textContent = folder.split(/[\/\\]/).pop() || folder;
            dirDisplay.title = folder;
          }
          window.globalOutputPath = folder;
          const outInput = document.getElementById('global-output-path');
          if (outInput) outInput.value = folder;
          updateStatus(`Default output directory set: ${folder}`);
        }
      } catch (err) {
        console.error("Browse dir error:", err);
      }
    });
  }

  if (browseFfmpegBtn) {
    browseFfmpegBtn.addEventListener('click', async () => {
      try {
        const isWindows = navigator.userAgent.toLowerCase().includes('win');
        const dialogOptions = {};
        if (isWindows) {
          dialogOptions.filters = [{ name: 'Executable', extensions: ['exe'] }];
        }
        const file = await tauriDialog.open(dialogOptions);
        if (file) {
          localStorage.setItem('ffmpeg-custom-path', file);
          if (ffmpegPathInput) ffmpegPathInput.value = file;
          updateStatus(`Custom FFmpeg path selected.`);
          checkEngineStatus();
        }
      } catch (err) {
        console.error("FFmpeg browse error:", err);
      }
    });
  }

  if (clearFfmpegBtn) {
    clearFfmpegBtn.addEventListener('click', () => {
      localStorage.removeItem('ffmpeg-custom-path');
      if (ffmpegPathInput) ffmpegPathInput.value = "";
      updateStatus("Custom FFmpeg path reset.");
      checkEngineStatus();
    });
  }

  const browseYtdlpBtn = document.getElementById('settings-browse-ytdlp-btn');
  if (browseYtdlpBtn) {
    browseYtdlpBtn.addEventListener('click', async () => {
      try {
        const isWindows = navigator.userAgent.toLowerCase().includes('win');
        const dialogOptions = {};
        if (isWindows) {
          dialogOptions.filters = [{ name: 'Executable', extensions: ['exe'] }];
        }
        const file = await tauriDialog.open(dialogOptions);
        if (file) {
          localStorage.setItem('ytdlp-custom-path', file);
          const ytdlpPathInput = document.getElementById('settings-ytdlp-path');
          if (ytdlpPathInput) ytdlpPathInput.value = file;
          updateStatus(`Custom yt-dlp path selected.`);
          checkYtdlpStatus();
        }
      } catch (err) {
        console.error("yt-dlp browse error:", err);
      }
    });
  }

  const clearYtdlpBtn = document.getElementById('settings-clear-ytdlp-btn');
  if (clearYtdlpBtn) {
    clearYtdlpBtn.addEventListener('click', () => {
      localStorage.removeItem('ytdlp-custom-path');
      const ytdlpPathInput = document.getElementById('settings-ytdlp-path');
      if (ytdlpPathInput) ytdlpPathInput.value = "";
      updateStatus("Custom yt-dlp path reset.");
      checkYtdlpStatus();
    });
  }

  const forceCheckYtdlpBtn = document.getElementById('settings-force-check-ytdlp-btn');
  if (forceCheckYtdlpBtn) {
    forceCheckYtdlpBtn.addEventListener('click', () => {
      checkYtdlpStatus();
    });
  }

  const installYtdlpBtn = document.getElementById('settings-install-ytdlp-btn');
  if (installYtdlpBtn) {
    installYtdlpBtn.addEventListener('click', async () => {
      try {
        const confirmResult = confirm("Do you want to download the latest yt-dlp binary automatically?");
        if (!confirmResult) return;

        const stageSpan = document.getElementById('ytdlp-install-stage');
        const sizeSpan = document.getElementById('ytdlp-install-size');
        const fill = document.getElementById('ytdlp-install-progress-fill');
        const progressDiv = document.getElementById('ytdlp-install-progress');
        const errorText = document.getElementById('ytdlp-install-error');

        if (progressDiv) progressDiv.style.display = 'block';
        if (errorText) errorText.style.display = 'none';

        if (installYtdlpBtn) {
          installYtdlpBtn.disabled = true;
          installYtdlpBtn.querySelector('span').textContent = 'Installing...';
        }

        const unlisten = await listen('ytdlp-install-progress', (event) => {
          const payload = event.payload;
          if (stageSpan) stageSpan.textContent = payload.stage;
          if (sizeSpan) {
            const sizeDisplay = payload.totalBytes > 0
              ? `${(payload.downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(payload.totalBytes / 1024 / 1024).toFixed(1)}MB`
              : `${(payload.downloadedBytes / 1024 / 1024).toFixed(1)}MB`;
            sizeSpan.textContent = sizeDisplay;
          }
          if (fill) fill.style.width = `${payload.percent}%`;
        });

        await invoke('install_managed_ytdlp');

        if (installYtdlpBtn) {
          installYtdlpBtn.querySelector('span').textContent = 'Setup yt-dlp';
          installYtdlpBtn.disabled = false;
        }

        unlisten();
        checkYtdlpStatus();
        updateStatus("yt-dlp configured successfully.");
      } catch (err) {
        console.error("Managed yt-dlp install failed:", err);
        const errorText = document.getElementById('ytdlp-install-error');
        if (errorText) {
          errorText.textContent = String(err || 'Installation failed.');
          errorText.style.display = 'block';
        }
        if (installYtdlpBtn) {
          installYtdlpBtn.querySelector('span').textContent = 'Retry Installation';
          installYtdlpBtn.disabled = false;
        }
      }
    });
  }

  previewCards.forEach(card => {
    card.addEventListener('click', () => {
      const preset = card.dataset.preset;
      setTheme(preset);

      let key = 'theme_' + preset.replace('theme-', '');
      if (preset === 'theme-modern') {
        const activeStandardTheme = localStorage.getItem('last-standard-theme') || 'theme-blue';
        key = 'theme_' + activeStandardTheme.replace('theme-', '');
      }

      const speech = getAuraSpeech(key);
      if (speech) {
        setPersonaEmotion(speech.face, speech.msg);
      }
    });
  });

  if (forceCheckBtn) {
    forceCheckBtn.addEventListener('click', async () => {
      updateStatus("Forcing engine verification scan...");
      const icon = forceCheckBtn.querySelector('i');
      if (icon) {
        icon.style.transition = "transform 1s ease";
        icon.style.transform = "rotate(360deg)";
        setTimeout(() => { icon.style.transform = "none"; }, 1000);
      }

      await checkEngineStatus();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (autoclearToggle) {
        localStorage.setItem('settings-autoclear-logs', autoclearToggle.checked ? 'true' : 'false');
      }
      if (debugToggle) {
        localStorage.setItem('settings-debug-mode', debugToggle.checked ? 'true' : 'false');
      }
      if (auraLanguageSelect) {
        localStorage.setItem('settings-aura-language', auraLanguageSelect.value);
      }

      if (notificationsToggle) {
        localStorage.setItem('settings-notifications-active', notificationsToggle.checked ? 'true' : 'false');
        if (notificationsToggle.checked && window.Notification && Notification.permission === "default") {
          Notification.requestPermission();
        }
      }

      if (voiceoversToggle) {
        localStorage.setItem('settings-voiceovers-active', voiceoversToggle.checked ? 'true' : 'false');
      }

      if (auraToggle) {
        const isSilenced = !auraToggle.checked;
        localStorage.setItem('settings-aura-silenced', isSilenced ? 'true' : 'false');

        const auraSpeechContainer = document.getElementById('aura-speech-container');
        if (isSilenced) {
          if (auraSpeechContainer) auraSpeechContainer.style.display = 'none';
          if (reactiveFace) reactiveFace.src = 'emotive-ani-character/face_neutral.png';
        } else {
          if (auraSpeechContainer) auraSpeechContainer.style.display = 'block';
        }
      }

      closeModal();
      updateStatus("Settings applied successfully!");
      const speech = getAuraSpeech('settings_saved');
      setPersonaEmotion(speech.face, speech.msg);
    });
  }
}
