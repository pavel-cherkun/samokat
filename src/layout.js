// Раскладка улицы — чистые данные, без THREE. Бесконечный трек режется на куски по L метров.
// Ось: едем вдоль s (дистанция), x — поперёк, +x справа. В мире z = -s.

export const L = 60;

export const ROAD = {
  curb: 7.0,        // кромка тротуара
  front: 12.6,      // линия фасадов
  walkH: 0.15,      // высота тротуара
  parkX: 6.05,      // ось припаркованных машин
  bike0: 3.4, bike1: 5.0,   // велополоса справа
  laneSame: 1.7, laneOpp: -1.7,
};

// Перекрёсток (локальные s внутри куска): поперечная улица и зебра перед ней
export const CROSS = { s0: 23, s1: 37, walk0: 15, walk1: 45, zebra0: 16, zebra1: 20.5 };

export const isCross = i => i >= 2 && i % 3 === 2;

// Есть ли бордюр в этой точке: на зебре и на поперечной улице он опущен
export function curbAt(s) {
  const i = Math.floor(s / L), ls = s - i * L;
  if (!isCross(i)) return true;
  if (ls >= CROSS.zebra0 && ls <= CROSS.zebra1) return false;
  return !(ls > CROSS.s0 && ls < CROSS.s1);
}

// Летняя палитра фасадов: персик, сливочный, мята, терракота, небесный, белый, лаванда
export const WALLS = ['#ffcfa3', '#ffe6a6', '#bfe8cf', '#f3a27e', '#a9d6f5', '#fbf3e6', '#d9c6f0', '#ffb8b8', '#f7d27a', '#9ed9c8'];
export const AWNINGS = ['#e8443a', '#2f8fd8', '#26a65b', '#ff8a1f', '#7a4fd0', '#e0457b'];
export const SIGNS = ['#ff5a36', '#1d1a2b', '#2f8fd8', '#26a65b', '#ffd23f', '#e0457b'];
export const GLB_BUILDINGS = ['white_shop', 'commercial', 'diner', 'tienda', 'khrush', 'spalny'];

