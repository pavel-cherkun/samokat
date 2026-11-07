// «Самокат. Последнее лето» — симулятор летнего кикшеринга от первого лица.
import * as THREE from 'three';
import * as A from './assets.js';
import * as M from './models.js';
import * as AU from './audio.js';
import { World, SUN_DIR } from './world.js';
import { Input } from './input.js';
import * as CARDS from './cards.js';
import { ROAD, CROSS, L, curbAt } from './layout.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- рендер
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const quality = { dpr: Math.min(devicePixelRatio, isTouch ? 1.5 : 2), shadow: isTouch ? 1024 : 2048 };
renderer.setPixelRatio(quality.dpr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
renderer.info.autoReset = false;

const world = new World(renderer, quality);
const scene = world.scene;
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Вьюмодель: руль, дека и руки рисуются вторым проходом своей камерой — не влезают в стены и машины
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(70, 1, 0.02, 10);
vmCam.rotation.order = 'YXZ';
const vmHemi = new THREE.HemisphereLight('#cfe6ff', '#e8c49a', 1.5);
const vmSun = new THREE.DirectionalLight('#fff1d6', 2.6);
vmScene.add(vmHemi, vmSun, vmSun.target);
vmScene.environment = scene.environment;
vmScene.environmentIntensity = 0.6;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = vmCam.aspect = w / h;
  // на узком (портретном) экране шире угол, чтобы руль влез
  camera.fov = w / h < 1.3 ? 72 : 58;
  vmCam.fov = w / h < 1.3 ? 88 : 70;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  // повернули телефон вертикально посреди заезда — ставим на паузу
  if (isTouch && w < h && (state === 'play' || state === 'crash')) $('pause').click();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- состояние
const input = new Input(canvas);
let state = 'loading';
let choice = +(localStorage.getItem('samokat.choice') ?? 0) || 0;
let best = +(localStorage.getItem('samokat.best') ?? 0) || 0;
const p = { x: 4.2, s: 2, y: 0, h: 0, v: 0, steer: 0, lean: 0, onWalk: false, inPuddle: null, invuln: 0, wallT: 0 };
const run = { cards: { yellow: 0, violet: 0, orange: 0 }, score: 0, mult: 1, streak: 0, lives: 3, falls: 0, started: false, t: 0, crashT: 0, cause: '', nearMiss: [], dist0: 0, best0: 0 };
let shake = 0, shakeT = 0, flashA = 0;
let vm = null, proxy = null, menuScooter = null, tumble = null;
const time = { t: 0 };

// ---------------------------------------------------------------- самокаты
function buildVM(spec) {
  if (vm) vmScene.remove(vm.root);
  const root = new THREE.Group();
  const sc = M.makeScooter(spec);
  root.add(sc.group);
  sc.fw.rotation.order = 'YXZ';
  const hands = [], arms = [];
  for (const side of [-1, 1]) {
    const h = M.makeHand(side);
    h.group.position.set(side * 0.25, 0, 0);
    sc.bar.add(h.group);
    const arm = M.makeForearm(h.skin, h.band);
    root.add(arm);
    hands.push(h); arms.push(arm);
  }
  vmScene.add(root);
  vm = { root, sc, hands, arms, dispT: 0 };
}

function buildProxy(spec) {
  // невидимый двойник в мире: отбрасывает тень седока и самоката на асфальт
  if (proxy) scene.remove(proxy.group);
  const sc = M.makeScooter(spec);
  const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const body = new THREE.Group();
  const torso = new THREE.Mesh(M.G.cap, ghost); torso.scale.set(0.2, 0.7, 0.14); torso.position.set(0, 1.25, 0.1);
  const legs = new THREE.Mesh(M.G.cap, ghost); legs.scale.set(0.16, 0.85, 0.12); legs.position.set(0, 0.62, 0.1);
  const head = new THREE.Mesh(M.G.sph, ghost); head.scale.setScalar(0.13); head.position.set(0, 1.78, 0.08);
  const armL = new THREE.Mesh(M.G.cap, ghost); armL.scale.set(0.05, 0.55, 0.05); armL.position.set(-0.24, 1.3, -0.15); armL.rotation.x = 1.0;
  const armR = armL.clone(); armR.position.x = 0.24;
  body.add(torso, legs, head, armL, armR);
  sc.group.add(body);
  sc.group.traverse(o => { if (o.isMesh) { o.material = ghost; o.castShadow = true; } });
  scene.add(sc.group);
  proxy = sc;
}

function buildMenuScooter(spec) {
  if (menuScooter) scene.remove(menuScooter.group);
  menuScooter = M.makeScooter(spec);
  scene.add(menuScooter.group);
}

// ---------------------------------------------------------------- FX: частицы, всплывашки
const parts = [];
const partGeo = new THREE.SphereGeometry(1, 6, 4);
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: '#bfe4ff', transparent: true }));
  m.visible = false; scene.add(m);
  parts.push({ m, v: new THREE.Vector3(), life: 0 });
}
function burst(x, y, z, color, n, spd, size = 0.06) {
  let k = 0;
  for (const q of parts) {
    if (q.life > 0) continue;
    q.life = 0.5 + Math.random() * 0.4;
    q.m.visible = true; q.m.material.color.set(color); q.m.scale.setScalar(size * (0.6 + Math.random()));
    q.m.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
    q.v.set((Math.random() - 0.5) * spd, spd * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * spd - p.v * 0.3);
    if (++k >= n) break;
  }
}
function updateParts(dt) {
  for (const q of parts) {
    if (q.life <= 0) continue;
    q.life -= dt;
    q.v.y -= 14 * dt;
    q.m.position.addScaledVector(q.v, dt);
    q.m.material.opacity = Math.min(1, q.life * 3);
    if (q.life <= 0) q.m.visible = false;
  }
}

