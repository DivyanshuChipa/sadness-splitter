const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const tauriDialog = window.__TAURI__?.dialog || window.__TAURI__?.pluginDialog || window.__TAURI__?.plugin?.dialog;

// --- UI Elements ---
const navBtns = document.querySelectorAll('.nav-btn');
const toolViews = document.querySelectorAll('.tool-view');
const statusText = document.getElementById('status-text');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');

let isDemoMode = false; // Controlled by tour/emotional mode choices
let globalInputPath = "";
let globalOutputPath = "";
let videoDuration = 0;
let previewPromptCount = 0;
let isWaitingForPreviewConsent = false;
let previewConsentTimer = null;

// Emotional Stages
const emotionalStages = [
  { min: 0, max: 20, msg: "Denial phase: pretending everything is fine...", face: "face_denial.png" },
  { min: 20, max: 40, msg: "Anger phase: codec fighting bitrate...", face: "face_anger.png" },
  { min: 40, max: 60, msg: "Bargaining phase: CRF negotiating with pixels...", face: "face_bargaining.png" },
  { min: 60, max: 80, msg: "Depression phase: slow contemplation of life's choices...", face: "face_depression.png" },
  { min: 80, max: 101, msg: "Acceptance: sadness re-encoded successfully 💛", face: "face_acceptance.png" }
];

// --- Reactive Persona System ---
const reactiveFace = document.getElementById('reactive-face');
let pokeCount = 0;
let pokeTimer = null;
let idleTimer = null;
let isIdle = false;
let flashTimer = null;
let isFlashing = false;
let autoGlowTimer = null;
let hoverCount = 0;
let hoverResetTimer = null;
let metricsHoverCount = 0;

const toolReactions = {
  'compress': { face: 'face_confident.png', msg: "File too heavy? Let’s shrink it down! 💪" },
  'split': { face: 'face_thinking.png', msg: "Where should I cut? I’m figuring it out… 🤔" },
  'trim': { face: 'face_determined.png', msg: "Time to clean up the unnecessary junk! ✂️" },
  'rotate': { face: 'face_surprised.png', msg: "Want a new perspective? Got it! 🔄" },
  'audio': { face: 'face_curious.png', msg: "Only need the sound? Aura is listening… 🎧" },
  'convert': { face: 'face_smug.png', msg: "Changing format? Easy peasy! ✨" },
  'subtitle': { face: 'face_thinking.png', msg: "Words matter. Let’s burn those subtitles in! ✍️" },
  'speed': { face: 'face_exicited.png', msg: "Speed warp! Fast or slow, Aura handles it all! ⚡" },
  'gif': { face: 'face_laughing.png', msg: "Meme time! Let’s make a cool GIF! 😂" },
  'merger': { face: 'face_love.png', msg: "Combine them both? Sweet! 💖" },
  'stabilize': { face: 'face_shocked.png', msg: "So much shake?! Don’t worry, I’ll fix it! 😵‍💫" },
  'contact': { face: 'face_curious.png', msg: "Want to see everything at once? Let’s go! 🖼️" },
  'batch': { face: 'face_surprised.png', msg: "So many files? Looks like you’ve got me working overtime…" }
};

const emoteThemeMap = {
  'face_denial.png': 'theme-white',
  'face_anger.png': 'theme-red',
  'face_angry.png': 'theme-red',
  'face_bargaining.png': 'theme-purple',
  'face_depression.png': 'theme-blue',
  'face_acceptance.png': 'theme-gold',
  'face_confident.png': 'theme-yellow',
  'face_thinking.png': 'theme-purple',
  'face_determined.png': 'theme-blue',
  'face_surprised.png': 'theme-yellow',
  'face_curious.png': 'theme-purple',
  'face_smug.png': 'theme-green',
  'face_exicited.png': 'theme-pink',
  'face_laughing.png': 'theme-yellow',
  'face_love.png': 'theme-pink',
  'face_shocked.png': 'theme-red',
  'face_bored.png': 'theme-white',
  'face_embrrasment.png': 'theme-pink',
  'face_sleepy.png': 'theme-yellow'
};

function updatePersonaFace(percent) {
  if (pokeCount > 5) return; // Don't override if angry
  if (localStorage.getItem('settings-aura-silenced') === 'true') {
    if (reactiveFace) reactiveFace.src = 'emotive-ani-character/face_neutral.png';
    return;
  }

  const stage = emotionalStages.find(s => percent >= s.min && percent <= s.max);
  if (stage && reactiveFace) {
    reactiveFace.src = `emotive-ani-character/${stage.face}`;

    // Apply theme mapping
    if (typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive()) {
      if (emoteThemeMap[stage.face]) setTheme(emoteThemeMap[stage.face]);
    }
  }
}

function setPersonaEmotion(face, message) {
  if (localStorage.getItem('settings-aura-silenced') === 'true') {
    if (reactiveFace) reactiveFace.src = 'emotive-ani-character/face_neutral.png';
    return;
  }
  if (pokeCount > 5) return;
  if (reactiveFace) reactiveFace.src = `emotive-ani-character/${face}`;

  // Apply theme mapping
  if (typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive()) {
    if (emoteThemeMap[face]) setTheme(emoteThemeMap[face]);
  }

  if (message) updateStatus(message);
}

function clearPreviewConsentState() {
  isWaitingForPreviewConsent = false;
  clearTimeout(previewConsentTimer);
  const previewSettingsItem = document.getElementById('preview-settings-item');
  if (previewSettingsItem) {
    previewSettingsItem.classList.remove('preview-pulse-highlight');
  }
}

function flashRedYellow() {
  if (isFlashing) return;
  isFlashing = true;
  let count = 0;
  flashTimer = setInterval(() => {
    if (count % 2 === 0) setTheme('theme-yellow');
    else setTheme('theme-red');
    count++;
    if (count >= 8) { // 4 alternates
      clearInterval(flashTimer);
      isFlashing = false;
      setTheme('theme-red'); // end on red
    }
  }, 300);
}

// Reset idle system
function resetIdleTimer() {
  if (isIdle) {
    isIdle = false;
    setTheme('theme-blue');
    setPersonaEmotion('face_exicited.png', "Let's go!");
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    isIdle = true;
    const isEmotional = typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive();
    if (isEmotional) {
      setTheme('theme-white');
    }
    setPersonaEmotion('face_bored.png', "Hey man, do something! I am getting bored.");
  }, 120000); // 2 minutes
}

// Attach idle listeners
document.addEventListener('mousemove', resetIdleTimer);
document.addEventListener('keydown', resetIdleTimer);
document.addEventListener('click', resetIdleTimer);
resetIdleTimer(); // Start timer

// Sassy Interaction (Poking)
if (reactiveFace) {
  reactiveFace.addEventListener('click', () => {
    pokeCount++;
    const isEmotional = typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive();

    if (pokeCount === 6) {
      reactiveFace.src = `emotive-ani-character/face_angry.png`;
      updateStatus("ENOUGH IS ENOUGH! 🌋");
      if (isEmotional) flashRedYellow();

      clearTimeout(pokeTimer);
      pokeTimer = setTimeout(() => {
        pokeCount = 0;
        const currentPercent = parseFloat(progressFill.style.width) || 0;
        updatePersonaFace(currentPercent);
        updateStatus("Ready to process emotional baggage.");
      }, 4000);
    } else if (pokeCount > 6) {
      // Ignore during flash
    } else if (pokeCount === 5) {
      reactiveFace.src = `emotive-ani-character/face_anger.png`;
      updateStatus("HEY! Stop poking me and focus on your work! 💢");
      if (isEmotional) setTheme('theme-red');

      clearTimeout(pokeTimer);
      pokeTimer = setTimeout(() => {
        if (pokeCount === 5) { // Only reset if they didn't poke again to trigger 6
          pokeCount = 0;
          const currentPercent = parseFloat(progressFill.style.width) || 0;
          updatePersonaFace(currentPercent);
          updateStatus("Ready to process emotional baggage.");
        }
      }, 3000);
    }
  });

  // Hover-to-Anger (5 hovers = anger — independent of click system)
  reactiveFace.addEventListener('mouseenter', () => {
    if (hoverCount >= 5) return;
    clearTimeout(hoverResetTimer);
    hoverCount++;

    if (hoverCount === 5) {
      hoverCount = 0;
      reactiveFace.src = `emotive-ani-character/face_angry.png`;
      updateStatus("STOP STARING AT ME! Mind your own business! 😤🌋");
      const isEmotional = typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive();
      if (isEmotional) flashRedYellow();
      setTimeout(() => {
        const currentPercent = parseFloat(progressFill.style.width) || 0;
        updatePersonaFace(currentPercent);
        updateStatus("Ready to process emotional baggage.");
      }, 4000);
    } else {
      // Reset hover streak if user goes away for 2s
      hoverResetTimer = setTimeout(() => { hoverCount = 0; }, 2000);
    }
  });

  // Easter Egg Contextual Hovers
  const browseBtn = document.getElementById('browse-input-btn');
  if (browseBtn) {
    browseBtn.addEventListener('mouseenter', () => {
      setPersonaEmotion('face_smug.png', "Want to select a video file?");
      if (typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive()) {
        setTheme('theme-green');
      }
    });
  }

  const metricsCard = document.querySelector('.metrics-card');
  if (metricsCard) {
    metricsCard.addEventListener('mouseenter', () => {
      if (metricsHoverCount < 2) {
        metricsHoverCount++;
        setPersonaEmotion('face_embrrasment.png', "Oh, you like my performance stats? 👉👈");
        if (typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive()) {
          setTheme('theme-pink');
        }
      }
    });
  }

  const creatorCard = document.querySelector('.about-card');
  if (creatorCard) {
    creatorCard.addEventListener('mouseenter', () => {
      setPersonaEmotion('face_sleepy.png', "That section is just for showing off... yawn.");
    });
  }
}

