const appRoot = document.getElementById('appRoot');
const simpleView = document.getElementById('simpleView');
const advancedView = document.getElementById('advancedView');
const advancedBtn = document.getElementById('advancedBtn');
const backToSimpleBtn = document.getElementById('backToSimpleBtn');
const brightnessSlider = document.getElementById('brightnessSlider');
const digitalBrightness = document.getElementById('digitalBrightness');
const hexValue = document.getElementById('hexValue');
const levelValue = document.getElementById('levelValue');


const clock = document.getElementById('clock');
const toggle = document.getElementById('powerToggle');
const sun = document.getElementById('sun');
const moon = document.getElementById('moon');

let isOn = true;
let animationFrame = null;

const PATH = {
  cx: 54,
  cy: 70,
  rx: 55,
  ry: 740,
};

function setMode(mode) {
  const advanced = mode === 'advanced';
  appRoot.dataset.mode = mode;
  simpleView.hidden = advanced;
  advancedView.hidden = !advanced;
  document.title = advanced ? 'LED UI - Advanced Mode' : 'LED UI - Simple Mode';
}

advancedBtn.addEventListener('click', () => setMode('advanced'));
backToSimpleBtn.addEventListener('click', () => setMode('simple'));

function toHex(channel) {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).toUpperCase().padStart(2, '0');
}

function brightnessToHex(level) {
  const minBase = { r: 34, g: 34, b: 34 };
  const maxBase = { r: 255, g: 176, b: 0 };
  const t = level / 100;
  const r = minBase.r + (maxBase.r - minBase.r) * t;
  const g = minBase.g + (maxBase.g - minBase.g) * t;
  const b = minBase.b + (maxBase.b - minBase.b) * t;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function updateBrightnessDisplay(level) {
  const value = String(level).padStart(3, '0');
  digitalBrightness.textContent = value;
  levelValue.textContent = `LEVEL: ${level}%`;
  hexValue.textContent = `HEX: ${brightnessToHex(level)}`;
}

brightnessSlider?.addEventListener('input', (event) => {
  updateBrightnessDisplay(Number(event.target.value));
});


function updateTime() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function pointOnArc(progress) {
  const theta = Math.PI - (Math.PI * progress);
  const x = PATH.cx + PATH.rx * Math.cos(theta);
  const y = PATH.cy - PATH.ry * Math.sin(theta);
  return { x, y };
}

function setBodyPosition(el, progress, opacity = 1) {
  const { x, y } = pointOnArc(progress);
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
  el.style.opacity = `${opacity}`;
}

function renderFromProgress(sunProgress) {
  const moonProgress = 1 - sunProgress;

  setBodyPosition(sun, sunProgress, 1);
  setBodyPosition(moon, moonProgress, 1);
}

function animateCycle(targetOn) {
  if (animationFrame) cancelAnimationFrame(animationFrame);

  const duration = 800;
  const start = performance.now();
  const from = targetOn ? 1 : 0;
  const to = targetOn ? 0 : 1;

  function tick(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const sunProgress = from + (to - from) * eased;

    renderFromProgress(sunProgress);

    if (t < 1) {
      animationFrame = requestAnimationFrame(tick);
    } else {
      animationFrame = null;
      isOn = targetOn;
      toggle.classList.toggle('off', !isOn);
      toggle.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    }
  }

  animationFrame = requestAnimationFrame(tick);
}

toggle.addEventListener('click', () => {
  animateCycle(!isOn);
});

updateTime();
setInterval(updateTime, 1000);
renderFromProgress(0);
updateBrightnessDisplay(Number(brightnessSlider?.value ?? 75));