function pop(text, cls = '', sub = '') {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  el.style.top = (26 + Math.random() * 12) + '%';
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 1150);
}
function kick(a) { shake = Math.max(shake, a); }
function flash(a, color = '#fff') { flashA = a; $('flash').style.background = color; }

const fx = {
  doorOpen() { AU.sfx.creak(); },
  bark() { AU.sfx.bark(); },
  pigeons() {
    AU.sfx.flap();
    if (state === 'play' && run.started) { addScore(10 * run.mult); pop('Кыш!', 'good', '+' + 10 * run.mult); }
  },
};

// ---------------------------------------------------------------- карты
// жёлтая — мир медленнее, фиолетовая — рывок и очки ×2, оранжевая — удары отскакивают
const cardBar = new CARDS.CardBar($('cardbar'), i => useCard(i));
const active = id => run.cards[id] > 0;
function useCard(i) {
  const sl = cardBar.slots[i], d = sl.d;
  if (state !== 'play' || !sl.have) return;
  sl.have = false; sl.act = d.dur; run.cards[d.id] = d.dur;
  pop(d.name, 'card', d.fx);
  AU.sfx.levelUp(); flash(0.35, d.col); kick(0.15);
  if (d.id === 'violet') { p.v = Math.max(p.v, scooterSpec().speed * 1.15); AU.sfx.whoosh(); }
}
function takeCard(a) {
  a.taken = true;
  const sl = cardBar.slots.find(x => x.d.id === a.id);
  AU.sfx.coin();
  if (sl.have) { addScore(50 * run.mult); pop('Ещё одна', 'good', '+' + 50 * run.mult); return; }
  sl.have = true;
  pop(sl.d.name, 'card', 'карта у тебя — жми, когда пригодится');
  if (Q.has('auto')) useCard(cardBar.slots.indexOf(sl));
}
function tickCards(dt) {
  for (const sl of cardBar.slots) {
    if (sl.act > 0) { sl.act = Math.max(0, sl.act - dt); run.cards[sl.d.id] = sl.act; }
  }
  cardBar.sync();
  // цветная рамка экрана, пока карта работает
  const on = cardBar.slots.find(x => x.act > 0);
  const au = $('aura');
  au.style.opacity = on ? (0.55 + Math.sin(time.t * 8) * 0.15).toFixed(2) : 0;
  if (on) au.style.setProperty('--c', on.d.col);
}
// оранжевая карта гасит удар: отскок вместо падения
function shieldHit() {
  const sl = cardBar.slots[2];
  sl.act = 0; run.cards.orange = 0;
  p.v *= 0.45; p.h *= -0.4; p.invuln = 1.2;
  kick(0.6); flash(0.4, '#FF5A00'); AU.sfx.bump();
  pop('Идут работы!', 'card', 'забор принял удар');
}

