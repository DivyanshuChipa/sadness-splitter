import { setPersonaEmotion, auraDialogues } from './aura_persona.js';

let isPlayingTrimRange = false;
let trimRangeCheckInterval = null;

export function getActivePreviewElement() {
  const previewVideo = document.getElementById('preview-video');
  const visualizerAudio = window.visualizerAudio;
  if (previewVideo && previewVideo.style.display !== 'none' && (previewVideo.getAttribute('src') || previewVideo.src)) {
    return previewVideo;
  }
  if (visualizerAudio && (visualizerAudio.getAttribute('src') || visualizerAudio.src)) {
    return visualizerAudio;
  }
  return null;
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function timeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  return 0;
}

export function isValidTimeFormat(timeStr) {
  const regex = /^(\d{2}):([0-5]\d):([0-5]\d)$/;
  return regex.test(timeStr);
}

export function syncMediaPlayerUI() {
  const activeEl = getActivePreviewElement();
  const hudSeekSlider = document.getElementById('hud-seek-slider');
  const hudTimeCurrent = document.getElementById('hud-time-current');
  const hudTimeTotal = document.getElementById('hud-time-total');

  if (!activeEl) return;

  const currentTime = activeEl.currentTime || 0;
  const duration = activeEl.duration || 0;

  if (hudTimeCurrent) {
    hudTimeCurrent.textContent = formatTime(currentTime);
  }

  if (hudTimeTotal && !isNaN(duration) && duration > 0) {
    hudTimeTotal.textContent = formatTime(duration);
    if (hudSeekSlider) {
      hudSeekSlider.max = duration;
      if (!hudSeekSlider.dataset.dragging) {
        hudSeekSlider.value = currentTime;
      }
    }
  } else if (hudTimeTotal) {
    hudTimeTotal.textContent = "00:00:00";
    if (hudSeekSlider) hudSeekSlider.value = 0;
  }
}

export function updatePlayButtons(isPlaying) {
  const previewPlayBtn = document.getElementById('preview-play-btn');
  const hudPlayBtn = document.getElementById('hud-play-btn');

  if (previewPlayBtn) {
    previewPlayBtn.innerHTML = isPlaying ? '<i data-lucide="pause"></i> Pause' : '<i data-lucide="play"></i> Play';
  }
  if (hudPlayBtn) {
    hudPlayBtn.innerHTML = isPlaying ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
  }
  if (window.lucide) window.lucide.createIcons();
}

export function updateVolumeButtonsState(volume, isMuted) {
  const volBtn = document.getElementById('hud-volume-btn');
  if (!volBtn) return;

  if (isMuted || volume === 0) {
    volBtn.innerHTML = '<i data-lucide="volume-x"></i>';
  } else if (volume < 0.5) {
    volBtn.innerHTML = '<i data-lucide="volume-1"></i>';
  } else {
    volBtn.innerHTML = '<i data-lucide="volume-2"></i>';
  }
  if (window.lucide) window.lucide.createIcons();
}

export function applyPersistedVolume() {
  const activeEl = getActivePreviewElement();
  if (!activeEl) return;
  const lastVol = parseFloat(localStorage.getItem('preview-volume'));
  const volume = isNaN(lastVol) ? 1.0 : lastVol;
  activeEl.volume = volume;
  const volSlider = document.getElementById('hud-volume-slider');
  if (volSlider) volSlider.value = volume;
  updateVolumeButtonsState(volume, activeEl.muted);
}

export function toggleMute() {
  const activeEl = getActivePreviewElement();
  const volSlider = document.getElementById('hud-volume-slider');
  if (!activeEl) return;

  const currentlyMuted = activeEl.muted || activeEl.volume === 0;
  if (currentlyMuted) {
    const lastVol = parseFloat(localStorage.getItem('preview-volume')) || 1.0;
    activeEl.volume = lastVol === 0 ? 1.0 : lastVol;
    activeEl.muted = false;
    if (volSlider) volSlider.value = activeEl.volume;
    updateVolumeButtonsState(activeEl.volume, false);
  } else {
    activeEl.muted = true;
    if (volSlider) volSlider.value = 0;
    updateVolumeButtonsState(0, true);
  }
}

export function handleVolumeSliderInput(e) {
  const val = parseFloat(e.target.value);
  const activeEl = getActivePreviewElement();
  if (activeEl) {
    activeEl.volume = val;
    activeEl.muted = (val === 0);
  }
  localStorage.setItem('preview-volume', val);
  updateVolumeButtonsState(val, false);
}