// Initialize Lucide Icons
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
});

// --- Navigation ---
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class from all buttons and tool views
    navBtns.forEach(b => b.classList.remove('active'));
    toolViews.forEach(v => {
      v.classList.remove('active');
      v.style.display = 'none'; // Keep this for backup if needed, but class is primary
    });

    // Add active class to clicked button and target view
    const targetId = btn.dataset.target;
    btn.classList.add('active');
    const targetView = document.getElementById(targetId);
    targetView.classList.add('active');
    targetView.style.display = 'block';

    // Update Play Trim Selection visibility in Live Preview
    const previewTrimPlayBtn = document.getElementById('preview-trim-play-btn');
    if (previewTrimPlayBtn) {
      previewTrimPlayBtn.style.display = (targetId === 'trim') ? 'flex' : 'none';
    }

    // Aura Reacts to Tab Change
    const reaction = toolReactions[targetId];
    if (reaction) {
      setPersonaEmotion(reaction.face, reaction.msg);
    }

    // Interactive Video Preview Suggestion Flow
    const previewToggleInput = document.getElementById('preview-toggle-input');
    const previewSettingsItem = document.getElementById('preview-settings-item');
    if ((targetId === 'trim' || targetId === 'split') && previewToggleInput && !previewToggleInput.checked && previewPromptCount < 2) {
      // Clear previous timer/highlight if any
      clearPreviewConsentState();

      previewPromptCount++;
      isWaitingForPreviewConsent = true;

      // Small natural delay for suggestion to appear after initial tab reaction
      setTimeout(() => {
        if (isWaitingForPreviewConsent) {
          setPersonaEmotion('face_curious.png', "Hey! You want to trim/split? It's much better to preview what you are cutting! Let's turn on Video Preview? 😉");
          if (previewSettingsItem) {
            previewSettingsItem.classList.add('preview-pulse-highlight');
          }

          // Timeout to clear highlight and reset state if ignored
          previewConsentTimer = setTimeout(() => {
            if (isWaitingForPreviewConsent) {
              clearPreviewConsentState();
              setPersonaEmotion('face_neutral.png', "Ok, as you wish. 💛");
            }
          }, 12000); // 12 seconds
        }
      }, 900);
    } else {
      // If clicking away to another tool, dismiss the suggest highlights cleanly
      if (targetId !== 'trim' && targetId !== 'split') {
        clearPreviewConsentState();
      }
    }

    // Update video preview rotation
    updatePreviewRotation();

    // Refresh icons just in case (though usually not needed)
    lucide.createIcons();
  });
});

// --- System Engine Check ---
async function checkEngineStatus() {
  const ffmpegDot = document.getElementById('ffmpeg-dot');
  const ffmpegStatus = document.getElementById('ffmpeg-status-text');
  const ffmpegVersion = document.getElementById('ffmpeg-version-text');
  const ffmpegFix = document.getElementById('ffmpeg-fix-link');

  const settingsFfmpegDot = document.getElementById('settings-ffmpeg-dot');
  const settingsFfmpegStatus = document.getElementById('settings-ffmpeg-status-text');
  const settingsFfmpegVersion = document.getElementById('settings-ffmpeg-version');

  const customPath = localStorage.getItem('ffmpeg-custom-path') || null;

  try {
    const isReady = await invoke('check_ffmpeg', { customFfmpegPath: customPath });
    if (isReady) {
      if (ffmpegDot) ffmpegDot.className = 'dot green';
      if (ffmpegStatus) ffmpegStatus.textContent = 'FFmpeg Engine: Active';
      if (ffmpegFix) ffmpegFix.style.display = 'none';

      if (settingsFfmpegDot) {
        settingsFfmpegDot.className = 'dot green';
        settingsFfmpegDot.style.background = 'var(--success)';
        settingsFfmpegDot.style.boxShadow = '0 0 5px var(--success)';
      }
      if (settingsFfmpegStatus) settingsFfmpegStatus.textContent = 'Status: Active';

      try {
        const version = await invoke('get_ffmpeg_version', { customFfmpegPath: customPath });
        if (ffmpegVersion) {
          ffmpegVersion.textContent = `Version: ${version}`;
        }
        if (settingsFfmpegVersion) {
          settingsFfmpegVersion.textContent = `Version: ${version}`;
        }
      } catch (verErr) {
        if (ffmpegVersion) ffmpegVersion.textContent = 'Version: Unknown';
        if (settingsFfmpegVersion) settingsFfmpegVersion.textContent = 'Version: Unknown';
      }

      // Sleepy Easter egg for late night/early morning hours
      const currentHour = new Date().getHours();
      if (currentHour >= 23 || currentHour < 6) {
        setTimeout(() => {
          setPersonaEmotion('face_sleepy.png', "Yawn... Raat kaafi ho gayi hai, Sadness Split karte karte so mat jana! 🥱💤");
        }, 1500);
      }
    } else {
      if (ffmpegDot) ffmpegDot.className = 'dot red';
      if (ffmpegStatus) ffmpegStatus.textContent = 'FFmpeg: Not Active';
      if (ffmpegFix) ffmpegFix.style.display = 'block';

      if (settingsFfmpegDot) {
        settingsFfmpegDot.className = 'dot red';
        settingsFfmpegDot.style.background = 'var(--danger)';
        settingsFfmpegDot.style.boxShadow = '0 0 5px var(--danger)';
      }
      if (settingsFfmpegStatus) settingsFfmpegStatus.textContent = 'Status: Not Active';

      if (ffmpegVersion) ffmpegVersion.textContent = 'Version: Not Found';
      if (settingsFfmpegVersion) settingsFfmpegVersion.textContent = 'Version: Not Found';
      setPersonaEmotion('face_depression.png', "Oh no... Please install FFmpeg! Without it, I am nothing... 😭");
      if (typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive()) {
        setTheme('theme-blue');
      }
    }
  } catch (e) {
    if (ffmpegDot) ffmpegDot.className = 'dot red';
    if (ffmpegStatus) ffmpegStatus.textContent = 'FFmpeg: Not Active';
    if (ffmpegFix) ffmpegFix.style.display = 'block';

    if (settingsFfmpegDot) {
      settingsFfmpegDot.className = 'dot red';
      settingsFfmpegDot.style.background = 'var(--danger)';
      settingsFfmpegDot.style.boxShadow = '0 0 5px var(--danger)';
    }
    if (settingsFfmpegStatus) settingsFfmpegStatus.textContent = 'Status: Error';

    if (ffmpegVersion) ffmpegVersion.textContent = 'Version: Error';
    if (settingsFfmpegVersion) settingsFfmpegVersion.textContent = 'Version: Error';
    setPersonaEmotion('face_depression.png', "Oh no... Please install FFmpeg! Without it, I am nothing... 😭");
    if (typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive()) {
      setTheme('theme-blue');
    }
  }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initSettingsModal();
  checkEngineStatus();

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
    emotionalToggleInput.addEventListener('change', (e) => {
      const isActive = typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive();
      if (isActive) window.stopEmotionalMode?.();
      else window.startEmotionalMode?.();
    });
  }

  // Live Video Preview Toggle Logic
  const previewToggleInput = document.getElementById('preview-toggle-input');
  const livePreviewCard = document.getElementById('live-preview-card');

  if (previewToggleInput && livePreviewCard) {
    // Load saved preference, default to true (show) if not set
    const showPreview = localStorage.getItem('show-video-preview') !== 'false';
    previewToggleInput.checked = showPreview;
    livePreviewCard.style.display = showPreview ? 'flex' : 'none';

    previewToggleInput.addEventListener('change', (e) => {
      if (e.target.checked) {
        livePreviewCard.style.display = 'flex';
        localStorage.setItem('show-video-preview', 'true');

        // Dynamic reaction if they complied with Aura's suggest flow
        if (isWaitingForPreviewConsent) {
          clearPreviewConsentState();
          setTimeout(() => {
            setPersonaEmotion('face_exicited.png', "Yay! Now you can see exactly where you are cutting! 🎬✨");
          }, 300);
        }

        // Re-initialize Lucide Icons just in case
        if (window.lucide) window.lucide.createIcons();
      } else {
        livePreviewCard.style.display = 'none';
        localStorage.setItem('show-video-preview', 'false');

        // Safely pause video playback to conserve system resources
        if (typeof stopTrimRangePlayback === 'function') {
          stopTrimRangePlayback();
        } else {
          const previewVideo = document.getElementById('preview-video');
          if (previewVideo) previewVideo.pause();
        }
      }
    });
  }

  startSystemMetrics();

  // About Card Collapsible Toggle
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
        lucide.createIcons();
      }
    });
  }
});

