// Загрузка GLB (meshopt) и нормализация: центр по x/z, низ на y=0, нужный размер.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// size: {len} — длина по z, {width} — ширина по x, {height} — высота. rotY — развернуть «лицом» к -z / к улице.
export const MODELS = {
  tiggo8:   { url: 'assets/cars/tiggo8.glb', len: 4.6, rotY: Math.PI, bake: 'car' },
  mustang:  { url: 'assets/cars/mustang.glb', len: 4.7, rotY: 0, bake: 'car' },
  hydrant:  { url: 'assets/props/fire_hydrant.glb', height: 0.75, half: true, bake: true },
  trash:    { url: 'assets/props/metal_trash_can.glb', height: 0.95, half: true, bake: true },
  box:      { url: 'assets/props/utility_box_01.glb', height: 1.15, bake: true },
  aircon:   { url: 'assets/props/exterior_aircon_unit.glb', width: 0.85, half: true, bake: true },
  white_shop: { url: 'assets/buildings/white_shop.glb' },
  commercial: { url: 'assets/buildings/commercial.glb' },
  diner:      { url: 'assets/buildings/diner.glb' },
  tienda:     { url: 'assets/buildings/tienda.glb' },
  khrush:     { url: 'assets/buildings/khrush.glb' },
  spalny:     { url: 'assets/buildings/spalny.glb' },
};

const cache = {};
const baked = {};
const bakedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });

// Летние цвета машин: кузов перекрашиваем, всё остальное оставляем
const CAR_COLORS = ['#ff6b5a', '#ffd23f', '#5ec2ff', '#f7f4ee', '#7ad38c', '#ff9ec7', '#2d2d33', '#f2741c', '#b9a4ff'];

const _cv = document.createElement('canvas');
const _cg = _cv.getContext('2d', { willReadFrequently: true });
const pixCache = new Map();
function pixels(img) {
  if (pixCache.has(img)) return pixCache.get(img);
  const w = Math.min(256, img.width), h = Math.min(256, img.height);
  _cv.width = w; _cv.height = h;
  _cg.clearRect(0, 0, w, h); _cg.drawImage(img, 0, 0, w, h);
  const px = { w, h, d: _cg.getImageData(0, 0, w, h).data };
  pixCache.set(img, px);
  return px;
}
const isGlass = m => m.transparent || m.opacity < 1 || /glass|window|стекл/i.test(m.name || '');
// брендинг: значки марки целиком и яркие полосы из палитры (G-Drive у мустанга) — красим в цвет кузова
const isBadge = m => /badge|logo|decal|sticker/i.test(m.name || '');
const isPalette = m => /palette/i.test(m.name || '');
const _t = new THREE.Color();

function floatAttr(at) {
  // meshopt квантует вершины в int16 — переводим во float, иначе матрица их обрежет
  const n = at.itemSize, f = new Float32Array(at.count * n);
  for (let i = 0; i < at.count; i++) for (let k = 0; k < n; k++) f[i * n + k] = at.getComponent(i, k);
  return new THREE.BufferAttribute(f, n);
}

/** Сливает модель в одну геометрию с вертекс-цветами (цвет берём из текстуры в точке UV).
 *  1 вызов отрисовки вместо 16. Для машин — варианты окраски кузова. */