// ---------------------------------------------------------------- очки
function addScore(n) { run.score += n; }
function penalty(text, sub = '') {
  if (run.mult > 1) $('mult').classList.add('lost');
  run.streak = 0; run.mult = 1;
  pop(text, 'bad', sub || 'серия сброшена');
  setTimeout(() => $('mult').classList.remove('lost'), 600);
}

const CAUSE = {
  traffic: 'Поцеловался с машиной', car: 'Припаркованная машина не уступила', door: 'Дверь открылась прямо в тебя',
  granny: 'Бабушка в шоке', ped: 'Ой, извините!', dog: 'Собака цела. Ты — не очень', manhole: 'Люк!',
  tree: 'Дерево не подвинулось', pole: 'Столб!', hydrant: 'Гидрант!', trash: 'Урна!', box: 'Электрощиток!', cafe: 'Прямо в летнюю веранду',
};

// ---------------------------------------------------------------- игра
function scooterSpec() { return M.SCOOTERS[choice]; }

function newRun() {
  world.reset(Math.floor(Math.random() * 1e6));
  Object.assign(p, { x: 4.2, s: +(Q.get('s') ?? 2), y: 0, h: 0, v: 0, steer: 0, lean: 0, onWalk: false, inPuddle: null, invuln: 0 });
  for (const sl of cardBar.slots) { sl.have = false; sl.act = 0; }
  run.cards = { yellow: 0, violet: 0, orange: 0 };
  Object.assign(run, { score: 0, mult: 1, streak: 0, lives: 3, falls: 0, started: false, t: 0, crashT: 0, nearMiss: [], dist0: p.s, best0: best });
  world.update(p.s, 0);
  buildVM(scooterSpec());
  buildProxy(scooterSpec());
  if (menuScooter) menuScooter.group.visible = false;
  vm.root.visible = true;
  state = 'play';
  $('menu').classList.add('hidden'); $('over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('hint').classList.toggle('hidden', Q.has('auto'));
  drawLives();
  AU.init();
}

function drawLives() {
  let h = '';
  for (let i = 0; i < 3; i++) h += `<span class="${i < run.lives ? '' : 'off'}">⛑️</span>`;
  $('lives').innerHTML = h;
}

function crash(kind) {
  if (state !== 'play') return;
  state = 'crash';
  run.crashT = 0; run.lives--; run.falls++;
  run.cause = CAUSE[kind] || 'Бум!';
  AU.sfx.crash();
  kick(1); flash(0.6, '#ff6a4a');
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate([60, 40, 120]);
  pop(run.cause, 'bad');
  run.streak = 0; run.mult = 1;
  drawLives();
  // самокат улетает вперёд кувырком
  if (!menuScooter) buildMenuScooter(scooterSpec());
  const t = menuScooter.group;
  t.visible = true;
  t.position.set(p.x, p.y, -p.s - 0.6);
  t.rotation.set(0, -p.h, 0);
  tumble = { v: new THREE.Vector3(Math.sin(p.h) * p.v * 0.5, 3.5, -Math.cos(p.h) * p.v * 0.6), w: new THREE.Vector3(-6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6) };
  vm.root.visible = false;
  run.crashV = p.v;
}

function respawn() {
  if (run.lives <= 0) return gameOver();
  state = 'play';
  menuScooter.group.visible = false;
  vm.root.visible = true;
  p.h = 0; p.v = scooterSpec().speed * 0.3; p.x = 4.2; p.steer = 0; p.invuln = 2.5;
  // убрать машины, которые прямо сейчас перед носом
  for (const c of world.traffic.cars) if (Math.abs(c.s - p.s) < 25) c.group.position.x = 99;
}

function gameOver() {
  state = 'over';
  AU.engine(0, 1, 0);
  const dist = Math.round(p.s - run.dist0);
  const score = Math.round(run.score);
  const rec = score > best;
  if (rec) { best = score; localStorage.setItem('samokat.best', best); }
  $('overTitle').textContent = rec ? 'Новый рекорд!' : 'Приехали';
  $('overScore').textContent = score;
  $('overInfo').innerHTML = `проехал <b>${dist} м</b> · падений ${run.falls}<br>последнее: ${run.cause}<br>рекорд ${best}`;
  $('over').classList.remove('hidden');
  $('hud').classList.add('hidden'); $('hint').classList.add('hidden');
}

function toMenu() {
  state = 'menu';
  $('over').classList.add('hidden'); $('paused').classList.add('hidden'); $('hud').classList.add('hidden'); $('hint').classList.add('hidden');
  $('menu').classList.remove('hidden');
  world.reset(7);
  Object.assign(p, { x: 4.2, s: 2, v: 0, h: 0 });
  world.update(0, 0);
  if (vm) vm.root.visible = false;
  buildMenuScooter(scooterSpec());
  $('menuBest').textContent = best ? 'рекорд ' + best : '';
  AU.engine(0, 1, 0);
}

// ---------------------------------------------------------------- шаг симуляции
const PR = 0.3;   // радиус седока
const _dir = new THREE.Vector3();

function step(dt) {
  const spec = scooterSpec();
  const diff = Math.min(1, (p.s - run.dist0) / 3000);
  run.t += dt;
  if (Q.has('auto')) autopilot();

  if (state === 'play') {
    if (!run.started && (input.holding || Q.has('auto'))) { run.started = true; $('hint').classList.add('hidden'); AU.sfx.bell(); }
    // --- газ/тормоз
    const boost = active('violet');
    const vmax = spec.speed * (1 + 0.12 * diff) * (boost ? 1.45 : 1);
    const thr = run.started ? (Q.has('auto') ? 1 : input.throttle) : 0;
    const brk = run.started ? (Q.has('auto') ? 0 : input.brake) : 0;
    if (thr > 0 || boost) p.v += (spec.accel + (boost ? 7 : 0)) * Math.max(thr, boost ? 1 : 0) * (1 - Math.pow(p.v / vmax, 2)) * dt;
    p.v -= (brk * 8 + 0.35) * dt;
    if (p.onWalk) p.v -= 0.2 * dt;
    p.v = Math.max(0, Math.min(vmax, p.v));
    // --- руль
    const steerIn = Q.has('auto') ? p.autoSteer : input.steer;
    p.steer += (steerIn - p.steer) * Math.min(1, dt * 14);
    const yaw = p.steer * 1.55 * spec.handling * Math.min(1, 0.35 + p.v / 5);
    p.h += yaw * dt;
    if (Math.abs(steerIn) < 0.08) p.h *= Math.exp(-1.1 * dt);       // самокат сам выравнивается вдоль улицы
    p.h = Math.max(-0.95, Math.min(0.95, p.h));
    // --- движение
    const ox = p.x;
    p.s += p.v * Math.cos(p.h) * dt;
    p.x += p.v * Math.sin(p.h) * dt;
    addScore(p.v * Math.cos(p.h) * dt * run.mult * (boost ? 2 : 1));
    // --- бордюр
    const inCrossRoad = !curbAt(p.s) && !(Math.abs(p.x) > ROAD.curb && atZebra(p.s));
    const wasWalk = Math.abs(ox) > ROAD.curb, isWalk = Math.abs(p.x) > ROAD.curb;
    if (wasWalk !== isWalk && curbAt(p.s) && p.v > 2.5 && p.invuln <= 0 && !Q.has('god')) {
      p.v *= 0.72; kick(0.35); AU.sfx.bump(); penalty('Бордюр!', 'съезжай на зебре');
      p.h *= 0.5;
    }
    p.onWalk = isWalk && !inCrossRoad;
    // --- стена домов
    const lim = ROAD.front - 0.45;
    if (Math.abs(p.x) > lim) {
      p.x = Math.sign(p.x) * lim; p.h *= 0.85;
      if (p.v > 3) { p.v *= Math.pow(0.4, dt); kick(0.12); p.wallT -= dt; if (p.wallT <= 0) { AU.sfx.scrape(); p.wallT = 0.2; } }
    }
    // --- серия
    if (run.started && p.v > 2) run.streak += dt;
    const m = Math.min(5, 1 + Math.floor(run.streak / 10));
    if (m > run.mult) {
      run.mult = m; AU.sfx.levelUp(); pop('×' + m, 'good', 'чистая езда');
      $('mult').classList.add('bump'); setTimeout(() => $('mult').classList.remove('bump'), 200);
    }
    p.invuln = Math.max(0, p.invuln - dt);
    collide();
  } else if (state === 'crash') {
    run.crashT += dt;
    p.v *= Math.pow(0.02, dt);
    p.s += p.v * Math.cos(p.h) * dt;
    p.x += p.v * Math.sin(p.h) * dt;
    if (tumble) {
      const t = menuScooter.group;
      tumble.v.y -= 16 * dt;
      t.position.addScaledVector(tumble.v, dt);
      if (t.position.y < 0) { t.position.y = 0; tumble.v.multiplyScalar(0.45); tumble.v.y = Math.abs(tumble.v.y) * 0.6; tumble.w.multiplyScalar(0.6); }
      t.rotation.x += tumble.w.x * dt; t.rotation.y += tumble.w.y * dt; t.rotation.z += tumble.w.z * dt;
    }
    if (run.crashT > (Q.has('slowcrash') ? 8 : 1.7)) respawn();
  }

  const yT = p.onWalk ? ROAD.walkH : 0;
  p.y += (yT - p.y) * Math.min(1, dt * 12);

  // --- мир и актёры
  world.update(p.s, diff);
  const wdt = active('yellow') ? dt * 0.45 : dt;     // жёлтая: мир медленнее, игрок — нет
  const ctx = { player: p, t: time.t, dt: wdt, difficulty: diff, started: run.started, fx };
  world.traffic.update(wdt, ctx);
  for (const c of world.chunks.values()) {
    if (Math.abs(c.i * L + L / 2 - p.s) > 140) continue;
    for (const a of c.actors) a.update(wdt, ctx);
  }
  tickCards(dt);

  // --- звук
  AU.engine(p.v, spec.speed, state === 'play' ? input.throttle || (Q.has('auto') ? 1 : 0) : 0);
}

function atZebra(s) {
  const i = Math.floor(s / L), ls = s - i * L;
  return i >= 2 && i % 3 === 2 && ls >= CROSS.zebra0 && ls <= CROSS.zebra1;
}

function autopilot() {
  // для проверки: держит велополосу и объезжает ближайшее препятствие
  let target = 4.2;
  for (const a of world.actors()) for (const c of a.colliders) {
    const dz = -c.z - p.s;
    if (dz > 0 && dz < 14 && Math.abs(c.x - target) < c.r + 0.9) target = c.x > 2.5 ? c.x - c.r - 1.1 : c.x + c.r + 1.1;
  }
  const want = Math.atan2(target - p.x, 6) - p.h;
  p.autoSteer = Math.max(-1, Math.min(1, want * 2.2));
}

function collide() {
  const px = p.x, pz = -p.s;
  for (const a of world.actors()) {
    if (a.kind === 'card') {
      if (!a.taken && state === 'play' && Math.abs(a.s - p.s) < 0.9 && Math.abs(a.x - px) < 0.95) takeCard(a);
      continue;
    }
    if (a.zone) {                       // лужа
      const z = a.zone, dx = px - z.x, dz = -pz - z.s;
      const c = Math.cos(z.rot), sn = Math.sin(z.rot);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const inside = (lx / z.rx) ** 2 + (lz / z.rz) ** 2 < 1;
      if (inside && p.inPuddle !== a) {
        p.inPuddle = a;
        if (p.v > 2) {
          AU.sfx.splash(); burst(px, 0.1, pz - 0.6, '#cfeaff', 18, 3.5, 0.05); kick(0.15);
          p.h += (Math.random() < 0.5 ? -1 : 1) * 0.16 * (p.v / 10); p.v *= 0.94;
          pop('Плюх!', '', 'скользко');
        }
      } else if (!inside && p.inPuddle === a) p.inPuddle = null;
      continue;
    }
    const cs = a.colliders;
    if (!cs || !cs.length) continue;
    for (const c of cs) {
      const dz = c.z - pz;
      if (dz > 3.5 || dz < -3.5) continue;
      const dist = Math.hypot(c.x - px, dz);
      const gap = dist - c.r - PR;
      if (gap < 0) {
        if (p.invuln > 0 || Q.has('god')) continue;
        if (a.kind === 'cone') {
          a.knock({ player: p }); AU.sfx.cone(); kick(0.25); burst(c.x, 0.3, c.z, '#ff7a1a', 8, 3, 0.05);
          if (active('violet') || active('orange')) { addScore(5 * run.mult); pop('Снёс!', 'good', '+' + 5 * run.mult); break; }
          p.v *= 0.82; penalty('Конус!');
          break;
        }
        if (a.hard) {
          const kind = a.doorCol && a.doorCol.includes(c) ? 'door' : a.statics ? c.kind : a.kind === 'static' ? c.kind : a.kind;
          if (active('orange')) { shieldHit(); return; }
          crash(kind);
          return;
        }
      } else if (a.hard && gap < 0.5 && p.v > 5 && Math.abs(dz) < 0.6 && !run.nearMiss.some(n => n.c === c)) {
        run.nearMiss.push({ c, z: c.z });
      }
    }
  }
  // «впритирку»: начисляем, когда объект остался позади
  for (let k = run.nearMiss.length - 1; k >= 0; k--) {
    const n = run.nearMiss[k];
    if (n.z > pz + 1.2) {
      if (!n.done) { n.done = true; const b = 20 * run.mult; addScore(b); pop('Впритирку!', 'good', '+' + b); AU.sfx.whoosh(); }
      if (n.z > pz + 30) run.nearMiss.splice(k, 1);
    }
  }
}

// ---------------------------------------------------------------- камера и вьюмодель
function updateCamera(dt) {
  const spec = scooterSpec();
  const k = Math.min(1, p.v / spec.speed);
  shakeT += dt * 40;
  shake *= Math.pow(0.02, dt);
  const sh = shake * 0.08;
  const roadBuzz = state === 'play' ? k * 0.006 * (p.onWalk ? 2.5 : 1) : 0;   // плитка трясёт сильнее асфальта
  const bx = Math.sin(shakeT * 1.3) * sh, by = Math.sin(shakeT * 1.7) * sh + Math.sin(time.t * 37) * roadBuzz;
  p.lean += (-p.steer * k * 0.11 - p.lean) * Math.min(1, dt * 6);

  if (state === 'crash') {
    const t = Math.min(1, run.crashT / 0.55), e = 1 - Math.pow(1 - t, 3);
    camera.position.set(p.x + bx, p.y + 1.6 - e * 0.95 + by, -p.s + e * 0.8);
    camera.rotation.set(-0.08 - e * 0.28 + Math.sin(run.crashT * 9) * 0.05 * (1 - t), -p.h + e * 0.35, p.lean + e * 0.45);
  } else {
    camera.position.set(p.x + bx, p.y + 1.6 + by, -p.s);
    camera.rotation.set(-0.075 + sh * 0.5, -p.h - p.steer * 0.06, p.lean + bx * 0.5);
  }
  if (Q.has('top')) {   // отладка: вид сверху-сзади
    camera.position.set(p.x - 6, 9, -p.s + 10);
    camera.lookAt(p.x, 0, -p.s - 14);
  }
  const fov = (camera.aspect < 1.3 ? 72 : 58) + Math.min(1.5, k) * 7 + (active('violet') ? 6 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }

  // вьюмодель
  if (vm) {
    vmCam.position.set(bx * 0.3, 1.5 + by * 0.6, 0.45);
    vmCam.rotation.set(-0.30, 0, p.lean * 0.6);
    const sc = vm.sc;
    sc.bar.rotation.y = -p.steer * 0.42;
    sc.fw.rotation.y = -p.steer * 0.42;
    sc.fw.rotation.x -= p.v * dt / 0.14; sc.rw.rotation.x -= p.v * dt / 0.14;
    // руки тянутся к локтям, которые остаются на месте
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, h = vm.hands[i], arm = vm.arms[i];
      h.wrist.getWorldPosition(arm.position);
      arm.lookAt(side * 0.4, 1.12, 0.75);   // к плечу позади-внизу камеры
    }
    vm.dispT -= dt;
    if (vm.dispT <= 0) {
      vm.dispT = 0.25;
      const t = sc.dispTex, { g } = t.userData;
      g.fillStyle = '#0d1a14'; g.fillRect(0, 0, 128, 64);
      g.fillStyle = '#7dffb2'; g.fillText(String(Math.round(p.v * 3.6)), 64, 34);
      t.needsUpdate = true;
    }
    // подмигивание при неуязвимости
    vm.root.visible = state !== 'crash' && !(p.invuln > 0 && Math.floor(time.t * 10) % 2 === 0);
    vmSun.position.copy(SUN_DIR).applyAxisAngle(THREE.Object3D.DEFAULT_UP, p.h).multiplyScalar(5);
  }
  if (proxy) {
    proxy.group.position.set(p.x, p.y, -p.s + 0.2);
    proxy.group.rotation.set(0, -p.h, -p.lean * 1.5);
    proxy.bar.rotation.y = -p.steer * 0.42;
    proxy.group.visible = state === 'play';
  }
  world.follow(p.x, p.s, p.h);
}

