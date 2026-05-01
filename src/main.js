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
let annoyanceLevel = 0;
let annoyanceTimer = null;

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

function updatePersonaFace(percent) {
  if (annoyanceLevel > 5) return; // Don't override if angry

  const stage = emotionalStages.find(s => percent >= s.min && percent <= s.max);
  if (stage && reactiveFace) {
    reactiveFace.src = `emotive-ani-character/${stage.face}`;
  }
}

function setPersonaEmotion(face, message) {
  if (annoyanceLevel > 5) return;
  if (reactiveFace) reactiveFace.src = `emotive-ani-character/${face}`;
  if (message) updateStatus(message);
}

// Sassy Interaction
if (reactiveFace) {
  reactiveFace.addEventListener('mouseenter', () => {
    annoyanceLevel++;

    if (annoyanceLevel > 5) {
      reactiveFace.src = `emotive-ani-character/face_anger.png`;
      updateStatus("HEY! Stop poking me and focus on your work! 💢");

      // Reset annoyance after a few seconds
      clearTimeout(annoyanceTimer);
      annoyanceTimer = setTimeout(() => {
        annoyanceLevel = 0;
        // Restore face based on current progress
        const currentPercent = parseFloat(progressFill.style.width) || 0;
        updatePersonaFace(currentPercent);
        updateStatus("Ready to process emotional baggage.");
      }, 3000);
    }
  });
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

    // Aura Reacts to Tab Change
    const reaction = toolReactions[targetId];
    if (reaction) {
      setPersonaEmotion(reaction.face, reaction.msg);
    }

    // Refresh icons just in case (though usually not needed)
    lucide.createIcons();
  });
});

// --- System Engine Check ---
async function checkEngineStatus() {
  const ffmpegDot = document.getElementById('ffmpeg-dot');
  const ffmpegStatus = document.getElementById('ffmpeg-status-text');
  const ffmpegFix = document.getElementById('ffmpeg-fix-link');
  
  try {
    const isReady = await invoke('check_ffmpeg');
    if (isReady) {
      ffmpegDot.className = 'dot green';
      ffmpegStatus.textContent = 'FFmpeg Engine: Active';
      ffmpegFix.style.display = 'none';
    } else {
      ffmpegDot.className = 'dot red';
      ffmpegStatus.textContent = 'FFmpeg: Not Found';
      ffmpegFix.style.display = 'block';
      updateStatus("Aura noticed FFmpeg is missing! Please install it. 🔴");
    }
  } catch (e) {
    ffmpegDot.className = 'dot red';
    ffmpegStatus.textContent = 'FFmpeg: Error';
    ffmpegFix.style.display = 'block';
  }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  checkEngineStatus();

  // Listeners for both tour trigger buttons
  const triggers = ['demo-trigger-btn'];
  
  const openModal = () => {
    const modal = document.getElementById('custom-modal');
    if (modal) modal.style.display = 'flex';
  };

  triggers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', openModal);
  });

  // Modal Action Buttons
  const startTourBtn = document.getElementById('start-tour-btn');
  const startEmotionalBtn = document.getElementById('start-emotional-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');

  if (startTourBtn) {
    startTourBtn.addEventListener('click', () => {
      document.getElementById('custom-modal').style.display = 'none';
      if (typeof window.startTour === 'function') window.startTour();
    });
  }

  if (startEmotionalBtn) {
    startEmotionalBtn.addEventListener('click', () => {
      document.getElementById('custom-modal').style.display = 'none';
      if (typeof window.startEmotionalMode === 'function') window.startEmotionalMode(window.getEmotionalSettings?.());
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      document.getElementById('custom-modal').style.display = 'none';
    });
  }
  const nextTourBtn = document.getElementById('tour-next-btn');
  if (nextTourBtn) {
    nextTourBtn.addEventListener('click', () => {
      if (typeof window.nextTourStep === 'function') window.nextTourStep();
    });
  }


  const restartTourBtn = document.getElementById('restart-tour-btn');
  if (restartTourBtn) {
    restartTourBtn.addEventListener('click', () => {
      if (typeof window.startTour === 'function') window.startTour();
    });
  }

  const emotionalToggleBtn = document.getElementById('emotional-toggle-btn');
  window.onEmotionalModeChange = updateEmotionalToggleUI;
  updateEmotionalToggleUI(typeof window.isEmotionalModeActive === 'function' ? window.isEmotionalModeActive() : false);

  if (emotionalToggleBtn) {
    emotionalToggleBtn.addEventListener('click', () => {
      const isActive = typeof window.isEmotionalModeActive === 'function' && window.isEmotionalModeActive();
      if (isActive) window.stopEmotionalMode?.();
      else window.startEmotionalMode?.(window.getEmotionalSettings?.());
    });
  }


  const emotionIntensity = document.getElementById('emotion-intensity');
  const emotionAutoStop = document.getElementById('emotion-auto-stop');

  const syncEmotionSettings = () => {
    window.setEmotionalSettings?.({
      intensity: emotionIntensity?.value || 'normal',
      autoStop: !!emotionAutoStop?.checked,
    });
  };

  if (emotionIntensity) emotionIntensity.addEventListener('change', syncEmotionSettings);
  if (emotionAutoStop) emotionAutoStop.addEventListener('change', syncEmotionSettings);
  syncEmotionSettings();

  startSystemMetrics();
});

