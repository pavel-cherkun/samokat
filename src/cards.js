// Карты-способности из «Курьера»: жёлтая, фиолетовая, оранжевая — по цветам трёх кикшерингов.
// Тройка по смыслу: время (жёлтая), скорость (фиолетовая), защита (оранжевая).
// Подбираются на дороге: карта висит над асфальтом, крутится и светится. В HUD три слота:
// нет карты — полупрозрачная и тусклая, есть — яркая с ореолом, работает — горит и тает полоска.
import * as THREE from 'three';

export const DEFS = [
  { id: 'yellow', name: 'Правка карты', fx: 'Мы уже посчитали: 5 с мир вдвое медленнее, а ты — нет', col: '#FFE600', dur: 5, file: '03_yellow' },
  { id: 'violet', name: 'Обменник', fx: 'Ваш заряд 100%! Рывок на 3 с, очки ×2', col: '#B23CF0', dur: 3, file: '05_violet' },
  { id: 'orange', name: 'Идут работы', fx: 'Куда прёшь? 8 с всё отскакивает, как от забора', col: '#FF5A00', dur: 8, file: '06_orange' },
];
export const byId = Object.fromEntries(DEFS.map(d => [d.id, d]));

// окно арта в исходной рамке 122×166 (из «Курьера», world/hotbar.js)
const ART = { yellow: [21, 12, 101, 90], violet: [19, 20, 104, 80], orange: [17, 21, 100, 81] };

// пиксельные значки 16×16 — те же, что в «Курьере»
function drawIcon(id, g, ox, oy, k) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(ox + x * k, oy + y * k, w * k, h * k); };
  const stroke = (rects, col, out) => { for (const [x, y, w, h] of rects) P(x - 1, y - 1, w + 2, h + 2, out); for (const [x, y, w, h] of rects) P(x, y, w, h, col); };
  if (id === 'yellow') { const o = '#0B0B0A'; stroke([[2, 12, 3, 3], [4, 10, 3, 3], [6, 9, 3, 3], [8, 8, 3, 3], [8, 6, 3, 3], [9, 4, 3, 3]], '#FFE600', o); stroke([[11, 1, 3, 2], [12, 3, 3, 2], [9, 1, 2, 2]], '#C6FF00', o); P(2, 12, 1, 1, '#FF2BD6'); P(13, 13, 2, 2, '#FFE600'); }
  if (id === 'violet') { const o = '#1C0752'; stroke([[3, 4, 10, 10], [6, 2, 4, 2]], '#D9C6FF', o); P(4, 5, 8, 8, '#481173'); for (let y = 0; y < 3; y++) P(5, 10 - y * 2, 6, 1, y < 2 ? '#B23CF0' : '#FFFFFF'); P(7, 5, 2, 2, '#FFFFFF'); }
  if (id === 'orange') {
    for (let y = 2; y < 13; y++) { const hw = 1 + Math.floor((y - 2) * 0.45); P(8 - hw - 1, y, hw * 2 + 2, 1, '#2B2D31'); }
    for (let y = 2; y < 13; y++) { const hw = 1 + Math.floor((y - 2) * 0.45); P(8 - hw, y, hw * 2, 1, (y === 6 || y === 7 || y === 10) ? '#ECECEA' : '#FF5A00'); }
    P(2, 13, 12, 2, '#2B2D31'); P(3, 13, 10, 1, '#FF8A3D');
  }
}

const frames = {};
export function loadFrames() {
  return Promise.all(DEFS.map(d => new Promise(ok => {
    const im = new Image();
    im.onload = () => { frames[d.id] = im; ok(); };
    im.onerror = () => ok();          // без рамки нарисуем плашку цветом карты
    im.src = 'assets/cards/' + d.file + '.png';
  })));
}

/** Карта целиком: рамка + крупный значок в окне арта. 122×166, пиксельно. */
export function cardCanvas(id) {
  const d = byId[id], c = document.createElement('canvas');
  c.width = 122; c.height = 166;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  if (frames[id]) g.drawImage(frames[id], 0, 0);
  else { g.fillStyle = '#0b0b0e'; g.fillRect(4, 4, 114, 158); g.fillStyle = d.col; g.fillRect(8, 8, 106, 150); }
  const [x0, y0, x1, y1] = ART[id], k = Math.floor(Math.min(x1 - x0, y1 - y0) * 0.8 / 16);
  drawIcon(id, g, Math.round((x0 + x1) / 2 - 8 * k), Math.round((y0 + y1) / 2 - 8 * k), k);
  return c;
}

// ---------------------------------------------------------------- карта на дороге
let haloTex = null;
function halo() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}
const cardTex = {};
function texOf(id) {
  if (cardTex[id]) return cardTex[id];
  const t = new THREE.CanvasTexture(cardCanvas(id));
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return (cardTex[id] = t);
}
const cardGeo = new THREE.PlaneGeometry(0.68, 0.92);

export class Pickup {
  constructor(parent, d) {
    this.kind = 'card'; this.id = d.id; this.s = d.s; this.x = d.x; this.colliders = [];
    this.taken = false; this.t = Math.random() * 6; this.k = 1;
    const def = byId[d.id];
    const g = new THREE.Group(); g.position.set(d.x, 0, -d.s);
    const card = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: texOf(d.id), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false }));
    card.position.y = 1.15;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), color: def.col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, toneMapped: false }));
    glow.scale.set(2.1, 2.3, 1); glow.position.y = 1.15;
    // пятно света на асфальте — карту видно издалека и понятно, где она по полосе
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ map: halo(), color: def.col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6, toneMapped: false }));
    spot.rotation.x = -Math.PI / 2; spot.position.y = 0.03;
    g.add(glow, card, spot);
    parent.add(g);
    Object.assign(this, { group: g, card, glow, spot });
  }
  update(dt) {
    this.t += dt;
    if (this.taken) {
      // взяли: карта взлетает к игроку и тает
      this.k -= dt * 4;
      this.card.position.y += dt * 3; this.card.scale.setScalar(1 + (1 - this.k) * 0.6);
      this.card.material.opacity = this.glow.material.opacity = Math.max(0, this.k);
      this.spot.visible = false;
      if (this.k <= 0) this.group.visible = false;
      return;
    }
    this.card.rotation.y = this.t * 1.6;
    const b = Math.sin(this.t * 2.6) * 0.09;
    this.card.position.y = this.glow.position.y = 1.15 + b;
    this.glow.material.opacity = 0.65 + Math.sin(this.t * 5) * 0.2;
  }
}

// ---------------------------------------------------------------- три слота в HUD
export class CardBar {
  constructor(el, onUse) {
    this.slots = DEFS.map((d, i) => {
      const b = document.createElement('button');
      b.className = 'cslot off'; b.style.setProperty('--c', d.col);
      b.setAttribute('aria-label', d.name);
      const c = cardCanvas(d.id); b.appendChild(c);
      const bar = document.createElement('i'); b.appendChild(bar);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onUse(i); });
      el.appendChild(b);
      return { d, b, bar, have: false, act: 0 };
    });
  }
  /** перерисовать после ресайза рамок (рамки грузятся асинхронно) */
  redraw() { for (const s of this.slots) s.b.replaceChild(cardCanvas(s.d.id), s.b.querySelector('canvas')); }
  sync() {
    for (const s of this.slots) {
      const cls = s.act > 0 ? 'cslot act' : s.have ? 'cslot have' : 'cslot off';
      if (s.b.className !== cls) s.b.className = cls;
      s.bar.style.transform = `scaleX(${s.act > 0 ? (s.act / s.d.dur).toFixed(3) : 0})`;
    }
  }
}
