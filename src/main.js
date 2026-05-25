
//  Serial State
let port   = null;
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
    if (port)   { await port.close();   port   = null; }
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
  dot.className   = 'serial-dot ' + (connected ? 'connected' : 'disconnected');
}

//  Mode Switch (Simple ↔ Advanced)
const appRoot       = document.getElementById('appRoot');
const simpleView    = document.getElementById('simpleView');
const advancedView  = document.getElementById('advancedView');
const advancedBtn   = document.getElementById('advancedBtn');
const backToSimpleBtn = document.getElementById('backToSimpleBtn');

function setMode(mode) {
  const advanced = mode === 'advanced';
  appRoot.dataset.mode   = mode;
  simpleView.hidden      = advanced;
  advancedView.hidden    = !advanced;
  document.title = advanced ? 'LED UI - Advanced Mode' : 'LED UI - Simple Mode';
}

advancedBtn.addEventListener('click',     () => setMode('advanced'));
backToSimpleBtn.addEventListener('click', () => setMode('simple'));

// Serial Connect Button
document.getElementById('serialConnectBtn').addEventListener('click', async () => {
  if (port) await disconnectSerial();
  else      await connectSerial();
});

//  Color State
let baseR = 255, baseG = 176, baseB = 0;
let brightness = 75;
let speedVal   = 5;

function toHex(n)  { return Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, '0'); }
function pad3(n)   { return String(Math.round(n)).padStart(3, '0'); }
function applyBrightness(r, g, b, lvl) {
  const s = lvl / 100;
  return [Math.round(r * s), Math.round(g * s), Math.round(b * s)];
}

// Display update
const hexValue    = document.getElementById('hexValue');
const levelValue  = document.getElementById('levelValue');
const rgbValue    = document.getElementById('rgbValue');
const colorSwatch = document.getElementById('colorSwatch');
const valR        = document.getElementById('valR');
const valG        = document.getElementById('valG');
const valB        = document.getElementById('valB');
const sliderR     = document.getElementById('sliderR');
const sliderG     = document.getElementById('sliderG');
const sliderB     = document.getElementById('sliderB');

function updateDisplay() {
  const [r, g, b] = applyBrightness(baseR, baseG, baseB, brightness);
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  hexValue.textContent   = `HEX: ${hex}`;
  levelValue.textContent = `LEVEL: ${brightness}%`;
  rgbValue.textContent   = `RGB: ${pad3(r)},${pad3(g)},${pad3(b)}`;
  colorSwatch.style.background = `rgb(${baseR},${baseG},${baseB})`;
}

function syncSlidersToBase() {
  sliderR.value = baseR; valR.textContent = pad3(baseR);
  sliderG.value = baseG; valG.textContent = pad3(baseG);
  sliderB.value = baseB; valB.textContent = pad3(baseB);
}

let colorTimer = null;
function scheduleColorSend() {
  clearTimeout(colorTimer);
  colorTimer = setTimeout(() => {
    const [r, g, b] = applyBrightness(baseR, baseG, baseB, brightness);
    send(`COLOR:${r},${g},${b}`);
  }, 80);
}

sliderR.addEventListener('input', e => { baseR = Number(e.target.value); valR.textContent = pad3(baseR); updateDisplay(); scheduleColorSend(); });
sliderG.addEventListener('input', e => { baseG = Number(e.target.value); valG.textContent = pad3(baseG); updateDisplay(); scheduleColorSend(); });
sliderB.addEventListener('input', e => { baseB = Number(e.target.value); valB.textContent = pad3(baseB); updateDisplay(); scheduleColorSend(); });

const brightnessSlider = document.getElementById('brightnessSlider');
brightnessSlider?.addEventListener('input', e => {
  brightness = Number(e.target.value);
  updateDisplay(); scheduleColorSend();
  send(`BRIGHTNESS:${brightness}`);
});