// Demo mode logic is now handled in tour.js via the dialog.

function updateStatus(msg) {
  statusText.textContent = msg;
  
  // Trigger pop animation on speech bubble
  const container = document.getElementById('aura-speech-container');
  if (container) {
    container.classList.remove('speech-update');
    void container.offsetWidth; // Trigger reflow
    container.classList.add('speech-update');
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
      videoDuration = await invoke('get_video_duration', { file_path: file });

      // Initialize Timeline Sliders
      const splitSlider = document.getElementById('split-slider');
      if (splitSlider) {
        splitSlider.max = Math.floor(videoDuration);
        splitSlider.value = 0;
        document.getElementById('split-slider-value').textContent = "00:00:00";
      }

      const trimStart = document.getElementById('trim-slider-start');
      const trimEnd = document.getElementById('trim-slider-end');
      if (trimStart && trimEnd) {
        trimStart.max = Math.floor(videoDuration);
        trimEnd.max = Math.floor(videoDuration);
        trimStart.value = 0;
        trimEnd.value = Math.floor(videoDuration);
        document.getElementById('trim-label-start').textContent = "00:00:00";
        document.getElementById('trim-label-end').textContent = formatTime(Math.floor(videoDuration));
      }
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
  const btn = document.getElementById('emotional-toggle-btn');
  if (!btn) return;
  btn.textContent = isActive ? 'ON' : 'OFF';
  btn.classList.toggle('active', isActive);
  btn.setAttribute('aria-pressed', String(isActive));
}

function startSystemMetrics() {
  const ramRing = document.getElementById('ram-ring');
  const cpuRing = document.getElementById('cpu-ring');
  const ramValue = document.getElementById('ram-value');
  const cpuValue = document.getElementById('cpu-value');

  const setUnavailable = () => {
    if (ramValue) ramValue.textContent = 'N/A';
    if (cpuValue) cpuValue.textContent = 'N/A';
    if (ramRing) ramRing.style.setProperty('--metric-value', '0%');
    if (cpuRing) cpuRing.style.setProperty('--metric-value', '0%');
    ramRing?.classList.add('metric-unavailable');
    cpuRing?.classList.add('metric-unavailable');
  };

  const poll = async () => {
    try {
      const metrics = await invoke('get_system_metrics');
      const ram = Number(metrics?.ram_percent);
      const cpu = Number(metrics?.cpu_percent);

      if (!Number.isFinite(ram) || !Number.isFinite(cpu)) {
        setUnavailable();
        return;
      }

      ramRing?.classList.remove('metric-unavailable');
      cpuRing?.classList.remove('metric-unavailable');
      setMetricRing(ramRing, ram);
      setMetricRing(cpuRing, cpu);
      if (ramValue) ramValue.textContent = `${Math.round(ram)}%`;
      if (cpuValue) cpuValue.textContent = `${Math.round(cpu)}%`;
    } catch (error) {
      console.warn('System metrics unavailable:', error);
      setUnavailable();
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
  if (event.payload.success) {
    displayedProgress = Math.max(displayedProgress, 99);
    setProgressSmooth(100);
    updateStatus(emotionalStages[4].msg);
    updatePersonaFace(100);
  } else {
    updateStatus("Error processing emotional baggage. FFmpeg failed.");
    updatePersonaFace(40); // Anger face for failure
  }
  setTimeout(() => {
    progressContainer.style.display = 'none';
    progressFill.classList.remove('indeterminate');
  if (event.payload.success) {
      setTimeout(() => updatePersonaFace(0), 10000); // Back to neutral after some time
    }
  }, 5000);
});

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Slider listeners
document.getElementById('split-slider')?.addEventListener('input', (e) => {
  document.getElementById('split-slider-value').textContent = formatTime(e.target.value);
});

document.getElementById('trim-slider-start')?.addEventListener('input', (e) => {
  const start = parseInt(e.target.value);
  const end = parseInt(document.getElementById('trim-slider-end').value);
  if (start >= end) {
    e.target.value = end - 1;
  }
  document.getElementById('trim-label-start').textContent = formatTime(e.target.value);
});

document.getElementById('trim-slider-end')?.addEventListener('input', (e) => {
  const end = parseInt(e.target.value);
  const start = parseInt(document.getElementById('trim-slider-start').value);
  if (end <= start) {
    e.target.value = start + 1;
  }
  document.getElementById('trim-label-end').textContent = formatTime(e.target.value);
});

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

  invoke('process_video', { args, totalDuration: videoDuration });
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
async function executeFFmpegTask(taskName, args) {
  if (!globalInputPath || !globalOutputPath) {
    alert("Please select input video and output folder.");
    return;
  }

  if (isDemoMode) {
    updateStatus(`${taskName} completed (Demo mode activated 🎭)`);
    return;
  }

  progressContainer.style.display = 'block';
  displayedProgress = 0;
  setProgressMode(videoDuration);
  updateStatus(`Initiating ${taskName.toLowerCase()}...`);

  try {
    await invoke('process_video', { args, totalDuration: videoDuration });
  } catch (e) {
    console.error(`Error in ${taskName}:`, e);
    updateStatus(`${taskName} failed.`);
  }
}

// --- Split Tool ---
document.getElementById('run-split-btn').addEventListener('click', () => {
  const startSeconds = document.getElementById('split-slider').value;
  const start = formatTime(startSeconds);
  const filename = globalInputPath.split(/[\/\\]/).pop();
  const output = `${globalOutputPath}/split_${filename}`;

  // Note: For split, we usually just want to cut from a point to the end, or a fixed duration.
  // We'll cut from 'start' till the end.
  const args = ["-i", globalInputPath, "-ss", start, "-c", "copy", "-y", output];
  executeFFmpegTask("Splitting", args);
});

// --- Trim Tool ---
document.getElementById('run-trim-btn').addEventListener('click', () => {
  const startSeconds = document.getElementById('trim-slider-start').value;
  const endSeconds = document.getElementById('trim-slider-end').value;
  const start = formatTime(startSeconds);
  const end = formatTime(endSeconds);
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

    // We run them one by one for now to avoid CPU overload
    const duration = await invoke('get_video_duration', { filePath: input });
    await invoke('process_video', { args, totalDuration: duration });

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
  const filename = globalInputPath.split(/[\/\\]/).pop().split('.')[0];
  const output = `${globalOutputPath}/${filename}_elite.gif`;

  // High Quality GIF filter chain
  const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

  const args = ["-i", globalInputPath, "-vf", filter, "-y", output];
  executeFFmpegTask("GIF Creation", args);
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
    await invoke('process_video', { args: args1 });

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

  // Filter for grid of thumbnails
  const filter = `thumbnail,scale=${width}:-1,tile=${grid}`;

  const args = ["-i", globalInputPath, "-vf", filter, "-frames:v", "1", "-y", output];
  executeFFmpegTask("Contact Sheet", args);
});

// --- Theme Switcher Logic ---
const themeCircles = document.querySelectorAll('.theme-circle');
const body = document.body;

// Load saved theme
const savedTheme = localStorage.getItem('app-theme') || 'theme-blue';
setTheme(savedTheme);

themeCircles.forEach(circle => {
  circle.addEventListener('click', () => {
    const theme = circle.dataset.theme;
    setTheme(theme);
  });
});

function setTheme(themeName) {
  // Remove existing themes
  body.classList.remove('theme-blue', 'theme-red', 'theme-green', 'theme-purple', 'theme-gold');
  body.classList.add(themeName);

  // Update active state in UI
  themeCircles.forEach(c => {
    if (c.dataset.theme === themeName) c.classList.add('active');
    else c.classList.remove('active');
  });

  localStorage.setItem('app-theme', themeName);
}


