import { updatePlayButtons, syncMediaPlayerUI, applyPersistedVolume, stopTrimRangePlayback } from './preview_player.js';

let audioContext = null;
let analyserNode = null;
let sourceNode = null;
let animationFrameId = null;
let kaleidoscopeAngle = 0;
let kaleidoscopeHue = 0;

export function initAudioVisualizer(filePath) {
  const canvas = document.getElementById('preview-audio-canvas');
  const videoEl = document.getElementById('preview-video');
  const placeholder = document.getElementById('preview-placeholder');
  const warning = document.getElementById('preview-compat-warning');
  const controls = document.getElementById('preview-controls');
  const playBtn = document.getElementById('preview-play-btn');
  const trimPlayBtn = document.getElementById('preview-trim-play-btn');

  const previewOutBtn = document.getElementById('preview-output-btn');
  if (previewOutBtn) {
    previewOutBtn.style.display = 'none';
  }

  stopTrimRangePlayback();
  if (window.visualizerAudio) {
    window.visualizerAudio.pause();
    window.visualizerAudio.removeAttribute('src');
    window.visualizerAudio.src = '';
  }
  if (window.analysisAudio) {
    window.analysisAudio.pause();
    window.analysisAudio.removeAttribute('src');
    window.analysisAudio.src = '';
  }

  if (videoEl) {
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.src = '';
    videoEl.load();
    videoEl.style.display = 'none';
  }
  if (warning) warning.style.display = 'none';
  if (placeholder) placeholder.style.display = 'none';
  if (canvas) canvas.style.display = 'block';
  if (controls) controls.style.display = 'flex';
  if (trimPlayBtn) trimPlayBtn.style.display = 'none';

  const fsTriggerBtn = document.getElementById('preview-fullscreen-trigger-btn');
  if (fsTriggerBtn) fsTriggerBtn.style.display = 'flex';

  if (playBtn) {
    playBtn.innerHTML = '<i data-lucide="play"></i> Play';
    if (window.lucide) window.lucide.createIcons();
  }

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

  if (!window.visualizerAudio) {
    window.visualizerAudio = new Audio();
    window.visualizerAudio.crossOrigin = "anonymous";
  }
  const visualizerAudio = window.visualizerAudio;
  visualizerAudio.src = assetUrl;
  visualizerAudio.setAttribute('src', assetUrl);
  visualizerAudio.load();

  if (isLinux) {
    if (!window.analysisAudio) {
      window.analysisAudio = new Audio();
      window.analysisAudio.crossOrigin = "anonymous";
    }
    window.analysisAudio.src = assetUrl;
    window.analysisAudio.setAttribute('src', assetUrl);
    window.analysisAudio.load();
  }

  applyPersistedVolume();

  visualizerAudio.onpause = () => {
    updatePlayButtons(false);
    if (isLinux && window.analysisAudio) {
      window.analysisAudio.pause();
    }
  };
  visualizerAudio.onplay = () => {
    updatePlayButtons(true);
    if (isLinux && window.analysisAudio) {
      window.analysisAudio.currentTime = visualizerAudio.currentTime;
      window.analysisAudio.play();
    }
    setupWebAudioContext();
  };
  visualizerAudio.onended = () => {
    updatePlayButtons(false);
    if (isLinux && window.analysisAudio) {
      window.analysisAudio.pause();
      window.analysisAudio.currentTime = 0;
    }
    visualizerAudio.currentTime = 0;
    syncMediaPlayerUI();
  };
  visualizerAudio.ontimeupdate = () => {
    syncMediaPlayerUI();
  };
  if (isLinux) {
    visualizerAudio.onseeking = () => {
      if (window.analysisAudio) {
        window.analysisAudio.currentTime = visualizerAudio.currentTime;
      }
    };
  }
}

export function setupWebAudioContext() {
  if (audioContext) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.85;

    const isLinux = navigator.userAgent.toLowerCase().includes('linux');
    if (isLinux && window.analysisAudio) {
      sourceNode = audioContext.createMediaElementSource(window.analysisAudio);
      sourceNode.connect(analyserNode);
    } else if (window.visualizerAudio) {
      sourceNode = audioContext.createMediaElementSource(window.visualizerAudio);
      sourceNode.connect(analyserNode);
      analyserNode.connect(audioContext.destination);
    }

    startVisualizerDrawing();
  } catch (err) {
    console.warn("Failed to initialize Web Audio context:", err);
  }
}