const speedSlider   = document.getElementById('speedSlider');
const speedValLabel = document.getElementById('speedVal');
speedSlider?.addEventListener('input', e => {
  speedVal = Number(e.target.value);
  if (speedValLabel) speedValLabel.textContent = speedVal;
  send(`SPEED:${speedVal}`);
});

//  HSV ↔ RGB
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r, g, b;
  if      (h < 60)  { r=c; g=x; b=0; }
  else if (h < 120) { r=x; g=c; b=0; }
  else if (h < 180) { r=0; g=c; b=x; }
  else if (h < 240) { r=0; g=x; b=c; }
  else if (h < 300) { r=x; g=0; b=c; }
  else              { r=c; g=0; b=x; }
  return [Math.round((r+m)*255), Math.round((g+m)*255), Math.round((b+m)*255)];
}
function rgbToHsv(r, g, b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0, s=max===0?0:d/max, v=max;
  if (d!==0) {
    if      (max===r) h = ((g-b)/d + (g<b?6:0)) / 6;
    else if (max===g) h = ((b-r)/d + 2) / 6;
    else              h = ((r-g)/d + 4) / 6;
  }
  return [h*360, s, v];
}

//  Color Wheel
const wheelCanvas = document.getElementById('colorWheel');
const wheelCtx    = wheelCanvas.getContext('2d');
const W = wheelCanvas.width, H = wheelCanvas.height;
const WR = W / 2 - 4;
let currentHue = 28, currentSat = 1.0, currentVal = 1.0;

function drawWheel() {
  const img = wheelCtx.createImageData(W, H);
  const cx = W/2, cy = H/2;
  for (let y=0; y<H; y++) {
    for (let x=0; x<W; x++) {
      const dx = x-cx, dy = y-cy, dist = Math.sqrt(dx*dx+dy*dy);
      if (dist > WR) continue;
      const hue = ((Math.atan2(dy, dx) * 180/Math.PI) + 360) % 360;
      const sat = dist / WR;
      const [r,g,b] = hsvToRgb(hue, sat, 1);
      const i = (y*W+x)*4;
      img.data[i]=r; img.data[i+1]=g; img.data[i+2]=b; img.data[i+3]=255;
    }
  }
  wheelCtx.putImageData(img, 0, 0);
}

function drawWheelCursor() {
  drawWheel();
  const cx=W/2, cy=H/2, rad = currentSat * WR, ang = currentHue * Math.PI/180;
  const px = cx + rad*Math.cos(ang), py = cy + rad*Math.sin(ang);
  wheelCtx.beginPath(); wheelCtx.arc(px, py, 7, 0, Math.PI*2);
  wheelCtx.strokeStyle='#fff'; wheelCtx.lineWidth=2.5; wheelCtx.stroke();
  wheelCtx.beginPath(); wheelCtx.arc(px, py, 7, 0, Math.PI*2);
  wheelCtx.strokeStyle='#000'; wheelCtx.lineWidth=1; wheelCtx.stroke();
}

const svCanvas = document.getElementById('svSquare');
const svCtx    = svCanvas.getContext('2d');
const SW = svCanvas.width, SH = svCanvas.height;

function drawSVSquare() {
  const base = svCtx.createLinearGradient(0,0,SW,0);
  base.addColorStop(0, '#fff');
  base.addColorStop(1, `hsl(${currentHue},100%,50%)`);
  svCtx.fillStyle = base; svCtx.fillRect(0,0,SW,SH);
  const dark = svCtx.createLinearGradient(0,0,0,SH);
  dark.addColorStop(0,'transparent'); dark.addColorStop(1,'#000');
  svCtx.fillStyle = dark; svCtx.fillRect(0,0,SW,SH);
}
function drawSVCursor() {
  drawSVSquare();
  const px = currentSat * SW, py = (1-currentVal) * SH;
  svCtx.beginPath(); svCtx.arc(px,py,7,0,Math.PI*2);
  svCtx.strokeStyle='#fff'; svCtx.lineWidth=2.5; svCtx.stroke();
  svCtx.beginPath(); svCtx.arc(px,py,7,0,Math.PI*2);
  svCtx.strokeStyle='#000'; svCtx.lineWidth=1; svCtx.stroke();
}
function refreshPicker() { drawWheelCursor(); drawSVCursor(); }
function pickerToBase() {
  const [r,g,b] = hsvToRgb(currentHue, currentSat, currentVal);
  baseR=r; baseG=g; baseB=b;
  syncSlidersToBase(); updateDisplay(); scheduleColorSend();
}