// ---------------------------------------------------------------- меню
function buildCards() {
  const max = { speed: 12.5, accel: 4.6, handling: 1.35 };
  $('cards').innerHTML = M.SCOOTERS.map((s, i) => `
    <div class="card${i === choice ? ' sel' : ''}" data-i="${i}">
      <div class="sw" style="background:linear-gradient(90deg, ${s.main} 60%, ${s.accent} 60%)"></div>
      <h3>${s.name}</h3><p>${s.about}</p>
      <div class="stat"><i>скорость</i><u><b style="width:${s.speed / max.speed * 100}%"></b></u></div>
      <div class="stat"><i>разгон</i><u><b style="width:${s.accel / max.accel * 100}%"></b></u></div>
      <div class="stat"><i>руль</i><u><b style="width:${s.handling / max.handling * 100}%"></b></u></div>
    </div>`).join('');
  for (const el of document.querySelectorAll('.card')) {
    el.addEventListener('click', () => {
      choice = +el.dataset.i;
      localStorage.setItem('samokat.choice', choice);
      document.querySelectorAll('.card').forEach(c => c.classList.toggle('sel', c === el));
      buildMenuScooter(scooterSpec());
      AU.init(); AU.sfx.bell();
    });
  }
}

function menuFrame() {
  const g = menuScooter.group;
  g.visible = true;
  const sx = 10.4, sz = -12;
  g.position.set(sx, ROAD.walkH, sz);
  g.rotation.set(0, 0.35, 0);
  menuScooter.bar.rotation.y = Math.sin(time.t * 0.8) * 0.25;
  // камера качается слева от самоката; сам самокат — в левой трети кадра, карточки справа
  const a = -1.15 + Math.sin(time.t * 0.25) * 0.45;
  camera.position.set(sx + Math.sin(a) * 2.4, 1.25, sz + Math.cos(a) * 2.4);
  const dx = sx - camera.position.x, dz = sz - camera.position.z, l = Math.hypot(dx, dz);
  camera.lookAt(sx - dz / l * 1.05, 0.7, sz + dx / l * 1.05);
  world.follow(4, 10, 0);
  const ctx = { player: { x: 4, s: -60, v: 0, h: 0 }, t: time.t, dt: 0.016, difficulty: 0, started: false, fx: { doorOpen() {}, bark() {}, pigeons() {} } };
  for (const c of world.chunks.values()) for (const a of c.actors) a.update(1 / 60, ctx);
}

