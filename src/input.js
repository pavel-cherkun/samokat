// Руль двумя пальцами.
//  • Поворот — наклон линии между пальцами: левый вверх + правый вниз = направо.
//  • Газ — автоматически, пока держишь обе ручки.
//  • Тормоз — отпусти руль или потяни обе ручки на себя (вниз), как тормозные рычаги.
// Разность высот пальцев рулит, их общее смещение тормозит — оси не мешают друг другу.
const MAX_ANGLE = 0.42;     // ~24°: полный поворот руля
const DEAD = 0.05;

export class Input {
  constructor(el) {
    this.touches = new Map();     // id → {x, y, x0, y0}
    this.steer = 0; this.throttle = 0; this.brake = 0;
    this.holding = false;         // обе руки на руле
    this.keys = {};
    this.usingKeys = false;
    this.baseMid = null;
    this.gripL = null; this.gripR = null;
    const opt = { passive: false };
    el.addEventListener('touchstart', e => this.onTouch(e), opt);
    el.addEventListener('touchmove', e => this.onTouch(e), opt);
    el.addEventListener('touchend', e => this.onTouch(e), opt);
    el.addEventListener('touchcancel', e => this.onTouch(e), opt);
    addEventListener('keydown', e => { this.keys[e.code] = true; this.usingKeys = true; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.touches.clear(); });
  }
  onTouch(e) {
    e.preventDefault();
    const seen = new Set();
    for (const t of e.touches) {
      seen.add(t.identifier);
      const p = this.touches.get(t.identifier);
      if (p) { p.x = t.clientX; p.y = t.clientY; }
      else this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    for (const id of [...this.touches.keys()]) if (!seen.has(id)) this.touches.delete(id);
    this.usingKeys = false;
  }
  update(dt) {
    const list = [...this.touches.values()].slice(0, 2).sort((a, b) => a.x - b.x);
    if (list.length === 2) {
      const [l, r] = list;
      const ang = Math.atan2(r.y - l.y, Math.max(40, r.x - l.x));
      let s = ang / MAX_ANGLE;
      s = Math.sign(s) * Math.max(0, Math.abs(s) - DEAD) / (1 - DEAD);
      this.steer = Math.max(-1, Math.min(1, s));
      const mid = (l.y + r.y) / 2;
      if (this.baseMid === null) this.baseMid = mid;
      // если пальцы ушли вверх — база едет за ними, чтобы тормоз всегда был «потянуть на себя»
      if (mid < this.baseMid) this.baseMid = mid;
      const pull = mid - this.baseMid;
      this.brake = Math.max(0, Math.min(1, (pull - 35) / 70));
      this.throttle = this.brake > 0.2 ? 0 : 1;
      this.holding = true;
      this.gripL = l; this.gripR = r;
      return;
    }
    this.baseMid = null;
    this.gripL = list[0] || null; this.gripR = null;
    if (this.usingKeys || list.length === 0 && Object.values(this.keys).some(Boolean)) {
      const k = this.keys;
      const target = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
      // клавиши — плавный руль, как будто ведёшь пальцами
      this.steer += (target - this.steer) * Math.min(1, dt * 7);
      this.brake = k.ArrowDown || k.KeyS || k.Space ? 1 : 0;
      this.throttle = this.brake ? 0 : 1;
      this.holding = true;
      return;
    }
    // руки отпущены: тормоз, руль сам возвращается
    this.steer *= Math.max(0, 1 - dt * 6);
    this.throttle = 0;
    this.brake = list.length === 1 ? 0.6 : 1;
    this.holding = false;
  }
}