function wheelPointer(e) {
  const rect = wheelCanvas.getBoundingClientRect();
  const cx=W/2, cy=H/2;
  const x=(e.clientX-rect.left)*(W/rect.width)-cx;
  const y=(e.clientY-rect.top)*(H/rect.height)-cy;
  const dist=Math.sqrt(x*x+y*y);
  if (dist>WR) return;
  currentHue=((Math.atan2(y,x)*180/Math.PI)+360)%360;
  currentSat=Math.min(dist/WR,1);
  refreshPicker(); pickerToBase();
}
let wheelDragging=false;
wheelCanvas.addEventListener('mousedown', e=>{wheelDragging=true; wheelPointer(e);});
window.addEventListener('mousemove',      e=>{if(wheelDragging) wheelPointer(e);});
window.addEventListener('mouseup',        ()=>wheelDragging=false);
wheelCanvas.addEventListener('touchstart', e=>{e.preventDefault(); wheelPointer(e.touches[0]);},{passive:false});
wheelCanvas.addEventListener('touchmove',  e=>{e.preventDefault(); wheelPointer(e.touches[0]);},{passive:false});

function svPointer(e) {
  const rect=svCanvas.getBoundingClientRect();
  const x=Math.max(0,Math.min((e.clientX-rect.left)*(SW/rect.width),SW));
  const y=Math.max(0,Math.min((e.clientY-rect.top)*(SH/rect.height),SH));
  currentSat=x/SW; currentVal=1-y/SH;
  refreshPicker(); pickerToBase();
}
let svDragging=false;
svCanvas.addEventListener('mousedown', e=>{svDragging=true; svPointer(e);});
window.addEventListener('mousemove',   e=>{if(svDragging) svPointer(e);});
window.addEventListener('mouseup',     ()=>svDragging=false);
svCanvas.addEventListener('touchstart',e=>{e.preventDefault(); svPointer(e.touches[0]);},{passive:false});
svCanvas.addEventListener('touchmove', e=>{e.preventDefault(); svPointer(e.touches[0]);},{passive:false});

function baseToHSV() {
  const [h,s,v]=rgbToHsv(baseR,baseG,baseB);
  currentHue=h; currentSat=s; currentVal=v;
}
sliderR.addEventListener('input', ()=>{ baseToHSV(); refreshPicker(); });
sliderG.addEventListener('input', ()=>{ baseToHSV(); refreshPicker(); });
sliderB.addEventListener('input', ()=>{ baseToHSV(); refreshPicker(); });

//  Clock
const clock = document.getElementById('clock');
function updateTime() {
  clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}
updateTime();
setInterval(updateTime, 1000);

//  Sun / Moon Animation
const toggle = document.getElementById('powerToggle');
const sun    = document.getElementById('sun');
const moon   = document.getElementById('moon');
const PATH   = { cx: 54, cy: 60, rx: 87, ry: 85 };
let isOn = true, animationFrame = null;

function pointOnArc(progress) {
  const theta = Math.PI - (Math.PI * progress);
  return { x: PATH.cx + PATH.rx * Math.cos(theta), y: PATH.cy - PATH.ry * Math.sin(theta) };
}
function setBodyPosition(el, progress) {
  const { x, y } = pointOnArc(progress);
  el.style.left = `${x}%`; el.style.top = `${y}%`;
}
function renderFromProgress(sunProgress) {
  setBodyPosition(sun, sunProgress);
  setBodyPosition(moon, 1 - sunProgress);
}
function animateCycle(targetOn) {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  const duration = 800, start = performance.now();
  const from = targetOn ? 1 : 0, to = targetOn ? 0 : 1;
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    renderFromProgress(from + (to - from) * eased);
    if (t < 1) { animationFrame = requestAnimationFrame(tick); }
    else {
      animationFrame = null; isOn = targetOn;
      toggle.classList.toggle('off', !isOn);
      toggle.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    }
  }
  animationFrame = requestAnimationFrame(tick);
}

