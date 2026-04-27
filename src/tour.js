
// --- Tour & Emotional Logic ---

const tourSteps = [
  {
    target: '.sidebar',
    text: "This is your control center. Switch between tools like Compress, Split, and Trim here.",
    action: () => {}
  },
  {
    target: '[data-target="compress"]',
    text: "Compress helps you shrink video size without losing much quality. Perfect for sharing!",
    action: () => document.querySelector('[data-target="compress"]').click()
  },
  {
    target: '#crf-slider',
    text: "Move this slider to balance between file size and video quality. 23 is the sweet spot!",
    action: () => {}
  },
  {
    target: '.file-picker',
    text: "Pick your video file here. We support almost all formats thanks to FFmpeg!",
    action: () => {}
  },
  {
    target: '#run-compress-btn',
    text: "Once ready, hit this button. We'll handle the emotional (and digital) weight for you.",
    action: () => {}
  }
];

let currentTourStep = 0;

function showTourStep(stepIndex) {
  const step = tourSteps[stepIndex];
  const targetEl = document.querySelector(step.target);
  const tooltip = document.getElementById('tour-tooltip');
  const tooltipText = document.getElementById('tour-text');
  const stepCount = document.getElementById('tour-step-count');

  if (!targetEl) return;

  // Cleanup previous highlights
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

  // Highlight new target
  targetEl.classList.add('tour-highlight');
  step.action();

  // Position Tooltip
  const rect = targetEl.getBoundingClientRect();
  tooltip.style.display = 'block';
  tooltip.style.top = `${rect.bottom + 15 + window.scrollY}px`;
  tooltip.style.left = `${rect.left}px`;

  tooltipText.innerText = step.text;
  stepCount.innerText = `${stepIndex + 1}/${tourSteps.length}`;
}

// --- Emotional Mode ---
let emotionalInterval;
function startEmotionalMode() {
  const themes = ['theme-blue', 'theme-red', 'theme-purple', 'theme-gold', 'theme-green'];
  let i = 0;
  
  // Show a greeting
  showStatus("Emotional Mode Activated. Embracing all stages of sadness...", "info");
  
  emotionalInterval = setInterval(() => {
    document.body.className = themes[i];
    const msg = sadnessMessages[Math.floor(Math.random() * sadnessMessages.length)];
    showStatus(msg.msg, "info");
    
    i = (i + 1) % themes.length;
  }, 3000);

  // Stop after 30 seconds or if user clicks something else
  setTimeout(() => stopEmotionalMode(), 30000);
}

function stopEmotionalMode() {
  clearInterval(emotionalInterval);
  document.body.className = 'theme-blue';
}

// --- Event Listeners for Demo Features ---
document.getElementById('demo-trigger-btn').addEventListener('click', () => {
  document.getElementById('custom-modal').style.display = 'flex';
});

document.getElementById('close-modal-btn').addEventListener('click', () => {
  document.getElementById('custom-modal').style.display = 'none';
});

document.getElementById('start-tour-btn').addEventListener('click', () => {
  document.getElementById('custom-modal').style.display = 'none';
  currentTourStep = 0;
  showTourStep(0);
});

document.getElementById('tour-next-btn').addEventListener('click', () => {
  currentTourStep++;
  if (currentTourStep < tourSteps.length) {
    showTourStep(currentTourStep);
  } else {
    document.getElementById('tour-tooltip').style.display = 'none';
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    showStatus("Tour Complete! You're ready to split some sadness. 🎃", "success");
  }
});

document.getElementById('start-emotional-btn').addEventListener('click', () => {
  document.getElementById('custom-modal').style.display = 'none';
  startEmotionalMode();
});