// Demo mode logic is now handled in tour.js via the dialog.

function updateStatus(msg) {
  statusText.textContent = msg;

  // Sync with sidebar status card
  const auraStatusVal = document.getElementById('aura-status-val');
  if (auraStatusVal) {
    if (msg.toLowerCase().includes("ready")) {
      auraStatusVal.textContent = "Ready";
    } else if (msg.toLowerCase().includes("processing") || msg.toLowerCase().includes("initiating") || msg.toLowerCase().includes("beginning")) {
      auraStatusVal.textContent = "Processing...";
    } else if (msg.length < 25) {
      auraStatusVal.textContent = msg;
    } else {
      auraStatusVal.textContent = "Active";
    }
  }

  // Trigger pop animation on speech bubble
  const container = document.getElementById('aura-speech-container');
  if (container) {
    container.classList.remove('speech-update');
    void container.offsetWidth; // Trigger reflow
    container.classList.add('speech-update');

    // Auto-glow for 4 seconds (mascot + speech bubble synced)
    container.classList.add('speech-auto-glow');
    if (reactiveFace) reactiveFace.classList.add('mascot-glow');
    clearTimeout(autoGlowTimer);
    autoGlowTimer = setTimeout(() => {
      container.classList.remove('speech-auto-glow');
      if (reactiveFace) reactiveFace.classList.remove('mascot-glow');
    }, 4000);
  }
}

// --- Global Setup ---
// In a real app without bundler, we might need a workaround for dialog if plugin isn't globally exposed easily.
// For now, we will simulate the paths or use manual input for simplicity if open() fails.
document.getElementById('browse-input-btn').addEventListener('click', async () => {
  try {
    const file = await tauriDialog.open({
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }]
    });
    if (file) {
      globalInputPath = file;
      document.getElementById('global-input-path').value = file;

      const filename = file.split(/[\/\\]/).pop();
      updateStatus(`Selected: ${filename}`);
      setPersonaEmotion('face_happy.png', `Mil gayi file! Ab shuru karein? ${filename}`);

      // Get Duration (Needed for Sliders)
      videoDuration = await invoke('get_video_duration', { filePath: file, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });

      // Initialize Timeline Sliders
      const splitSlider = document.getElementById('split-slider');
      const splitTimeInput = document.getElementById('split-time-input');
      const runSplitBtn = document.getElementById('run-split-btn');
      if (splitSlider) {
        splitSlider.max = Math.floor(videoDuration);
        splitSlider.value = 0;
        document.getElementById('split-slider-value').textContent = "00:00:00";
        if (splitTimeInput) {
          splitTimeInput.value = "00:00:00";
          splitTimeInput.classList.remove('invalid-input');
        }
        if (runSplitBtn) {
          runSplitBtn.disabled = false;
          runSplitBtn.style.opacity = '1';
          runSplitBtn.style.pointerEvents = 'auto';
        }
      }

      const trimStart = document.getElementById('trim-slider-start');
      const trimEnd = document.getElementById('trim-slider-end');
      const trimTimeStart = document.getElementById('trim-time-start');
      const trimTimeEnd = document.getElementById('trim-time-end');
      const runTrimBtn = document.getElementById('run-trim-btn');
      if (trimStart && trimEnd) {
        trimStart.max = Math.floor(videoDuration);
        trimEnd.max = Math.floor(videoDuration);
        trimStart.value = 0;
        trimEnd.value = Math.floor(videoDuration);
        document.getElementById('trim-label-start').textContent = "00:00:00";
        document.getElementById('trim-label-end').textContent = formatTime(Math.floor(videoDuration));
        if (trimTimeStart && trimTimeEnd) {
          trimTimeStart.value = "00:00:00";
          trimTimeEnd.value = formatTime(Math.floor(videoDuration));
          trimTimeStart.classList.remove('invalid-input');
          trimTimeEnd.classList.remove('invalid-input');
        }
        if (runTrimBtn) {
          runTrimBtn.disabled = false;
          runTrimBtn.style.opacity = '1';
          runTrimBtn.style.pointerEvents = 'auto';
        }
      }

      // Initialize Live Video Preview Player
      initPreviewPlayer(file);
    }
  } catch (e) {
    console.error("Dialog error:", e);
    updateStatus("Failed to open file dialog. Check permissions.");
  }
});

document.getElementById('browse-output-btn').addEventListener('click', async () => {
  try {
    const folder = await tauriDialog.open({ directory: true });
    if (folder) {
      globalOutputPath = folder;
      document.getElementById('global-output-path').value = folder;
      updateStatus(`Output folder set: ${folder}`);
    }
  } catch (e) {
    console.error("Dialog error:", e);
    updateStatus("Failed to open folder dialog.");
  }
});

let displayedProgress = 0;

function setProgressMode(totalDuration = 0) {
  const hasKnownDuration = Number(totalDuration) > 0;
  progressFill.classList.toggle('indeterminate', !hasKnownDuration);
  if (!hasKnownDuration) {
    progressFill.style.width = '100%';
    progressLabel.textContent = 'Emotional Level: Processing...';
  } else {
    progressFill.classList.remove('indeterminate');
    progressFill.style.width = '0%';
    progressLabel.textContent = 'Emotional Level: 0%';
  }
}


function setProgressSmooth(target) {
  const clamped = Math.max(displayedProgress, Math.min(100, Number(target) || 0));
  displayedProgress += (clamped - displayedProgress) * 0.35;
  if (Math.abs(clamped - displayedProgress) < 0.5) displayedProgress = clamped;
  progressFill.style.width = `${displayedProgress.toFixed(1)}%`;
  progressLabel.textContent = `Emotional Level: ${Math.round(displayedProgress)}%`;
}

function setMetricRing(el, value) {
  if (!el) return;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  el.style.setProperty('--metric-value', `${v}%`);
}


function updateEmotionalToggleUI(isActive) {
  const input = document.getElementById('emotional-toggle-input');
  if (!input) return;
  input.checked = isActive;
}

