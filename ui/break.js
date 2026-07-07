// Break takeover screen. Primary monitor gets the dog + countdown + question;
// secondary monitors get a quiet dim screen. All input is swallowed except the
// ESC-hold escape hatch (if enabled) and the happiness buttons at the end.
const invoke = window.__TAURI__.core.invoke;

const $ = (id) => document.getElementById(id);
const RING_LEN = 276.46;

let phase = 'enter'; // enter -> countdown -> ask -> react
let info = null;
let dog = null;
let scene = null;
let audio = null;

function sound(fn) {
  if (!info.settings.sound) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    fn(audio);
  } catch {
    /* no audio available, stay silent */
  }
}

function pluck(ctx, freq, at, dur = 0.5, gain = 0.12) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + dur);
}

const chimeIn = () => sound((ctx) => { pluck(ctx, 659.25, 0); pluck(ctx, 880, 0.18); });
const chimeDone = () => sound((ctx) => { pluck(ctx, 880, 0); pluck(ctx, 659.25, 0.15); pluck(ctx, 1108.7, 0.3); });
const woof = () =>
  sound((ctx) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(170, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(72, ctx.currentTime + 0.12);
    f.type = 'lowpass';
    f.frequency.value = 420;
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
  });

function typewriter(el, text, speed = 34) {
  el.textContent = '';
  let i = 0;
  const tick = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) setTimeout(tick, speed);
  };
  tick();
}

// --- input swallowing + ESC-hold escape hatch ---
let escDownAt = null;
let escTimer = null;

function updateEscPill() {
  if (escDownAt === null) return;
  const held = (performance.now() - escDownAt) / 1000;
  const frac = Math.min(1, held / info.settings.escape_hold_seconds);
  $('skip-fill').style.width = `${frac * 100}%`;
  if (frac >= 1) {
    escDownAt = null;
    clearInterval(escTimer);
    leave(null); // skipped
    return;
  }
  $('skip-pill').classList.remove('hidden');
}

function installInputGuards() {
  window.addEventListener(
    'keydown',
    (e) => {
      e.preventDefault();
      if (e.key === 'Escape' && info.settings.allow_escape && !e.repeat && escDownAt === null) {
        escDownAt = performance.now();
        escTimer = setInterval(updateEscPill, 40);
      }
      if (phase === 'ask') {
        const k = e.key.toLowerCase();
        if (k === 'y') answer('happy');
        if (k === 'n') answer('meh');
      }
    },
    true
  );
  window.addEventListener(
    'keyup',
    (e) => {
      e.preventDefault();
      if (e.key === 'Escape') {
        escDownAt = null;
        clearInterval(escTimer);
        $('skip-fill').style.width = '0%';
        $('skip-pill').classList.add('hidden');
      }
    },
    true
  );
  window.addEventListener('contextmenu', (e) => e.preventDefault(), true);
  window.addEventListener('mousedown', (e) => { if (phase !== 'ask') e.preventDefault(); }, true);
  // A visible reminder that ESC exists, without inviting it.
  if (info.settings.allow_escape) {
    setTimeout(() => {
      $('skip-pill').classList.remove('hidden');
      $('skip-fill').style.width = '0%';
      setTimeout(() => { if (escDownAt === null) $('skip-pill').classList.add('hidden'); }, 2600);
    }, 1200);
  }
}

// --- phases ---
function startCountdown() {
  phase = 'countdown';
  const total = info.settings.break_seconds;
  let remaining = total;
  $('bubble').classList.add('show');
  $('ringwrap').classList.remove('hidden');
  $('count').textContent = remaining;
  typewriter($('msg'), info.message);
  chimeIn();

  const started = performance.now();
  const timer = setInterval(() => {
    const elapsed = (performance.now() - started) / 1000;
    remaining = Math.max(0, Math.ceil(total - elapsed));
    $('count').textContent = remaining;
    $('ringfg').style.strokeDashoffset = RING_LEN * Math.min(1, elapsed / total);
    if (remaining <= 0) {
      clearInterval(timer);
      startAsk();
    }
  }, 100);
}

function startAsk() {
  phase = 'ask';
  woof();
  dog?.setMode('ask');
  document.body.classList.remove('no-cursor');
  $('ringwrap').classList.add('hidden');
  typewriter($('msg'), `One more thing, are you happy?`);
  $('sub').textContent = `${info.settings.dog_name} wants to know`;
  $('ask').classList.remove('hidden');
}

function answer(mood) {
  if (phase !== 'ask') return;
  phase = 'react';
  $('ask').classList.add('hidden');
  if (mood === 'happy') {
    chimeDone();
    dog?.setMode('happy');
    dog?.spawnHearts(scene);
    typewriter($('msg'), `Yesss! ${info.settings.dog_name} is thrilled. Back to it! 🐾`);
  } else {
    dog?.setMode('sad');
    typewriter($('msg'), `${info.settings.dog_name} sends a paw hug. Be kind to yourself. 💛`);
  }
  $('sub').textContent = '';
  setTimeout(() => leave(mood), 2800);
}

let leaving = false;
async function leave(mood) {
  if (leaving) return;
  leaving = true;
  dog?.setMode('leave');
  document.body.classList.remove('shown');
  await new Promise((r) => setTimeout(r, 480));
  if (mood) await invoke('finish_break', { mood });
  else await invoke('skip_break');
}

// --- boot ---
async function main() {
  info = await invoke('get_break_info');
  installInputGuards();
  requestAnimationFrame(() => document.body.classList.add('shown'));

  if (!info.primary) {
    // Secondary monitors get only the dim, no bubble, so there is exactly one
    // message on screen (on the primary) rather than a popup per display.
    document.body.classList.add('secondary');
    $('bubble').remove();
    $('scene').remove();
    return;
  }

  // Real-footage dog when clips exist (unless forced to 3D); procedural 3D otherwise.
  const clips = info.settings.dog_style !== '3d' ? await invoke('get_dog_clips') : null;
  if (clips) {
    const mod = await import('./videodog.js');
    dog = new mod.VideoDog($('scene'), clips, window.__TAURI__.core.convertFileSrc);
    dog.setMode('enter');
  } else {
    const mod = await import('./dog.js');
    const built = mod.createScene($('scene'), info.settings.coat);
    dog = built.dog;
    scene = built.scene;
  }

  // let the dog trot/fade in, then start the clock
  setTimeout(startCountdown, 2100);
}

$('btn-happy').addEventListener('click', () => answer('happy'));
$('btn-meh').addEventListener('click', () => answer('meh'));

main();
