// Живое на улице: конусы, двери, пешеходы, бабушки, собаки, голуби, лужи, люки, машины.
// У каждого актёра: update(dt, ctx), colliders [{x,z,r}], kind, hard (падение) или soft (штраф).
import * as THREE from 'three';
import * as M from './models.js';
import * as A from './assets.js';
import { ROAD, L, CROSS } from './layout.js';

const TAU = Math.PI * 2;
const ahead = (ctx, s) => s - ctx.player.s;          // насколько объект впереди игрока

// ---------------------------------------------------------------- конус
export class Cone {
  constructor(parent, x, s) {
    this.mesh = new THREE.Mesh(M.coneGeometry(), M.MAT.vc);
    this.mesh.position.set(x, 0, -s);
    this.mesh.rotation.y = Math.random() * TAU;
    parent.add(this.mesh);
    this.s = s; this.kind = 'cone'; this.hard = false;
    this.colliders = [{ x, z: -s, r: 0.26 }];
    this.vel = null;
  }
  knock(ctx) {
    const p = ctx.player;
    this.colliders = [];
    this.vel = new THREE.Vector3(Math.sin(p.h) * p.v * 0.7 + (Math.random() - 0.5) * 2, 3 + p.v * 0.15, -Math.cos(p.h) * p.v * 0.8);
    this.spin = new THREE.Vector3(Math.random() * 10 - 5, 0, Math.random() * 10 - 5);
  }
  update(dt) {
    if (!this.vel) return;
    const m = this.mesh;
    this.vel.y -= 18 * dt;
    m.position.addScaledVector(this.vel, dt);
    if (m.position.y < 0.12) {
      m.position.y = 0.12; this.vel.y *= -0.3; this.vel.x *= 0.7; this.vel.z *= 0.7; this.spin.multiplyScalar(0.7);
      if (this.vel.lengthSq() < 0.2) { this.vel = null; m.rotation.x = Math.PI / 2; return; }
    }
    m.rotation.x += this.spin.x * dt; m.rotation.z += this.spin.z * dt;
  }
}

// ---------------------------------------------------------------- припаркованная машина (+ дверь)
export class Parked {
  constructor(parent, d) {
    this.s = d.s; this.kind = 'car'; this.hard = true;
    const g = new THREE.Group();
    g.position.set(d.x, 0, -d.s);
    const car = A.model(d.model);
    if (car) g.add(car);
    if (d.side < 0) g.rotation.y = Math.PI;       // на левой стороне стоят встречные
    parent.add(g);
    this.group = g;
    const x = d.x, z = -d.s;
    this.colliders = [{ x, z: z - 1.45, r: 0.93 }, { x, z, r: 0.95 }, { x, z: z + 1.45, r: 0.93 }];
    this.door = null;
    if (d.door) {
      // дверь водителя: слева по ходу, петля спереди — открывается прямо в велополосу
      const door = M.makeDoor(d.model === 'mustang' ? '#f2741c' : '#1f2026');
      door.position.set(-0.93, 0.05, -0.95);
      g.add(door);
      door.visible = false;
      this.door = door;
      this.open = 0;
      this.blink = [];
      for (const [bx, bz] of [[-0.85, -2.3], [0.85, -2.3], [-0.85, 2.3], [0.85, 2.3]]) {
        const b = new THREE.Mesh(M.G.sph, new THREE.MeshBasicMaterial({ color: '#ffa31a', toneMapped: false }));
        b.scale.setScalar(0.09); b.position.set(bx, 0.85, bz); g.add(b); this.blink.push(b);
      }
      this.doorCol = [{ x: 0, z: 0, r: 0.24 }, { x: 0, z: 0, r: 0.24 }, { x: 0, z: 0, r: 0.24 }];
    }
  }
  update(dt, ctx) {
    if (!this.door) return;
    const a = ahead(ctx, this.s);
    const on = a < 45 && a > -5;
    const lit = on && (ctx.t * 3) % 1 < 0.5;
    for (const b of this.blink) b.visible = lit;
    const trigger = 11 + ctx.player.v * 0.55;
    if (a < trigger && a > -3) this.open = Math.min(1, this.open + dt * 2.2);
    if (this.open > 0) {
      this.door.visible = true;
      const ang = this.open * 1.15;
      this.door.rotation.y = -ang;            // задний край уходит влево, в полосу
      const hx = this.group.position.x - 0.93, hz = this.group.position.z - 0.95;
      // точки вдоль двери от петли
      for (let k = 0; k < 3; k++) {
        const d = 0.25 + k * 0.38;
        this.doorCol[k].x = hx - Math.sin(ang) * d;
        this.doorCol[k].z = hz + Math.cos(ang) * d;
      }
      if (!this.colliders.includes(this.doorCol[0])) {
        this.colliders = this.colliders.concat(this.doorCol);
        ctx.fx.doorOpen(this);
      }
      this.kindAt = 'door';
    }
  }
}