let lastCpuWarningTime = 0;

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

      // High CPU / RAM Panic warning with 30-second cooldown
      if (Number.isFinite(ram) && Number.isFinite(cpu)) {
        const now = Date.now();
        if ((cpu > 85 || ram > 85) && (now - lastCpuWarningTime > 30000)) {
          lastCpuWarningTime = now;
          setPersonaEmotion('face_shocked.png', "Oye! System statistics are sweating! 🥵 Mere dimaag me fire lag gayi hai! 🔥");
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

// --- Progress Listener ---
listen('progress', (event) => {
  const percent = event.payload.percentage;
  progressFill.classList.remove('indeterminate');
  setProgressSmooth(percent);

  const stage = emotionalStages.find(s => percent >= s.min && percent < s.max);
  if (stage) {
    updateStatus(`Sadness Meter: ${stage.msg}`);
    updatePersonaFace(percent);
  }
});

listen('finished', (event) => {
  progressFill.classList.remove('indeterminate');
  const activeTab = document.querySelector('.nav-btn.active')?.dataset.target;
  
  const successReactions = {
    'compress': { face: 'face_confident.png', msg: "Boom! Heavy baggage successfully compressed into a compact file! 😎" },
    'split': { face: 'face_smug.png', msg: "Cut clean! Your memories have been successfully split! ✂️" },
    'trim': { face: 'face_determined.png', msg: "Trim complete! All unnecessary clutter has been cut away! 🧼" },
    'rotate': { face: 'face_laughing.png', msg: "Perspective rotated successfully! Looks amazing from this side! 🔄" },
    'audio': { face: 'face_curious.png', msg: "Audio successfully extracted! Aura is vibing to these beats! 🎧🎶" },
    'convert': { face: 'face_smug.png', msg: "Conversion success! Brand new format, same emotions! ✨" },
    'subtitle': { face: 'face_confident.png', msg: "Subtitles burned in! Every single word now carries weight! ✍️" },
    'speed': { face: 'face_exicited.png', msg: "Speed Warp applied! Time dilation is complete! ⚡" },
    'gif': { face: 'face_laughing.png', msg: "Elite loop generated! Go share this loop and spread the laughter! 😂" },
    'merger': { face: 'face_love.png', msg: "Videos merged! Your timelines are beautifully unified! 💖" },
    'stabilize': { face: 'face_exicited.png', msg: "Anti-shake complete! Smooth footage achieved, no more shaky memories! 🧘✨" },
    'contact': { face: 'face_curious.png', msg: "Contact sheet created! Your professional visual summary is ready! 🖼️" },
    'batch': { face: 'face_confident.png', msg: "Batch processing completed! Aura worked overtime, but we crushed it! 🏆" }
  };

  if (event.payload.success) {
    displayedProgress = Math.max(displayedProgress, 99);
    setProgressSmooth(100);
    
    const reaction = successReactions[activeTab];
    if (reaction) {
      setPersonaEmotion(reaction.face, reaction.msg);
    } else {
      updateStatus(emotionalStages[4].msg);
      updatePersonaFace(100);
    }
  } else {
    const errorMsg = "Error processing emotional baggage. FFmpeg failed.";
    setPersonaEmotion('face_anger.png', errorMsg);
  }
  
  setTimeout(() => {
    progressContainer.style.display = 'none';
    progressFill.classList.remove('indeterminate');
    if (event.payload.success) {
      setTimeout(() => updatePersonaFace(0), 10000); // Back to neutral after some time
    }

    // Auto-Clear Technical Logs logic
    if (localStorage.getItem('settings-autoclear-logs') === 'true') {
      setTimeout(() => {
        updateStatus("Ready to process emotional baggage.");
        const auraStatusVal = document.getElementById('aura-status-val');
        if (auraStatusVal) auraStatusVal.textContent = "Ready";
        updatePersonaFace(0);
      }, 3000); // Wait 3s after progress panel vanishes
    }
  }, 5000);
});

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function timeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  return 0;
}

function isValidTimeFormat(timeStr) {
  const regex = /^(\d{2}):([0-5]\d):([0-5]\d)$/;
  return regex.test(timeStr);
}

// Slider & Input listeners
const splitSliderEl = document.getElementById('split-slider');
const splitTimeInputEl = document.getElementById('split-time-input');
const splitSliderValueEl = document.getElementById('split-slider-value');

if (splitSliderEl && splitTimeInputEl) {
  splitSliderEl.addEventListener('input', (e) => {
    const formattedTime = formatTime(e.target.value);
    splitSliderValueEl.textContent = formattedTime;
    splitTimeInputEl.value = formattedTime;
    splitTimeInputEl.classList.remove('invalid-input');
    const runSplitBtn = document.getElementById('run-split-btn');
    if (runSplitBtn) {
      runSplitBtn.disabled = false;
      runSplitBtn.style.opacity = '1';
      runSplitBtn.style.pointerEvents = 'auto';
    }
  });

  splitTimeInputEl.addEventListener('input', () => {
    const val = splitTimeInputEl.value.trim();
    if (isValidTimeFormat(val)) {
      const seconds = timeToSeconds(val);
      if (seconds >= 0 && seconds <= parseInt(splitSliderEl.max)) {
        splitSliderEl.value = seconds;
        splitSliderValueEl.textContent = val;
        splitTimeInputEl.classList.remove('invalid-input');
        const runSplitBtn = document.getElementById('run-split-btn');
        if (runSplitBtn) {
          runSplitBtn.disabled = false;
          runSplitBtn.style.opacity = '1';
          runSplitBtn.style.pointerEvents = 'auto';
        }
        return;
      }
    }
    
    if (val.length >= 8) {
      splitTimeInputEl.classList.add('invalid-input');
      const runSplitBtn = document.getElementById('run-split-btn');
      if (runSplitBtn) {
        runSplitBtn.disabled = true;
        runSplitBtn.style.opacity = '0.5';
        runSplitBtn.style.pointerEvents = 'none';
      }
    }
  });

  splitTimeInputEl.addEventListener('blur', () => {
    const val = splitTimeInputEl.value.trim();
    if (!isValidTimeFormat(val) || timeToSeconds(val) > parseInt(splitSliderEl.max)) {
      splitTimeInputEl.value = formatTime(splitSliderEl.value);
      splitTimeInputEl.classList.remove('invalid-input');
      const runSplitBtn = document.getElementById('run-split-btn');
      if (runSplitBtn) {
        runSplitBtn.disabled = false;
        runSplitBtn.style.opacity = '1';
        runSplitBtn.style.pointerEvents = 'auto';
      }
    }
  });
}

const trimSliderStartEl = document.getElementById('trim-slider-start');
const trimSliderEndEl = document.getElementById('trim-slider-end');
const trimTimeStartEl = document.getElementById('trim-time-start');
const trimTimeEndEl = document.getElementById('trim-time-end');
const trimLabelStartEl = document.getElementById('trim-label-start');
const trimLabelEndEl = document.getElementById('trim-label-end');

if (trimSliderStartEl && trimSliderEndEl && trimTimeStartEl && trimTimeEndEl) {
  trimSliderStartEl.addEventListener('input', (e) => {
    let start = parseInt(e.target.value);
    let end = parseInt(trimSliderEndEl.value);
    if (start >= end) {
      start = end - 1;
      e.target.value = start;
    }
    const formattedStart = formatTime(start);
    trimLabelStartEl.textContent = formattedStart;
    trimTimeStartEl.value = formattedStart;
    trimTimeStartEl.classList.remove('invalid-input');
    
    if (!trimTimeEndEl.classList.contains('invalid-input')) {
      const runTrimBtn = document.getElementById('run-trim-btn');
      if (runTrimBtn) {
        runTrimBtn.disabled = false;
        runTrimBtn.style.opacity = '1';
        runTrimBtn.style.pointerEvents = 'auto';
      }
    }
  });

  trimSliderEndEl.addEventListener('input', (e) => {
    let end = parseInt(e.target.value);
    let start = parseInt(trimSliderStartEl.value);
    if (end <= start) {
      end = start + 1;
      e.target.value = end;
    }
    const formattedEnd = formatTime(end);
    trimLabelEndEl.textContent = formattedEnd;
    trimTimeEndEl.value = formattedEnd;
    trimTimeEndEl.classList.remove('invalid-input');
    
    if (!trimTimeStartEl.classList.contains('invalid-input')) {
      const runTrimBtn = document.getElementById('run-trim-btn');
      if (runTrimBtn) {
        runTrimBtn.disabled = false;
        runTrimBtn.style.opacity = '1';
        runTrimBtn.style.pointerEvents = 'auto';
      }
    }
  });

  trimTimeStartEl.addEventListener('input', () => {
    const val = trimTimeStartEl.value.trim();
    const endVal = trimTimeEndEl.value.trim();
    
    if (isValidTimeFormat(val) && isValidTimeFormat(endVal)) {
      const startSecs = timeToSeconds(val);
      const endSecs = timeToSeconds(endVal);
      if (startSecs >= 0 && startSecs < endSecs) {
        trimSliderStartEl.value = startSecs;
        trimLabelStartEl.textContent = val;
        trimTimeStartEl.classList.remove('invalid-input');
        
        if (!trimTimeEndEl.classList.contains('invalid-input')) {
          const runTrimBtn = document.getElementById('run-trim-btn');
          if (runTrimBtn) {
            runTrimBtn.disabled = false;
            runTrimBtn.style.opacity = '1';
            runTrimBtn.style.pointerEvents = 'auto';
          }
        }
        return;
      }
    }
    
    if (val.length >= 8) {
      trimTimeStartEl.classList.add('invalid-input');
      const runTrimBtn = document.getElementById('run-trim-btn');
      if (runTrimBtn) {
        runTrimBtn.disabled = true;
        runTrimBtn.style.opacity = '0.5';
        runTrimBtn.style.pointerEvents = 'none';
      }
    }
  });

  trimTimeStartEl.addEventListener('blur', () => {
    const val = trimTimeStartEl.value.trim();
    const endSecs = parseInt(trimSliderEndEl.value);
    if (!isValidTimeFormat(val) || timeToSeconds(val) >= endSecs || timeToSeconds(val) < 0) {
      trimTimeStartEl.value = formatTime(trimSliderStartEl.value);
      trimTimeStartEl.classList.remove('invalid-input');
      
      if (!trimTimeEndEl.classList.contains('invalid-input')) {
        const runTrimBtn = document.getElementById('run-trim-btn');
        if (runTrimBtn) {
          runTrimBtn.disabled = false;
          runTrimBtn.style.opacity = '1';
          runTrimBtn.style.pointerEvents = 'auto';
        }
      }
    }
  });

  trimTimeEndEl.addEventListener('input', () => {
    const val = trimTimeEndEl.value.trim();
    const startVal = trimTimeStartEl.value.trim();
    
    if (isValidTimeFormat(val) && isValidTimeFormat(startVal)) {
      const endSecs = timeToSeconds(val);
      const startSecs = timeToSeconds(startVal);
      if (endSecs > startSecs && endSecs <= parseInt(trimSliderEndEl.max)) {
        trimSliderEndEl.value = endSecs;
        trimLabelEndEl.textContent = val;
        trimTimeEndEl.classList.remove('invalid-input');
        
        if (!trimTimeStartEl.classList.contains('invalid-input')) {
          const runTrimBtn = document.getElementById('run-trim-btn');
          if (runTrimBtn) {
            runTrimBtn.disabled = false;
            runTrimBtn.style.opacity = '1';
            runTrimBtn.style.pointerEvents = 'auto';
          }
        }
        return;
      }
    }
    
    if (val.length >= 8) {
      trimTimeEndEl.classList.add('invalid-input');
      const runTrimBtn = document.getElementById('run-trim-btn');
      if (runTrimBtn) {
        runTrimBtn.disabled = true;
        runTrimBtn.style.opacity = '0.5';
        runTrimBtn.style.pointerEvents = 'none';
      }
    }
  });

  trimTimeEndEl.addEventListener('blur', () => {
    const val = trimTimeEndEl.value.trim();
    const startSecs = parseInt(trimSliderStartEl.value);
    const maxSecs = parseInt(trimSliderEndEl.max);
    if (!isValidTimeFormat(val) || timeToSeconds(val) <= startSecs || timeToSeconds(val) > maxSecs) {
      trimTimeEndEl.value = formatTime(trimSliderEndEl.value);
      trimTimeEndEl.classList.remove('invalid-input');
      
      if (!trimTimeStartEl.classList.contains('invalid-input')) {
        const runTrimBtn = document.getElementById('run-trim-btn');
        if (runTrimBtn) {
          runTrimBtn.disabled = false;
          runTrimBtn.style.opacity = '1';
          runTrimBtn.style.pointerEvents = 'auto';
        }
      }
    }
  });
}

// --- Compressor Tool ---
const crfSlider = document.getElementById('crf-slider');
const crfInput = document.getElementById('crf-input');
const crfDesc = document.getElementById('crf-description');

function updateCrfDesc(val) {
  if (val <= 20) crfDesc.textContent = "(High Quality)";
  else if (val <= 23) crfDesc.textContent = "(Balanced)";
  else crfDesc.textContent = "(Smaller File)";
}

crfSlider.addEventListener('input', (e) => {
  crfInput.value = e.target.value;
  updateCrfDesc(e.target.value);
});
crfInput.addEventListener('input', (e) => {
  crfSlider.value = e.target.value;
  updateCrfDesc(e.target.value);
});

document.getElementById('run-compress-btn').addEventListener('click', () => {
  if (!globalInputPath || !globalOutputPath) {
    alert("Please select input video and output folder.");
    return;
  }

  if (isDemoMode) {
    updateStatus("Sadness compressed. Emotional baggage reduced 💛 (Demo)");
    return;
  }

  const crf = crfInput.value;
  const preset = document.getElementById('compress-preset').value;
  const codec = document.getElementById('compress-codec').value;
  const resolution = document.getElementById('compress-resolution').value;

  const filename = globalInputPath.split(/[\/\\]/).pop();
  const output = `${globalOutputPath}/compressed_${filename}`;

  let args = [
    "-i", globalInputPath,
    "-vcodec", codec,
    "-crf", crf.toString(),
    "-preset", preset
  ];

  // Apply scaling if selected
  if (resolution !== "original") {
    if (resolution === "half") {
      args.push("-vf", "scale=iw/2:-1");
    } else {
      const [w, h] = resolution.split(':');
      args.push("-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
    }
  }

  args.push("-y", output);

  progressContainer.style.display = 'block';
  displayedProgress = 0;
  setProgressMode(videoDuration);
  updateStatus("Beginning the process of emotional containment...");

  if (localStorage.getItem('settings-debug-mode') === 'true') {
    console.log("[DEBUG] FFmpeg executable path:", localStorage.getItem('ffmpeg-custom-path') || "ffmpeg");
    console.log("[DEBUG] FFmpeg arguments:", args);
  }

  invoke('process_video', { args, totalDuration: videoDuration, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });
});

// --- Batch Processor Tool ---
document.getElementById('add-batch-files-btn').addEventListener('click', async () => {
  try {
    const files = await tauriDialog.open({
      multiple: true,
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }]
    });
    if (files && Array.isArray(files)) {
      const batchList = document.getElementById('batch-list');
      const emptyMsg = batchList.querySelector('.empty-msg');
      if (emptyMsg) emptyMsg.remove();
      batchList.classList.remove('empty');

      files.forEach(file => {
        const li = document.createElement('li');
        li.textContent = file.split(/[\/\\]/).pop();
        li.title = file;
        li.dataset.path = file;
        batchList.appendChild(li);
      });
      updateStatus(`Added ${files.length} videos to batch.`);
    }
  } catch (e) {
    console.error("Batch Dialog error:", e);
    alert("Could not open file dialog.");
  }
});

