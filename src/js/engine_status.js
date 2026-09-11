import { invoke, listen } from './tauri.js';
import { updateStatus, setPersonaEmotion, getAuraSpeech, setTheme } from './aura_persona.js';

let latestFfmpegStatus = null;
let ffmpegInstallInProgress = false;
let startupPopupShown = false;
let latestYtdlpStatus = null;

export function ffmpegSourceLabel(source) {
  return {
    custom: 'Custom path',
    system: 'System PATH',
    managed: 'App-managed',
    missing: 'Not detected'
  }[source] || source || 'Unknown';
}

export function formatByteCount(bytes) {
  if (!bytes) return '';
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
}

export function openEngineSettings() {
  document.getElementById('settings-trigger-btn')?.click();
  document.querySelector('.settings-tab-btn[data-tab="engine"]')?.click();
}

export function showFfmpegInstallConfirmation() {
  if (!latestFfmpegStatus || latestFfmpegStatus.platform !== 'windows') {
    openEngineSettings();
    return;
  }

  const destination = document.getElementById('ffmpeg-install-destination');
  if (destination) destination.textContent = latestFfmpegStatus.managedPath || 'App local data';
  const modal = document.getElementById('ffmpeg-install-modal');
  if (modal) modal.style.display = 'flex';
  if (window.lucide) window.lucide.createIcons();
}

export function updateFfmpegInstallProgress(payload) {
  const progress = document.getElementById('ffmpeg-install-progress');
  const fill = document.getElementById('ffmpeg-install-progress-fill');
  const stage = document.getElementById('ffmpeg-install-stage');
  const size = document.getElementById('ffmpeg-install-size');
  if (progress) progress.style.display = 'block';
  if (stage) stage.textContent = payload.message || payload.stage || 'Working...';
  if (size) {
    const downloaded = formatByteCount(payload.downloadedBytes);
    const total = formatByteCount(payload.totalBytes);
    size.textContent = downloaded && total ? `${downloaded} / ${total}` : downloaded;
  }
  if (fill) {
    const hasTotal = Number(payload.totalBytes) > 0;
    fill.classList.toggle('indeterminate', !hasTotal && payload.stage !== 'ready');
    fill.style.width = payload.stage === 'ready' ? '100%' : `${payload.percent || 0}%`;
  }
}

export async function startManagedFfmpegInstall() {
  if (ffmpegInstallInProgress) return;
  ffmpegInstallInProgress = true;

  const modal = document.getElementById('ffmpeg-install-modal');
  const installBtn = document.getElementById('settings-install-ffmpeg-btn');
  const confirmBtn = document.getElementById('ffmpeg-confirm-install-btn');
  const errorText = document.getElementById('ffmpeg-install-error');
  if (modal) modal.style.display = 'none';
  openEngineSettings();
  if (installBtn) {
    installBtn.disabled = true;
    installBtn.querySelector('span').textContent = 'Installing...';
  }
  if (confirmBtn) confirmBtn.disabled = true;
  if (errorText) {
    errorText.style.display = 'none';
    errorText.textContent = '';
  }
  updateStatus('Downloading and verifying FFmpeg...');
  updateFfmpegInstallProgress({
    stage: 'downloading',
    downloadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    message: 'Connecting to FFmpeg download server...'
  });

  try {
    await invoke('install_managed_ffmpeg');
    updateStatus('FFmpeg installed successfully. Engine is ready.');
    await checkEngineStatus();
  } catch (error) {
    const message = String(error || 'FFmpeg installation failed.');
    if (errorText) {
      errorText.textContent = message;
      errorText.style.display = 'block';
    }
    if (installBtn) installBtn.querySelector('span').textContent = 'Retry Installation';
    updateStatus(message);
  } finally {
    ffmpegInstallInProgress = false;
    if (installBtn) installBtn.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

export function initFfmpegSetupControls() {
  document.getElementById('ffmpeg-fix-link')?.addEventListener('click', () => {
    if (latestFfmpegStatus?.platform === 'windows') {
      showFfmpegInstallConfirmation();
    } else {
      openEngineSettings();
    }
  });
  document.getElementById('settings-install-ffmpeg-btn')?.addEventListener('click', showFfmpegInstallConfirmation);
  document.getElementById('ffmpeg-confirm-install-btn')?.addEventListener('click', startManagedFfmpegInstall);
  document.getElementById('ffmpeg-cancel-install-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('ffmpeg-install-modal');
    if (modal) modal.style.display = 'none';
  });
  document.getElementById('ffmpeg-modal-close-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('ffmpeg-install-modal');
    if (modal) modal.style.display = 'none';
  });
  document.getElementById('ffmpeg-install-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'ffmpeg-install-modal' && !ffmpegInstallInProgress) {
      event.currentTarget.style.display = 'none';
    }
  });
  document.getElementById('settings-copy-ffmpeg-command-btn')?.addEventListener('click', async () => {
    const command = latestFfmpegStatus?.installCommand;
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      updateStatus('FFmpeg install command copied.');
    } catch (error) {
      updateStatus(`Could not copy command: ${error}`);
    }
  });
  document.getElementById('modal-copy-winget-btn')?.addEventListener('click', async () => {
    const command = 'winget install "FFmpeg (Essentials Build)"';
    try {
      await navigator.clipboard.writeText(command);
      updateStatus('Winget installation command copied.');
    } catch (error) {
      updateStatus(`Could not copy command: ${error}`);
    }
  });
  document.getElementById('settings-linux-recheck-btn')?.addEventListener('click', checkEngineStatus);

  listen('ffmpeg-install-progress', (event) => updateFfmpegInstallProgress(event.payload))
    .catch((error) => console.error('FFmpeg progress listener failed:', error));
}