toggle.addEventListener('click', () => {
  const next = !isOn; animateCycle(next); send(next ? 'POWER:ON' : 'POWER:OFF');
});

document.querySelector('.adv-power .toggle')?.addEventListener('click', function () {
  const pressed = this.getAttribute('aria-pressed') === 'true';
  const next = !pressed;
  this.setAttribute('aria-pressed', String(next));
  this.classList.toggle('off', !next);
  send(next ? 'POWER:ON' : 'POWER:OFF');
});

//  Mode Buttons
const modeMap = {
  'STROBE':    'MODE:STROBE',
  'FADE':      'MODE:FADE',
  'RAINBOW':   'MODE:RAINBOW',
  'POLICE':    'MODE:POLICE',
  'CANDLE':    'MODE:CANDLE',
  'SUNRISE':   'MODE:SUNRISE',
  'DISCO':     'MODE:DISCO',
  'HEARTBEAT': 'MODE:HEARTBEAT',
  'THUNDER':   'MODE:THUNDER',
  'SOS':       'MODE:SOS',
  'BREATHE':   'MODE:BREATHE',
  'PARTY':     'MODE:PARTY',
};

let activeMode = null;

document.querySelectorAll('.adv-btn:not(.beat-mode)').forEach(btn => {
  btn.addEventListener('click', function () {
    const label = this.textContent.trim();
    const cmd   = modeMap[label];
    if (!cmd) return;
    // If beat sync is running, stop it when another mode is picked
    if (beatActive) stopBeatSync();
    if (activeMode === label) {
      activeMode = null; this.classList.remove('active'); send('MODE:SOLID');
    } else {
      document.querySelectorAll('.adv-btn').forEach(b => b.classList.remove('active'));
      activeMode = label; this.classList.add('active'); send(cmd);
    }
  });
});

// Mode tooltips
const modeDesc = {
  'STROBE':    'Rapid white flash',
  'FADE':      'Amber breathe cycle',
  'RAINBOW':   'Full hue rotation',
  'POLICE':    'Red / blue alternating',
  'CANDLE':    'Warm random flicker',
  'SUNRISE':   'Red -> orange ramp',
  'DISCO':     'Random color burst',
  'HEARTBEAT': 'Lub-dub red pulse',
  'THUNDER':   'Dark wait then flash',
  'SOS':       'Morse SOS in red',
  'BREATHE':   'Slow warm-white breath',
  'PARTY':     'R -> G -> B snap cycle',
  '🎵 MUSIC/BEAT SYNC': 'LED pulses with mic audio',
};
const tooltip = document.getElementById('modeTooltip');
document.querySelectorAll('.adv-btn').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    const label = btn.textContent.trim();
    if (!tooltip || !modeDesc[label]) return;
    tooltip.textContent = modeDesc[label]; tooltip.style.display = 'block';
  });
  btn.addEventListener('mousemove', e => {
    if (!tooltip) return;
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top  = `${e.clientY - 28}px`;
  });
  btn.addEventListener('mouseleave', () => { if (tooltip) tooltip.style.display = 'none'; });
});

//  AUTO-OFF TIMER
let timerEndTime  = null;
let timerInterval = null;

