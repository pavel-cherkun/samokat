// Мир: небо, солнце, туман и бесконечная улица из кусков. Статика куска сливается в 5 мешей.
import * as THREE from 'three';
import * as TX from './textures.js';
import * as M from './models.js';
import * as A from './assets.js';
import * as ACT from './actors.js';
import { Pickup } from './cards.js';
import { L, ROAD, CROSS, genChunk, rngFor } from './layout.js';

const { part, merge, G } = M;

export const SUN_DIR = new THREE.Vector3(-0.6, 0.5, 0.42).normalize(); // солнце слева-сзади: тени ложатся вперёд-вправо
export const SKY = { top: new THREE.Color('#3f8fe8'), horizon: new THREE.Color('#cfe9ff'), haze: new THREE.Color('#f7e6c8') };

export class World {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.quality = quality;
    this.chunks = new Map();
    this.seed = 1;
    this.tex = {
      asphalt: TX.asphalt(), sidewalk: TX.sidewalk(), facade: TX.facade(), shop: TX.shopfront(), awning: TX.awning(),
      cloud: TX.cloud(), puddle: TX.puddle(), manhole: TX.manhole(),
    };
    this.mat = {
      road: new THREE.MeshLambertMaterial({ map: this.tex.asphalt }),
      walk: new THREE.MeshLambertMaterial({ map: this.tex.sidewalk }),
      facade: new THREE.MeshLambertMaterial({ map: this.tex.facade, vertexColors: true }),
      shop: new THREE.MeshLambertMaterial({ map: this.tex.shop, vertexColors: true }),
      awning: new THREE.MeshLambertMaterial({ map: this.tex.awning, vertexColors: true, side: THREE.DoubleSide }),
      vc: M.MAT.vc,
    };
    this.buildSky();
    this.buildLights();
    this.traffic = new ACT.Traffic(this.scene);
  }

  buildSky() {
    const s = this.scene;
    s.fog = new THREE.Fog(SKY.haze.clone().lerp(SKY.horizon, 0.5), 60, 225);
    const geo = new THREE.SphereGeometry(800, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: SKY.top }, hor: { value: SKY.horizon }, haze: { value: SKY.haze }, sun: { value: SUN_DIR } },
      vertexShader: `varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top, hor, haze, sun; varying vec3 vd;
        void main(){
          float h = clamp(vd.y, -0.2, 1.0);
          vec3 c = mix(hor, top, pow(max(h,0.0), 0.55));
          c = mix(c, haze, smoothstep(0.12, -0.02, h) * 0.8);
          float sd = max(dot(normalize(vd), sun), 0.0);
          c += vec3(1.0,0.9,0.7) * pow(sd, 18.0) * 0.45 + vec3(1.0,0.95,0.85) * pow(sd, 900.0) * 3.0;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    s.add(this.sky);
    // облака — пара десятков спрайтов на дальнем плане
    this.clouds = new THREE.Group();
    const cm = new THREE.SpriteMaterial({ map: this.tex.cloud, fog: false, depthWrite: false, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(cm);
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, d = 450 + Math.random() * 200;
      sp.position.set(Math.cos(a) * d, 90 + Math.random() * 120, Math.sin(a) * d);
      const k = 140 + Math.random() * 160;
      sp.scale.set(k, k * 0.45, 1);
      this.clouds.add(sp);
    }
    s.add(this.clouds);
    // окружение для металла/лака машин
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(geo, mat));
    this.scene.environment = pm.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    pm.dispose();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight('#bfe0ff', '#e8c49a', 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffeccc', 3.6);
    sun.castShadow = true;
    const sz = this.quality.shadow;
    sun.shadow.mapSize.set(sz, sz);
    const c = sun.shadow.camera;
    c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 1; c.far = 160;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  follow(x, s, h) {
    // тень центрирована чуть впереди игрока — там, куда он смотрит
    const fx = x + Math.sin(h) * 14, fz = -s - Math.cos(h) * 14;
    // привязка к текселю, чтобы тени не дрожали
    const step = 60 / this.quality.shadow;
    const tx = Math.round(fx / step) * step, tz = Math.round(fz / step) * step;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + SUN_DIR.x * 80, SUN_DIR.y * 80, tz + SUN_DIR.z * 80);
    this.sky.position.set(x, 0, -s);
    this.clouds.position.set(x, 0, -s);
  }

  reset(seed) {
    for (const c of this.chunks.values()) this.dropChunk(c);
    this.chunks.clear();
    this.traffic.reset();
    this.seed = seed;
  }

  // держим куски от -1 до +3 от текущего (~220 м вперёд, дальше туман)
  update(s, difficulty) {
    const i0 = Math.floor(s / L);
    for (let i = Math.max(0, i0 - 1); i <= i0 + 3; i++) {
      if (!this.chunks.has(i)) this.chunks.set(i, this.buildChunk(i, difficulty));
    }
    for (const [i, c] of this.chunks) if (i < i0 - 1 || i > i0 + 4) { this.dropChunk(c); this.chunks.delete(i); }
  }

  dropChunk(c) {
    this.scene.remove(c.group);
    for (const g of c.geos) g.dispose();
  }

  *actors() {
    for (const c of this.chunks.values()) yield* c.actors;
    yield* this.traffic.cars;
  }

  // -------------------------------------------------------------------- кусок улицы
  buildChunk(i, difficulty) {
    const d = genChunk(i, this.seed, difficulty);
    const r = rngFor(i * 31 + 5, this.seed);
    const group = new THREE.Group();
    const geos = [];
    const vc = [], facade = [], shop = [], awn = [];
    const z0 = -d.s0;
    const colliders = [];
    const actors = [];
    const add = (geo, mat, shadowCast = true, recv = true) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadowCast; m.receiveShadow = recv;
      group.add(m); geos.push(geo);
      return m;
    };

    // --- дорога
    const roadW = 14;
    add(plane(roadW, L, 0, 0, z0 - L / 2, 4), this.mat.road, false, true);
    if (d.cross) {
      const cz = z0 - (CROSS.s0 + CROSS.s1) / 2, cw = CROSS.s1 - CROSS.s0;
      add(plane(100, cw, 0, -0.002, cz, 4), this.mat.road, false, true);
    }
    // --- тротуары (плитка), бордюры
    const walkSegs = d.cross ? [[0, CROSS.s0], [CROSS.s1, L]] : [[0, L]];
    for (const side of [-1, 1]) for (const [a, b] of walkSegs) {
      const len = b - a, zc = z0 - (a + b) / 2;
      add(box(16, ROAD.walkH, len, side * (ROAD.curb + 8), ROAD.walkH / 2, zc, 2), this.mat.walk, false, true);
      // бордюр, на зебре опущен
      const segs = d.cross && a === 0 ? [[a, CROSS.zebra0], [CROSS.zebra1, b]] : [[a, b]];
      for (const [p, q] of segs) vc.push(part(G.box, '#d6d0c6', side * ROAD.curb, ROAD.walkH / 2 + 0.01, z0 - (p + q) / 2, 0, 0, 0, 0.22, ROAD.walkH + 0.02, q - p));
      if (d.cross && a === 0) {   // пандус на зебре
        vc.push(part(G.box, '#c9c3b9', side * (ROAD.curb + 0.5), ROAD.walkH / 2 - 0.05, z0 - (CROSS.zebra0 + CROSS.zebra1) / 2, 0, 0, side * 0.15, 1.0, 0.12, CROSS.zebra1 - CROSS.zebra0));
      }
    }
    if (d.cross) {
      // тротуары поперечной улицы
      for (const side of [-1, 1]) for (const [a, b] of [[CROSS.walk0, CROSS.s0], [CROSS.s1, CROSS.walk1]]) {
        add(box(40, ROAD.walkH, b - a, side * (ROAD.curb + 8 + 28), ROAD.walkH / 2, z0 - (a + b) / 2, 2), this.mat.walk, false, true);
      }
    }
    // --- разметка: осевая пунктиром, велодорожка, зебра
    for (let s = 1.5; s < L; s += 6) {
      if (d.cross && s > CROSS.zebra0 - 3 && s < CROSS.s1 + 1) continue;
      vc.push(part(G.box, '#f4f1ea', 0, 0.006, z0 - s, 0, 0, 0, 0.14, 0.01, 3));
    }
    const bikeSegs = d.cross ? [[0, CROSS.zebra0 - 0.5], [CROSS.s1 + 0.5, L]] : [[0, L]];
    for (const [a, b] of bikeSegs) {
      vc.push(part(G.box, '#3fa36c', (ROAD.bike0 + ROAD.bike1) / 2, 0.005, z0 - (a + b) / 2, 0, 0, 0, ROAD.bike1 - ROAD.bike0, 0.008, b - a));
      vc.push(part(G.box, '#f4f1ea', ROAD.bike0 - 0.06, 0.007, z0 - (a + b) / 2, 0, 0, 0, 0.12, 0.01, b - a));
      // велосипедики-стрелки каждые 20 м
      for (let s = a + 8; s < b - 2; s += 20) vc.push(part(G.box, '#f4f1ea', (ROAD.bike0 + ROAD.bike1) / 2, 0.009, z0 - s, 0, 0, 0, 0.5, 0.01, 1.2));
    }
    if (d.cross) {
      for (let x = -6.5; x <= 6.5; x += 1.0) vc.push(part(G.box, '#f7f5ef', x, 0.008, z0 - (CROSS.zebra0 + CROSS.zebra1) / 2, 0, 0, 0, 0.5, 0.01, CROSS.zebra1 - CROSS.zebra0 - 0.4));
      // стоп-линия поперечной улицы
      for (const side of [-1, 1]) {
        vc.push(part(G.box, '#f4f1ea', side * 10, 0.008, z0 - (CROSS.s0 + CROSS.s1) / 2 + side * 3.5, 0, 0, 0, 0.3, 0.01, 7));
        vc.push(...M.trafficLightParts(side * 7.6, z0 - CROSS.zebra0 + 1.2, side));
        colliders.push({ x: side * 7.6, z: z0 - CROSS.zebra0 + 1.2, r: 0.14, kind: 'pole' });
      }
    }

    // --- здания
    for (const b of d.buildings) this.addBuilding(b, d, { vc, facade, shop, awn, group, r });

    // --- деревья, фонари, мелочь
    for (const t of d.trees) {
      vc.push(...M.treeParts(t.x, -t.s, t.big, r));
      if (!t.big) colliders.push({ x: t.x, z: -t.s, r: 0.32, kind: 'tree' });
    }
    for (const l of d.lamps) { vc.push(...M.lampParts(l.x, -l.s, l.side)); colliders.push({ x: l.x, z: -l.s, r: 0.16, kind: 'pole' }); }
    for (const p of d.props) {
      const m = A.model(p.kind);
      if (m) {
        m.position.set(p.x, ROAD.walkH, -p.s);
        m.rotation.y = p.side > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(m);
      }
      colliders.push({ x: p.x, z: -p.s, r: p.kind === 'trash' ? 0.34 : 0.28, kind: p.kind });
    }
    for (const c of d.cafes) {
      vc.push(...M.cafeParts(c.x, -c.s, c.kind, r));
      if (c.kind === 'icecream') colliders.push({ x: c.x, z: -c.s, r: 0.85, kind: 'cafe' });
      else for (let k = 0; k < 2; k++) colliders.push({ x: c.x, z: -c.s - k * 2.6, r: 0.7, kind: 'cafe' });
    }

    add(merge(vc), this.mat.vc, true, true);
    if (facade.length) add(merge(facade), this.mat.facade, true, true);
    if (shop.length) add(merge(shop), this.mat.shop, false, true);
    if (awn.length) add(merge(awn), this.mat.awning, true, true);

    // --- актёры
    for (const p of d.parked) actors.push(new ACT.Parked(group, p));
    for (const c of d.cones) actors.push(new ACT.Cone(group, c.x, c.s));
    for (const m of d.manholes) actors.push(new ACT.Decal(group, 'manhole', m, this.tex.manhole));
    for (const p of d.puddles) actors.push(new ACT.Decal(group, 'puddle', p, this.tex.puddle));
    for (const f of d.pigeons) actors.push(new ACT.Flock(group, f));
    for (const w of d.walkers) actors.push(new ACT.Walker(group, w, 'stroll'));
    for (const g of d.grannies) actors.push(new ACT.Walker(group, { x: g.x, s: g.s, dir: Math.random() < 0.5 ? 1 : -1 }, g.jay ? 'jay' : 'stroll', true));
    for (const dg of d.dogs) actors.push(new ACT.Dog(group, dg));
    for (const c of d.cards) actors.push(new Pickup(group, c));
    for (const z of d.zebraWalkers) actors.push(new ACT.Walker(group, z, 'zebra', z.granny));
    // статичные препятствия — тоже «актёр» без поведения
    actors.push({ kind: 'static', hard: true, colliders, update() {}, statics: true });

    this.scene.add(group);
    return { i, group, geos, actors, data: d };
  }

  addBuilding(b, d, acc) {
    const { vc, facade, shop, awn, group, r } = acc;
    const side = b.side;
    const depth = b.back ? 14 : d.cross ? 26 : 11;
    const front = b.back ? ROAD.front + 16 + r() * 6 : ROAD.front + b.setback;
    const cx = side * (front + depth / 2), cz = -(b.s + b.w / 2);
    const y0 = ROAD.walkH;
    if (b.glb && A.has(b.glb)) {
      const m = A.building(b.glb, b.w - 0.4, depth);
      if (m) {
        const wrap = new THREE.Group();
        wrap.add(m);
        wrap.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        const sz = m.userData.size;
        wrap.position.set(side * (front + sz.z / 2), y0, cz);
        group.add(wrap);
        // задник, чтобы низкие магазины не оставляли дыру в небе
        if (sz.y < 7) {
          const h = 9 + r() * 6;
          facade.push(boxUV(b.w, h, 8, side * (front + sz.z + 4.2), y0 + h / 2, cz, b.wall));
        }
        return;
      }
    }
    const shopH = b.shop && !b.back ? 4.0 : 0;
    const upH = b.floors * 3.2;
    const totalH = shopH + upH;
    if (shopH) {
      shop.push(boxUV(b.w, shopH, depth, cx, y0 + shopH / 2, cz, b.wall, 3, 4));
      // вывеска над витриной
      vc.push(part(G.box, b.sign, side * (front - 0.08), y0 + 3.6, cz, 0, 0, 0, 0.16, 0.55, b.w * 0.7));
      if (b.awning) {
        const ag = new THREE.PlaneGeometry(b.w * 0.9, 1.6);
        const uv = ag.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * b.w * 0.9 / 1.2);
        ag.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        ag.rotateZ(side * -0.5);
        ag.translate(side * (front - 0.7), y0 + 3.05, cz);
        tint(ag, b.awning);
        awn.push(ag);
      }
    }
    facade.push(boxUV(b.w, upH, depth, cx, y0 + shopH + upH / 2, cz, b.wall));
    // карниз-парапет и коробка на крыше
    const dark = new THREE.Color(b.wall).multiplyScalar(0.82).getStyle();
    vc.push(part(G.box, dark, cx, y0 + totalH + 0.2, cz, 0, 0, 0, depth + 0.3, 0.4, b.w + 0.3));
    if (b.roofBox) vc.push(part(G.box, '#c9c4bd', cx + side * 2, y0 + totalH + 1.1, cz, 0, 0, 0, 3, 1.8, Math.min(4, b.w * 0.4)));
    if (!b.back && b.floors >= 2 && r() < 0.5) {
      // балконы с цветами — летний акцент
      const n = Math.floor(b.w / 3);
      const fl = 1 + Math.floor(r() * (b.floors - 1));
      for (let k = 0; k < n; k++) {
        if (r() < 0.5) continue;
        const zz = -(b.s + 1.5 + k * 3);
        const yy = y0 + shopH + fl * 3.2 + 0.1;
        vc.push(part(G.box, '#efe9e0', side * (front - 0.45), yy, zz, 0, 0, 0, 0.9, 0.12, 2.2));
        vc.push(part(G.box, '#ffffff', side * (front - 0.88), yy + 0.45, zz, 0, 0, 0, 0.05, 0.8, 2.2));
        vc.push(part(G.box, ['#ff5a7a', '#ffb12a', '#e8443a', '#c45cff'][Math.floor(r() * 4)], side * (front - 0.85), yy + 0.95, zz, 0, 0, 0, 0.25, 0.22, 1.8));
      }
    }
    if (!b.back && r() < 0.4) {
      const m = A.model('aircon');
      if (m) {
        m.position.set(side * (front - 0.18), y0 + shopH + 3.2 * (1 + Math.floor(r() * b.floors)) - 1.1, -(b.s + 1 + r() * (b.w - 2)));
        m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(m);
      }
    }
  }
}

// ---------------------------------------------------------------- геометрия-помощники
function tint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

function plane(w, l, x, y, z, tile) {
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
  return g;
}

function box(w, h, l, x, y, z, tile) {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
  return g;
}

/** Коробка здания вдоль улицы (w — по z), фасадный тайл 3 × 3.2 м, крыша — чистая стена. */
function boxUV(w, h, depth, x, y, z, color, tu = 3, tv = 3.2) {
  const g = new THREE.BoxGeometry(depth, h, w).toNonIndexed();
  g.translate(x, y, z);
  const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const nx = n.getX(i), ny = n.getY(i);
    if (Math.abs(ny) > 0.5) { uv.setXY(i, 0.03, 0.03); continue; }
    const u = Math.abs(nx) > 0.5 ? p.getZ(i) : p.getX(i);
    // окна выравниваем от низа коробки: v = высота / этаж
    uv.setXY(i, u / tu, (p.getY(i) - (y - h / 2)) / tv);
  }
  tint(g, color);
  return g;
}