document.getElementById('add-batch-folder-btn').addEventListener('click', async () => {
  try {
    const folder = await tauriDialog.open({ directory: true });
    if (folder) {
      const videos = await invoke('list_videos_in_folder', { folderPath: folder });
      if (videos.length > 0) {
        const batchList = document.getElementById('batch-list');
        const emptyMsg = batchList.querySelector('.empty-msg');
        if (emptyMsg) emptyMsg.remove();
        batchList.classList.remove('empty');

        videos.forEach(file => {
          const li = document.createElement('li');
          li.textContent = file.split(/[\/\\]/).pop();
          li.title = file;
          li.dataset.path = file;
          batchList.appendChild(li);
        });
        updateStatus(`Added ${videos.length} videos from folder.`);
      } else {
        alert("No supported video files found in that folder.");
      }
    }
  } catch (e) {
    console.error("Folder Dialog error:", e);
    alert("Could not open folder dialog.");
  }
});

document.getElementById('clear-batch-list-btn').addEventListener('click', () => {
  const batchList = document.getElementById('batch-list');
  batchList.innerHTML = '<li class="empty-msg">No files in batch.</li>';
  batchList.classList.add('empty');
  updateStatus("Batch list cleared.");
});

// --- HELPER: Execute FFmpeg Task ---
async function executeFFmpegTask(taskName, args, customDuration = null) {
  if (!globalInputPath || !globalOutputPath) {
    alert("Please select input video and output folder.");
    return;
  }

  if (isDemoMode) {
    updateStatus(`${taskName} completed (Demo mode activated 🎭)`);
    return;
  }

  const durationToUse = (customDuration !== null) ? customDuration : videoDuration;

  progressContainer.style.display = 'block';
  displayedProgress = 0;
  setProgressMode(durationToUse);
  updateStatus(`Initiating ${taskName.toLowerCase()}...`);

  if (localStorage.getItem('settings-debug-mode') === 'true') {
    console.log(`[DEBUG] Task Name: ${taskName}`);
    console.log("[DEBUG] FFmpeg executable path:", localStorage.getItem('ffmpeg-custom-path') || "ffmpeg");
    console.log("[DEBUG] FFmpeg arguments:", args);
  }

  try {
    await invoke('process_video', { args, totalDuration: durationToUse, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });
  } catch (e) {
    console.error(`Error in ${taskName}:`, e);
    updateStatus(`${taskName} failed.`);
  }
}

// --- Split Tool ---
document.getElementById('run-split-btn').addEventListener('click', () => {
  const start = document.getElementById('split-time-input').value || document.getElementById('split-slider-value').textContent;
  const filename = globalInputPath.split(/[\/\\]/).pop();
  const output = `${globalOutputPath}/split_${filename}`;

  // Note: For split, we usually just want to cut from a point to the end, or a fixed duration.
  // We'll cut from 'start' till the end.
  const args = ["-i", globalInputPath, "-ss", start, "-c", "copy", "-y", output];
  executeFFmpegTask("Splitting", args);
});

// --- Trim Tool ---
document.getElementById('run-trim-btn').addEventListener('click', () => {
  const start = document.getElementById('trim-time-start').value || document.getElementById('trim-label-start').textContent;
  const end = document.getElementById('trim-time-end').value || document.getElementById('trim-label-end').textContent;
  const filename = globalInputPath.split(/[\/\\]/).pop();
  const output = `${globalOutputPath}/trimmed_${filename}`;

  const args = ["-i", globalInputPath, "-ss", start, "-to", end, "-c", "copy", "-y", output];
  executeFFmpegTask("Trimming", args);
});