// ---------------------------------------------------------------- HUD
let hudT = 0;
function updateHUD(dt) {
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.08;
    $('score').textContent = Math.round(run.score);
    $('mult').textContent = '×' + run.mult;
    $('speed').textContent = Math.round(p.v * 3.6);
    $('best').textContent = 'рекорд ' + Math.max(best, Math.round(run.score));
  }
  // кружки под пальцами и линия руля
  const gl = $('gL'), gr = $('gR'), line = $('gLine').firstElementChild;
  const L = input.gripL, R = input.gripR;
  gl.classList.toggle('on', !!L); gr.classList.toggle('on', !!R);
  if (L) { gl.style.left = L.x + 'px'; gl.style.top = L.y + 'px'; }
  if (R) { gr.style.left = R.x + 'px'; gr.style.top = R.y + 'px'; }
  if (L && R) { line.setAttribute('x1', L.x); line.setAttribute('y1', L.y); line.setAttribute('x2', R.x); line.setAttribute('y2', R.y); line.style.display = ''; }
  else line.style.display = 'none';
  if (!run.started && state === 'play') {
    const n = input.touches.size;
    document.querySelector('.hint-zone.l').classList.toggle('on', n >= 1);
    document.querySelector('.hint-zone.r').classList.toggle('on', n >= 2);
  }
  flashA *= Math.pow(0.03, dt);
  $('flash').style.opacity = flashA.toFixed(3);
}