function drawGlowBars(ctx, width, height, dataArray, bufferLength, activeColor, activeGlow) {
  ctx.clearRect(0, 0, width, height);
  const barWidth = (width / bufferLength) * 1.4;
  let barHeight;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    barHeight = (dataArray[i] / 255) * (height * 0.65);
    const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
    grad.addColorStop(0, activeColor);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
    x += barWidth;
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = activeColor;
  ctx.shadowBlur = 15;
  ctx.shadowColor = activeGlow;
  ctx.beginPath();
  const sliceWidth = width / bufferLength;
  let waveX = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const waveY = (v * (height * 0.25)) + (height * 0.2);
    if (i === 0) {
      ctx.moveTo(waveX, waveY);
    } else {
      ctx.lineTo(waveX, waveY);
    }
    waveX += sliceWidth;
  }
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawRetroWormhole(ctx, width, height, dataArray, bufferLength, activeColor) {
  ctx.fillStyle = 'rgba(5, 7, 10, 0.2)';
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const maxDim = Math.min(width, height);
  const maxRadius = maxDim * 0.45;
  const numRings = 8;
  const timeOffset = (Date.now() / 12) % (maxRadius / numRings);
  for (let k = 0; k < numRings; k++) {
    const baseR = (k / numRings) * maxRadius + timeOffset;
    if (baseR <= 0 || baseR > maxRadius) continue;
    const progress = baseR / maxRadius;
    const hue = (Date.now() / 45 + k * 18) % 360;
    const opacity = (1 - progress) * 0.8;
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${opacity})`;
    ctx.lineWidth = 2 + progress * 6;
    ctx.beginPath();
    const numPoints = 60;
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const dataIdx = Math.floor(Math.abs(numPoints / 2 - (i % numPoints)) / (numPoints / 2) * bufferLength * 0.7);
      const freqFactor = (dataArray[dataIdx] / 255);
      const r = baseR + freqFactor * (50 * progress);
      const angleRot = angle + (Date.now() / 4000) * (k % 2 === 0 ? 1 : -1);
      const x = cx + Math.cos(angleRot) * r;
      const y = cy + Math.sin(angleRot) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  const centerBass = dataArray[Math.floor(bufferLength * 0.05)] / 255;
  const coreRadius = 15 + centerBass * 18;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, activeColor);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, coreRadius, 0, 2 * Math.PI);
  ctx.fill();
}

function drawHyperStarfield(ctx, width, height, dataArray, bufferLength) {
  ctx.fillStyle = 'rgba(5, 7, 10, 0.25)';
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  if (!window.starfieldStars || window.starfieldStars.length === 0) {
    window.starfieldStars = [];
    for (let i = 0; i < 160; i++) {
      window.starfieldStars.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        z: Math.random() * 1000,
        hue: Math.random() * 360
      });
    }
  }
  let totalFreq = 0;
  for (let i = 0; i < bufferLength; i++) {
    totalFreq += dataArray[i];
  }
  const avgAmp = totalFreq / bufferLength;
  const speed = 2 + (avgAmp / 255) * 16;
  const bassFactor = dataArray[Math.floor(bufferLength * 0.04)] / 255;
  window.starfieldStars.forEach(star => {
    const prevZ = star.z;
    star.z -= speed;
    if (star.z <= 0) {
      star.z = 1000;
      star.x = (Math.random() - 0.5) * 2000;
      star.y = (Math.random() - 0.5) * 2000;
      star.hue = Math.random() * 360;
      return;
    }
    const px = cx + (star.x / star.z) * (width * 0.7);
    const py = cy + (star.y / star.z) * (height * 0.7);
    const ppx = cx + (star.x / prevZ) * (width * 0.7);
    const ppy = cy + (star.y / prevZ) * (height * 0.7);
    if (px < 0 || px > width || py < 0 || py > height) {
      star.z = 1000;
      star.x = (Math.random() - 0.5) * 2000;
      star.y = (Math.random() - 0.5) * 2000;
      return;
    }
    const depth = (1 - star.z / 1000);
    const hue = (star.hue + Date.now() / 50) % 360;
    ctx.strokeStyle = `hsla(${hue}, 100%, 75%, ${depth * 0.9})`;
    ctx.lineWidth = depth * (1.5 + bassFactor * 7.5);
    ctx.beginPath();
    ctx.moveTo(ppx, ppy);
    ctx.lineTo(px, py);
    ctx.stroke();
  });
}

function drawOscilloscopeCircle(ctx, width, height, timeDomainArray, bufferLength, activeColor, activeGlow) {
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) * 0.32;
  ctx.strokeStyle = activeColor;
  ctx.lineWidth = 3.5;
  ctx.shadowBlur = 18;
  ctx.shadowColor = activeGlow;
  ctx.beginPath();
  for (let i = 0; i <= bufferLength; i++) {
    const angle = (i / bufferLength) * 2 * Math.PI;
    const dataIdx = i % bufferLength;
    const val = (timeDomainArray[dataIdx] - 128) / 128.0;
    const r = baseRadius + val * (baseRadius * 0.38);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, 0, 2 * Math.PI);
  ctx.stroke();
}

function drawKaleidoscopeVisualizer(ctx, width, height, timeDomainArray, dataArray, bufferLength) {
  ctx.fillStyle = 'rgba(10, 12, 20, 0.32)';
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;

  let bass = 0;
  for (let i = 0; i < 8; i++) {
    bass += (dataArray[i] || 0);
  }
  bass = bass / (8 * 255);

  let midHigh = 0;
  for (let i = 8; i < 32; i++) {
    midHigh += (dataArray[i] || 0);
  }
  midHigh = midHigh / (24 * 255);

  const baseRadius = Math.min(width, height) * 0.22 * (1 + bass * 0.42);
  const innerRadius = baseRadius * 0.42;
  kaleidoscopeAngle += 0.006 + (bass * 0.035);
  kaleidoscopeHue = (kaleidoscopeHue + 0.4 + bass * 1.5) % 360;

  const segments = 8;
  const segmentAngle = (2 * Math.PI) / segments;

  ctx.save();
  ctx.translate(cx, cy);

  ctx.save();
  ctx.rotate(-kaleidoscopeAngle * 1.2);
  ctx.strokeStyle = `hsla(${kaleidoscopeHue}, 90%, 65%, 0.85)`;
  ctx.shadowColor = `hsla(${kaleidoscopeHue}, 100%, 60%, 0.9)`;
  ctx.shadowBlur = 12 + bass * 25;
  ctx.lineWidth = 2 + bass * 2;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * 2 * Math.PI;
    const r = innerRadius * (0.85 + 0.3 * Math.sin(a * 3 + kaleidoscopeAngle * 2));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  ctx.rotate(kaleidoscopeAngle);
  ctx.shadowBlur = 16 + bass * 30;
  ctx.shadowColor = `hsla(${(kaleidoscopeHue + 60) % 360}, 95%, 60%, 0.95)`;
  ctx.lineWidth = 2.2 + bass * 2.5;

  const sliceLen = Math.floor(bufferLength / segments);

  for (let s = 0; s < segments; s++) {
    ctx.save();
    ctx.rotate(s * segmentAngle);

    const petalHue = (kaleidoscopeHue + s * (360 / segments)) % 360;
    ctx.strokeStyle = `hsla(${petalHue}, 90%, 62%, 0.9)`;

    if (s % 2 === 1) {
      ctx.scale(1, -1);
    }

    ctx.beginPath();
    for (let i = 0; i < sliceLen; i++) {
      const angle = (i / sliceLen) * segmentAngle;
      const val = ((timeDomainArray[i] || 128) - 128) / 128.0;
      const r = baseRadius + (val * baseRadius * (0.55 + bass * 0.35));

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (bass > 0.25) {
      ctx.beginPath();
      ctx.strokeStyle = `hsla(${(petalHue + 40) % 360}, 100%, 75%, ${0.3 + bass * 0.4})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < sliceLen; i += 2) {
        const angle = (i / sliceLen) * segmentAngle;
        const val = ((timeDomainArray[i] || 128) - 128) / 128.0;
        const r = baseRadius * 1.35 + (val * baseRadius * 0.3);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  if (midHigh > 0.15) {
    ctx.fillStyle = `hsla(${(kaleidoscopeHue + 180) % 360}, 100%, 75%, 0.8)`;
    for (let p = 0; p < 8; p++) {
      const pAngle = (p / 8) * Math.PI * 2 + kaleidoscopeAngle * 2;
      const pDist = baseRadius * (1.5 + midHigh * 0.4);
      ctx.beginPath();
      ctx.arc(Math.cos(pAngle) * pDist, Math.sin(pAngle) * pDist, 1.5 + midHigh * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawRgbSpectrum(ctx, width, height, dataArray, bufferLength) {
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const barWidth = (width / bufferLength) * 0.9;
  const cy = height / 2;
  for (let i = 0; i < bufferLength; i++) {
    const barHeight = (dataArray[i] / 255) * (height * 0.45);
    const hue = (i / bufferLength) * 360 + (Date.now() / 25) % 360;
    ctx.fillStyle = `hsla(${hue}, 100%, 55%, 0.85)`;
    const xLeft = cx - i * barWidth;
    const xRight = cx + i * barWidth;
    const yStart = cy - barHeight;
    if (xRight < width) {
      ctx.fillRect(xRight, yStart, barWidth - 1.5, barHeight * 2);
    }
    if (xLeft > 0) {
      ctx.fillRect(xLeft, yStart, barWidth - 1.5, barHeight * 2);
    }
  }
}

function drawSynthwaveSunset(ctx, width, height, dataArray, bufferLength) {
  ctx.fillStyle = '#0a0516';
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const horizon = height * 0.62;

  const sceneWidth = Math.min(width, height * 2.5);

  let bass = 0;
  const bassBins = Math.max(1, Math.floor(bufferLength * 0.08));
  for (let i = 0; i < bassBins; i++) {
    bass += dataArray[i];
  }
  bass = bass / bassBins / 255;

  let mids = 0;
  const midStart = Math.floor(bufferLength * 0.1);
  const midEnd = Math.floor(bufferLength * 0.35);
  for (let i = midStart; i < midEnd; i++) {
    mids += dataArray[i];
  }
  mids = mids / (midEnd - midStart) / 255;

  let treble = 0;
  const trebleStart = Math.floor(bufferLength * 0.6);
  for (let i = trebleStart; i < bufferLength; i++) {
    treble += dataArray[i];
  }
  treble = treble / (bufferLength - trebleStart) / 255;

  if (!window.synthwaveStars || window.synthwaveStars.length === 0) {
    window.synthwaveStars = [];
    for (let i = 0; i < 60; i++) {
      window.synthwaveStars.push({
        x: Math.random(),
        y: Math.random() * horizon,
        size: 0.5 + Math.random() * 1.5,
        speed: 0.05 + Math.random() * 0.05
      });
    }
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  window.synthwaveStars.forEach(star => {
    const x = star.x * width;
    const size = star.size * (1 + treble * 1.8);
    ctx.beginPath();
    ctx.arc(x, star.y, size, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.save();
  const sunRadius = Math.min(width, height) * 0.23 * (1 + bass * 0.15);
  const sunY = horizon - 5;

  const sunGrad = ctx.createLinearGradient(cx, sunY - sunRadius, cx, sunY);
  sunGrad.addColorStop(0, '#ffe600');
  sunGrad.addColorStop(0.4, '#ff007f');
  sunGrad.addColorStop(1, '#3b0066');

  ctx.fillStyle = sunGrad;
  ctx.shadowBlur = 25;
  ctx.shadowColor = '#ff007f';

  const sliceHeight = Math.max(2, Math.floor(height * 0.007));
  const maxGap = Math.max(4, Math.floor(height * 0.015));

  for (let y = sunY - sunRadius; y < sunY + sunRadius; y += sliceHeight + 1.5) {
    const distFromTop = y - (sunY - sunRadius);
    const progress = distFromTop / (sunRadius * 2);
    const gap = progress * maxGap;

    const dy = Math.abs(y - sunY);
    const halfWidth = Math.sqrt(Math.max(0, sunRadius * sunRadius - dy * dy));

    if (halfWidth > 0) {
      const actualSliceHeight = Math.max(1, sliceHeight - (gap * 0.8));
      ctx.fillRect(cx - halfWidth, y, halfWidth * 2, actualSliceHeight);
    }
  }
  ctx.restore();

  ctx.fillStyle = '#0f051c';
  ctx.strokeStyle = '#ff007f';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#ff007f';

  ctx.beginPath();
  ctx.moveTo(0, horizon);
  const leftPeak1Y = horizon - (35 + mids * 65);
  const leftPeak2Y = horizon - (20 + treble * 40);
  ctx.lineTo(cx - sceneWidth * 0.35, leftPeak1Y);
  ctx.lineTo(cx - sceneWidth * 0.22, leftPeak2Y);
  ctx.lineTo(cx - sceneWidth * 0.08, horizon);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width, horizon);
  const rightPeak1Y = horizon - (40 + mids * 55);
  const rightPeak2Y = horizon - (15 + bass * 35);
  ctx.lineTo(cx + sceneWidth * 0.32, rightPeak1Y);
  ctx.lineTo(cx + sceneWidth * 0.18, rightPeak2Y);
  ctx.lineTo(cx + sceneWidth * 0.03, horizon);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(width, horizon);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
  ctx.lineWidth = 1.5;
  const numGridLines = 18;
  for (let i = 0; i <= numGridLines; i++) {
    const ratio = i / numGridLines;
    const bottomX = cx + sceneWidth * (-0.75 + ratio * 1.5);
    ctx.beginPath();
    ctx.moveTo(cx, horizon);
    ctx.lineTo(bottomX, height);
    ctx.stroke();
  }

  if (typeof window.gridScrollOffset === 'undefined') {
    window.gridScrollOffset = 0;
  }
  const speed = 1.2 + bass * 7.5;
  window.gridScrollOffset = (window.gridScrollOffset + speed) % 100;

  const floorHeight = height - horizon;
  const numHorizLines = 11;
  for (let i = 0; i < numHorizLines; i++) {
    const lineProgress = (i + window.gridScrollOffset / 100) / numHorizLines;
    const curve = Math.pow(lineProgress, 2.5);
    const y = horizon + curve * floorHeight;

    const opacity = 0.15 + curve * 0.75;
    ctx.strokeStyle = `rgba(0, 255, 255, ${opacity})`;
    ctx.lineWidth = 1 + curve * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

export function startVisualizerDrawing() {
  const canvas = document.getElementById('preview-audio-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const timeDomainArray = new Uint8Array(bufferLength);

  canvas.classList.add('canvas-glow');

  function draw() {
    animationFrameId = requestAnimationFrame(draw);

    const visualizerAudio = window.visualizerAudio;
    if (visualizerAudio && !visualizerAudio.paused) {
      analyserNode.getByteFrequencyData(dataArray);
      analyserNode.getByteTimeDomainData(timeDomainArray);

      for (let i = 0; i < bufferLength; i++) {
        dataArray[i] = dataArray[i] * 0.75;
        timeDomainArray[i] = 128 + (timeDomainArray[i] - 128) * 0.75;
      }
    } else {
      for (let i = 0; i < bufferLength; i++) {
        dataArray[i] = dataArray[i] * 0.9;
        timeDomainArray[i] = 128 + (timeDomainArray[i] - 128) * 0.9;
      }
    }

    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight;

    const activeColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3b82f6';
    const activeGlow = getComputedStyle(document.body).getPropertyValue('--accent-glow').trim() || 'rgba(59,130,246,0.3)';

    const preset = document.getElementById('hud-visualizer-select')?.value || 'glow-bars-wave';

    if (preset === 'glow-bars-wave') {
      drawGlowBars(ctx, width, height, dataArray, bufferLength, activeColor, activeGlow);
    } else if (preset === 'synthwave-sunset') {
      drawSynthwaveSunset(ctx, width, height, dataArray, bufferLength);
    } else if (preset === 'kaleidoscope-mandala') {
      drawKaleidoscopeVisualizer(ctx, width, height, timeDomainArray, dataArray, bufferLength);
    } else if (preset === 'retro-wormhole') {
      drawRetroWormhole(ctx, width, height, dataArray, bufferLength, activeColor);
    } else if (preset === 'hyper-starfield') {
      drawHyperStarfield(ctx, width, height, dataArray, bufferLength);
    } else if (preset === 'oscilloscope-circle') {
      drawOscilloscopeCircle(ctx, width, height, timeDomainArray, bufferLength, activeColor, activeGlow);
    } else if (preset === 'rgb-spectrum') {
      drawRgbSpectrum(ctx, width, height, dataArray, bufferLength);
    }
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  draw();
}