export function rngFor(i, seed) {
  let a = (Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(seed + 7, 0x85EBCA6B)) >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Описание куска i. difficulty 0..1 растёт с дистанцией.
 * Все s в описании — абсолютные (метры от старта).
 */
export function genChunk(i, seed, difficulty) {
  const r = rngFor(i, seed);
  const R = (a, b) => a + r() * (b - a);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const s0 = i * L;
  const cross = isCross(i);
  const quiet = i < 2;                         // первые 120 м — разогнаться и понять руль
  const d = difficulty;

  const out = {
    i, s0, cross,
    buildings: [], trees: [], lamps: [], props: [], parked: [], cafes: [],
    cones: [], manholes: [], puddles: [], pigeons: [], walkers: [], grannies: [], dogs: [], zebraWalkers: [],
  };

  // Где на тротуаре нельзя ставить мебель: зебра и поперечная улица
  const freeWalk = ls => !cross || ls < CROSS.walk0 - 1 || ls > CROSS.walk1 + 1;
  const freeRoad = ls => !cross || ls < CROSS.zebra0 - 2 || ls > CROSS.s1 + 2;

  // --- Здания: улица — не коридор. Разные отступы, высоты, просветы-дворы.
  const spans = cross ? [[0, CROSS.walk0], [CROSS.walk1, L]] : [[0, L]];
  for (const side of [-1, 1]) {
    for (const [a, b] of spans) {
      let s = a;
      while (s < b - 3) {
        let w = Math.min(R(8, 16), b - s);
        if (b - s - w < 5) w = b - s;          // не оставлять огрызков
        if (!cross && r() < 0.12 && w > 9) {    // двор: пускает солнце на улицу и даёт глубину
          out.trees.push({ x: side * (ROAD.front + 2.5), s: s0 + s + 3, big: true });
          s += 6; continue;
        }
        const glb = r() < 0.15 && w >= 9 ? pick(GLB_BUILDINGS) : null;
        out.buildings.push({
          side, s: s0 + s, w,
          setback: r() < 0.35 ? R(0.4, 1.6) : 0,
          floors: glb ? 0 : Math.floor(R(2, 6.99)),
          wall: pick(WALLS),
          shop: r() < 0.75,
          sign: pick(SIGNS),
          awning: r() < 0.6 ? pick(AWNINGS) : null,
          roofBox: r() < 0.5,
          glb,
        });
        s += w;
      }
    }
    // фоновые массы за кварталом — третий план, чтобы даль не была картонкой
    out.buildings.push({ side, s: s0 + R(0, 30), w: R(18, 30), back: true, floors: Math.floor(R(7, 12)), wall: pick(WALLS) });
  }

  // --- Деревья, фонари, мелочь на тротуаре
  for (const side of [-1, 1]) {
    for (let s = R(2, 6); s < L; s += R(8, 11)) if (freeWalk(s)) out.trees.push({ x: side * 8.1, s: s0 + s });
    for (let s = 14; s < L; s += 30) if (freeWalk(s)) out.lamps.push({ x: side * 7.45, s: s0 + s, side });
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const s = R(2, L - 2);
      if (!freeWalk(s)) continue;
      if (out.trees.some(t => Math.abs(t.s - s0 - s) < 1.6 && Math.sign(t.x) === side)) continue;
      out.props.push({ kind: pick(['hydrant', 'trash', 'box', 'trash']), x: side * R(7.5, 7.9), s: s0 + s, side });
    }
    if (!quiet && r() < 0.35) {
      const s = R(4, L - 8);
      if (freeWalk(s) && freeWalk(s + 4)) out.cafes.push({ x: side * 10.9, s: s0 + s, side, kind: r() < 0.4 ? 'icecream' : 'cafe' });
    }
  }

  // --- Припаркованные машины, справа иногда открывают дверь прямо в велополосу
  for (const side of [-1, 1]) {
    for (let s = 3; s < L - 3; s += 6.2) {
      if (!freeRoad(s) || !freeRoad(s + 3)) continue;
      if (r() < 0.5) continue;
      out.parked.push({
        x: side * ROAD.parkX, s: s0 + s + 2.5, side, model: r() < 0.55 ? 'tiggo8' : 'mustang',
        door: !quiet && side > 0 && r() < 0.12 + 0.18 * d,
      });
    }
  }

  if (quiet) {
    out.pigeons.push({ x: 4.2, s: s0 + 70 - 30 + 8, n: 6 });
    return out;
  }

  // --- Опасности на проезжей части. Плотность растёт с дистанцией.
  const used = [];
  const free = (x, s, rad) => used.every(u => Math.hypot(u.x - x, u.s - s) > u.r + rad + 1.2);
  const take = (x, s, rad) => used.push({ x, s, r: rad });

  const nCones = Math.floor(R(0.7, 2.3 + 1.5 * d));
  for (let k = 0; k < nCones; k++) {
    const s = R(4, L - 6); if (!freeRoad(s)) continue;
    const x = R(1.0, 5.0);
    if (!free(x, s, 2)) continue;
    take(x, s, 2);
    const roadworks = r() < 0.4;
    if (roadworks) {               // открытый люк, обставленный конусами: видно издалека
      out.manholes.push({ x, s: s0 + s, open: true });
      for (let a = 0; a < 4; a++) out.cones.push({ x: x + Math.cos(a * Math.PI / 2 + 0.6) * 1.1, s: s0 + s + Math.sin(a * Math.PI / 2 + 0.6) * 1.1 });
    } else {
      const m = 2 + Math.floor(r() * 3), dx = r() < 0.5 ? 0 : (r() - 0.5) * 1.2;
      for (let a = 0; a < m; a++) out.cones.push({ x: x + dx * a, s: s0 + s + a * 1.6 });
    }
  }
  for (let k = 0; k < 2; k++) {
    const s = R(3, L - 3), x = R(-5.5, 5.5);
    if (!freeRoad(s) || !free(x, s, 0.8)) continue;
    take(x, s, 0.8);
    // открытый люк без ограждения — редкая подлость
    out.manholes.push({ x, s: s0 + s, open: r() < 0.08 + 0.12 * d && x > 0 });
  }
  const nPud = Math.floor(R(0, 2.5));
  for (let k = 0; k < nPud; k++) {
    const s = R(3, L - 3), x = R(-4, 6.2);
    const rx = R(0.9, 1.8);
    if (!free(x, s, rx)) continue;
    take(x, s, rx);
    out.puddles.push({ x, s: s0 + s, rx, rz: R(1.2, 2.4), rot: R(-0.4, 0.4) });
  }
  if (r() < 0.55) {
    const s = R(4, L - 4), x = R(-3, 10.5);
    if (free(x, s, 1.5)) { take(x, s, 1.5); out.pigeons.push({ x, s: s0 + s, n: 4 + Math.floor(r() * 6) }); }
  }

  // --- Люди: гуляют по тротуарам, бабушки, собаки, переходят на зебре
  for (const side of [-1, 1]) {
    const n = Math.floor(R(1, 3 + 2 * d));
    for (let k = 0; k < n; k++) {
      const s = R(0, L);
      if (!freeWalk(s)) continue;
      out.walkers.push({ x: side * R(9, 11.8), s: s0 + s, dir: r() < 0.5 ? 1 : -1, speed: R(1.1, 1.6), look: Math.floor(r() * 6) });
    }
  }
  if (r() < 0.5 + 0.3 * d) {
    const s = R(5, L - 5);
    const jay = r() < 0.5 && freeRoad(s);          // бабушка переходит, где ей удобно
    out.grannies.push({ x: (r() < 0.5 ? -1 : 1) * R(8.5, 10.5), s: s0 + s, jay });
  }
  if (r() < 0.3 + 0.35 * d) {
    const s = R(8, L - 8);
    if (freeRoad(s)) out.dogs.push({ x: (r() < 0.5 ? -1 : 1) * 9.5, s: s0 + s, color: pick(['#c98a4b', '#3b3030', '#f2e6d0', '#8a6a4a']) });
  }
  if (cross) {
    const n = 1 + Math.floor(r() * (2 + 2 * d));
    for (let k = 0; k < n; k++) {
      const side = r() < 0.5 ? -1 : 1;
      out.zebraWalkers.push({ x: side * R(8, 11), s: s0 + R(CROSS.zebra0 + 0.6, CROSS.zebra1 - 0.6), dir: -side, delay: R(0, 2.5), look: Math.floor(r() * 6), granny: r() < 0.25 });
    }
  }
  return out;
}
