// ─── Serial State ────────────────────────────────────────────────────────────
let port = null;
let writer = null;

async function connectSerial() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    const textEncoder = new TextEncoderStream();
    textEncoder.readable.pipeTo(port.writable);
    writer = textEncoder.writable.getWriter();
    setSerialStatus(true);
    console.log('Serial connected');
  } catch (err) {
    console.warn('Serial connect failed:', err);
    setSerialStatus(false);
  }
}

async function disconnectSerial() {
  try {
    if (writer) { await writer.close(); writer = null; }
    if (port) { await port.close(); port = null; }
  } catch (err) {
    console.warn('Serial disconnect error:', err);
  }
  setSerialStatus(false);
}

async function send(cmd) {
  if (!writer) { console.warn('Serial not connected. Command:', cmd); return; }
  try {
    await writer.write(cmd + '\n');
    console.log('Sent:', cmd);
  } catch (err) {
    console.error('Send error:', err);
  }
}

function setSerialStatus(connected) {
  const btn = document.getElementById('serialConnectBtn');
  const dot = document.getElementById('serialDot');
  if (!btn || !dot) return;
  btn.textContent = connected ? 'DISCONNECT' : 'CONNECT';
  dot.className = 'serial-dot ' + (connected ? 'connected' : 'disconnected');
}

// ─── Mode Switch ─────────────────────────────────────────────────────────────
const appRoot = document.getElementById('appRoot');
const simpleView = document.getElementById('simpleView');
const advancedView = document.getElementById('advancedView');
const advancedBtn = document.getElementById('advancedBtn');
const backToSimpleBtn = document.getElementById('backToSimpleBtn');

function setMode(mode) {
  const advanced = mode === 'advanced';
  appRoot.dataset.mode = mode;
  simpleView.hidden = advanced;
  advancedView.hidden = !advanced;
  document.title = advanced ? 'LED UI - Advanced Mode' : 'LED UI - Simple Mode';
}

advancedBtn.addEventListener('click', () => setMode('advanced'));
backToSimpleBtn.addEventListener('click', () => setMode('simple'));

// ─── Serial Connect Button ────────────────────────────────────────────────────
document.getElementById('serialConnectBtn').addEventListener('click', async () => {
  if (port) {
    await disconnectSerial();
  } else {
    await connectSerial();
  }
});

// ─── Brightness Display ───────────────────────────────────────────────────────
const brightnessSlider = document.getElementById('brightnessSlider');
const digitalBrightness = document.getElementById('digitalBrightness');
const hexValue = document.getElementById('hexValue');
const levelValue = document.getElementById('levelValue');

function toHex(channel) {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).toUpperCase().padStart(2, '0');
}

function brightnessToHex(level) {
  const t = level / 100;
  const r = Math.round(34 + (255 - 34) * t);
  const g = Math.round(34 + (176 - 34) * t);
  const b = Math.round(34 + (0   - 34) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function updateBrightnessDisplay(level) {
  digitalBrightness.textContent = String(level).padStart(3, '0');
  levelValue.textContent = `LEVEL: ${level}%`;
  hexValue.textContent = `HEX: ${brightnessToHex(level)}`;
}

let brightnessTimer = null;
brightnessSlider?.addEventListener('input', (e) => {
  const level = Number(e.target.value);
  updateBrightnessDisplay(level);
  // Debounce serial sends — don't flood port on every tick
  clearTimeout(brightnessTimer);
  brightnessTimer = setTimeout(() => {
    send(`BRIGHTNESS:${level}`);
  }, 80);
});

// ─── Clock ───────────────────────────────────────────────────────────────────
const clock = document.getElementById('clock');

function updateTime() {
  clock.textContent = new Date().toLocaleTimeString([], {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
updateTime();
setInterval(updateTime, 1000);

// ─── Sun / Moon Animation ────────────────────────────────────────────────────
const toggle = document.getElementById('powerToggle');
const sun = document.getElementById('sun');
const moon = document.getElementById('moon');

const PATH = { cx: 54, cy: 70, rx: 55, ry: 85 };
let isOn = true;
let animationFrame = null;

function pointOnArc(progress) {
  const theta = Math.PI - (Math.PI * progress);
  return {
    x: PATH.cx + PATH.rx * Math.cos(theta),
    y: PATH.cy - PATH.ry * Math.sin(theta),
  };
}

function setBodyPosition(el, progress) {
  const { x, y } = pointOnArc(progress);
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
}

function renderFromProgress(sunProgress) {
  setBodyPosition(sun, sunProgress);
  setBodyPosition(moon, 1 - sunProgress);
}

function animateCycle(targetOn) {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  const duration = 950;
  const start = performance.now();
  const from = targetOn ? 1 : 0;
  const to   = targetOn ? 0 : 1;

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    renderFromProgress(from + (to - from) * eased);
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
  const next = !isOn;
  animateCycle(next);
  send(next ? 'POWER:ON' : 'POWER:OFF');
});

// ─── Advanced Power Toggle ────────────────────────────────────────────────────
document.querySelector('.adv-power .toggle')?.addEventListener('click', function () {
  const pressed = this.getAttribute('aria-pressed') === 'true';
  const next = !pressed;
  this.setAttribute('aria-pressed', String(next));
  this.classList.toggle('off', !next);
  send(next ? 'POWER:ON' : 'POWER:OFF');
});

// ─── Mode Buttons (Advanced) ──────────────────────────────────────────────────
const modeMap = {
  'STROBE':  'MODE:STROBE',
  'FADE':    'MODE:FADE',
  'RAINBOW': 'MODE:RAINBOW',
  'POLICE':  'MODE:POLICE',
  'CANDLE':  'MODE:CANDLE',
  'SUNRISE': 'MODE:SUNRISE',
};

let activeMode = null;

document.querySelectorAll('.adv-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const label = this.textContent.trim();
    const cmd = modeMap[label];
    if (!cmd) return;

    if (activeMode === label) {
      // Toggle off — back to solid
      activeMode = null;
      this.classList.remove('active');
      send('MODE:SOLID');
    } else {
      document.querySelectorAll('.adv-btn').forEach(b => b.classList.remove('active'));
      activeMode = label;
      this.classList.add('active');
      send(cmd);
    }
  });
});

// ─── Simple Mode Buttons (STROBE / BLINK) — re-enable with serial ────────────
// These are `disabled` in HTML. Enable them and wire up:
document.querySelectorAll('.mode-btn[disabled]').forEach(btn => {
  btn.removeAttribute('disabled');
  btn.addEventListener('click', function () {
    const label = this.textContent.trim();
    const cmd = modeMap[label] ?? `MODE:${label}`;
    const isActive = this.classList.contains('active');
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    if (!isActive) {
      this.classList.add('active');
      send(cmd);
    } else {
      send('MODE:SOLID');
    }
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────
renderFromProgress(0);
updateBrightnessDisplay(Number(brightnessSlider?.value ?? 75));
setSerialStatus(false);

// Warn if browser lacks Web Serial
if (!('serial' in navigator)) {
  const warn = document.createElement('div');
  warn.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:10px 20px;border-radius:8px;font-family:monospace;font-size:14px;z-index:999';
  warn.textContent = '⚠ Web Serial not supported. Use Chrome/Edge.';
  document.body.appendChild(warn);
}