export async function checkEngineStatus() {
  const ffmpegDot = document.getElementById('ffmpeg-dot');
  const ffmpegStatus = document.getElementById('ffmpeg-status-text');
  const ffmpegVersion = document.getElementById('ffmpeg-version-text');
  const ffmpegFix = document.getElementById('ffmpeg-fix-link');

  const settingsFfmpegDot = document.getElementById('settings-ffmpeg-dot');
  const settingsFfmpegStatus = document.getElementById('settings-ffmpeg-status-text');
  const settingsFfmpegVersion = document.getElementById('settings-ffmpeg-version');
  const settingsFfmpegSource = document.getElementById('settings-ffmpeg-source');
  const managedInstallCard = document.getElementById('ffmpeg-managed-install-card');
  const linuxGuideCard = document.getElementById('ffmpeg-linux-guide-card');
  const linuxDescription = document.getElementById('ffmpeg-linux-description');
  const linuxCommand = document.getElementById('ffmpeg-linux-command');
  const linuxWarning = document.getElementById('ffmpeg-linux-warning');
  const copyCommandBtn = document.getElementById('settings-copy-ffmpeg-command-btn');

  const customPath = localStorage.getItem('ffmpeg-custom-path') || null;

  try {
    const status = await invoke('get_ffmpeg_status', { customFfmpegPath: customPath });
    latestFfmpegStatus = status;
    const customPathInvalid = Boolean(customPath && status.source !== 'custom');

    if (status.available) {
      if (ffmpegDot) ffmpegDot.className = 'dot green';
      if (ffmpegStatus) ffmpegStatus.textContent = 'FFmpeg Engine: Active';
      if (ffmpegFix) ffmpegFix.style.display = 'none';
      if (managedInstallCard) managedInstallCard.style.display = 'none';
      if (linuxGuideCard) linuxGuideCard.style.display = 'none';

      if (settingsFfmpegDot) {
        settingsFfmpegDot.className = 'dot green';
        settingsFfmpegDot.style.background = 'var(--success)';
        settingsFfmpegDot.style.boxShadow = '0 0 5px var(--success)';
      }
      if (settingsFfmpegStatus) {
        settingsFfmpegStatus.textContent = customPathInvalid
          ? 'Status: Active (saved custom path is invalid)'
          : 'Status: Active';
      }
      if (ffmpegVersion) ffmpegVersion.textContent = `Version: ${status.version}`;
      if (settingsFfmpegVersion) settingsFfmpegVersion.textContent = `Version: ${status.version}`;
      if (settingsFfmpegSource) {
        settingsFfmpegSource.textContent = `Source: ${ffmpegSourceLabel(status.source)} · ${status.path}`;
        settingsFfmpegSource.title = status.path;
      }

      const currentHour = new Date().getHours();
      if (currentHour >= 23 || currentHour < 6) {
        setTimeout(() => {
          const speech = getAuraSpeech('sleepy_egg');
          setPersonaEmotion(speech.face, speech.msg);
        }, 1500);
      }
    } else {
      if (ffmpegDot) ffmpegDot.className = 'dot red';
      if (ffmpegStatus) ffmpegStatus.textContent = 'FFmpeg: Not Active';
      if (ffmpegFix) {
        ffmpegFix.style.display = 'inline-flex';
        const icon = status.platform === 'windows' ? 'download' : 'help-circle';
        ffmpegFix.innerHTML = `<i data-lucide="${icon}" style="width: 12px; height: 12px;"></i> ${status.platform === 'windows' ? 'Install FFmpeg' : 'How to Install FFmpeg'}`;
        if (window.lucide) window.lucide.createIcons();
      }

      if (settingsFfmpegDot) {
        settingsFfmpegDot.className = 'dot red';
        settingsFfmpegDot.style.background = 'var(--danger)';
        settingsFfmpegDot.style.boxShadow = '0 0 5px var(--danger)';
      }
      if (settingsFfmpegStatus) settingsFfmpegStatus.textContent = 'Status: Not Active';

      if (ffmpegVersion) ffmpegVersion.textContent = 'Version: Not Found';
      if (settingsFfmpegVersion) settingsFfmpegVersion.textContent = 'Version: Not Found';
      if (settingsFfmpegSource) settingsFfmpegSource.textContent = 'Source: Not detected';

      if (managedInstallCard) {
        managedInstallCard.style.display = status.platform === 'windows' && status.installSupported ? 'block' : 'none';
      }
      if (linuxGuideCard) {
        linuxGuideCard.style.display = status.platform === 'linux' ? 'block' : 'none';
      }
      if (status.platform === 'linux') {
        const distroName = status.distro || 'your Linux distribution';
        if (linuxDescription) {
          linuxDescription.textContent = status.installCommand
            ? `Detected ${distroName}. Run this command in a terminal, then return here and check again.`
            : `Could not determine a safe package command for ${distroName}. Use your package manager or the official downloads page.`;
        }
        if (linuxCommand) {
          linuxCommand.textContent = status.installCommand || 'See official FFmpeg downloads';
          linuxCommand.style.display = status.installCommand ? 'block' : 'none';
        }
        if (copyCommandBtn) copyCommandBtn.style.display = status.installCommand ? 'inline-flex' : 'none';
        if (linuxWarning) {
          linuxWarning.textContent = status.installWarning || '';
          linuxWarning.style.display = status.installWarning ? 'block' : 'none';
        }
      }

      const speech = getAuraSpeech('ffmpeg_missing');
      setPersonaEmotion(speech.face, speech.msg);
      if (typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive()) {
        setTheme('theme-blue');
      }

      if (!startupPopupShown) {
        startupPopupShown = true;
        setTimeout(() => {
          if (status.platform === 'windows') {
            showFfmpegInstallConfirmation();
          } else {
            openEngineSettings();
          }
        }, 1000);
      }
    }
  } catch (e) {
    latestFfmpegStatus = null;
    if (ffmpegDot) ffmpegDot.className = 'dot red';
    if (ffmpegStatus) ffmpegStatus.textContent = 'FFmpeg: Not Active';
    if (ffmpegFix) {
      ffmpegFix.style.display = 'inline-flex';
      ffmpegFix.innerHTML = `<i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> Install FFmpeg`;
      if (window.lucide) window.lucide.createIcons();
    }

    if (settingsFfmpegDot) {
      settingsFfmpegDot.className = 'dot red';
      settingsFfmpegDot.style.background = 'var(--danger)';
      settingsFfmpegDot.style.boxShadow = '0 0 5px var(--danger)';
    }
    if (settingsFfmpegStatus) settingsFfmpegStatus.textContent = 'Status: Error';

    if (ffmpegVersion) ffmpegVersion.textContent = 'Version: Error';
    if (settingsFfmpegVersion) settingsFfmpegVersion.textContent = 'Version: Error';
    if (settingsFfmpegSource) settingsFfmpegSource.textContent = 'Source: Status check failed';
    const speech = getAuraSpeech('ffmpeg_missing');
    setPersonaEmotion(speech.face, speech.msg);
    if (typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive()) {
      setTheme('theme-blue');
    }
  }
  checkYtdlpStatus();
}

