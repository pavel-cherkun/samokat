// Процедурные модели: самокаты, руки, люди, бабушки, собаки, голуби, конусы, деревья, кафе.
// Статичное сливается в одну геометрию с вертекс-цветами — один вызов отрисовки на кусок улицы.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Часть статичной геометрии: копия + цвет + трансформ. Всё неиндексированное, только position/normal/color. */
export function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  _c.set(color);
  // лёгкий разброс оттенка, чтобы не было пластика
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export const merge = parts => mergeGeometries(parts.filter(Boolean), false);

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 12),
  sph: new THREE.SphereGeometry(1, 12, 8),
  ico: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  cap: new THREE.CapsuleGeometry(1, 1, 3, 8).scale(1, 1 / 3, 1),   // высота 1, радиус 1
};

export const MAT = {
  vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
};

// --------------------------------------------------------------------------------------------
// Самокаты. Раскраски как у кикшерингов, без брендов.
export const SCOOTERS = [
  {
    id: 'yellow', name: 'Жёлтый', nick: 'Шмель', main: '#ffc714', accent: '#1d1a2b', deck: '#2b2a30', hub: '#1d1a2b',
    about: 'Середнячок. Едет ровно, слушается руля, прощает ошибки.',
    speed: 10.5, accel: 3.4, handling: 1.0,
  },
  {
    id: 'violet', name: 'Фиолетовый', nick: 'Слива', main: '#7c3fe6', accent: '#f4f0ff', deck: '#2b2a30', hub: '#d6c8ff',
    about: 'Вёрткий и резвый со старта, но медленнее на прямой.',
    speed: 9.3, accel: 4.4, handling: 1.3,
  },
  {
    id: 'tiger', name: 'Оранжево-чёрный', nick: 'Тигр', main: '#1e1e24', accent: '#ff6a13', deck: '#1e1e24', hub: '#ff6a13',
    about: 'Самый быстрый. Разгоняется долго, в поворот входит тяжело.',
    speed: 12.2, accel: 2.6, handling: 0.8,
  },
];

const mats = {};
function lam(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  return mats[key] || (mats[key] = new THREE.MeshLambertMaterial({ color, ...extra }));
}
function std(color, rough = 0.5, metal = 0) {
  const key = 's' + color + rough + metal;
  return mats[key] || (mats[key] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}
function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  return m;
}

/**
 * Самокат в метрах. Начало — земля под серединой деки, вперёд -z.
 * Возвращает { group, bar } — bar поворачивается рулём (ось — рулевая колонка).
 */
