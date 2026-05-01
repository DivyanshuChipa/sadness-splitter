
// --- Tour & Emotional Logic ---

const tourSteps = [
  {
    target: '.sidebar',
    text: "This is your control center. Switch between tools like Compress, Split, and Trim here.",
    action: () => { }
  },
  {
    target: '[data-target="compress"]',
    text: "Compress helps you shrink video size without losing much quality. Perfect for sharing!",
    action: () => document.querySelector('[data-target="compress"]').click()
  },
  {
    target: '#crf-slider',
    text: "Move this slider to balance between file size and video quality. 23 is the sweet spot!",
    action: () => { }
  },
  {
    target: '.file-picker',
    text: "Pick your video file here. We support almost all formats thanks to FFmpeg!",
    action: () => { }
  },
  {
    target: '#run-compress-btn',
    text: "Once ready, hit this button. We'll handle the emotional (and digital) weight for you.",
    action: () => { }
  }
];

let currentTourStep = 0;

const sadnessMessages = [
  { msg: "Some frames heal with time. Some need re-encoding. 💛" },
  { msg: "Breathe in… breathe out… processing your timeline." },
  { msg: "Emotion detected. Stabilizing your inner bitrate." },
  { msg: "Tiny progress is still progress." }
];


function clearTourUI() {
  const tooltip = document.getElementById('tour-tooltip');
  if (tooltip) tooltip.style.display = 'none';
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function closeTour() {
  clearTourUI();
  if (typeof updateStatus === 'function') updateStatus('Tour closed. You can restart anytime from System Metrics.');
}

function showTourStep(stepIndex) {
  const step = tourSteps[stepIndex];

  // Run step action first (e.g. click a tab)
  step.action();

  // Give DOM a moment to switch tabs and render
  setTimeout(() => {
    const targetEl = document.querySelector(step.target);
    const tooltip = document.getElementById('tour-tooltip');
    const tooltipText = document.getElementById('tour-text');
    const stepCount = document.getElementById('tour-step-count');

    if (!targetEl) return;

    // Cleanup previous highlights
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

    // Highlight new target
    targetEl.classList.add('tour-highlight');

    // Position Tooltip with viewport clamping
    const rect = targetEl.getBoundingClientRect();
    tooltip.style.display = 'block';

    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 12;
    let top;
    let left;

    if (step.target === '.sidebar') {
      top = rect.top + 40;
      left = rect.right + 20;
    } else {
      top = rect.bottom + 15;
      left = rect.left;
    }

    top = clamp(top, margin, window.innerHeight - tooltipRect.height - margin);
    left = clamp(left, margin, window.innerWidth - tooltipRect.width - margin);

    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left + window.scrollX}px`;

    tooltipText.innerText = step.text;
    stepCount.innerText = `${stepIndex + 1}/${tourSteps.length}`;
  }, 100); // 100ms delay for tab switching
}

// --- Emotional Mode ---
let emotionalInterval;
let emotionalStopTimeout;
let emotionalModeActive = false;
let emotionalSettings = { intensity: "normal", autoStop: true };
function startEmotionalMode(options = {}) {
  const themes = ['theme-blue', 'theme-red', 'theme-purple', 'theme-gold', 'theme-green'];
  const speedMap = { calm: 5000, normal: 3000, hyper: 1600 };
  const settings = { ...emotionalSettings, ...options };
  emotionalSettings = settings;
  const intervalMs = speedMap[settings.intensity] || speedMap.normal;
  let i = 0;

  stopEmotionalMode({ silent: true });
  emotionalModeActive = true;
  if (typeof window.onEmotionalModeChange === 'function') window.onEmotionalModeChange(true);

  if (typeof updateStatus === 'function') updateStatus("Emotional Mode Activated. Embracing all stages of sadness...");

  emotionalInterval = setInterval(() => {
    document.body.classList.remove(...themes);
    document.body.classList.add(themes[i]);
    const msg = sadnessMessages[Math.floor(Math.random() * sadnessMessages.length)];
    if (typeof updateStatus === 'function') updateStatus(msg.msg);

    i = (i + 1) % themes.length;
  }, intervalMs);

  if (settings.autoStop) emotionalStopTimeout = setTimeout(() => stopEmotionalMode(), 30000);
}

function stopEmotionalMode(options = {}) {
  clearInterval(emotionalInterval);
  clearTimeout(emotionalStopTimeout);
  emotionalModeActive = false;
  const savedTheme = localStorage.getItem('app-theme') || 'theme-blue';
  document.body.classList.remove('theme-blue', 'theme-red', 'theme-purple', 'theme-gold', 'theme-green');
  document.body.classList.add(savedTheme);
  if (!options.silent && typeof updateStatus === 'function') updateStatus('Emotional Mode turned off. Back to calm blue.');
  if (typeof window.onEmotionalModeChange === 'function') window.onEmotionalModeChange(false);
}



window.showTourStep = showTourStep;
window.startTour = () => { currentTourStep = 0; showTourStep(0); };
window.nextTourStep = () => {
  currentTourStep++;
  if (currentTourStep < tourSteps.length) showTourStep(currentTourStep);
  else {
    clearTourUI();
    if (typeof updateStatus === 'function') updateStatus("Tour Complete! You're ready to split some sadness.");
  }
};
window.startEmotionalMode = startEmotionalMode;
window.stopEmotionalMode = stopEmotionalMode;
window.isEmotionalModeActive = () => emotionalModeActive;
window.setEmotionalSettings = (settings = {}) => { emotionalSettings = { ...emotionalSettings, ...settings }; };
window.getEmotionalSettings = () => ({ ...emotionalSettings });

window.closeTour = closeTour;

window.addEventListener('keydown', (event) => {
  const tooltip = document.getElementById('tour-tooltip');
  const isTourOpen = tooltip && tooltip.style.display === 'block';
  if (!isTourOpen) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeTour();
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    window.nextTourStep?.();
  }
});