export function updatePreviewRotation() {
  const previewVideo = document.getElementById('preview-video');
  if (!previewVideo) return;

  const activeTab = document.querySelector('.nav-btn.active')?.dataset.target;
  if (activeTab === 'rotate') {
    const type = document.getElementById('rotate-select').value;
    if (type === "90 Clockwise") {
      previewVideo.style.transform = "rotate(90deg) scale(0.75)";
    } else if (type === "90 Counter") {
      previewVideo.style.transform = "rotate(-90deg) scale(0.75)";
    } else if (type === "180 Flip") {
      previewVideo.style.transform = "rotate(180deg)";
    } else {
      previewVideo.style.transform = "none";
    }
  } else {
    previewVideo.style.transform = "none";
  }
}

export function seekPreviewTo(seconds) {
  const previewVideo = document.getElementById('preview-video');
  if (previewVideo && previewVideo.src && !isNaN(seconds)) {
    previewVideo.currentTime = seconds;
  }
}

export function stopTrimRangePlayback() {
  const previewVideo = document.getElementById('preview-video');
  const previewTrimPlayBtn = document.getElementById('preview-trim-play-btn');
  isPlayingTrimRange = false;
  clearInterval(trimRangeCheckInterval);
  if (previewVideo) {
    previewVideo.pause();
  }
  if (previewTrimPlayBtn) {
    previewTrimPlayBtn.innerHTML = '<i data-lucide="play-circle"></i> Play Trim Selection';
    if (window.lucide) window.lucide.createIcons();
  }
}

export function initPreviewPlayer(filePath) {
  const previewVideo = document.getElementById('preview-video');
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const previewCompatWarning = document.getElementById('preview-compat-warning');
  const previewControls = document.getElementById('preview-controls');
  const previewPlayBtn = document.getElementById('preview-play-btn');
  const previewTrimPlayBtn = document.getElementById('preview-trim-play-btn');
  const previewCanvas = document.getElementById('preview-audio-canvas');

  if (!previewVideo) return;

  const previewOutBtn = document.getElementById('preview-output-btn');
  if (previewOutBtn) {
    previewOutBtn.style.display = 'none';
  }

  if (previewCanvas) {
    previewCanvas.style.display = 'none';
  }

  stopTrimRangePlayback();

  if (typeof window.visualizerAudio !== 'undefined' && window.visualizerAudio) {
    window.visualizerAudio.pause();
    window.visualizerAudio.removeAttribute('src');
    window.visualizerAudio.src = '';
    window.visualizerAudio.load();
  }
  if (typeof window.analysisAudio !== 'undefined' && window.analysisAudio) {
    window.analysisAudio.pause();
    window.analysisAudio.removeAttribute('src');
    window.analysisAudio.src = '';
    window.analysisAudio.load();
  }

  if (previewPlayBtn) {
    previewPlayBtn.innerHTML = '<i data-lucide="play"></i> Play';
  }

  const extension = filePath.split('.').pop().toLowerCase();
  const isSupported = ['mp4', 'mov', 'webm'].includes(extension);

  if (isSupported) {
    let assetUrl = filePath;
    const isLinux = navigator.userAgent.toLowerCase().includes('linux');
    if (isLinux && window.MEDIA_PORT) {
      const cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
      const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
      assetUrl = `http://127.0.0.1:${window.MEDIA_PORT}/media/${encodedPath}`;
    } else if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.convertFileSrc === 'function') {
      assetUrl = window.__TAURI__.core.convertFileSrc(filePath);
    } else {
      assetUrl = `https://asset.localhost/${filePath}`;
    }

    previewVideo.src = assetUrl;
    previewVideo.setAttribute('src', assetUrl);
    previewVideo.style.display = 'block';
    previewPlaceholder.style.display = 'none';
    previewCompatWarning.style.display = 'none';
    previewControls.style.display = 'flex';

    const fsTriggerBtn = document.getElementById('preview-fullscreen-trigger-btn');
    if (fsTriggerBtn) fsTriggerBtn.style.display = 'flex';

    previewVideo.load();

    const activeTab = document.querySelector('.nav-btn.active')?.dataset.target;
    if (previewTrimPlayBtn) {
      previewTrimPlayBtn.style.display = (activeTab === 'trim') ? 'flex' : 'none';
    }

    previewVideo.onloadedmetadata = () => {
      previewVideo.currentTime = 0;
      syncMediaPlayerUI();
    };

    previewVideo.ontimeupdate = () => {
      syncMediaPlayerUI();
    };
  } else {
    previewVideo.style.display = 'none';
    previewPlaceholder.style.display = 'none';
    previewCompatWarning.style.display = 'flex';
    previewControls.style.display = 'none';

    const fsTriggerBtn = document.getElementById('preview-fullscreen-trigger-btn');
    if (fsTriggerBtn) fsTriggerBtn.style.display = 'none';

    previewVideo.removeAttribute('src');
    previewVideo.src = '';
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

export function initFullscreenMediaPlayer() {
  const card = document.getElementById('live-preview-card');
  const triggerBtn = document.getElementById('preview-fullscreen-trigger-btn');
  const exitBtn = document.getElementById('hud-exit-fs-btn');
  const playBtn = document.getElementById('hud-play-btn');
  const seekSlider = document.getElementById('hud-seek-slider');
  const volBtn = document.getElementById('hud-volume-btn');
  const volSlider = document.getElementById('hud-volume-slider');
  const previewVideo = document.getElementById('preview-video');
  const previewCanvas = document.getElementById('preview-audio-canvas');

  if (!card) return;

  const toggleFS = () => {
    if (!document.fullscreenElement) {
      card.requestFullscreen().catch(err => {
        console.error("Failed to enter fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  if (triggerBtn) triggerBtn.addEventListener('click', toggleFS);
  if (exitBtn) exitBtn.addEventListener('click', toggleFS);

  if (previewVideo) previewVideo.addEventListener('dblclick', toggleFS);
  if (previewCanvas) previewCanvas.addEventListener('dblclick', toggleFS);

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const activeEl = getActivePreviewElement();
      if (!activeEl) return;
      if (activeEl.paused) {
        activeEl.play();
      } else {
        activeEl.pause();
      }
    });
  }

  if (seekSlider) {
    seekSlider.addEventListener('input', (e) => {
      seekSlider.dataset.dragging = "true";
      const val = parseFloat(e.target.value);
      const hudTimeCurrent = document.getElementById('hud-time-current');
      if (hudTimeCurrent) hudTimeCurrent.textContent = formatTime(val);
    });

    seekSlider.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      const activeEl = getActivePreviewElement();
      if (activeEl) activeEl.currentTime = val;
      delete seekSlider.dataset.dragging;
    });
  }

  if (volBtn) volBtn.addEventListener('click', toggleMute);
  if (volSlider) volSlider.addEventListener('input', handleVolumeSliderInput);

  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = (document.fullscreenElement === card);
    const hud = document.getElementById('fullscreen-media-hud');
    const normalControls = document.getElementById('preview-controls');

    if (isFullscreen) {
      if (hud) hud.style.display = 'flex';
      if (normalControls) normalControls.style.display = 'none';

      const visualizerAudio = window.visualizerAudio;
      const isAudioActive = visualizerAudio && (visualizerAudio.getAttribute('src') || visualizerAudio.src);
      const hudSelect = document.getElementById('hud-visualizer-select');
      if (hudSelect) {
        hudSelect.style.display = isAudioActive ? 'block' : 'none';
      }

      applyPersistedVolume();
    } else {
      if (hud) hud.style.display = 'none';

      const activeEl = getActivePreviewElement();
      if (activeEl && normalControls) {
        normalControls.style.display = 'flex';
      }
    }

    if (window.lucide) window.lucide.createIcons();
  });
}