const timerCountdown    = document.getElementById('timerCountdown');
const timerCancel       = document.getElementById('timerCancel');
const advTimerCountdown = document.getElementById('advTimerCountdown');
const advTimerCancel    = document.getElementById('advTimerCancel');

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function setCountdownText(text) {
  if (timerCountdown)    timerCountdown.textContent    = `⏱ ${text}`;
  if (advTimerCountdown) advTimerCountdown.textContent = `⏱ ${text}`;
}
function setCountdownUrgent(urgent) {
  timerCountdown?.classList.toggle('urgent', urgent);
  advTimerCountdown?.classList.toggle('urgent', urgent);
}
function showCountdown(visible) {
  if (timerCountdown)    timerCountdown.hidden    = !visible;
  if (advTimerCountdown) advTimerCountdown.hidden = !visible;
}
function showCancelBtn(visible) {
  if (timerCancel)    timerCancel.hidden    = !visible;
  if (advTimerCancel) advTimerCancel.hidden = !visible;
}
function clearAllTimerBtnActive() {
  document.querySelectorAll('.timer-btn').forEach(b => b.classList.remove('active'));
}

function startTimer(minutes) {
  cancelTimer();
  timerEndTime = Date.now() + minutes * 60 * 1000;
  showCountdown(true);
  showCancelBtn(true);
  function tick() {
    const remaining = timerEndTime - Date.now();
    if (remaining <= 0) {
      setCountdownText('00:00');
      setCountdownUrgent(false);
      showCountdown(false);
      showCancelBtn(false);
      clearAllTimerBtnActive();
      clearInterval(timerInterval);
      timerInterval = null;
      timerEndTime  = null;
      send('POWER:OFF');
      animateCycle(false);
      const advToggle = document.querySelector('.adv-power .toggle');
      if (advToggle) { advToggle.setAttribute('aria-pressed', 'false'); advToggle.classList.add('off'); }
      return;
    }
    setCountdownText(formatCountdown(remaining));
    setCountdownUrgent(remaining <= 60000);
  }
  tick();
  timerInterval = setInterval(tick, 500);
}

function cancelTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  timerEndTime = null;
  showCountdown(false);
  showCancelBtn(false);
  clearAllTimerBtnActive();
}

document.querySelectorAll('.timer-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const mins = Number(this.dataset.mins);
    if (!mins) return;
    clearAllTimerBtnActive();
    this.classList.add('active');
    startTimer(mins);
  });
});

document.getElementById('timerCustomSet')?.addEventListener('click', () => {
  const input = document.getElementById('timerCustom');
  const mins = parseInt(input?.value, 10);
  if (!mins || mins < 1) return;
  clearAllTimerBtnActive();
  startTimer(mins);
  if (input) input.value = '';
});
document.getElementById('timerCustom')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('timerCustomSet')?.click();
});

timerCancel?.addEventListener('click',    cancelTimer);
advTimerCancel?.addEventListener('click', cancelTimer);

//  MUSIC / BEAT SYNC
let beatActive       = false;
let audioCtx         = null;
let analyser         = null;
let micStream        = null;
let beatAnimFrame    = null;
let beatSendTimer    = null;

// Beat detection state
let lastBeatTime     = 0;
let bpmHistory       = [];
let peakLevel        = 0;
let peakDecay        = 0.97;
let smoothedAmp      = 0;
let beatThreshold    = 0.25;
let noiseFloor       = 0.05;
let energyHistory    = [];
const ENERGY_WINDOW  = 43;

// Beat color state — smoothly interpolated current LED color during beat sync
let beatCurR = 255, beatCurG = 176, beatCurB = 0;
let beatTargetR = 255, beatTargetG = 176, beatTargetB = 0;

// Hue ranges:
//   Warm  = red/orange/yellow  (hue 0–60)
//   Cool  = cyan/blue/violet   (hue 170–270)
// Amplitude 0.0 -> warm end, 1.0 -> cool end
function ampToHue(amp) {
  // amp is normalised 0–1 (clamped)
  const t = Math.min(1, Math.max(0, amp));
  if (t < 0.5) {
    // low: random warm hue  (red 0° -> yellow 55°)
    return Math.random() * 55;
  } else {
    // high: random cool hue  (cyan 175° -> violet 270°)
    return 175 + Math.random() * 95;
  }
}