// ---------------------------------------------------------------- пешеход / бабушка
export class Walker {
  /** mode: stroll — гуляет вдоль; jay — бабушка переходит где хочет; zebra — по зебре */
  constructor(parent, d, mode, granny = false) {
    this.granny = granny;
    this.mesh = M.makePerson(d.look ?? Math.floor(Math.random() * 6), granny);
    parent.add(this.mesh);
    this.x = d.x; this.s = d.s; this.mode = mode;
    this.dir = d.dir ?? 1;
    this.speed = granny ? 0.85 : (d.speed ?? 1.3);
    this.delay = d.delay ?? 0;
    this.state = mode === 'stroll' ? 'walk' : 'wait';
    this.phase = Math.random() * TAU;
    this.kind = granny ? 'granny' : 'ped';
    this.hard = true;
    this.colliders = [{ x: this.x, z: -this.s, r: granny ? 0.34 : 0.3 }];
    this.place(0);
  }
  place(move) {
    const m = this.mesh;
    m.position.set(this.x, Math.abs(this.x) > ROAD.curb ? ROAD.walkH : 0, -this.s);
    const legs = m.userData.legs;
    const sw = Math.sin(this.phase) * 0.5 * move;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    m.children[0].position.y = Math.abs(Math.cos(this.phase)) * 0.04 * move;
    this.colliders[0].x = this.x; this.colliders[0].z = -this.s;
  }
  update(dt, ctx) {
    const a = ahead(ctx, this.s);
    let move = 0;
    if (this.state === 'walk') {
      if (this.mode === 'stroll') {
        this.s += this.dir * this.speed * dt;
        this.mesh.rotation.y = this.dir > 0 ? 0 : Math.PI;
      } else {
        this.x += this.dir * this.speed * dt;
        this.mesh.rotation.y = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (Math.abs(this.x) > 9.5 && Math.sign(this.x) === this.dir) {
          this.mode = 'stroll'; this.dir = Math.random() < 0.5 ? 1 : -1;
        }
      }
      move = 1;
      this.phase += dt * this.speed * (this.granny ? 7 : 6);
    } else if (this.state === 'wait') {
      const trig = this.mode === 'jay' ? 26 + ctx.player.v * 0.8 : 40 + this.delay * 6;
      if (a < trig) {
        this.state = 'walk';
        if (this.mode === 'jay') this.dir = -Math.sign(this.x);
      }
      this.mesh.rotation.y = this.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    this.place(move);
  }
}

// ---------------------------------------------------------------- собака
export class Dog {
  constructor(parent, d) {
    this.mesh = M.makeDog(d.color);
    parent.add(this.mesh);
    this.x = d.x; this.s = d.s; this.dir = -Math.sign(d.x);
    this.state = 'sit'; this.t = Math.random() * 10;
    this.kind = 'dog'; this.hard = true;
    this.colliders = [{ x: this.x, z: -this.s, r: 0.38 }];
    this.zig = Math.random() * TAU;
  }
  update(dt, ctx) {
    this.t += dt;
    const u = this.mesh.userData;
    u.tail.rotation.z = Math.sin(this.t * 16) * 0.6;
    if (this.state === 'sit') {
      if (ahead(ctx, this.s) < 24 + ctx.player.v * 0.6) { this.state = 'run'; ctx.fx.bark(this); }
      this.mesh.rotation.y = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else if (this.state === 'run') {
      this.x += this.dir * 5 * dt;
      this.s += Math.sin(this.t * 3 + this.zig) * 2.2 * dt;
      this.mesh.rotation.y = (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.cos(this.t * 3 + this.zig) * 0.4 * this.dir;
      for (let i = 0; i < 4; i++) u.legs[i].rotation.x = Math.sin(this.t * 22 + (i % 2) * Math.PI + (i > 1 ? 1 : 0)) * 0.8;
      if (Math.abs(this.x) > 10 && Math.sign(this.x) === this.dir) this.state = 'done';
    }
    this.mesh.position.set(this.x, Math.abs(this.x) > ROAD.curb ? ROAD.walkH : 0, -this.s);
    this.colliders[0].x = this.x; this.colliders[0].z = -this.s;
  }
}

// ---------------------------------------------------------------- голуби
export class Flock {
  constructor(parent, d) {
    this.birds = [];
    this.s = d.s; this.kind = 'pigeons'; this.hard = false; this.colliders = [];
    for (let i = 0; i < d.n; i++) {
      const b = M.makePigeon();
      const a = Math.random() * TAU, r = Math.random() * 1.4;
      const x = d.x + Math.cos(a) * r, z = -d.s + Math.sin(a) * r;
      b.position.set(x, Math.abs(x) > ROAD.curb ? ROAD.walkH : 0, z);
      b.rotation.y = Math.random() * TAU;
      parent.add(b);
      this.birds.push({ m: b, ph: Math.random() * 10, v: null });
    }
    this.x = d.x;
    this.flown = false;
  }
  update(dt, ctx) {
    const p = ctx.player;
    if (!this.flown && Math.hypot(p.x - this.x, p.s - this.s) < 7 + p.v * 0.25) {
      this.flown = true;
      ctx.fx.pigeons(this);
      for (const b of this.birds) {
        const dx = b.m.position.x - p.x, dz = b.m.position.z + p.s;
        const l = Math.hypot(dx, dz) || 1;
        b.v = new THREE.Vector3(dx / l * 3 + (Math.random() - 0.5) * 2, 3.5 + Math.random() * 2, dz / l * 2 - 2.5 - Math.random() * 3);
        b.m.rotation.y = Math.atan2(-b.v.x, -b.v.z);
        b.m.userData.wl.visible = b.m.userData.wr.visible = true;
      }
    }
    for (const b of this.birds) {
      b.ph += dt;
      if (b.v) {
        b.m.position.addScaledVector(b.v, dt);
        b.v.y += 1.2 * dt;
        const f = Math.sin(b.ph * 30) * 0.9;
        b.m.userData.wl.rotation.z = f; b.m.userData.wr.rotation.z = -f;
      } else {
        // клюют: голова-кивок через наклон тушки
        b.m.rotation.x = Math.max(0, Math.sin(b.ph * 5)) * 0.35;
      }
    }
  }
}

// ---------------------------------------------------------------- лужа / люк (плоские)
export class Decal {
  constructor(parent, kind, d, tex) {
    this.kind = kind; this.s = d.s;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    let geo, sx = 1, sz = 1;
    if (kind === 'puddle') { geo = new THREE.PlaneGeometry(1, 1); sx = d.rx * 2; sz = d.rz * 2; }
    else geo = new THREE.CircleGeometry(0.48, 20);
    if (kind === 'manhole' && d.open) {
      mat.map = null; mat.color.set('#0d0c10'); mat.transparent = false;
    }
    if (kind === 'puddle') mat.color.setScalar(1);
    this.mesh = new THREE.Mesh(geo, kind === 'puddle' ? new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, emissive: '#3b6f9c', emissiveIntensity: 0.4 }) : mat);
    this.mesh.rotation.x = -Math.PI / 2;
    if (d.rot) this.mesh.rotation.z = d.rot;
    this.mesh.scale.set(sx, sz, 1);
    this.mesh.position.set(d.x, 0.01, -d.s);
    this.mesh.receiveShadow = kind === 'puddle';
    parent.add(this.mesh);
    if (kind === 'manhole' && d.open) {
      // открытая крышка лежит рядом — видно, что люк зияет
      const lid = new THREE.Mesh(new THREE.CircleGeometry(0.48, 20), new THREE.MeshLambertMaterial({ map: tex }));
      lid.rotation.x = -Math.PI / 2; lid.rotation.z = 0.3;
      lid.position.set(d.x + 0.75, 0.03, -d.s + 0.5);
      parent.add(lid);
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.56, 20), new THREE.MeshLambertMaterial({ color: '#6c6873' }));
      rim.rotation.x = -Math.PI / 2; rim.position.set(d.x, 0.015, -d.s); parent.add(rim);
    }
    this.open = kind === 'manhole' && d.open;
    this.hard = this.open;
    this.x = d.x; this.d = d;
    this.colliders = this.open ? [{ x: d.x, z: -d.s, r: 0.3 }] : [];
    // зона лужи — эллипс, проверяется отдельно
    this.zone = kind === 'puddle' ? d : null;
    this.wet = false;
  }
  update() {}
}

