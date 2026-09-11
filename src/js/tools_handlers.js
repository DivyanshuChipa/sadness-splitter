import { invoke, tauriDialog, listen } from './tauri.js';
import { updateStatus, setPersonaEmotion, getAuraSpeech, logToTechyConsole } from './aura_persona.js';
import { initAudioVisualizer } from './visualizer.js';
import { initPreviewPlayer } from './preview_player.js';

let displayedProgress = 0;

export function setProgressMode(totalDuration = 0) {
  const progressFill = document.getElementById('progress-fill');
  const progressLabel = document.getElementById('progress-label');
  if (!progressFill || !progressLabel) return;

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

export function setProgressSmooth(target) {
  const progressFill = document.getElementById('progress-fill');
  const progressLabel = document.getElementById('progress-label');
  if (!progressFill || !progressLabel) return;

  const clamped = Math.max(displayedProgress, Math.min(100, Number(target) || 0));
  displayedProgress += (clamped - displayedProgress) * 0.35;
  if (Math.abs(clamped - displayedProgress) < 0.5) displayedProgress = clamped;
  progressFill.style.width = `${displayedProgress.toFixed(1)}%`;
  progressLabel.textContent = `Emotional Level: ${Math.round(displayedProgress)}%`;
}

export async function executeFFmpegTask(taskName, args, customDuration = null) {
  const isMerge = (taskName === "Video Merging");
  if ((!isMerge && !window.globalInputPath) || !window.globalOutputPath) {
    alert(isMerge ? "Please select output folder." : "Please select input video and output folder.");
    return;
  }

  if (args && args.length > 0) {
    window.lastProcessedOutputPath = args[args.length - 1];
  }
  const previewOutBtn = document.getElementById('preview-output-btn');
  if (previewOutBtn) {
    previewOutBtn.style.display = 'none';
  }

  if (window.isDemoMode) {
    updateStatus(`${taskName} completed (Demo mode activated 🎭)`);
    return;
  }

  const durationToUse = (customDuration !== null) ? customDuration : (window.videoDuration || 0);

  const progressContainer = document.getElementById('progress-container');
  if (progressContainer) progressContainer.style.display = 'block';
  displayedProgress = 0;
  setProgressMode(durationToUse);
  updateStatus(`Initiating ${taskName.toLowerCase()}...`);

  if (localStorage.getItem('settings-debug-mode') === 'true') {
    console.log(`[DEBUG] Task Name: ${taskName}`);
    console.log("[DEBUG] FFmpeg executable path:", localStorage.getItem('ffmpeg-custom-path') || "ffmpeg");
    console.log("[DEBUG] FFmpeg arguments:", args);
  }
  logToTechyConsole(`Executing FFmpeg task [${taskName}]: ffmpeg ${args.join(' ')}`, "command");

  try {
    await invoke('process_video', { args, totalDuration: durationToUse, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });
  } catch (e) {
    console.error(`Error in ${taskName}:`, e);
    updateStatus(`${taskName} failed.`);
  }
}

export async function loadVideoFile(file) {
  try {
    window.globalInputPath = file;
    document.getElementById('global-input-path').value = file;

    window.selectedCoverImagePath = "";
    const coverDisplay = document.getElementById('cover-path-display');
    if (coverDisplay) coverDisplay.textContent = "No image selected";
    const titleInput = document.getElementById('metadata-title');
    if (titleInput) titleInput.value = "";
    const artistInput = document.getElementById('metadata-artist');
    if (artistInput) artistInput.value = "";
    const albumInput = document.getElementById('metadata-album');
    if (albumInput) albumInput.value = "";

    const filename = file.split(/[\/\\]/).pop();
    const extension = filename.split('.').pop().toLowerCase();
    const isAudio = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(extension);

    updateStatus(`Selected: ${filename}`);
    setPersonaEmotion('face_happy.png', `Mil gayi file! Ab shuru karein? ${filename}`);
    logToTechyConsole(`Loaded media file path successfully: ${file}`, "system");

    window.videoDuration = await invoke('get_video_duration', { filePath: file, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });
    logToTechyConsole(`Queried media duration: ${window.videoDuration.toFixed(2)} seconds.`, "info");

    const splitSlider = document.getElementById('split-slider');
    const splitTimeInput = document.getElementById('split-time-input');
    const runSplitBtn = document.getElementById('run-split-btn');
    if (splitSlider) {
      splitSlider.max = Math.floor(window.videoDuration);
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
      trimStart.max = Math.floor(window.videoDuration);
      trimEnd.max = Math.floor(window.videoDuration);
      trimStart.value = 0;
      trimEnd.value = Math.floor(window.videoDuration);
      document.getElementById('trim-label-start').textContent = "00:00:00";
      document.getElementById('trim-label-end').textContent = window.formatTime ? window.formatTime(Math.floor(window.videoDuration)) : "00:00:00";
      if (trimTimeStart && trimTimeEnd) {
        trimTimeStart.value = "00:00:00";
        trimTimeEnd.value = window.formatTime ? window.formatTime(Math.floor(window.videoDuration)) : "00:00:00";
        trimTimeStart.classList.remove('invalid-input');
        trimTimeEnd.classList.remove('invalid-input');
      }
      if (runTrimBtn) {
        runTrimBtn.disabled = false;
        runTrimBtn.style.opacity = '1';
        runTrimBtn.style.pointerEvents = 'auto';
      }
    }

    if (isAudio) {
      const switcherContainer = document.querySelector('.mode-switcher-container');
      if (switcherContainer && switcherContainer.getAttribute('data-mode') !== 'audio') {
        if (window.switchToolkitMode) window.switchToolkitMode('audio');
      }
      initAudioVisualizer(file);
    } else {
      const switcherContainer = document.querySelector('.mode-switcher-container');
      if (switcherContainer && switcherContainer.getAttribute('data-mode') !== 'video') {
        if (window.switchToolkitMode) window.switchToolkitMode('video');
      }
      initPreviewPlayer(file);
    }
  } catch (err) {
    console.error("Failed to load media file:", err);
    updateStatus("Failed to query media duration metadata.");
    logToTechyConsole(`Metadata query failed for path: ${file}. Raw error logged.`, "error");
  }
}

export function initToolsHandlers() {
  const crfSlider = document.getElementById('crf-slider');
  const crfInput = document.getElementById('crf-input');
  const crfDesc = document.getElementById('crf-description');

  function updateCrfDesc(val) {
    if (val <= 20) crfDesc.textContent = "(High Quality)";
    else if (val <= 23) crfDesc.textContent = "(Balanced)";
    else crfDesc.textContent = "(Smaller File)";
  }

  if (crfSlider && crfInput) {
    crfSlider.addEventListener('input', (e) => {
      crfInput.value = e.target.value;
      updateCrfDesc(e.target.value);
    });
    crfInput.addEventListener('input', (e) => {
      crfSlider.value = e.target.value;
      updateCrfDesc(e.target.value);
    });
  }

  document.getElementById('run-compress-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input video and output folder.");
      return;
    }

    if (window.isDemoMode) {
      updateStatus("Sadness compressed. Emotional baggage reduced 💛 (Demo)");
      return;
    }

    const crf = crfInput.value;
    const preset = document.getElementById('compress-preset').value;
    const codec = document.getElementById('compress-codec').value;
    const resolution = document.getElementById('compress-resolution').value;

    const filename = window.globalInputPath.split(/[\/\\]/).pop();
    const output = `${window.globalOutputPath}/compressed_${filename}`;

    let args = [
      "-i", window.globalInputPath,
      "-vcodec", codec,
      "-crf", crf.toString(),
      "-preset", preset
    ];

    if (resolution !== "original") {
      if (resolution === "half") {
        args.push("-vf", "scale=iw/2:-1");
      } else {
        const [w, h] = resolution.split(':');
        args.push("-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
      }
    }

    args.push("-y", output);

    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) progressContainer.style.display = 'block';
    displayedProgress = 0;
    setProgressMode(window.videoDuration);
    updateStatus("Beginning the process of emotional containment...");

    if (localStorage.getItem('settings-debug-mode') === 'true') {
      console.log("[DEBUG] FFmpeg executable path:", localStorage.getItem('ffmpeg-custom-path') || "ffmpeg");
      console.log("[DEBUG] FFmpeg arguments:", args);
    }
    logToTechyConsole(`Executing FFmpeg compression command: ffmpeg ${args.join(' ')}`, "command");

    invoke('process_video', { args, totalDuration: window.videoDuration || 0, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });
  });

  document.getElementById('add-batch-files-btn')?.addEventListener('click', async () => {
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

  document.getElementById('add-batch-folder-btn')?.addEventListener('click', async () => {
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

  document.getElementById('clear-batch-list-btn')?.addEventListener('click', () => {
    const batchList = document.getElementById('batch-list');
    batchList.innerHTML = '<li class="empty-msg">No files in batch.</li>';
    batchList.classList.add('empty');
    updateStatus("Batch list cleared.");
  });

  document.getElementById('run-split-btn')?.addEventListener('click', () => {
    const start = document.getElementById('split-time-input').value || document.getElementById('split-slider-value').textContent;
    const filename = window.globalInputPath.split(/[\/\\]/).pop();
    const output = `${window.globalOutputPath}/split_${filename}`;

    const args = ["-i", window.globalInputPath, "-ss", start, "-c", "copy", "-y", output];
    executeFFmpegTask("Splitting", args);
  });

  document.getElementById('run-trim-btn')?.addEventListener('click', () => {
    const start = document.getElementById('trim-time-start').value || document.getElementById('trim-label-start').textContent;
    const end = document.getElementById('trim-time-end').value || document.getElementById('trim-label-end').textContent;
    const filename = window.globalInputPath.split(/[\/\\]/).pop();
    const output = `${window.globalOutputPath}/trimmed_${filename}`;

    const args = ["-i", window.globalInputPath, "-ss", start, "-to", end, "-c", "copy", "-y", output];
    executeFFmpegTask("Trimming", args);
  });

  document.getElementById('run-rotate-btn')?.addEventListener('click', () => {
    const type = document.getElementById('rotate-select').value;
    const rotationMap = {
      "90 Clockwise": "transpose=1",
      "90 Counter": "transpose=2",
      "180 Flip": "transpose=1,transpose=1"
    };
    const filename = window.globalInputPath.split(/[\/\\]/).pop();
    const output = `${window.globalOutputPath}/rotated_${filename}`;

    const args = ["-i", window.globalInputPath, "-vf", rotationMap[type], "-y", output];
    executeFFmpegTask("Rotation", args);
  });

  document.getElementById('run-audio-btn')?.addEventListener('click', () => {
    const format = document.getElementById('audio-format').value;
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_audio.${format}`;

    const args = ["-i", window.globalInputPath, "-q:a", "0", "-map", "a", "-y", output];
    executeFFmpegTask("Audio Extraction", args);
  });

  document.getElementById('run-convert-btn')?.addEventListener('click', () => {
    const format = document.getElementById('convert-format').value;
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/converted_${filename}.${format}`;

    let args = ["-i", window.globalInputPath];

    if (format === '3gp') {
      args.push("-vcodec", "libx264", "-acodec", "aac", "-strict", "experimental");
    } else if (format === 'gif') {
      args.push("-vf", "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse");
    }

    args.push("-y", output);
    executeFFmpegTask("Conversion", args);
  });

  document.getElementById('browse-subtitle-btn')?.addEventListener('click', async () => {
    const file = await tauriDialog.open({
      filters: [{ name: 'Subtitle', extensions: ['srt', 'ass'] }]
    });
    if (file) {
      document.getElementById('subtitle-path').value = file;
    }
  });

  document.getElementById('run-subtitle-btn')?.addEventListener('click', () => {
    const subPath = document.getElementById('subtitle-path').value;
    if (!subPath) { alert("Please select a subtitle file."); return; }

    const filename = window.globalInputPath.split(/[\/\\]/).pop();
    const output = `${window.globalOutputPath}/subtitled_${filename}`;

    const safeSubPath = subPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const args = ["-i", window.globalInputPath, "-vf", `subtitles='${safeSubPath}'`, "-c:a", "copy", "-y", output];
    executeFFmpegTask("Subtitle Burning", args);
  });

  document.getElementById('run-speed-btn')?.addEventListener('click', () => {
    const speed = document.getElementById('speed-factor').value;
    const ptsMap = { "0.5": "2.0*PTS", "1.5": "0.667*PTS", "2.0": "0.5*PTS", "4.0": "0.25*PTS" };
    const ptsFactor = ptsMap[speed];
    const audioFactor = parseFloat(speed);

    let atempo = `atempo=${audioFactor}`;
    if (audioFactor > 2.0) atempo = `atempo=2.0,atempo=${audioFactor / 2.0}`;

    const filename = window.globalInputPath.split(/[\/\\]/).pop();
    const output = `${window.globalOutputPath}/speedwarp_${speed}x_${filename}`;

    const args = [
      "-i", window.globalInputPath,
      "-filter_complex", `[0:v]setpts=${ptsFactor}[v];[0:a]${atempo}[a]`,
      "-map", "[v]", "-map", "[a]", "-y", output
    ];
    executeFFmpegTask("Speed Warp", args);
  });

  document.getElementById('run-batch-btn')?.addEventListener('click', async () => {
    const batchList = document.querySelectorAll('#batch-list li:not(.empty-msg)');
    if (batchList.length === 0) { alert("Batch list is empty."); return; }
    if (!window.globalOutputPath) { alert("Please select an output folder."); return; }

    const crf = document.getElementById('crf-input').value;
    updateStatus(`Starting batch processing for ${batchList.length} files...`);

    for (let i = 0; i < batchList.length; i++) {
      const input = batchList[i].dataset.path;
      const filename = input.split(/[\/\\]/).pop();
      const output = `${window.globalOutputPath}/BATCH_CRF${crf}_${filename}`;

      updateStatus(`Batch: Processing ${i + 1}/${batchList.length} - ${filename}`);

      const args = ["-i", input, "-vcodec", "libx264", "-crf", crf.toString(), "-preset", "medium", "-y", output];

      if (localStorage.getItem('settings-debug-mode') === 'true') {
        console.log(`[DEBUG] Batch file ${i + 1}/${batchList.length}: ${filename}`);
        console.log("[DEBUG] FFmpeg executable path:", localStorage.getItem('ffmpeg-custom-path') || "ffmpeg");
        console.log("[DEBUG] FFmpeg arguments:", args);
      }

      const duration = await invoke('get_video_duration', { filePath: input, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });
      await invoke('process_video', { args, totalDuration: duration, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });

      await new Promise(resolve => {
        const unlisten = listen('finished', () => {
          unlisten.then(fn => fn());
          resolve();
        });
      });
    }
    updateStatus("Batch processing complete! 💛");
  });

  document.getElementById('run-gif-btn')?.addEventListener('click', () => {
    const width = document.getElementById('gif-width').value || "480";
    const fps = document.getElementById('gif-fps').value || "15";
    const start = document.getElementById('gif-start').value || "00:00:00";
    const duration = parseInt(document.getElementById('gif-duration').value) || 6;
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_elite.gif`;

    const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

    const args = ["-ss", start, "-t", duration.toString(), "-i", window.globalInputPath, "-vf", filter, "-y", output];
    executeFFmpegTask("GIF Creation", args, duration);
  });

  document.getElementById('run-merge-btn')?.addEventListener('click', async () => {
    const batchList = document.querySelectorAll('#batch-list li:not(.empty-msg)');
    if (batchList.length < 2) { alert("Please add at least 2 videos in the Batch Processor tab."); return; }
    if (!window.globalOutputPath) { alert("Please select an output folder."); return; }

    let outName = document.getElementById('merge-filename').value || "merged_video.mp4";
    if (!outName.includes('.')) {
      outName += ".mp4";
    }
    const output = `${window.globalOutputPath}/${outName}`;

    updateStatus("Analyzing batch videos stream properties... 📊");

    const runMergeBtn = document.getElementById('run-merge-btn');
    if (runMergeBtn) runMergeBtn.disabled = true;

    try {
      const metadataList = [];
      const customFfmpeg = localStorage.getItem('ffmpeg-custom-path') || null;

      for (const li of batchList) {
        const path = li.dataset.path;
        try {
          const meta = await invoke('get_video_metadata', { filePath: path, customFfmpegPath: customFfmpeg });
          metadataList.push(meta);
        } catch (err) {
          console.error(`Failed to read metadata for ${path}:`, err);
          metadataList.push({
            width: 1920,
            height: 1080,
            hasAudio: true,
            duration: 10.0
          });
        }
      }

      let inputArgs = [];
      let filterStr = "";
      let concatInputs = "";

      const targetW = metadataList[0].width || 1920;
      const targetH = metadataList[0].height || 1080;

      batchList.forEach((li, i) => {
        inputArgs.push("-i", li.dataset.path);

        const meta = metadataList[i];

        filterStr += `[${i}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1[v_${i}];`;

        if (meta.hasAudio) {
          filterStr += `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a_${i}];`;
        } else {
          const dur = meta.duration || 10.0;
          filterStr += `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=end=${dur},asetpts=PTS-STARTPTS[a_${i}];`;
        }

        concatInputs += `[v_${i}][a_${i}]`;
      });

      filterStr += `${concatInputs}concat=n=${batchList.length}:v=1:a=1[v][a]`;

      const args = [...inputArgs, "-filter_complex", filterStr, "-map", "[v]", "-map", "[a]", "-y", output];

      executeFFmpegTask("Video Merging", args);
    } catch (err) {
      console.error("Failed to build video merge task:", err);
      updateStatus("Failed to initiate video merging.");
    } finally {
      if (runMergeBtn) runMergeBtn.disabled = false;
    }
  });

  document.getElementById('run-stabilize-btn')?.addEventListener('click', async () => {
    const shake = document.getElementById('stabilize-level').value || "5";
    const smooth = document.getElementById('stabilize-smooth').value || "30";
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/stabilized_${filename}.mp4`;
    const trfPath = `${window.globalOutputPath}/transforms.trf`;

    const escapedTrfPath = trfPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    updateStatus("Pass 1: Detecting shakiness... 📊");
    const args1 = ["-i", window.globalInputPath, "-vf", `vidstabdetect=shakiness=${shake}:result='${escapedTrfPath}'`, "-f", "null", "-"];

    try {
      if (localStorage.getItem('settings-debug-mode') === 'true') {
        console.log("[DEBUG] Stabilizer Pass 1 arguments:", args1);
      }
      await invoke('process_video', { args: args1, totalDuration: 0.0, customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null });

      updateStatus("Pass 2: Smoothing memories... ✨");
      const args2 = ["-i", window.globalInputPath, "-vf", `vidstabtransform=smoothing=${smooth}:input='${escapedTrfPath}'`, "-y", output];
      executeFFmpegTask("Stabilization", args2);
    } catch (err) {
      updateStatus(`Error in Pass 1: ${err}`);
    }
  });

  document.getElementById('run-contact-btn')?.addEventListener('click', () => {
    const grid = document.getElementById('contact-grid').value || "4x4";
    const width = document.getElementById('contact-width').value || "300";
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_contact_sheet.png`;

    const [cols, rows] = grid.split('x').map(Number);
    const numFrames = cols * rows;

    let filter;
    if (window.videoDuration && window.videoDuration > 0) {
      const interval = window.videoDuration / (numFrames + 1);
      filter = `select='isnan(prev_selected_t)+gte(t-prev_selected_t,${interval})',scale=${width}:-1,tile=${grid}`;
    } else {
      filter = `thumbnail,scale=${width}:-1,tile=${grid}`;
    }

    const args = ["-i", window.globalInputPath, "-vf", filter, "-frames:v", "1", "-y", output];
    executeFFmpegTask("Contact Sheet", args);
  });

  document.getElementById('run-slowed-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input media and output folder.");
      return;
    }
    const speed = document.getElementById('slowed-speed').value;
    const intensity = document.getElementById('slowed-reverb-intensity').value;
    const intensityMap = {
      'light': 'aecho=0.8:0.8:40:0.3',
      'medium': 'aecho=0.8:0.8:60:0.45',
      'deep': 'aecho=0.8:0.8:100:0.6'
    };
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_slowed_reverb.mp3`;
    const targetRate = Math.round(44100 * parseFloat(speed));
    const filter = `asetrate=${targetRate},aresample=44100,${intensityMap[intensity]}`;
    const args = ["-i", window.globalInputPath, "-af", filter, "-q:a", "2", "-y", output];
    executeFFmpegTask("Slowed + Reverb", args);
  });

  document.getElementById('run-lofi-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input media and output folder.");
      return;
    }
    const preset = document.getElementById('lofi-preset').value;
    const applyCrackle = document.getElementById('lofi-crackle-checkbox').checked;
    let filter = "";
    if (preset === 'cassette') {
      filter = "aresample=11025,vibrato=f=3.5:d=0.15,highpass=f=200,lowpass=f=3200";
    } else if (preset === 'gramophone') {
      filter = "aresample=8000,vibrato=f=5:d=0.25,highpass=f=350,lowpass=f=2000";
    } else {
      filter = "aresample=16000,vibrato=f=4.5:d=0.2,highpass=f=150,lowpass=f=4000";
    }
    if (applyCrackle) {
      filter += ",tremolo=f=12:d=0.1";
    }
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_lofi.mp3`;
    const args = ["-i", window.globalInputPath, "-af", filter, "-q:a", "2", "-y", output];
    executeFFmpegTask("Lofi Injector", args);
  });

  document.getElementById('run-vocal-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input media and output folder.");
      return;
    }
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_vocal_isolated.mp3`;
    const args = ["-i", window.globalInputPath, "-af", "pan=stereo|c0=c0-c1|c1=c1-c0", "-q:a", "2", "-y", output];
    executeFFmpegTask("Vocal Isolation", args);
  });

  document.getElementById('run-nightcore-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input media and output folder.");
      return;
    }
    const speed = document.getElementById('nightcore-speed').value;
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_nightcore.mp3`;
    const targetRate = Math.round(44100 * parseFloat(speed));
    const filter = `asetrate=${targetRate},aresample=44100`;
    const args = ["-i", window.globalInputPath, "-af", filter, "-q:a", "2", "-y", output];
    executeFFmpegTask("Nightcore Warp", args);
  });

  document.getElementById('run-audio-extractor-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input media and output folder.");
      return;
    }
    const format = document.getElementById('audio-extractor-format').value;
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_extracted.${format}`;
    const args = ["-i", window.globalInputPath, "-q:a", "0", "-map", "a", "-y", output];
    executeFFmpegTask("Audio Extraction", args);
  });

  const audioConvertAdvancedToggle = document.getElementById('audio-convert-advanced-toggle');
  const audioConvertAdvancedPanel = document.getElementById('audio-convert-advanced-panel');
  if (audioConvertAdvancedToggle && audioConvertAdvancedPanel) {
    audioConvertAdvancedToggle.addEventListener('change', (e) => {
      audioConvertAdvancedPanel.classList.toggle('show', e.target.checked);
    });
  }

  document.getElementById('run-audio-convert-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input media and output folder.");
      return;
    }
    const format = document.getElementById('audio-convert-format').value;
    const filename = window.globalInputPath.split(/[\/\\]/).pop().split('.')[0];
    const output = `${window.globalOutputPath}/${filename}_converted.${format}`;

    const args = ["-i", window.globalInputPath];

    const isAdvanced = audioConvertAdvancedToggle && audioConvertAdvancedToggle.checked;
    const isLossy = ['mp3', 'aac', 'ogg', 'opus'].includes(format);

    if (format === 'opus') {
      args.push("-c:a", "libopus");
    }

    if (isAdvanced) {
      if (isLossy) {
        const bitrate = document.getElementById('audio-convert-bitrate').value;
        if (bitrate !== 'keep') {
          args.push("-b:a", bitrate);
        } else if (format !== 'opus') {
          args.push("-q:a", "0");
        }
      }

      const channels = document.getElementById('audio-convert-channels').value;
      if (channels !== 'keep') {
        args.push("-ac", channels);
      }

      let sampleRate = document.getElementById('audio-convert-sample-rate').value;
      if (sampleRate !== 'keep') {
        if (format === 'opus') {
          if (sampleRate === '44100' || sampleRate === '32000') {
            sampleRate = '48000';
          } else if (sampleRate === '22050') {
            sampleRate = '24000';
          }
        }
        args.push("-ar", sampleRate);
      }
    } else {
      if (isLossy && format !== 'opus') {
        args.push("-q:a", "0");
      }
    }

    args.push("-y", output);
    executeFFmpegTask("Audio Conversion", args);
  });

  document.getElementById('browse-cover-btn')?.addEventListener('click', async () => {
    try {
      const file = await tauriDialog.open({
        filters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg'] }]
      });
      if (file) {
        window.selectedCoverImagePath = file;
        const display = document.getElementById('cover-path-display');
        if (display) {
          display.textContent = file.split(/[\/\\]/).pop();
          display.title = file;
        }
        logToTechyConsole(`Selected cover art: ${file}`, "info");
      }
    } catch (e) {
      console.error("Cover image selection failed:", e);
      logToTechyConsole("Failed to open cover image dialog.", "error");
    }
  });

  document.getElementById('run-metadata-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input media and output folder.");
      return;
    }

    const title = document.getElementById('metadata-title').value.trim();
    const artist = document.getElementById('metadata-artist').value.trim();
    const album = document.getElementById('metadata-album').value.trim();

    const inputFilename = window.globalInputPath.split(/[\/\\]/).pop();
    const dotIndex = inputFilename.lastIndexOf('.');
    const nameWithoutExt = dotIndex !== -1 ? inputFilename.substring(0, dotIndex) : inputFilename;
    const ext = dotIndex !== -1 ? inputFilename.substring(dotIndex + 1).toLowerCase() : 'mp3';
    const output = `${window.globalOutputPath}/${nameWithoutExt}_tagged.${ext}`;

    let args = [];
    if (window.selectedCoverImagePath) {
      args = [
        "-i", window.globalInputPath,
        "-i", window.selectedCoverImagePath,
        "-map", "0:0",
        "-map", "1:0",
        "-c", "copy",
        "-id3v2_version", "3",
        "-metadata:s:v", "title=Album cover",
        "-metadata:s:v", "comment=Cover (front)"
      ];
    } else {
      args = [
        "-i", window.globalInputPath,
        "-c", "copy"
      ];
    }

    if (title) {
      args.push("-metadata", `title=${title}`);
    }
    if (artist) {
      args.push("-metadata", `artist=${artist}`);
    }
    if (album) {
      args.push("-metadata", `album=${album}`);
    }

    args.push("-y", output);
    executeFFmpegTask("Metadata Update", args);
  });

  document.getElementById('browse-video-thumbnail-btn')?.addEventListener('click', async () => {
    try {
      const file = await tauriDialog.open({
        filters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg'] }]
      });
      if (file) {
        window.selectedVideoThumbnailPath = file;
        const display = document.getElementById('video-thumbnail-path-display');
        if (display) {
          display.textContent = file.split(/[\/\\]/).pop();
          display.title = file;
        }
        logToTechyConsole(`Selected video cover image: ${file}`, "info");
      }
    } catch (e) {
      console.error("Video cover image selection failed:", e);
      logToTechyConsole("Failed to open video cover image dialog.", "error");
    }
  });

  document.getElementById('waveform-bg-btn')?.addEventListener('click', async () => {
    try {
      const file = await tauriDialog.open({
        filters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg'] }]
      });
      if (file) {
        window.selectedWaveformBgPath = file;
        const display = document.getElementById('waveform-bg-path-display');
        if (display) {
          display.textContent = file.split(/[\/\\]/).pop();
          display.title = file;
        }
        logToTechyConsole(`Selected waveform background: ${file}`, "info");
      }
    } catch (e) {
      console.error("Waveform background selection failed:", e);
      logToTechyConsole("Failed to open background image dialog.", "error");
    }
  });

  const wfHeightSlider = document.getElementById('waveform-height');
  const wfHeightVal = document.getElementById('waveform-height-val');
  if (wfHeightSlider && wfHeightVal) {
    wfHeightSlider.addEventListener('input', () => {
      wfHeightVal.textContent = `${wfHeightSlider.value}px`;
    });
  }

  const wfYPosSlider = document.getElementById('waveform-y-pos');
  const wfYPosVal = document.getElementById('waveform-y-pos-val');
  if (wfYPosSlider && wfYPosVal) {
    wfYPosSlider.addEventListener('input', () => {
      const val = wfYPosSlider.value;
      let label = `${val}%`;
      if (val === '0') label += ' (Top)';
      else if (val === '50') label += ' (Center)';
      else if (val === '100') label += ' (Bottom)';
      wfYPosVal.textContent = label;
    });
  }

  const wfDensitySlider = document.getElementById('waveform-density');
  const wfDensityVal = document.getElementById('waveform-density-val');
  if (wfDensitySlider && wfDensityVal) {
    wfDensitySlider.addEventListener('input', () => {
      const val = wfDensitySlider.value;
      let desc = 'Bars';
      if (val < 60) desc += ' (Blocky)';
      else if (val < 150) desc += ' (Chunky)';
      else desc += ' (Fine)';
      wfDensityVal.textContent = `${val} ${desc}`;
    });
  }

  document.getElementById('run-waveform-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input audio first.");
      return;
    }

    const style = document.getElementById('waveform-style').value;
    const res = document.getElementById('waveform-res').value;
    const color = document.getElementById('waveform-color').value;
    const waveHeight = document.getElementById('waveform-height').value;
    const yPos = document.getElementById('waveform-y-pos').value;
    const density = document.getElementById('waveform-density').value;

    const resParts = res.split('x');
    const resW = resParts[0];
    const resH = resParts[1];

    const cleanColor = color.replace('#', '0x');

    const inputFilename = window.globalInputPath.split(/[\/\\]/).pop();
    const dotIndex = inputFilename.lastIndexOf('.');
    const nameWithoutExt = dotIndex !== -1 ? inputFilename.substring(0, dotIndex) : inputFilename;
    const isKaleidoscope = (style === 'kaleidoscope');
    const output = `${window.globalOutputPath}/${nameWithoutExt}_${isKaleidoscope ? 'kaleidoscope' : 'waveform'}.mp4`;

    let args = [];

    if (isKaleidoscope) {
      const minDim = Math.min(parseInt(resW), parseInt(resH));
      const quadDim = Math.max(160, Math.floor(minDim * 0.42));
      const kaleidoDim = Math.min(parseInt(resW), parseInt(resH));

      const kaleidoFilter = `[0:a]aformat=channel_layouts=mono,showwaves=s=${quadDim}x${quadDim}:mode=line:colors=${cleanColor}:r=24[w];[w]split=4[q1][q2][q3][q4];[q2]hflip[q2f];[q3]vflip[q3f];[q4]hflip,vflip[q4f];[q1][q2f]hstack[top];[q3f][q4f]hstack[bot];[top][bot]vstack[mirrored];[mirrored]split[m1][m2];[m1]rotate=a='PI*t/6':ow=${kaleidoDim}:oh=${kaleidoDim}:c=none[r1];[m2]rotate=a='PI*t/6+PI/4':ow=${kaleidoDim}:oh=${kaleidoDim}:c=none[r2];[r1][r2]blend=all_mode=addition[star];[star]split[sharp][blur];[blur]gblur=sigma=10:steps=2,eq=saturation=2.5:contrast=1.3[glowing];[sharp][glowing]blend=all_mode=addition,hue=H='2*PI*t*0.08':s=2.5[neon];`;

      if (window.selectedWaveformBgPath) {
        args = [
          "-i", window.globalInputPath,
          "-loop", "1",
          "-i", window.selectedWaveformBgPath,
          "-filter_complex", `${kaleidoFilter}[1:v]scale=${resW}:${resH}[bg];[bg][neon]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1[v]`,
          "-map", "[v]",
          "-map", "0:a",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-threads", "0",
          "-r", "24",
          "-pix_fmt", "yuv420p",
          "-shortest",
          "-y", output
        ];
      } else {
        args = [
          "-i", window.globalInputPath,
          "-filter_complex", `color=c=black:s=${resW}x${resH}[bg];${kaleidoFilter}[bg][neon]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1[v]`,
          "-map", "[v]",
          "-map", "0:a",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-threads", "0",
          "-r", "24",
          "-pix_fmt", "yuv420p",
          "-shortest",
          "-y", output
        ];
      }
    } else if (window.selectedWaveformBgPath) {
      args = [
        "-i", window.globalInputPath,
        "-loop", "1",
        "-i", window.selectedWaveformBgPath,
        "-filter_complex", `[0:a]aformat=channel_layouts=mono,showwaves=s=${density}x${waveHeight}:mode=${style}:colors=${cleanColor}:r=24[wave];[wave]scale=${resW}:${waveHeight}:flags=neighbor[scaledwave];[1:v]scale=${resW}:${resH}[bg];[bg][scaledwave]overlay=x=(W-w)/2:y=(H-h)*(${yPos}/100):shortest=1[v]`,
        "-map", "[v]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-threads", "0",
        "-r", "24",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-y", output
      ];
    } else {
      args = [
        "-i", window.globalInputPath,
        "-filter_complex", `color=c=black:s=${resW}x${resH}[bg];[0:a]aformat=channel_layouts=mono,showwaves=s=${density}x${waveHeight}:mode=${style}:colors=${cleanColor}:r=24[wave];[wave]scale=${resW}:${waveHeight}:flags=neighbor[scaledwave];[bg][scaledwave]overlay=x=(W-w)/2:y=(H-h)*(${yPos}/100):shortest=1[v]`,
        "-map", "[v]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-threads", "0",
        "-r", "24",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-y", output
      ];
    }

    executeFFmpegTask(isKaleidoscope ? "Neon Kaleidoscope Video Generation" : "Waveform Generation", args);
  });

  document.getElementById('run-video-thumbnail-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input video and output folder.");
      return;
    }
    if (!window.selectedVideoThumbnailPath) {
      alert("Please select a cover image first.");
      return;
    }

    const inputFilename = window.globalInputPath.split(/[\/\\]/).pop();
    const dotIndex = inputFilename.lastIndexOf('.');
    const nameWithoutExt = dotIndex !== -1 ? inputFilename.substring(0, dotIndex) : inputFilename;
    const ext = dotIndex !== -1 ? inputFilename.substring(dotIndex + 1).toLowerCase() : 'mp4';
    const output = `${window.globalOutputPath}/${nameWithoutExt}_thumbnail.${ext}`;

    const args = [
      "-i", window.globalInputPath,
      "-i", window.selectedVideoThumbnailPath,
      "-map", "0",
      "-map", "1",
      "-c", "copy",
      "-disposition:v:1", "attached_pic",
      "-y", output
    ];

    executeFFmpegTask("Video Thumbnail", args);
  });

  const vhsNoiseSlider = document.getElementById('vhs-noise');
  const vhsNoiseVal = document.getElementById('vhs-noise-val');
  if (vhsNoiseSlider && vhsNoiseVal) {
    vhsNoiseSlider.addEventListener('input', () => {
      const val = vhsNoiseSlider.value;
      let label = val;
      if (val === '0') label += ' (Clean)';
      else if (val < 15) label += ' (Light)';
      else if (val < 35) label += ' (Medium)';
      else label += ' (Heavy)';
      vhsNoiseVal.textContent = label;
    });
  }

  const vhsBleedSlider = document.getElementById('vhs-bleed');
  const vhsBleedVal = document.getElementById('vhs-bleed-val');
  if (vhsBleedSlider && vhsBleedVal) {
    vhsBleedSlider.addEventListener('input', () => {
      const val = vhsBleedSlider.value;
      vhsBleedVal.textContent = `${val}px`;
    });
  }

  document.getElementById('run-retro-filters-btn')?.addEventListener('click', () => {
    if (!window.globalInputPath || !window.globalOutputPath) {
      alert("Please select input video first.");
      return;
    }

    const noise = parseInt(document.getElementById('vhs-noise').value, 10);
    const bleed = parseInt(document.getElementById('vhs-bleed').value, 10);
    const audioMuffle = document.getElementById('vhs-audio-toggle').checked;
    const vignette = document.getElementById('vhs-vignette-toggle').checked;
    const lofi = document.getElementById('vhs-lofi-toggle').checked;

    const inputFilename = window.globalInputPath.split(/[\/\\]/).pop();
    const dotIndex = inputFilename.lastIndexOf('.');
    const nameWithoutExt = dotIndex !== -1 ? inputFilename.substring(0, dotIndex) : inputFilename;
    const ext = dotIndex !== -1 ? inputFilename.substring(dotIndex + 1).toLowerCase() : 'mp4';
    const output = `${window.globalOutputPath}/${nameWithoutExt}_retro.${ext}`;

    let vFilters = [];

    if (lofi) {
      vFilters.push("scale=480:-1");
      vFilters.push("setsar=1:1");
    }

    vFilters.push("eq=saturation=0.8");

    if (bleed > 0) {
      vFilters.push(`rgbashift=rh=${bleed}:rv=${Math.round(bleed/2)}:bh=-${bleed}:bv=-${Math.round(bleed/2)}`);
    }

    if (vignette) {
      vFilters.push("vignette");
    }

    if (noise > 0) {
      vFilters.push(`noise=alls=${noise}:allf=t+u`);
    }

    let args = ["-i", window.globalInputPath];

    if (vFilters.length > 0) {
      args.push("-vf", vFilters.join(","));
    }

    if (audioMuffle) {
      args.push("-af", "highpass=f=100,lowpass=f=3000");
    }

    args.push("-y", output);

    executeFFmpegTask("Retro Filters", args);
  });

  document.getElementById('preview-output-btn')?.addEventListener('click', async () => {
    if (!window.lastProcessedOutputPath) {
      alert("No recently processed file found.");
      return;
    }
    try {
      logToTechyConsole(`Previewing processed file: ${window.lastProcessedOutputPath}`, "system");
      await loadVideoFile(window.lastProcessedOutputPath);

      const extension = window.lastProcessedOutputPath.split('.').pop().toLowerCase();
      const isAudio = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(extension);
      if (isAudio) {
        if (window.visualizerAudio) {
          window.visualizerAudio.play().catch(err => console.error("Auto-play audio failed:", err));
        }
      } else {
        const previewVideo = document.getElementById('preview-video');
        if (previewVideo) {
          previewVideo.play().catch(err => console.error("Auto-play video failed:", err));
        }
      }
    } catch (err) {
      console.error("Preview Work error:", err);
      updateStatus("Failed to preview work.");
      logToTechyConsole(`Failed to load preview for output: ${window.lastProcessedOutputPath}`, "error");
    }
  });

  document.getElementById('run-ytdlp-btn')?.addEventListener('click', async () => {
    if (!window.globalOutputPath) {
      alert("Please select default output folder first.");
      return;
    }

    const url = document.getElementById('ytdlp-url').value.trim();
    if (!url) {
      alert("Please enter a valid YouTube link.");
      return;
    }

    const format = document.getElementById('ytdlp-format').value;
    const customPath = localStorage.getItem('ytdlp-custom-path') || null;

    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) progressContainer.style.display = 'block';
    const progressFill = document.getElementById('progress-fill');
    if (progressFill) progressFill.classList.add('indeterminate');
    updateStatus("Downloading from YouTube... Please wait.");

    logToTechyConsole(`Initiating YouTube download command: yt-dlp ${url} into ${window.globalOutputPath}`, "command");

    try {
      await invoke('download_youtube', {
        url,
        format,
        outputDir: window.globalOutputPath,
        customYtdlpPath: customPath,
        customFfmpegPath: localStorage.getItem('ffmpeg-custom-path') || null,
        cookiesBrowser: localStorage.getItem('settings-ytdlp-cookies-browser') || 'none'
      });
    } catch (err) {
      console.error("YouTube Download command failed:", err);
      updateStatus("Download failed.");
      logToTechyConsole(`Error initiating download command: ${err}`, "error");
    }
  });
}