// DOM refs
const beatSyncBtn    = document.getElementById('beatSyncBtn');
const beatSyncPanel  = document.getElementById('beatSyncPanel');
const beatMicBtn     = document.getElementById('beatMicBtn');
const beatDot        = document.getElementById('beatDot');
const beatStatusText = document.getElementById('beatStatusText');
const beatWaveCanvas = document.getElementById('beatWaveCanvas');
const beatWaveCtx    = beatWaveCanvas.getContext('2d');
const beatAmpVal     = document.getElementById('beatAmpVal');
const beatAmpBar     = document.getElementById('beatAmpBar');
const beatPeakVal    = document.getElementById('beatPeakVal');
const beatPeakBar    = document.getElementById('beatPeakBar');
const beatBpmVal     = document.getElementById('beatBpmVal');
const beatBpmBar     = document.getElementById('beatBpmBar');
const beatFlash      = document.getElementById('beatFlashOverlay');
const beatSensSlider = document.getElementById('beatSensitivity');
const beatSensVal    = document.getElementById('beatSensVal');
const beatMinSlider  = document.getElementById('beatMinBright');
const beatMinVal     = document.getElementById('beatMinVal');

// Toggle panel visibility with the MUSIC/BEAT SYNC button
beatSyncBtn.addEventListener('click', () => {
  if (beatActive) {
    stopBeatSync();
  } else {
    // Show panel, deactivate other modes visually
    document.querySelectorAll('.adv-btn:not(.beat-mode)').forEach(b => b.classList.remove('active'));
    activeMode = null;
    beatSyncBtn.classList.add('active');
    beatSyncPanel.hidden = false;
    setBeatStatus('idle');
  }
});

// Sensitivity slider
beatSensSlider?.addEventListener('input', e => {
  beatSensVal.textContent = e.target.value;
});
beatMinSlider?.addEventListener('input', e => {
  beatMinVal.textContent = e.target.value;
});

// START / STOP mic button
beatMicBtn.addEventListener('click', async () => {
  if (beatActive) {
    stopBeatSync();
  } else {
    await startBeatSync();
  }
});

function setBeatStatus(state) {
  // state: 'idle' | 'listening' | 'beat'
  beatDot.className = 'beat-status-dot' + (state !== 'idle' ? ' active' : '') + (state === 'beat' ? ' beat' : '');
  beatStatusText.textContent = state === 'idle' ? 'IDLE' : state === 'listening' ? 'LISTENING' : 'BEAT!';
}

async function startBeatSync() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.warn('Mic access denied:', err);
    beatStatusText.textContent = 'MIC DENIED';
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);

  beatActive = true;
  beatMicBtn.textContent = 'STOP MIC';
  beatMicBtn.classList.add('listening');
  setBeatStatus('listening');

  // Tell Arduino to go to solid mode so we control brightness directly
  send('MODE:SOLID');
  send(`COLOR:${baseR},${baseG},${baseB}`);

  runBeatLoop();
}

function stopBeatSync() {
  beatActive = false;

  if (beatAnimFrame) { cancelAnimationFrame(beatAnimFrame); beatAnimFrame = null; }
  if (beatSendTimer) { clearTimeout(beatSendTimer);         beatSendTimer = null; }

  // Stop mic
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioCtx)  { audioCtx.close(); audioCtx = null; }
  analyser = null;

  beatMicBtn.textContent = 'START MIC';
  beatMicBtn.classList.remove('listening');
  beatSyncBtn.classList.remove('active');
  beatSyncPanel.hidden = true;
  setBeatStatus('idle');

  // Restore normal color
  send(`COLOR:${baseR},${baseG},${baseB}`);
  send(`BRIGHTNESS:${brightness}`);

  // Clear canvas
  beatWaveCtx.clearRect(0, 0, beatWaveCanvas.width, beatWaveCanvas.height);

  // Reset meters
  beatAmpVal.textContent  = '0';
  beatPeakVal.textContent = '0';
  beatBpmVal.textContent  = '--';
  beatAmpBar.style.width  = '0%';
  beatPeakBar.style.width = '0%';
  beatBpmBar.style.width  = '0%';
  peakLevel   = 0;
  smoothedAmp = 0;
  bpmHistory  = [];
  energyHistory = [];
  beatCurR = baseR; beatCurG = baseG; beatCurB = baseB;
  beatTargetR = baseR; beatTargetG = baseG; beatTargetB = baseB;
}

