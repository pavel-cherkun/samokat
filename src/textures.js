// Все текстуры рисуются кодом на canvas: ничего не грузим, всё тайлится.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noise(g, w, h, n, a, light = true) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`;
    const s = 1 + Math.random() * 2;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

// Асфальт: тёплый серый, тайл 4×4 м
export function asphalt() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#6b6870'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 5000, 0.12, true);
  noise(g, 256, 256, 5000, 0.14, false);
  // трещинки и заплатки
  g.strokeStyle = 'rgba(30,28,35,.35)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 30; y += (Math.random() - .5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(40,38,45,.18)'; g.fillRect(150, 40, 60, 40);
  return tex(c);
}

// Плитка тротуара: тайл 2×2 м, 4×4 плитки
export function sidewalk() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d9cdb8'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const l = 200 + Math.random() * 25;
    g.fillStyle = `rgb(${l + 18},${l + 8},${l - 10})`;
    g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
  noise(g, 256, 256, 3000, 0.1, false);
  return tex(c);
}

// Плитка фасада: один пролёт × один этаж (3 × 3.2 м). Стена белая — цвет даёт вертекс-тинт.
// Окно с рамой, подоконником и бликом неба. Пиксель (4,4) — чистая стена (для крыш/торцов).
export function facade() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, 900, 0.06, false);
  // межэтажный пояс
  g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, 120, 128, 8);
  // окно
  const x0 = 34, y0 = 26, w = 60, h = 72;
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0 - 5, y0 - 5, w + 10, h + 10);
  const gr = g.createLinearGradient(0, y0, 0, y0 + h);
  gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(0.45, '#5f8fb8'); gr.addColorStop(1, '#2f4a68');
  g.fillStyle = gr; g.fillRect(x0, y0, w, h);
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath(); g.moveTo(x0, y0 + 20); g.lineTo(x0 + 22, y0); g.lineTo(x0 + 36, y0); g.lineTo(x0, y0 + 34); g.fill();
  g.fillStyle = '#f4f0ea'; g.fillRect(x0 + w / 2 - 2, y0, 4, h); g.fillRect(x0, y0 + 26, w, 4);
  g.fillStyle = '#ffffff'; g.fillRect(x0 - 8, y0 + h, w + 16, 7);
  g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x0 - 8, y0 + h + 7, w + 16, 3);
  return tex(c);
}

// Витрина первого этажа: пролёт 3 м × 4 м. Сверху полоса под вывеску.
export function shopfront() {
  const [c, g] = canvas(128, 160);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 160);
  noise(g, 128, 160, 600, 0.05, false);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 28, 128, 6);
  const gr = g.createLinearGradient(0, 40, 0, 150);
  gr.addColorStop(0, '#d8f1ff'); gr.addColorStop(0.5, '#6e9cc2'); gr.addColorStop(1, '#30455e');
  g.fillStyle = '#3a3440'; g.fillRect(8, 40, 112, 114);
  g.fillStyle = gr; g.fillRect(12, 44, 104, 106);
  g.fillStyle = 'rgba(255,255,255,.3)';
  g.beginPath(); g.moveTo(12, 80); g.lineTo(50, 44); g.lineTo(70, 44); g.lineTo(12, 104); g.fill();
  g.fillStyle = '#3a3440'; g.fillRect(62, 44, 4, 106);
  // товары за стеклом
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `hsl(${Math.random() * 360},70%,60%)`;
    g.fillRect(16 + i * 16, 128 + Math.random() * 8, 10, 22);
  }
  return tex(c);
}

// Полосатая маркиза
export function awning() {
  const [c, g] = canvas(64, 16);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#000000'; g.fillRect(i * 8, 0, 8, 16); }
  const t = tex(c, true, false);
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

// Мягкое облако для спрайтов
export function cloud() {
  const [c, g] = canvas(256, 128);
  for (let i = 0; i < 26; i++) {
    const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 18 + Math.random() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return tex(c, false);
}

// Кружок-тень под актёрами (дешевле настоящей тени)
export function blob() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

// Лужа: голубой блик неба с мягким краем
export function puddle() {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 62);
  gr.addColorStop(0, 'rgba(170,215,255,.95)'); gr.addColorStop(.75, 'rgba(120,170,220,.85)'); gr.addColorStop(1, 'rgba(90,110,140,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 62, 62, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(50, 48, 26, 8, -0.4, 0, Math.PI * 2); g.fill();
  return tex(c, false);
}

// Люк: чугунная крышка
export function manhole() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#3d3a40'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a282d'; g.lineWidth = 5;
  for (let r = 18; r < 60; r += 13) { g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(4, 64); g.lineTo(124, 64); g.moveTo(64, 4); g.lineTo(64, 124); g.stroke();
  noise(g, 128, 128, 400, 0.15, true);
  return tex(c, false);
}

// Цифры на дисплее руля
export function display(text = '0') {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#0d1a14'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#7dffb2'; g.font = '900 40px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const t = tex(c, false);
  t.userData = { c, g };
  return t;
}