export function makeScooter(p) {
  const group = new THREE.Group();
  const main = std(p.main, 0.35), accent = std(p.accent, 0.4), deck = std(p.deck, 0.8), black = std('#141418', 0.7);
  const rubber = std('#18181b', 0.95), metal = std('#b9bcc4', 0.3, 0.8);
  const wheelR = 0.14;
  const wheel = (z) => {
    const w = new THREE.Group();
    const tire = mesh(new THREE.TorusGeometry(wheelR - 0.03, 0.035, 8, 20), rubber); tire.rotation.y = Math.PI / 2;
    const hub = mesh(G.cyl, std(p.hub, 0.4), 0, 0, 0, 0.085, 0.06, 0.085); hub.rotation.z = Math.PI / 2;
    w.add(tire, hub); w.position.set(0, wheelR, z);
    return w;
  };
  const fw = wheel(-0.62), rw = wheel(0.52);
  group.add(fw, rw);
  // дека: корпус, резиновый коврик, бортики в цвет
  group.add(mesh(G.box, main, 0, 0.17, -0.03, 0.26, 0.09, 1.0));
  group.add(mesh(G.box, deck, 0, 0.22, -0.03, 0.22, 0.012, 0.9));
  group.add(mesh(G.box, accent, 0, 0.15, -0.03, 0.265, 0.025, 0.92));
  // крылья
  const rf = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 12, 1, true, -0.2, 2.2), main, 0, wheelR, 0.52);
  rf.rotation.z = Math.PI / 2; rf.rotation.x = 0; rf.material = main; rf.material.side = THREE.DoubleSide;
  group.add(rf);
  group.add(mesh(G.box, std('#ff2a2a', 0.3), 0, 0.27, 0.66, 0.08, 0.03, 0.02)); // стоп
  // вилка и колонка: от передней оси вверх с наклоном к седоку
  const steer = new THREE.Group();
  steer.position.set(0, wheelR, -0.62);
  steer.rotation.x = 0.24;           // колонка заваливается назад, к седоку
  group.add(steer);
  steer.add(mesh(G.box, black, 0, 0.12, 0, 0.12, 0.24, 0.05));
  steer.add(mesh(G.cyl, main, 0, 0.55, 0, 0.042, 0.84, 0.042));
  // «лопата» шеринга — панель на колонке, по ней узнают сервис
  steer.add(mesh(G.box, main, 0, 0.5, -0.03, 0.12, 0.5, 0.05));
  steer.add(mesh(G.box, accent, 0, 0.52, -0.058, 0.08, 0.36, 0.01));
  // фара
  const lamp = mesh(G.cyl, std('#fffbe6', 0.2), 0, 0.84, -0.05, 0.035, 0.02, 0.035);
  lamp.rotation.x = Math.PI / 2; lamp.material = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4c8', emissiveIntensity: 1.2 });
  steer.add(lamp);
  // руль на вершине колонки
  const bar = new THREE.Group();
  bar.position.set(0, 0.98, 0);
  steer.add(bar);
  const tube = mesh(G.cyl, black, 0, 0, 0, 0.016, 0.6, 0.016); tube.rotation.z = Math.PI / 2; bar.add(tube);
  for (const sx of [-1, 1]) {
    const g = mesh(G.cyl, rubber, sx * 0.25, 0, 0, 0.022, 0.12, 0.022); g.rotation.z = Math.PI / 2; bar.add(g);
    const end = mesh(G.cyl, accent, sx * 0.315, 0, 0, 0.024, 0.012, 0.024); end.rotation.z = Math.PI / 2; bar.add(end);
    const lever = mesh(G.box, metal, sx * 0.22, -0.01, -0.06, 0.12, 0.012, 0.02); lever.rotation.y = sx * 0.25; bar.add(lever);
  }
  // корпус с дисплеем
  bar.add(mesh(G.box, main, 0, 0.025, 0.0, 0.16, 0.06, 0.09));
  const dispTex = TX.display('0');
  const disp = mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false }), 0, 0.058, 0.01);
  disp.rotation.x = -Math.PI / 2 + 0.5; bar.add(disp);
  // звонок
  bar.add(mesh(G.sph, metal, -0.13, 0.02, -0.02, 0.025, 0.018, 0.025));
  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group, bar, steer, fw, rw, dispTex };
}

// Руки в перчатках-без-пальцев: загорелые, летние. Кисть сидит на ручке, предплечье тянется к локтю.
const SKIN = '#e3a27c';
export function makeHand(side) {
  const g = new THREE.Group();
  const skin = lam(SKIN), glove = lam('#26252b'), band = lam(side < 0 ? '#ff5a36' : '#ffd23f');
  // кулак вокруг ручки
  g.add(mesh(G.sph, glove, 0, 0.012, 0.004, 0.06, 0.042, 0.05));
  // костяшки — четыре пальца поверх ручки, загибаются вперёд-вниз
  for (let k = 0; k < 4; k++) {
    const f = mesh(G.cap, skin, side * (-0.03 + k * 0.021) * -1, 0.02, -0.03, 0.0115, 0.06, 0.0115);
    f.rotation.x = 1.25; g.add(f);
    const tip = mesh(G.sph, skin, side * (-0.03 + k * 0.021) * -1, -0.008, -0.034, 0.012, 0.012, 0.012); g.add(tip);
  }
  // большой палец сверху сзади
  const th = mesh(G.cap, skin, side * 0.035, 0.032, 0.02, 0.012, 0.07, 0.012); th.rotation.set(0.6, 0, side * 1.1); g.add(th);
  // запястье + браслет
  const wrist = new THREE.Group(); wrist.position.set(side * -0.04, 0.0, 0.03); g.add(wrist);
  return { group: g, wrist, skin, band };
}

export function makeForearm(skinMat, bandMat) {
  const g = new THREE.Group();
  const arm = mesh(G.cap, skinMat, 0, 0, 0.5, 1, 1, 1);  // ось капсулы — y, повернём
  arm.scale.set(0.038, 0.36, 0.034); arm.rotation.x = Math.PI / 2; arm.position.set(0, 0, 0.17);
  g.add(arm);
  const b = mesh(G.cyl, bandMat, 0, 0, 0.035, 0.044, 0.03, 0.041); b.rotation.x = Math.PI / 2; g.add(b);
  return g;
}

// --------------------------------------------------------------------------------------------
// Конус: оранжевый с белой полосой и квадратным основанием. Один меш.
let coneGeo;
export function coneGeometry() {
  if (coneGeo) return coneGeo;
  coneGeo = merge([
    part(G.box, '#ff6a1a', 0, 0.02, 0, 0, 0, 0, 0.42, 0.04, 0.42),
    part(new THREE.CylinderGeometry(0.03, 0.16, 0.66, 12), '#ff6a1a', 0, 0.37, 0),
    part(new THREE.CylinderGeometry(0.075, 0.105, 0.14, 12), '#ffffff', 0, 0.42, 0),
  ]);
  return coneGeo;
}