function runBeatLoop() {
  if (!beatActive || !analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const timeData     = new Uint8Array(bufferLength);
  const freqData     = new Uint8Array(bufferLength);

  function loop() {
    if (!beatActive) return;
    beatAnimFrame = requestAnimationFrame(loop);

    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    // Amplitude (RMS) from time domain
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = (timeData[i] / 128.0) - 1.0;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / bufferLength);

    // Smooth amplitude
    smoothedAmp = smoothedAmp * 0.7 + rms * 0.3;

    // Peak with decay
    if (rms > peakLevel) peakLevel = rms;
    else peakLevel *= peakDecay;

    // Energy-based beat detection
    energyHistory.push(rms);
    if (energyHistory.length > ENERGY_WINDOW) energyHistory.shift();
    const avgEnergy = energyHistory.reduce((a,b) => a+b, 0) / energyHistory.length;

    // Sensitivity: slider 1-10 maps to threshold multiplier 2.2 -> 1.2
    const sens       = Number(beatSensSlider?.value ?? 5);
    const multiplier = 2.2 - (sens - 1) * (1.0 / 9.0);
    const isBeat     = rms > Math.max(noiseFloor, avgEnergy * multiplier) && rms > 0.02;

    // BPM estimation from beat intervals
    const now = performance.now();
    if (isBeat && (now - lastBeatTime) > 200) {   // debounce 200ms (~300 BPM max)
      const interval = now - lastBeatTime;
      lastBeatTime = now;
      if (interval < 2000) {   // ignore gaps > 2s
        bpmHistory.push(60000 / interval);
        if (bpmHistory.length > 8) bpmHistory.shift();
      }
      setBeatStatus('beat');
      triggerBeatFlash(rms);
    } else if (now - lastBeatTime > 300) {
      setBeatStatus('listening');
    }

    const estimatedBpm = bpmHistory.length >= 2
      ? Math.round(bpmHistory.reduce((a,b) => a+b,0) / bpmHistory.length)
      : null;

    // Map amplitude -> color + bright
    //
    //  normAmp: 0.0 (silence) -> 1.0 (loud), scaled so typical
    //  speech/music peaks around 0.6–0.9 rather than maxing out.
    const normAmp   = Math.min(1, smoothedAmp * 5);
    const minBright = Number(beatMinSlider?.value ?? 5);

    // Brightness: min floor -> 100% at full amplitude
    const ledBright = Math.round(minBright + normAmp * (100 - minBright));

    // Pick a new target color on every beat (or every ~8 frames when quiet)
    const frameCount = Math.round(performance.now() / 16);
    const shouldPick = isBeat || (frameCount % 8 === 0 && normAmp < 0.15);
    if (shouldPick) {
      const hue = ampToHue(normAmp);
      // Saturation: loud = fully saturated, quiet = slightly washed out
      const sat = 0.65 + normAmp * 0.35;
      const val = ledBright / 100;
      const [tr, tg, tb] = hsvToRgb(hue, sat, val);
      beatTargetR = tr; beatTargetG = tg; beatTargetB = tb;
    }

    // Smooth the color transition — fast on beats, slow between
    const lerpSpeed = isBeat ? 0.6 : 0.12;
    beatCurR = Math.round(beatCurR + (beatTargetR - beatCurR) * lerpSpeed);
    beatCurG = Math.round(beatCurG + (beatTargetG - beatCurG) * lerpSpeed);
    beatCurB = Math.round(beatCurB + (beatTargetB - beatCurB) * lerpSpeed);

    // Send COLOR (contains brightness baked in) throttled to ~30 Hz
    if (!beatSendTimer) {
      beatSendTimer = setTimeout(() => {
        beatSendTimer = null;
        if (beatActive) send(`COLOR:${beatCurR},${beatCurG},${beatCurB}`);
      }, 33);
    }

    // Draw waveform
    drawWaveform(timeData, rms, isBeat);

    // Update meters
    const ampPct  = Math.min(100, Math.round(rms   * 400));
    const peakPct = Math.min(100, Math.round(peakLevel * 400));
    beatAmpVal.textContent  = ampPct;
    beatPeakVal.textContent = peakPct;
    beatAmpBar.style.width  = `${ampPct}%`;
    beatPeakBar.style.width = `${peakPct}%`;

    if (estimatedBpm) {
      beatBpmVal.textContent = estimatedBpm;
      beatBpmBar.style.width = `${Math.min(100, Math.round((estimatedBpm - 60) / (200 - 60) * 100))}%`;
    }
  }

  loop();
}