// ---------------------------------------------------------------- цикл
let last = performance.now();
const perf = { acc: 0, n: 0 };
// ?nopause — для отладки в скрытой вкладке, где rAF спит
const nextFrame = Q.has('nopause') ? f => setTimeout(() => f(performance.now()), 16) : requestAnimationFrame;
function frame(now) {
  nextFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'loading' || state === 'paused') return;
  time.t += dt;
  input.update(dt);
  if (state === 'menu') menuFrame();
  else if (state === 'play' || state === 'crash') { step(dt); updateCamera(dt); updateHUD(dt); }
  else if (state === 'over') { updateCamera(dt); }
  updateParts(dt);

  renderer.info.reset();
  renderer.clear();
  renderer.render(scene, camera);
  if ((state === 'play' || state === 'crash') && vm) {
    renderer.clearDepth();
    renderer.render(vmScene, vmCam);
  }
  adapt(dt);
}

// Если телефон не тянет — снижаем разрешение, потом тени
function adapt(dt) {
  if (state !== 'play') return;
  perf.acc += dt; perf.n++;
  if (perf.n < 120) return;
  const avg = perf.acc / perf.n;
  perf.acc = 0; perf.n = 0;
  if (avg > 0.021 && quality.dpr > 0.9) {
    quality.dpr = Math.max(0.85, quality.dpr - 0.25);
    renderer.setPixelRatio(quality.dpr); resize();
  } else if (avg > 0.021 && world.sun.shadow.mapSize.x > 512) {
    world.sun.shadow.mapSize.set(512, 512);
    world.sun.shadow.map?.dispose(); world.sun.shadow.map = null;
  }
  if (Q.has('perf')) document.title = `${(1 / avg).toFixed(0)} fps · ${renderer.info.render.calls} dc · dpr ${quality.dpr}`;
}