// Дерево: ствол + несколько глыб кроны. Разные зелени, летние.
const GREENS = ['#5cb85c', '#4caf50', '#79c25a', '#3f9e4a', '#8fcf5e'];
export function treeParts(x, z, big, r) {
  const k = big ? 1.5 : 0.85 + r() * 0.35;
  const h = 2.4 * k;
  const parts = [part(G.cyl6, '#7a5236', x, h / 2, z, 0, 0, 0, 0.13 * k, h, 0.13 * k)];
  // приствольная решётка
  if (!big) parts.push(part(G.box, '#5b5560', x, 0.155, z, 0, 0, 0, 1.2, 0.01, 1.2));
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 0.5 * k * r();
    const s = (0.9 + r() * 0.6) * k;
    parts.push(part(G.ico, GREENS[Math.floor(r() * GREENS.length)], x + Math.cos(a) * d, h + 0.6 * k + r() * 0.8 * k, z + Math.sin(a) * d, r(), r(), 0, s, s * 0.85, s));
  }
  return parts;
}

export function lampParts(x, z, side) {
  const pole = '#2f4a3e';
  return [
    part(G.cyl6, pole, x, 2.8, z, 0, 0, 0, 0.07, 5.6, 0.07),
    part(G.cyl6, pole, x, 0.35, z, 0, 0, 0, 0.13, 0.7, 0.13),
    part(G.box, pole, x - side * 0.6, 5.55, z, 0, 0, 0, 1.3, 0.06, 0.06),
    part(G.box, '#3a3d42', x - side * 1.2, 5.45, z, 0, 0, 0, 0.5, 0.12, 0.24),
    part(G.box, '#fff6d8', x - side * 1.2, 5.38, z, 0, 0, 0, 0.4, 0.02, 0.18),
  ];
}

export function trafficLightParts(x, z, side) {
  const pole = '#2b2b30';
  return [
    part(G.cyl6, pole, x, 1.9, z, 0, 0, 0, 0.07, 3.8, 0.07),
    part(G.box, pole, x, 3.4, z, 0, 0, 0, 0.3, 0.85, 0.25),
    part(G.sph, '#ff3b30', x, 3.68, z + 0.13, 0, 0, 0, 0.08, 0.08, 0.03),
    part(G.sph, '#5a4a20', x, 3.42, z + 0.13, 0, 0, 0, 0.08, 0.08, 0.03),
    part(G.sph, '#1f4a2a', x, 3.16, z + 0.13, 0, 0, 0, 0.08, 0.08, 0.03),
  ];
}

// Кафе на тротуаре: зонт, столик, два стула. Или тележка с мороженым.
export function cafeParts(x, z, kind, r) {
  const parts = [];
  if (kind === 'icecream') {
    parts.push(part(G.box, '#f7f2ea', x, 0.65, z, 0, 0, 0, 0.9, 0.7, 1.6));
    parts.push(part(G.box, '#7fd3ff', x, 0.62, z, 0, 0, 0, 0.92, 0.18, 1.62));
    parts.push(part(G.cyl, '#2b2b30', x - 0.46, 0.22, z - 0.55, 0, 0, Math.PI / 2, 0.22, 0.06, 0.22));
    parts.push(part(G.cyl, '#2b2b30', x - 0.46, 0.22, z + 0.55, 0, 0, Math.PI / 2, 0.22, 0.06, 0.22));
    parts.push(part(G.cyl6, '#dddddd', x, 1.6, z, 0, 0, 0, 0.03, 1.4, 0.03));
    parts.push(part(G.cone, '#ff6fa8', x, 2.35, z, 0, 0, 0, 1.0, 0.4, 1.0));
    parts.push(part(G.sph, '#ffe6f0', x, 1.06, z - 0.3, 0, 0, 0, 0.13));
    parts.push(part(G.sph, '#8a5a3c', x, 1.06, z + 0.0, 0, 0, 0, 0.13));
    parts.push(part(G.sph, '#b6f0c2', x, 1.06, z + 0.3, 0, 0, 0, 0.13));
    return parts;
  }
  const col = ['#e8443a', '#2f8fd8', '#26a65b', '#ff8a1f'][Math.floor(r() * 4)];
  for (let k = 0; k < 2; k++) {
    const zz = z + k * 2.6;
    parts.push(part(G.cyl6, '#e9e4dc', x, 1.2, zz, 0, 0, 0, 0.03, 2.4, 0.03));
    parts.push(part(new THREE.ConeGeometry(1.25, 0.45, 8), col, x, 2.3, zz));
    parts.push(part(G.cyl, '#f4efe6', x, 0.72, zz, 0, 0, 0, 0.36, 0.04, 0.36));
    parts.push(part(G.cyl6, '#555', x, 0.36, zz, 0, 0, 0, 0.03, 0.72, 0.03));
    for (const dz of [-0.55, 0.55]) {
      parts.push(part(G.box, '#c8a26a', x, 0.45, zz + dz, 0, 0, 0, 0.38, 0.05, 0.38));
      parts.push(part(G.box, '#c8a26a', x, 0.7, zz + dz + Math.sign(dz) * 0.18, 0, 0, 0, 0.38, 0.45, 0.04));
    }
  }
  return parts;
}