function drawWaveform(timeData, rms, isBeat) {
  const cw = beatWaveCanvas.width;
  const ch = beatWaveCanvas.height;

  beatWaveCtx.clearRect(0, 0, cw, ch);

  // Dim trail
  beatWaveCtx.fillStyle = 'rgba(14, 15, 18, 0.35)';
  beatWaveCtx.fillRect(0, 0, cw, ch);

  const mid   = ch / 2;
  // Waveform color mirrors the current beat LED color
  const color = `rgb(${beatCurR},${beatCurG},${beatCurB})`;
  const glow  = isBeat ? 3 : 1;

  beatWaveCtx.shadowColor = color;
  beatWaveCtx.shadowBlur  = glow * 4;
  beatWaveCtx.strokeStyle = color;
  beatWaveCtx.lineWidth   = isBeat ? 2.5 : 1.5;
  beatWaveCtx.beginPath();

  const step = cw / timeData.length;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] / 128.0) - 1.0;
    const x = i * step;
    const y = mid + v * mid * 0.85;
    if (i === 0) beatWaveCtx.moveTo(x, y);
    else         beatWaveCtx.lineTo(x, y);
  }
  beatWaveCtx.stroke();
  beatWaveCtx.shadowBlur = 0;

  if (isBeat) {
    beatWaveCtx.strokeStyle = `rgba(${beatCurR},${beatCurG},${beatCurB},0.35)`;
    beatWaveCtx.lineWidth   = 1;
    beatWaveCtx.beginPath();
    beatWaveCtx.moveTo(0, mid);
    beatWaveCtx.lineTo(cw, mid);
    beatWaveCtx.stroke();
  }
}

function triggerBeatFlash(rms) {
  if (!beatFlash) return;
  const alpha = Math.min(0.22, rms * 0.7);
  beatFlash.style.background = `rgba(${beatCurR},${beatCurG},${beatCurB},${alpha})`;
  beatFlash.style.opacity    = '1';
  clearTimeout(beatFlash._fadeTimer);
  beatFlash._fadeTimer = setTimeout(() => {
    beatFlash.style.opacity = '0';
  }, 80);
}

//  Init
renderFromProgress(0);
syncSlidersToBase();
updateDisplay();
requestAnimationFrame(() => {
  const [h,s,v] = rgbToHsv(baseR, baseG, baseB);
  currentHue=h; currentSat=s; currentVal=v;
  refreshPicker();
});
setSerialStatus(false);

if (!('serial' in navigator)) {
  const warn = document.createElement('div');
  warn.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:10px 20px;border-radius:8px;font-family:monospace;font-size:14px;z-index:999';
  warn.textContent = '⚠ Web Serial not supported. Use Chrome/Edge.';
  document.body.appendChild(warn);
}