// --- Rotate Tool ---
document.getElementById('run-rotate-btn').addEventListener('click', () => {
  const type = document.getElementById('rotate-select').value;
  const rotationMap = {
    "90 Clockwise": "transpose=1",
    "90 Counter": "transpose=2",
    "180 Flip": "transpose=1,transpose=1"
  };
  const filename = globalInputPath.split(/[\/\\]/).pop();
  const output = `${globalOutputPath}/rotated_${filename}`;

  const args = ["-i", globalInputPath, "-vf", rotationMap[type], "-y", output];
  executeFFmpegTask("Rotation", args);
});

// --- Audio Tool ---
document.getElementById('run-audio-btn').addEventListener('click', () => {
  const format = document.getElementById('audio-format').value;
  const filename = globalInputPath.split(/[\/\\]/).pop().split('.')[0];
  const output = `${globalOutputPath}/${filename}_audio.${format}`;

  const args = ["-i", globalInputPath, "-q:a", "0", "-map", "a", "-y", output];
  executeFFmpegTask("Audio Extraction", args);
});

// --- Convert Tool ---
document.getElementById('run-convert-btn').addEventListener('click', () => {
  const format = document.getElementById('convert-format').value;
  const filename = globalInputPath.split(/[\/\\]/).pop().split('.')[0];
  const output = `${globalOutputPath}/converted_${filename}.${format}`;

  let args = ["-i", globalInputPath];

  // Specific handling for legacy formats like 3GP
  if (format === '3gp') {
    args.push("-vcodec", "libx264", "-acodec", "aac", "-strict", "experimental");
  } else if (format === 'gif') {
    args.push("-vf", "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse");
  }

  args.push("-y", output);
  executeFFmpegTask("Conversion", args);
});

// --- Subtitle Tool ---
document.getElementById('browse-subtitle-btn').addEventListener('click', async () => {
  const file = await tauriDialog.open({
    filters: [{ name: 'Subtitle', extensions: ['srt', 'ass'] }]
  });
  if (file) {
    document.getElementById('subtitle-path').value = file;
  }
});

document.getElementById('run-subtitle-btn').addEventListener('click', () => {
  const subPath = document.getElementById('subtitle-path').value;
  if (!subPath) { alert("Please select a subtitle file."); return; }

  const filename = globalInputPath.split(/[\/\\]/).pop();
  const output = `${globalOutputPath}/subtitled_${filename}`;

  // FFmpeg expects forward slashes in filter paths
  const safeSubPath = subPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const args = ["-i", globalInputPath, "-vf", `subtitles='${safeSubPath}'`, "-c:a", "copy", "-y", output];
  executeFFmpegTask("Subtitle Burning", args);
});

// --- Speed Tool ---
document.getElementById('run-speed-btn').addEventListener('click', () => {
  const speed = document.getElementById('speed-factor').value;
  const ptsMap = { "0.5": "2.0*PTS", "1.5": "0.667*PTS", "2.0": "0.5*PTS", "4.0": "0.25*PTS" };
  const ptsFactor = ptsMap[speed];
  const audioFactor = parseFloat(speed);

  let atempo = `atempo=${audioFactor}`;
  if (audioFactor > 2.0) atempo = `atempo=2.0,atempo=${audioFactor / 2.0}`;

  const filename = globalInputPath.split(/[\/\\]/).pop();
  const output = `${globalOutputPath}/speedwarp_${speed}x_${filename}`;

  const args = [
    "-i", globalInputPath,
    "-filter_complex", `[0:v]setpts=${ptsFactor}[v];[0:a]${atempo}[a]`,
    "-map", "[v]", "-map", "[a]", "-y", output
  ];
  executeFFmpegTask("Speed Warp", args);
});

// --- Batch Execution ---
document.getElementById('run-batch-btn').addEventListener('click', async () => {
  const batchList = document.querySelectorAll('#batch-list li:not(.empty-msg)');
  if (batchList.length === 0) { alert("Batch list is empty."); return; }
  if (!globalOutputPath) { alert("Please select an output folder."); return; }

  const crf = document.getElementById('crf-input').value;
  updateStatus(`Starting batch processing for ${batchList.length} files...`);

  for (let i = 0; i < batchList.length; i++) {
    const input = batchList[i].dataset.path;
    const filename = input.split(/[\/\\]/).pop();
    const output = `${globalOutputPath}/BATCH_CRF${crf}_${filename}`;

    updateStatus(`Batch: Processing ${i + 1}/${batchList.length} - ${filename}`);

    const args = ["-i", input, "-vcodec", "libx264", "-crf", crf.toString(), "-preset", "medium", "-y", output];

    if (localStorage.getItem('settings-debug-mode') === 'true') {
      console.log(`[DEBUG] Batch file ${i + 1}/${batchList.length}: ${filename}`);
      console.log("[DEBUG] FFmpeg executable path:", localStorage.getItem('ffmpeg-custom-path') || "ffmpeg");
      console.log("[DEBUG] FFmpeg arguments:", args);
    }

    // We run them one by one for now to avoid CPU overload
    const duration = await invoke('get_video_duration', { filePath: input, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });
    await invoke('process_video', { args, totalDuration: duration, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });

    // Wait for the 'finished' event before moving to next (simplified loop)
    await new Promise(resolve => {
      const unlisten = listen('finished', () => {
        unlisten.then(fn => fn());
        resolve();
      });
    });
  }
  updateStatus("Batch processing complete! 💛");
});

// --- GIF Maker Tool ---
document.getElementById('run-gif-btn').addEventListener('click', () => {
  const width = document.getElementById('gif-width').value || "480";
  const fps = document.getElementById('gif-fps').value || "15";
  const start = document.getElementById('gif-start').value || "00:00:00";
  const duration = parseInt(document.getElementById('gif-duration').value) || 6;
  const filename = globalInputPath.split(/[\/\\]/).pop().split('.')[0];
  const output = `${globalOutputPath}/${filename}_elite.gif`;

  // High Quality GIF filter chain
  const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

  // Fast input-seeking using -ss and -t before -i
  const args = ["-ss", start, "-t", duration.toString(), "-i", globalInputPath, "-vf", filter, "-y", output];
  executeFFmpegTask("GIF Creation", args, duration);
});

// --- Video Merger Tool ---
document.getElementById('run-merge-btn').addEventListener('click', async () => {
  const batchList = document.querySelectorAll('#batch-list li:not(.empty-msg)');
  if (batchList.length < 2) { alert("Please add at least 2 videos in the Batch Processor tab."); return; }
  if (!globalOutputPath) { alert("Please select an output folder."); return; }

  const outName = document.getElementById('merge-filename').value || "merged_video.mp4";
  const output = `${globalOutputPath}/${outName}`;

  let inputArgs = [];
  let filterStr = "";

  batchList.forEach((li, index) => {
    inputArgs.push("-i", li.dataset.path);
    filterStr += `[${index}:v][${index}:a]`;
  });

  filterStr += `concat=n=${batchList.length}:v=1:a=1[v][a]`;

  const args = [...inputArgs, "-filter_complex", filterStr, "-map", "[v]", "-map", "[a]", "-y", output];

  // Note: Duration estimation for merge is tricky, we'll just set it to 0 to show indefinite progress
  executeFFmpegTask("Video Merging", args);
});

// --- Video Stabilizer Tool ---
document.getElementById('run-stabilize-btn').addEventListener('click', async () => {
  const shake = document.getElementById('stabilize-level').value || "5";
  const smooth = document.getElementById('stabilize-smooth').value || "30";
  const filename = globalInputPath.split(/[\/\\]/).pop().split('.')[0];
  const output = `${globalOutputPath}/stabilized_${filename}.mp4`;
  const trfPath = `${globalOutputPath}/transforms.trf`;

  // Pass 1: Detect shakiness
  updateStatus("Pass 1: Detecting shakiness... 📊");
  const args1 = ["-i", globalInputPath, "-vf", `vidstabdetect=shake=${shake}:result='${trfPath}'`, "-f", "null", "-"];

  try {
    // Run Pass 1
    if (localStorage.getItem('settings-debug-mode') === 'true') {
      console.log("[DEBUG] Stabilizer Pass 1 arguments:", args1);
    }
    await invoke('process_video', { args: args1, totalDuration: 0.0, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });

    // Pass 2: Apply stabilization
    updateStatus("Pass 2: Smoothing memories... ✨");
    const args2 = ["-i", globalInputPath, "-vf", `vidstabtransform=smoothing=${smooth}:input='${trfPath}'`, "-y", output];
    executeFFmpegTask("Stabilization", args2);
  } catch (err) {
    updateStatus(`Error in Pass 1: ${err}`);
  }
});