// ---------------------------------------------------------------- UI
$('go').addEventListener('click', async () => {
  AU.init();
  try {
    if (isTouch && !document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
  } catch (e) { /* не дали — играем как есть */ }
  newRun();
});
$('creditsBtn').addEventListener('click', () => $('credits').classList.remove('hidden'));
$('creditsClose').addEventListener('click', () => $('credits').classList.add('hidden'));
$('again').addEventListener('click', newRun);
$('toMenu').addEventListener('click', toMenu);
$('pause').addEventListener('click', () => { if (state === 'play' || state === 'crash') { run.prev = state; state = 'paused'; $('paused').classList.remove('hidden'); AU.engine(0, 1, 0); } });
$('resume').addEventListener('click', () => { state = run.prev || 'play'; $('paused').classList.add('hidden'); last = performance.now(); });
$('quit').addEventListener('click', toMenu);
addEventListener('keydown', e => { const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (n >= 0) useCard(n); if (e.code === 'Escape') $('pause').click(); if (e.code === 'Enter' && state === 'menu') $('go').click(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !Q.has('nopause')) $('pause').click(); });

// ---------------------------------------------------------------- старт
(async () => {
  await Promise.race([CARDS.loadFrames().then(() => cardBar.redraw()), new Promise(ok => setTimeout(ok, 5000))]);
  await A.loadAll(f => { $('loading').querySelector('i').style.width = (f * 100).toFixed(0) + '%'; });
  buildCards();
  toMenu();
  window.__booted = true; clearTimeout(window.__bootWatch);
  $('loading').classList.add('hidden');
  if (Q.has('play') || Q.has('auto')) newRun();
  window.game = { p, run, world, renderer, input, crash, newRun, scene, camera, cardBar, useCard, get state() { return state; } };
  nextFrame(frame);
})();
