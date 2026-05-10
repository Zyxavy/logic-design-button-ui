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