// --- Contact Sheet Tool ---
document.getElementById('run-contact-btn').addEventListener('click', () => {
  const grid = document.getElementById('contact-grid').value || "4x4";
  const width = document.getElementById('contact-width').value || "300";
  const filename = globalInputPath.split(/[\/\\]/).pop().split('.')[0];
  const output = `${globalOutputPath}/${filename}_contact_sheet.png`;

  const [cols, rows] = grid.split('x').map(Number);
  const numFrames = cols * rows;

  let filter;
  if (videoDuration && videoDuration > 0) {
    // Select frames at regular intervals based on total duration to fill the grid completely
    const interval = videoDuration / (numFrames + 1);
    filter = `select='isnan(prev_selected_t)+gte(t-prev_selected_t,${interval})',scale=${width}:-1,tile=${grid}`;
  } else {
    filter = `thumbnail,scale=${width}:-1,tile=${grid}`;
  }

  const args = ["-i", globalInputPath, "-vf", filter, "-frames:v", "1", "-y", output];
  executeFFmpegTask("Contact Sheet", args);
});

// --- Theme Switcher Logic ---
const themeCircles = document.querySelectorAll('.theme-circle');
const retroBtns = document.querySelectorAll('.retro-theme-btn');
const body = document.body;

const themeReactions = {
  'theme-pink': { face: 'face_love.png', msg: "Aww, is pink matching my vibe today? 👉👈" },
  'theme-red': { face: 'face_anger.png', msg: "Why so red? Angry ho kya? 😡" },
  'theme-green': { face: 'face_smug.png', msg: "Green looks fresh, ready to crush some bitrates! 🍃" },
  'theme-gold': { face: 'face_acceptance.png', msg: "Golden premium vibes! Standard high quality only! ✨" },
  'theme-white': { face: 'face_bored.png', msg: "White? So blank... add some colors to your life! 🥱" },
  'theme-blue': { face: 'face_confident.png', msg: "Classic blue. Back to focus and coding! 💻" },
  'theme-purple': { face: 'face_thinking.png', msg: "Purple elegance. Let's think of some cool cuts! 🔮" },
  'theme-yellow': { face: 'face_exicited.png', msg: "A sunny theme! Exciting times ahead! ☀️" }
};

const retroReactions = {
  'theme-win98': { face: 'face_bored.png', msg: "Windows 98 Classic! Sab kuch retro gray ho gaya... feel safe? 📺" },
  'theme-winxp': { face: 'face_exicited.png', msg: "Luna theme activated! Let's split video in XP style! 🌳" },
  'theme-synth': { face: 'face_smug.png', msg: "Retro sunset vibing... Let's warp time with neon! 🌆💜" }
};

themeCircles.forEach(circle => {
  circle.addEventListener('click', () => {
    const theme = circle.dataset.theme;
    setTheme(theme);
    
    // Mascot reacts to manual theme pick
    const reaction = themeReactions[theme];
    if (reaction) {
      setPersonaEmotion(reaction.face, reaction.msg);
    }
  });
});

retroBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.retro;
    setTheme(theme);
    
    // Mascot reacts to retro preset pick
    const reaction = retroReactions[theme];
    if (reaction) {
      setPersonaEmotion(reaction.face, reaction.msg);
    }
  });
});

function setTheme(themeName) {
  let targetTheme = themeName;
  
  if (themeName === 'theme-modern') {
    targetTheme = localStorage.getItem('last-standard-theme') || 'theme-blue';
  } else if (['theme-blue', 'theme-red', 'theme-green', 'theme-purple', 'theme-gold', 'theme-pink', 'theme-white', 'theme-yellow'].includes(themeName)) {
    localStorage.setItem('last-standard-theme', themeName);
  }

  // Remove existing themes (standard & retro)
  body.classList.remove(
    'theme-blue', 'theme-red', 'theme-green', 'theme-purple', 'theme-gold', 'theme-pink', 'theme-white', 'theme-yellow',
    'theme-win98', 'theme-winxp', 'theme-synth'
  );
  body.classList.add(targetTheme);

  // Update active state in UI for circles
  themeCircles.forEach(c => {
    if (c.dataset.theme === targetTheme) c.classList.add('active');
    else c.classList.remove('active');
  });

  // Update active state in UI for settings visual cards
  const themeCards = document.querySelectorAll('.theme-preview-card');
  themeCards.forEach(card => {
    const isRetro = ['theme-win98', 'theme-winxp', 'theme-synth'].includes(targetTheme);
    if (card.dataset.preset === 'theme-modern') {
      if (!isRetro) card.classList.add('active');
      else card.classList.remove('active');
    } else {
      if (card.dataset.preset === targetTheme) card.classList.add('active');
      else card.classList.remove('active');
    }
  });

  // Show/Hide Aura Mood picker in sidebar smoothly
  const auraContainer = document.querySelector('.theme-selector-container');
  if (auraContainer) {
    const isRetro = ['theme-win98', 'theme-winxp', 'theme-synth'].includes(targetTheme);
    if (isRetro) {
      auraContainer.style.opacity = '0';
      auraContainer.style.transform = 'translateY(-10px) scale(0.95)';
      auraContainer.style.pointerEvents = 'none';
      setTimeout(() => {
        const currentTheme = localStorage.getItem('app-theme') || 'theme-blue';
        const currentIsRetro = ['theme-win98', 'theme-winxp', 'theme-synth'].includes(currentTheme);
        if (currentIsRetro) {
          auraContainer.style.display = 'none';
        }
      }, 300);
    } else {
      auraContainer.style.display = 'flex';
      // Force reflow for transition
      void auraContainer.offsetWidth;
      auraContainer.style.opacity = '1';
      auraContainer.style.transform = 'translateY(0) scale(1)';
      auraContainer.style.pointerEvents = 'auto';
    }
  }

  localStorage.setItem('app-theme', targetTheme);
}

// Load saved theme
const savedTheme = localStorage.getItem('app-theme') || 'theme-blue';
setTheme(savedTheme);

// ==========================================
// --- Live Video Preview Logic ---
// ==========================================
let isPlayingTrimRange = false;
let trimRangeCheckInterval = null;

function initPreviewPlayer(filePath) {
  const previewVideo = document.getElementById('preview-video');
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const previewCompatWarning = document.getElementById('preview-compat-warning');
  const previewControls = document.getElementById('preview-controls');
  const previewPlayBtn = document.getElementById('preview-play-btn');
  const previewTrimPlayBtn = document.getElementById('preview-trim-play-btn');

  if (!previewVideo) return;

  // Stop any active playback loops
  stopTrimRangePlayback();

  // Reset controls
  if (previewPlayBtn) {
    previewPlayBtn.innerHTML = '<i data-lucide="play"></i> Play';
  }

  const extension = filePath.split('.').pop().toLowerCase();
  const isSupported = ['mp4', 'mov', 'webm'].includes(extension);

  if (isSupported) {
    // Get Tauri asset URL
    let assetUrl = filePath;
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.convertFileSrc === 'function') {
      assetUrl = window.__TAURI__.core.convertFileSrc(filePath);
    } else {
      assetUrl = `https://asset.localhost/${filePath}`;
    }

    previewVideo.src = assetUrl;
    previewVideo.style.display = 'block';
    previewPlaceholder.style.display = 'none';
    previewCompatWarning.style.display = 'none';
    previewControls.style.display = 'flex';
    previewVideo.load();

    // Set correct "Play Trim Selection" visibility depending on current active tab
    const activeTab = document.querySelector('.nav-btn.active')?.dataset.target;
    if (previewTrimPlayBtn) {
      previewTrimPlayBtn.style.display = (activeTab === 'trim') ? 'flex' : 'none';
    }

    // React to video load metadata
    previewVideo.onloadedmetadata = () => {
      previewVideo.currentTime = 0;
    };
  } else {
    // Fallback for unsupported containers
    previewVideo.style.display = 'none';
    previewPlaceholder.style.display = 'none';
    previewCompatWarning.style.display = 'flex';
    previewControls.style.display = 'none';
    previewVideo.src = '';
  }
  
  // Reinitialize Lucide Icons for buttons inside the preview card
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Update the physical rotation of the video preview player
function updatePreviewRotation() {
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

// Seek helper
function seekPreviewTo(seconds) {
  const previewVideo = document.getElementById('preview-video');
  if (previewVideo && previewVideo.src && !isNaN(seconds)) {
    previewVideo.currentTime = seconds;
  }
}

// Stop trim playback helper
function stopTrimRangePlayback() {
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

// Hook up events on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const previewVideo = document.getElementById('preview-video');
  const previewPlayBtn = document.getElementById('preview-play-btn');
  const previewTrimPlayBtn = document.getElementById('preview-trim-play-btn');

  // Sliders and manual inputs
  const splitSlider = document.getElementById('split-slider');
  const splitTimeInput = document.getElementById('split-time-input');

  const trimSliderStart = document.getElementById('trim-slider-start');
  const trimSliderEnd = document.getElementById('trim-slider-end');
  const trimTimeStart = document.getElementById('trim-time-start');
  const trimTimeEnd = document.getElementById('trim-time-end');

  // 1. Split timeline hooks
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

  // 2. Trim timeline hooks
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

  // 3. Play / Pause Control
  if (previewPlayBtn) {
    previewPlayBtn.addEventListener('click', () => {
      if (!previewVideo || !previewVideo.src) return;
      stopTrimRangePlayback();

      if (previewVideo.paused) {
        previewVideo.play();
        previewPlayBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
      } else {
        previewVideo.pause();
        previewPlayBtn.innerHTML = '<i data-lucide="play"></i> Play';
      }
      if (window.lucide) window.lucide.createIcons();
    });
  }

  // 4. Play Trim Range Control
  if (previewTrimPlayBtn) {
    previewTrimPlayBtn.addEventListener('click', () => {
      if (!previewVideo || !previewVideo.src) return;

      const startVal = parseInt(trimSliderStart.value) || 0;
      const endVal = parseInt(trimSliderEnd.value) || Math.floor(videoDuration);

      if (isPlayingTrimRange) {
        stopTrimRangePlayback();
      } else {
        isPlayingTrimRange = true;
        previewTrimPlayBtn.innerHTML = '<i data-lucide="pause-circle"></i> Pause Selection';
        if (window.lucide) window.lucide.createIcons();

        // Seek to start and play
        previewVideo.currentTime = startVal;
        previewVideo.play();

        // Monitor time range to pause at the end bounds
        trimRangeCheckInterval = setInterval(() => {
          if (previewVideo.currentTime >= endVal || previewVideo.currentTime < startVal) {
            stopTrimRangePlayback();
          }
        }, 100);
      }
    });
  }

  // Monitor simple video pause to update play/pause button state
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

  // 5. Rotate select change control
  const rotateSelect = document.getElementById('rotate-select');
  if (rotateSelect) {
    rotateSelect.addEventListener('change', () => {
      updatePreviewRotation();
    });
  }

});