// ---------------------------------------------------------------- поток машин
const LANES = { same: ROAD.laneSame, opp: ROAD.laneOpp };

class Car {
  constructor(parent, model, x, z, vx, vz) {
    this.group = new THREE.Group();
    const m = A.model(model);
    if (m) this.group.add(m);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = Math.atan2(-vx, -vz);
    parent.add(this.group);
    this.vx = vx; this.vz = vz;
    this.kind = 'traffic'; this.hard = true;
    this.colliders = [{ x, z, r: 0.95 }, { x, z, r: 0.95 }, { x, z, r: 0.95 }];
    this.sync();
  }
  sync() {
    const p = this.group.position, l = Math.hypot(this.vx, this.vz) || 1;
    for (let k = 0; k < 3; k++) {
      this.colliders[k].x = p.x + this.vx / l * (k - 1) * 1.45;
      this.colliders[k].z = p.z + this.vz / l * (k - 1) * 1.45;
    }
    this.s = -p.z;
  }
  update(dt) {
    this.group.position.x += this.vx * dt;
    this.group.position.z += this.vz * dt;
    this.sync();
  }
}

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.timer = { same: 0, opp: 1, cross: {} };
  }
  reset() {
    for (const c of this.cars) this.scene.remove(c.group);
    this.cars = [];
    this.timer = { same: 0, opp: 1, cross: {} };
  }
  spawn(model, x, z, vx, vz) {
    const c = new Car(this.scene, model, x, z, vx, vz);
    this.cars.push(c);
    return c;
  }
  update(dt, ctx) {
    const p = ctx.player, d = ctx.difficulty;
    const models = ['tiggo8', 'mustang'];
    const rnd = () => models[Math.floor(Math.random() * 2)];
    // попутные: едут медленнее нас, обгоняем по велополосе
    this.timer.same -= dt;
    if (this.timer.same <= 0 && ctx.started) {
      this.timer.same = 4.5 - 2 * d + Math.random() * 3;
      const s = p.s + 150 + Math.random() * 50;
      if (!this.cars.some(c => c.vz < 0 && Math.abs(c.s - s) < 12)) this.spawn(rnd(), LANES.same, -s, 0, -(5 + Math.random() * 2.5));
    }
    // встречка
    this.timer.opp -= dt;
    if (this.timer.opp <= 0 && ctx.started) {
      this.timer.opp = 2.6 - 1.2 * d + Math.random() * 2.5;
      this.spawn(rnd(), LANES.opp, -(p.s + 230), 0, 9 + Math.random() * 3);
    }
    // поперечный поток на перекрёстках впереди
    const i0 = Math.floor(p.s / L);
    for (let i = i0; i <= i0 + 3; i++) {
      if (!(i >= 2 && i % 3 === 2)) continue;
      const sc = i * L + (CROSS.s0 + CROSS.s1) / 2;
      if (sc - p.s < -10 || sc - p.s > 160) continue;
      const t = this.timer.cross[i] ?? (this.timer.cross[i] = Math.random() * 2);
      this.timer.cross[i] = t - dt;
      if (t - dt <= 0 && ctx.started) {
        this.timer.cross[i] = 3.2 - 1.2 * d + Math.random() * 2.5;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const lane = dir > 0 ? sc + 3.2 : sc - 3.2;
        this.spawn(rnd(), -dir * 46, -lane, dir * (8 + Math.random() * 2), 0);
      }
    }
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      // попутные притормаживают перед открытыми люками/конусами не умеют — просто едут
      c.update(dt);
      const gp = c.group.position;
      if (gp.z > -(p.s - 40) || gp.z < -(p.s + 260) || Math.abs(gp.x) > 50) {
        this.scene.remove(c.group);
        this.cars.splice(k, 1);
      }
    }
  }
}