export async function checkYtdlpStatus() {
  const settingsYtdlpDot = document.getElementById('settings-ytdlp-dot');
  const settingsYtdlpStatus = document.getElementById('settings-ytdlp-status-text');
  const settingsYtdlpVersion = document.getElementById('settings-ytdlp-version');
  const managedInstallCard = document.getElementById('ytdlp-managed-install-card');
  const customPath = localStorage.getItem('ytdlp-custom-path') || null;

  try {
    const status = await invoke('get_ytdlp_status', { customYtdlpPath: customPath });
    latestYtdlpStatus = status;

    if (status.available) {
      if (settingsYtdlpDot) {
        settingsYtdlpDot.className = 'dot green';
        settingsYtdlpDot.style.background = 'var(--success)';
        settingsYtdlpDot.style.boxShadow = '0 0 5px var(--success)';
      }
      if (settingsYtdlpStatus) {
        settingsYtdlpStatus.textContent = 'Status: Active';
      }
      if (settingsYtdlpVersion) {
        settingsYtdlpVersion.textContent = `Version: ${status.version} (${status.source})`;
      }
      if (managedInstallCard) {
        managedInstallCard.style.display = (status.source !== 'managed' && status.installSupported) ? 'block' : 'none';
      }
    } else {
      if (settingsYtdlpDot) {
        settingsYtdlpDot.className = 'dot red';
        settingsYtdlpDot.style.background = 'var(--danger)';
        settingsYtdlpDot.style.boxShadow = '0 0 5px var(--danger)';
      }
      if (settingsYtdlpStatus) settingsYtdlpStatus.textContent = 'Status: Not Active';
      if (settingsYtdlpVersion) settingsYtdlpVersion.textContent = 'Version: Not Found';

      if (managedInstallCard) {
        managedInstallCard.style.display = status.installSupported ? 'block' : 'none';
      }
    }
  } catch (e) {
    console.error("yt-dlp status check failed:", e);
    latestYtdlpStatus = null;
    if (settingsYtdlpDot) {
      settingsYtdlpDot.className = 'dot red';
      settingsYtdlpDot.style.background = 'var(--danger)';
      settingsYtdlpDot.style.boxShadow = '0 0 5px var(--danger)';
    }
    if (settingsYtdlpStatus) settingsYtdlpStatus.textContent = 'Status: Error';
    if (settingsYtdlpVersion) settingsYtdlpVersion.textContent = 'Version: Error';
  }
}