// --------------------------------------------------------------------------------------------
// Люди. Голова, тело, руки — одним мешем; ноги отдельно, чтобы шагать.
const SKINS = ['#f1c7a5', '#e3a27c', '#c98a62', '#8d5a3c', '#f6d7bd'];
const SHIRTS = ['#ff5a36', '#2f8fd8', '#ffd23f', '#26a65b', '#ffffff', '#e0457b', '#7c3fe6', '#ff9f1c'];
const PANTS = ['#2d3e5c', '#e9e1cf', '#3a3a3a', '#6b8f71', '#c9a46c'];
const HAIR = ['#2a1d16', '#5a3a22', '#c8a060', '#111', '#a0522d'];

export function makePerson(look = 0, granny = false) {
  const g = new THREE.Group();
  const skin = SKINS[look % SKINS.length];
  const parts = [];
  let hipY = 0.92;
  if (granny) {
    hipY = 0.7;
    const coat = ['#8e6bbf', '#c0504d', '#5a7d9a', '#7a8b52'][look % 4];
    parts.push(part(new THREE.CylinderGeometry(0.17, 0.27, 0.75, 10), coat, 0, 0.72, 0));          // платье-пальто
    parts.push(part(G.sph, coat, 0, 1.12, 0.02, 0, 0, 0, 0.21, 0.2, 0.19));                          // плечи, сутулые
    parts.push(part(G.sph, skin, 0, 1.36, -0.05, 0, 0, 0, 0.11));                                   // голова
    parts.push(part(G.sph, ['#e7e3f2', '#ff8fb1', '#fff3a8'][look % 3], 0, 1.4, -0.03, 0, 0, 0, 0.125, 0.11, 0.125)); // платок
    parts.push(part(G.box, '#3a2a20', 0.25, 0.8, 0, 0, 0, 0, 0.18, 0.2, 0.08));                     // сумка
    parts.push(part(G.cyl6, '#6b4a2a', -0.22, 0.45, -0.12, 0.15, 0, 0, 0.015, 0.9, 0.015));          // палочка
    parts.push(part(G.cap, coat, 0.2, 1.0, -0.02, 0.2, 0, 0.15, 0.05, 0.5, 0.05));
    parts.push(part(G.cap, coat, -0.2, 1.0, -0.08, 0.5, 0, -0.15, 0.05, 0.5, 0.05));
  } else {
    const shirt = SHIRTS[(look * 3) % SHIRTS.length];
    parts.push(part(G.cap, shirt, 0, 1.24, 0, 0, 0, 0, 0.19, 0.62, 0.13));                           // торс
    parts.push(part(G.sph, skin, 0, 1.62, 0, 0, 0, 0, 0.115));                                       // голова
    parts.push(part(G.sph, HAIR[look % HAIR.length], 0, 1.66, 0.02, 0, 0, 0, 0.12, 0.09, 0.12));    // волосы
    if (look % 3 === 0) parts.push(part(G.box, '#111', 0, 1.63, -0.11, 0, 0, 0, 0.17, 0.035, 0.02)); // очки
    if (look % 4 === 1) parts.push(part(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), '#f3e2b0', 0, 1.73, 0)); // панама
    parts.push(part(G.cap, skin, 0.25, 1.16, 0, 0, 0, 0.08, 0.05, 0.58, 0.05));
    parts.push(part(G.cap, skin, -0.25, 1.16, 0, 0, 0, -0.08, 0.05, 0.58, 0.05));
    parts.push(part(G.cap, shirt, 0.24, 1.38, 0, 0, 0, 0.08, 0.07, 0.22, 0.07));
    parts.push(part(G.cap, shirt, -0.24, 1.38, 0, 0, 0, -0.08, 0.07, 0.22, 0.07));
  }
  const body = new THREE.Mesh(merge(parts), MAT.vc);
  body.castShadow = true;
  g.add(body);
  const legCol = granny ? '#e8d8c8' : PANTS[look % PANTS.length];
  const legGeo = merge([
    part(G.cap, legCol, 0, -hipY / 2 + 0.04, 0, 0, 0, 0, 0.075, hipY, 0.075),
    part(G.box, granny ? '#4a3a30' : '#f4f4f4', 0, -hipY + 0.05, -0.05, 0, 0, 0, 0.11, 0.09, 0.24),
  ]);
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, MAT.vc);
    leg.position.set(sx * 0.1, hipY, 0);
    leg.castShadow = true;
    g.add(leg); legs.push(leg);
  }
  g.userData.legs = legs;
  return g;
}