export function initPreviewControlsEvents() {
  const previewVideo = document.getElementById('preview-video');
  const previewPlayBtn = document.getElementById('preview-play-btn');
  const previewTrimPlayBtn = document.getElementById('preview-trim-play-btn');

  const splitSlider = document.getElementById('split-slider');
  const splitTimeInput = document.getElementById('split-time-input');

  const trimSliderStart = document.getElementById('trim-slider-start');
  const trimSliderEnd = document.getElementById('trim-slider-end');
  const trimTimeStart = document.getElementById('trim-time-start');
  const trimTimeEnd = document.getElementById('trim-time-end');

  if (splitSlider) {
    splitSlider.addEventListener('input', (e) => {
      stopTrimRangePlayback();
      seekPreviewTo(parseFloat(e.target.value));
    });
  }
  if (splitTimeInput) {
    splitTimeInput.addEventListener('input', () => {
      const val = splitTimeInput.value.trim();
      if (isValidTimeFormat(val)) {
        stopTrimRangePlayback();
        seekPreviewTo(timeToSeconds(val));
      }
    });
  }

  if (trimSliderStart) {
    trimSliderStart.addEventListener('input', (e) => {
      stopTrimRangePlayback();
      seekPreviewTo(parseFloat(e.target.value));
    });
  }
  if (trimTimeStart) {
    trimTimeStart.addEventListener('input', () => {
      const val = trimTimeStart.value.trim();
      if (isValidTimeFormat(val)) {
        stopTrimRangePlayback();
        seekPreviewTo(timeToSeconds(val));
      }
    });
  }

  if (trimSliderEnd) {
    trimSliderEnd.addEventListener('input', (e) => {
      stopTrimRangePlayback();
      seekPreviewTo(parseFloat(e.target.value));
    });
  }
  if (trimTimeEnd) {
    trimTimeEnd.addEventListener('input', () => {
      const val = trimTimeEnd.value.trim();
      if (isValidTimeFormat(val)) {
        stopTrimRangePlayback();
        seekPreviewTo(timeToSeconds(val));
      }
    });
  }

  if (previewPlayBtn) {
    previewPlayBtn.addEventListener('click', () => {
      const visualizerAudio = window.visualizerAudio;
      if (visualizerAudio && (visualizerAudio.getAttribute('src') || visualizerAudio.src)) {
        if (visualizerAudio.paused) {
          visualizerAudio.play();
        } else {
          visualizerAudio.pause();
        }
        return;
      }

      if (!previewVideo || (!previewVideo.getAttribute('src') && !previewVideo.src)) return;

      const wasPaused = previewVideo.paused;
      if (isPlayingTrimRange) {
        stopTrimRangePlayback();
      }

      if (wasPaused) {
        previewVideo.play();
        previewPlayBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
      } else {
        previewVideo.pause();
        previewPlayBtn.innerHTML = '<i data-lucide="play"></i> Play';
      }
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (previewTrimPlayBtn) {
    previewTrimPlayBtn.addEventListener('click', () => {
      if (!previewVideo || !previewVideo.src) return;

      const startVal = parseInt(trimSliderStart.value) || 0;
      const endVal = parseInt(trimSliderEnd.value) || Math.floor(window.videoDuration || 0);

      if (isPlayingTrimRange) {
        stopTrimRangePlayback();
      } else {
        isPlayingTrimRange = true;
        previewTrimPlayBtn.innerHTML = '<i data-lucide="pause-circle"></i> Pause Selection';
        if (window.lucide) window.lucide.createIcons();

        previewVideo.currentTime = startVal;
        previewVideo.play();

        trimRangeCheckInterval = setInterval(() => {
          if (previewVideo.currentTime >= endVal || previewVideo.currentTime < startVal) {
            stopTrimRangePlayback();
          }
        }, 100);
      }
    });
  }

  if (previewVideo) {
    previewVideo.addEventListener('pause', () => {
      if (!isPlayingTrimRange && previewPlayBtn) {
        previewPlayBtn.innerHTML = '<i data-lucide="play"></i> Play';
        if (window.lucide) window.lucide.createIcons();
      }
    });
    previewVideo.addEventListener('play', () => {
      if (!isPlayingTrimRange && previewPlayBtn) {
        previewPlayBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  const rotateSelect = document.getElementById('rotate-select');
  if (rotateSelect) {
    rotateSelect.addEventListener('change', () => {
      updatePreviewRotation();
    });
  }

  initFullscreenMediaPlayer();
}

let focusedPreviewTimer = null;

export function startFocusedPreviewTimer(targetId) {
  if (focusedPreviewTimer) {
    clearTimeout(focusedPreviewTimer);
    focusedPreviewTimer = null;
  }

  resetFocusedPreviewMode();

  if (targetId === 'trim' || targetId === 'split' || targetId === 'rotate' || targetId === 'video-thumbnail') {
    focusedPreviewTimer = setTimeout(() => {
      triggerFocusedPreviewMode();
    }, 180000);
  }
}

export function triggerFocusedPreviewMode() {
  const previewCard = document.getElementById('live-preview-card');
  const scrollableContent = document.querySelector('.scrollable-content');
  const toolViewsContainer = document.querySelector('.tool-views');

  if (!previewCard || !scrollableContent || !toolViewsContainer) return;

  document.body.classList.add('focused-preview-active');
  scrollableContent.insertBefore(previewCard, toolViewsContainer);

  const currentLang = localStorage.getItem('settings-aura-language') || 'hinglish';
  const dialect = auraDialogues[currentLang] || auraDialogues['hinglish'];
  const speech = dialect['eyesight_care'] || auraDialogues['hinglish']['eyesight_care'];
  if (speech) {
    setPersonaEmotion(speech.face, speech.msg);
  }
}

export function resetFocusedPreviewMode() {
  const previewCard = document.getElementById('live-preview-card');
  const rightPanel = document.querySelector('.right-panel');

  if (document.body.classList.contains('focused-preview-active')) {
    document.body.classList.remove('focused-preview-active');
    if (rightPanel && previewCard) {
      rightPanel.insertBefore(previewCard, rightPanel.firstChild);
    }
  }
}