// --- Control Panel / Settings Modal Logic ---
function initSettingsModal() {
  const triggerBtn = document.getElementById('settings-trigger-btn');
  const closeBtn = document.getElementById('settings-close-btn');
  const saveBtn = document.getElementById('settings-save-btn');
  const modal = document.getElementById('settings-modal');
  
  // Tab Navigation Elements
  const tabBtns = document.querySelectorAll('.settings-tab-btn');
  const panels = document.querySelectorAll('.settings-panel-view');
  
  // General Tab Controls
  const dirDisplay = document.getElementById('settings-default-dir-display');
  const changeDirBtn = document.getElementById('settings-change-dir-btn');
  const autoclearToggle = document.getElementById('settings-autoclear-toggle');
  const debugToggle = document.getElementById('settings-debug-toggle');
  
  // Themes & Nostalgia Controls
  const auraToggle = document.getElementById('settings-aura-toggle');
  const previewCards = document.querySelectorAll('.theme-preview-card');
  
  // Engine Controls
  const ffmpegPathInput = document.getElementById('settings-ffmpeg-path');
  const browseFfmpegBtn = document.getElementById('settings-browse-ffmpeg-btn');
  const clearFfmpegBtn = document.getElementById('settings-clear-ffmpeg-btn');
  const forceCheckBtn = document.getElementById('settings-force-check-btn');

  // Load Saved Values
  const savedDir = localStorage.getItem('settings-default-dir') || "";
  if (dirDisplay) {
    dirDisplay.textContent = savedDir ? savedDir.split(/[\/\\]/).pop() || savedDir : "No default path set";
    dirDisplay.title = savedDir;
  }
  
  // Auto load output path if not manually set
  if (savedDir && !globalOutputPath) {
    globalOutputPath = savedDir;
    const outInput = document.getElementById('global-output-path');
    if (outInput) outInput.value = savedDir;
  }

  if (autoclearToggle) {
    autoclearToggle.checked = localStorage.getItem('settings-autoclear-logs') === 'true';
  }

  if (debugToggle) {
    debugToggle.checked = localStorage.getItem('settings-debug-mode') === 'true';
  }

  if (auraToggle) {
    // aura-toggle is interactive speeches active. If silenced is true, checked should be false.
    auraToggle.checked = localStorage.getItem('settings-aura-silenced') !== 'true';
  }

  const customFfmpegPath = localStorage.getItem('ffmpeg-custom-path') || "";
  if (ffmpegPathInput) {
    ffmpegPathInput.value = customFfmpegPath;
  }

  // Aura silence on start check
  const auraSpeechContainer = document.getElementById('aura-speech-container');
  if (localStorage.getItem('settings-aura-silenced') === 'true') {
    if (auraSpeechContainer) auraSpeechContainer.style.display = 'none';
    if (reactiveFace) reactiveFace.src = 'emotive-ani-character/face_neutral.png';
  } else {
    if (auraSpeechContainer) auraSpeechContainer.style.display = 'block';
  }

  // --- TRIGGERS ---
  
  // Open Modal
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      if (modal) {
        modal.style.display = 'flex';
        // Force refresh tab contents visual cards active highlight
        const currentTheme = localStorage.getItem('app-theme') || 'theme-blue';
        setTheme(currentTheme);
        
        // Check engine status when opened
        checkEngineStatus();
      }
    });
  }

  // Close Modal Helper
  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  // Escape Key Close
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      closeModal();
    }
  });

  // Tab Switcher
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

  // --- ACTIONS ---

  // Browse Output Directory
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
          // also update active output path
          globalOutputPath = folder;
          const outInput = document.getElementById('global-output-path');
          if (outInput) outInput.value = folder;
          updateStatus(`Default output directory set: ${folder}`);
        }
      } catch (err) {
        console.error("Browse dir error:", err);
      }
    });
  }

  // Browse Custom FFmpeg Path
  if (browseFfmpegBtn) {
    browseFfmpegBtn.addEventListener('click', async () => {
      try {
        const file = await tauriDialog.open({
          filters: [{ name: 'Executable', extensions: ['exe'] }]
        });
        if (file) {
          localStorage.setItem('ffmpeg-custom-path', file);
          if (ffmpegPathInput) ffmpegPathInput.value = file;
          updateStatus(`Custom FFmpeg path selected.`);
          
          // Re-verify instantly
          checkEngineStatus();
        }
      } catch (err) {
        console.error("FFmpeg browse error:", err);
      }
    });
  }

  // Clear Custom FFmpeg Path
  if (clearFfmpegBtn) {
    clearFfmpegBtn.addEventListener('click', () => {
      localStorage.removeItem('ffmpeg-custom-path');
      if (ffmpegPathInput) ffmpegPathInput.value = "";
      updateStatus("Custom FFmpeg path reset.");
      
      // Re-verify instantly
      checkEngineStatus();
    });
  }

  // Visual Theme Cards Preset Selectors
  previewCards.forEach(card => {
    card.addEventListener('click', () => {
      const preset = card.dataset.preset;
      setTheme(preset);

      // Mascot reacts to visual preset pick
      let reaction = retroReactions[preset];
      if (preset === 'theme-modern') {
        const activeStandardTheme = localStorage.getItem('last-standard-theme') || 'theme-blue';
        reaction = themeReactions[activeStandardTheme];
      }
      if (reaction) {
        setPersonaEmotion(reaction.face, reaction.msg);
      }
    });
  });

  // Force Re-check Engine
  if (forceCheckBtn) {
    forceCheckBtn.addEventListener('click', async () => {
      updateStatus("Forcing engine verification scan...");
      // Add spin rotation to icon for aesthetic feedback
      const icon = forceCheckBtn.querySelector('i');
      if (icon) {
        icon.style.transition = "transform 1s ease";
        icon.style.transform = "rotate(360deg)";
        setTimeout(() => { icon.style.transform = "none"; }, 1000);
      }
      
      await checkEngineStatus();
    });
  }

  // Apply & Save settings button
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      // Save General values
      if (autoclearToggle) {
        localStorage.setItem('settings-autoclear-logs', autoclearToggle.checked ? 'true' : 'false');
      }
      if (debugToggle) {
        localStorage.setItem('settings-debug-mode', debugToggle.checked ? 'true' : 'false');
      }

      // Save Aura Silence values
      if (auraToggle) {
        const isSilenced = !auraToggle.checked;
        localStorage.setItem('settings-aura-silenced', isSilenced ? 'true' : 'false');
        
        // Trigger UI changes instantly
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
      setPersonaEmotion('face_confident.png', "Settings and variables successfully updated! Let's go! 🚀");
    });
  }
}