export function makeDog(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(merge([
    part(G.cap, color, 0, 0.42, 0, Math.PI / 2, 0, 0, 0.14, 0.8, 0.14),
    part(G.sph, color, 0, 0.6, -0.36, 0, 0, 0, 0.14, 0.13, 0.15),
    part(G.box, color, 0, 0.56, -0.5, 0, 0, 0, 0.12, 0.09, 0.14),
    part(G.sph, '#111', 0, 0.58, -0.58, 0, 0, 0, 0.03),
    part(G.box, '#3a2a20', 0.09, 0.73, -0.33, 0, 0, 0.3, 0.05, 0.1, 0.06),
    part(G.box, '#3a2a20', -0.09, 0.73, -0.33, 0, 0, -0.3, 0.05, 0.1, 0.06),
    part(G.cyl6, '#e8443a', 0, 0.55, -0.27, 0.3, 0, 0, 0.11, 0.03, 0.11),
  ]), MAT.vc);
  body.castShadow = true;
  g.add(body);
  const tail = new THREE.Mesh(merge([part(G.cap, color, 0, 0.14, 0, 0, 0, 0, 0.03, 0.3, 0.03)]), MAT.vc);
  tail.position.set(0, 0.5, 0.36); tail.rotation.x = -0.7; g.add(tail);
  const legGeo = merge([part(G.box, color, 0, -0.15, 0, 0, 0, 0, 0.07, 0.3, 0.07)]);
  const legs = [];
  for (const [x, z] of [[-0.08, -0.22], [0.08, -0.22], [-0.08, 0.22], [0.08, 0.22]]) {
    const l = new THREE.Mesh(legGeo, MAT.vc); l.position.set(x, 0.32, z); g.add(l); legs.push(l);
  }
  g.userData = { legs, tail };
  return g;
}

let pigeonGeo, wingGeo;
export function makePigeon() {
  if (!pigeonGeo) {
    pigeonGeo = merge([
      part(G.sph, '#8d93a0', 0, 0.12, 0, 0, 0, 0, 0.07, 0.07, 0.12),
      part(G.sph, '#5d6a78', 0, 0.2, -0.09, 0, 0, 0, 0.045),
      part(G.sph, '#6fa58a', 0, 0.16, -0.07, 0, 0, 0, 0.05, 0.04, 0.04),
      part(G.cone, '#d9a36a', 0, 0.2, -0.14, -Math.PI / 2, 0, 0, 0.012, 0.03, 0.012),
      part(G.box, '#5d6a78', 0, 0.12, 0.13, 0, 0, 0, 0.08, 0.02, 0.1),
    ]);
    wingGeo = merge([part(G.box, '#a8aebb', 0.11, 0, 0, 0, 0, 0, 0.22, 0.015, 0.12)]);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(pigeonGeo, MAT.vc));
  const wl = new THREE.Mesh(wingGeo, MAT.vc), wr = new THREE.Mesh(wingGeo, MAT.vc);
  wl.position.set(0.03, 0.15, 0); wr.position.set(-0.03, 0.15, 0); wr.scale.x = -1;
  wl.visible = wr.visible = false;
  g.add(wl, wr);
  g.userData = { wl, wr };
  return g;
}

// Дверь машины: панель со стеклом, петля спереди
export function makeDoor(color = '#d9dde3') {
  const g = new THREE.Group();
  const m = new THREE.Mesh(merge([
    part(G.box, color, 0, 0.75, 0.55, 0, 0, 0, 0.08, 0.7, 1.1),
    part(G.box, '#2a3442', 0, 1.25, 0.55, 0, 0, 0, 0.06, 0.32, 0.95),
    part(G.box, '#222', 0, 0.85, 0.95, 0, 0, 0, 0.1, 0.04, 0.12),
  ]), MAT.vc);
  m.castShadow = true;
  g.add(m);
  return g;
}
