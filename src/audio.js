// Звук синтезом WebAudio: гул мотора, ветер, удары, звонок, голуби. Без файлов.
let ctx, master, motor, motorGain, whine, whineGain, wind, windGain, windFilter, noiseBuf;

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // мотор: низкий пилообразный гул через фильтр + тонкий свист контроллера
  motor = ctx.createOscillator(); motor.type = 'sawtooth';
  const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 420;
  motorGain = ctx.createGain(); motorGain.gain.value = 0;
  motor.connect(mf).connect(motorGain).connect(master); motor.start();
  whine = ctx.createOscillator(); whine.type = 'sine';
  whineGain = ctx.createGain(); whineGain.gain.value = 0;
  whine.connect(whineGain).connect(master); whine.start();
  // ветер
  wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.6;
  windGain = ctx.createGain(); windGain.gain.value = 0;
  wind.connect(windFilter).connect(windGain).connect(master); wind.start();
}

export function setMuted(m) { if (master) master.gain.value = m ? 0 : 0.7; }

export function engine(v, vmax, throttle) {
  if (!ctx) return;
  const t = ctx.currentTime, k = Math.min(1, v / vmax);
  motor.frequency.setTargetAtTime(55 + k * 70, t, 0.1);
  motorGain.gain.setTargetAtTime((0.02 + throttle * 0.05) * Math.min(1, v * 0.5), t, 0.1);
  whine.frequency.setTargetAtTime(500 + k * 900, t, 0.1);
  whineGain.gain.setTargetAtTime(throttle * k * 0.012, t, 0.1);
  windGain.gain.setTargetAtTime(k * k * 0.16, t, 0.2);
  windFilter.frequency.setTargetAtTime(350 + k * 700, t, 0.2);
}

function noiseHit(dur, freq, q, gain, type = 'lowpass') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

function tone(freq, dur, gain, type = 'sine', slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  bump() { noiseHit(0.18, 180, 1, 0.5); tone(70, 0.15, 0.3, 'sine', 0.5); },
  cone() { tone(420, 0.12, 0.25, 'square', 0.4); noiseHit(0.1, 1200, 2, 0.2, 'bandpass'); },
  crash() { noiseHit(0.6, 900, 0.7, 0.7); tone(90, 0.5, 0.5, 'sine', 0.3); noiseHit(0.35, 3000, 1, 0.25, 'highpass'); },
  splash() { noiseHit(0.35, 1400, 0.8, 0.4, 'bandpass'); noiseHit(0.5, 600, 1, 0.2); },
  coin() { tone(988, 0.09, 0.15, 'square'); tone(1319, 0.22, 0.15, 'square', 1, 0.08); },
  whoosh() { noiseHit(0.3, 900, 3, 0.35, 'bandpass'); },
  flap() { for (let i = 0; i < 6; i++) setTimeout(() => noiseHit(0.06, 2200, 2, 0.25, 'bandpass'), i * 45 + Math.random() * 30); },
  bark() { tone(520, 0.08, 0.2, 'sawtooth', 0.6); tone(480, 0.1, 0.2, 'sawtooth', 0.6, 0.16); },
  bell() { tone(2100, 0.6, 0.12, 'sine'); tone(2630, 0.5, 0.06, 'sine'); },
  creak() { tone(300, 0.25, 0.08, 'sawtooth', 1.6); },
  scrape() { noiseHit(0.15, 2500, 4, 0.12, 'bandpass'); },
  levelUp() { tone(660, 0.1, 0.12, 'triangle'); tone(880, 0.1, 0.12, 'triangle', 1, 0.08); tone(1100, 0.2, 0.12, 'triangle', 1, 0.16); },
};
