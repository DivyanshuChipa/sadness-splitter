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
  { min: 0, max: 25, msg: "Denial phase: pretending everything is fine..." },
  { min: 25, max: 50, msg: "Anger phase: codec fighting bitrate..." },
  { min: 50, max: 75, msg: "Bargaining phase: CRF negotiating with pixels..." },
  { min: 75, max: 100, msg: "Depression phase: slow contemplation of life's choices..." },
  { min: 100, max: 101, msg: "Acceptance: sadness re-encoded successfully 💛" }
];

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
    btn.classList.add('active');
    const targetView = document.getElementById(btn.dataset.target);
    targetView.classList.add('active');
    targetView.style.display = 'block';
    
    // Refresh icons just in case (though usually not needed)
    lucide.createIcons();
  });
});

// Demo mode logic is now handled in tour.js via the dialog.

function updateStatus(msg) {
  statusText.textContent = msg;
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

// --- Progress Listener ---
listen('progress', (event) => {
  const percent = event.payload.percentage;
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = `Emotional Level: ${percent}%`;
  
  const stage = emotionalStages.find(s => percent >= s.min && percent < s.max);
  if (stage) {
    updateStatus(`Sadness Meter: ${stage.msg}`);
  }
});

listen('finished', (event) => {
  if (event.payload.success) {
    progressFill.style.width = `100%`;
    progressLabel.textContent = `Emotional Level: 100%`;
    updateStatus(emotionalStages[4].msg);
  } else {
    updateStatus("Error processing emotional baggage. FFmpeg failed.");
  }
  setTimeout(() => { progressContainer.style.display = 'none'; }, 5000);
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
  progressFill.style.width = '0%';
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
  progressFill.style.width = '0%';
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
  if (audioFactor > 2.0) atempo = `atempo=2.0,atempo=${audioFactor/2.0}`;
  
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
    
    updateStatus(`Batch: Processing ${i+1}/${batchList.length} - ${filename}`);
    
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