function bake(root, car) {
  root.updateMatrixWorld(true);
  const items = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', floatAttr(src.attributes.position));
    g.applyMatrix4(o.matrixWorld);
    const m = o.material, n = g.attributes.position.count;
    const col = new Float32Array(n * 3), brand = new Uint8Array(n);
    const glass = isGlass(m), badge = car && isBadge(m), pal = car && isPalette(m);
    const base = m.color || new THREE.Color(1, 1, 1);
    const uv = src.attributes.uv, img = m.map && m.map.image;
    const px = img && uv ? pixels(img) : null;
    const hsl = {};
    for (let i = 0; i < n; i++) {
      if (glass) _t.set('#25303d');
      else if (px) {
        let u = uv.getX(i) % 1, v = uv.getY(i) % 1; if (u < 0) u += 1; if (v < 0) v += 1;
        const x = Math.min(px.w - 1, Math.floor(u * px.w)), y = Math.min(px.h - 1, Math.floor(v * px.h));
        const j = (y * px.w + x) * 4;
        _t.setRGB(px.d[j] / 255, px.d[j + 1] / 255, px.d[j + 2] / 255, THREE.SRGBColorSpace).multiply(base);
      } else _t.copy(base);
      col[i * 3] = _t.r; col[i * 3 + 1] = _t.g; col[i * 3 + 2] = _t.b;
      if (badge) brand[i] = 1;
      else if (pal) { _t.getHSL(hsl); if (hsl.s > 0.35 && hsl.l > 0.12) brand[i] = 1; }
    }
    items.push({ g, col, brand, glass });
  });
  // кузов — самый частый цвет среди непрозрачных вершин
  const keyOf = (a, i) => (Math.round(a[i] * 15) << 8) | (Math.round(a[i + 1] * 15) << 4) | Math.round(a[i + 2] * 15);
  let body = null;
  if (car) {
    const hist = new Map();
    for (const it of items) if (!it.glass) for (let i = 0; i < it.col.length; i += 3) {
      const key = keyOf(it.col, i);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
    let best = 0;
    for (const [k, c] of hist) if (c > best) { best = c; body = k; }
  }
  // упрощённая геометрия: сглаженные нормали с изломом по рёбрам прячут грани
  const shape = toCreasedNormals(mergeGeometries(items.map(it => it.g), false), car ? 0.75 : 0.6);
  const colAll = new Float32Array(shape.attributes.position.count * 3), brandAll = new Uint8Array(colAll.length / 3);
  let off = 0;
  for (const it of items) { colAll.set(it.col, off * 3); brandAll.set(it.brand, off); off += it.brand.length; }
  // колёса: в палитре шины часто того же цвета, что кузов, — находим их по пятнам контакта и не красим
  const wheel = new Uint8Array(brandAll.length);
  if (car) {
    const P = shape.attributes.position, box = new THREE.Box3().setFromBufferAttribute(P);
    const hx = Math.max(-box.min.x, box.max.x), zs = [[], []];
    for (let v = 0; v < P.count; v++) if (P.getY(v) < 0.04) zs[P.getZ(v) < 0 ? 0 : 1].push(P.getZ(v));
    const r = 0.36;
    for (const g of zs) {
      if (!g.length) continue;
      const zc = g.reduce((a, b) => a + b, 0) / g.length;
      for (let v = 0; v < P.count; v++)
        if (Math.abs(P.getX(v)) > hx * 0.55 && Math.hypot(P.getY(v) - r, P.getZ(v) - zc) < r * 1.08) wheel[v] = 1;
    }
  }
  const tire = new THREE.Color('#2a2a2e');
  const colors = car ? CAR_COLORS : [null];
  return colors.map(cc => {
    const a = colAll.slice();
    if (cc) {
      const paint = new THREE.Color(cc);
      for (let i = 0, v = 0; i < a.length; i += 3, v++) {
        if (wheel[v]) { if (keyOf(a, i) === body) { a[i] = tire.r; a[i + 1] = tire.g; a[i + 2] = tire.b; } }
        else if (brandAll[v] || keyOf(a, i) === body) { a[i] = paint.r; a[i + 1] = paint.g; a[i + 2] = paint.b; }
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', shape.attributes.position);
    gg.setAttribute('normal', shape.attributes.normal);
    gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return gg;
  });
}

function normalize(root, spec) {
  if (spec.rotY) root.rotation.y = spec.rotY;
  root.updateMatrixWorld(true);
  if (spec.half) {
    // в файлах Poly Haven по два варианта рядом — оставляем левый
    const all = new THREE.Box3().setFromObject(root), cx = all.getCenter(new THREE.Vector3()).x;
    const drop = [];
    root.traverse(o => { if (o.isMesh && new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).x > cx) drop.push(o); });
    for (const o of drop) o.parent.remove(o);
    root.updateMatrixWorld(true);
  }
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  let k = 1;
  if (spec.len) k = spec.len / size.z;
  else if (spec.height) k = spec.height / size.y;
  else if (spec.width) k = spec.width / size.x;
  const wrap = new THREE.Group();
  const c = box.getCenter(new THREE.Vector3());
  root.position.set(-c.x, -box.min.y, -c.z);
  wrap.add(root);
  wrap.scale.setScalar(k);
  const outer = new THREE.Group();
  outer.add(wrap);
  outer.userData.size = size.clone().multiplyScalar(k);
  outer.userData.raw = size.clone();
  return outer;
}

export async function loadAll(onProgress) {
  const keys = Object.keys(MODELS);
  let done = 0;
  await Promise.all(keys.map(async key => {
    const spec = MODELS[key];
    try {
      // зависший запрос не держит загрузку: модель необязательна, игра обойдётся без неё
      const gltf = await Promise.race([loader.loadAsync(spec.url), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 12000))]);
      const root = gltf.scene;
      root.traverse(o => {
        if (o.isMesh) {
          o.castShadow = !!(spec.len || spec.height);
          o.receiveShadow = false;
          const m = o.material;
          if (m && m.transmission) { m.transmission = 0; m.opacity = 0.6; m.transparent = true; }
        }
      });
      cache[key] = normalize(root, spec);
      if (spec.bake) baked[key] = bake(cache[key], spec.bake === 'car');
    } catch (e) {
      console.warn('model failed', key, e);
    }
    done++;
    onProgress && onProgress(done / keys.length);
  }));
}

export function has(key) { return !!cache[key]; }

export function model(key) {
  const b = baked[key];
  if (b) {
    const m = new THREE.Mesh(b[Math.floor(Math.random() * b.length)], bakedMat);
    m.castShadow = !!MODELS[key].len;   // тени только у машин
    return m;
  }
  const src = cache[key];
  if (!src) return null;
  const m = src.clone(true);
  m.userData.size = src.userData.size;
  return m;
}

// Здание из GLB, вписанное в ширину вдоль улицы w и глубину не больше depth
export function building(key, w, depth = 12) {
  const src = cache[key];
  if (!src) return null;
  const m = src.clone(true);
  const s = src.userData.size;
  // длинной стороной вдоль улицы
  const long = s.x >= s.z;
  const along = long ? s.x : s.z, across = long ? s.z : s.x;
  const k = Math.min(w / along, depth / across);
  m.scale.setScalar(k);
  if (!long) m.rotation.y = Math.PI / 2;
  m.userData.size = new THREE.Vector3(along * k, s.y * k, across * k);
  m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return m;
}
