import * as THREE from 'three';

// خامات مرسومة إجرائيًا على Canvas: حجر منحوت، بلاط حجري، قرميد، خشب، قماش.
// مولد عشوائي ثابت حتى تبدو الخامات نفسها في كل تشغيل.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function finish(c: HTMLCanvasElement, repeat = 1, color = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, r: () => number) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** جدار حجري من كتل منحوتة متفاوتة الألوان، مع خريطة نتوء مطابقة */
export function stoneTexture(base = [176, 166, 148], seed = 7) {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const [bc, bctx] = canvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = `rgb(${base.map((v) => v - 50).join(',')})`;
  ctx.fillRect(0, 0, W, H);
  bctx.fillStyle = '#000';
  bctx.fillRect(0, 0, W, H);
  const rows = 8;
  const rh = H / rows;
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -r() * 60 : -r() * 20;
    while (x < W) {
      const bw = 60 + r() * 70;
      const v = (r() - 0.5) * 34;
      const warm = (r() - 0.5) * 14;
      const col = [base[0] + v + warm, base[1] + v, base[2] + v - warm];
      const gx = x + 3, gy = row * rh + 3, gw = bw - 6, gh = rh - 6;
      const grad = ctx.createLinearGradient(gx, gy, gx, gy + gh);
      grad.addColorStop(0, `rgb(${col.map((q) => q + 16).join(',')})`);
      grad.addColorStop(1, `rgb(${col.map((q) => q - 18).join(',')})`);
      ctx.fillStyle = grad;
      roundRect(ctx, gx, gy, gw, gh, 5);
      ctx.fill();
      // كسور وبقع
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = `rgba(${r() > 0.5 ? '255,255,240' : '40,35,30'},${0.04 + r() * 0.06})`;
        ctx.beginPath();
        ctx.ellipse(gx + r() * gw, gy + r() * gh, 4 + r() * 16, 3 + r() * 8, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const bg = bctx.createLinearGradient(gx, gy, gx, gy + gh);
      bg.addColorStop(0, '#ddd');
      bg.addColorStop(0.5, '#fff');
      bg.addColorStop(1, '#bbb');
      bctx.fillStyle = bg;
      roundRect(bctx, gx, gy, gw, gh, 5);
      bctx.fill();
      x += bw;
    }
  }
  noise(ctx, W, H, 22, r);
  noise(bctx, W, H, 40, r);
  return { map: finish(c), bump: finish(bc, 1, false) };
}

/** بلاط أرضية الساحات */
export function cobbleTexture(seed = 11) {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const [bc, bctx] = canvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = '#6f675b';
  ctx.fillRect(0, 0, W, H);
  bctx.fillStyle = '#000';
  bctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * H, rx = 9 + r() * 12, ry = 7 + r() * 9, a = r() * Math.PI;
    const v = 150 + r() * 50;
    ctx.fillStyle = `rgb(${v},${v - 8},${v - 22})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
    ctx.fill();
    bctx.fillStyle = `rgb(${200 + r() * 55},${200 + r() * 55},${200 + r() * 55})`;
    bctx.beginPath();
    bctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
    bctx.fill();
  }
  noise(ctx, W, H, 18, r);
  return { map: finish(c), bump: finish(bc, 1, false) };
}

/** قرميد السقوف بلون معين */
export function roofTexture(hex: string, seed = 3) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const r = rng(seed);
  const col = new THREE.Color(hex);
  ctx.fillStyle = `#${col.clone().multiplyScalar(0.55).getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  const rows = 10;
  for (let row = 0; row < rows; row++) {
    const y = (row / rows) * H;
    for (let x = (row % 2) * -12; x < W; x += 24) {
      const v = 0.8 + r() * 0.35;
      const cc = col.clone().multiplyScalar(v);
      const g = ctx.createLinearGradient(0, y, 0, y + H / rows);
      g.addColorStop(0, `#${cc.clone().multiplyScalar(1.12).getHexString()}`);
      g.addColorStop(1, `#${cc.clone().multiplyScalar(0.7).getHexString()}`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + 23, y);
      ctx.lineTo(x + 23, y + H / rows - 3);
      ctx.quadraticCurveTo(x + 12, y + H / rows + 3, x + 1, y + H / rows - 3);
      ctx.fill();
    }
  }
  noise(ctx, W, H, 14, r);
  return finish(c);
}

export function woodTexture(seed = 5) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const r = rng(seed);
  for (let x = 0; x < W; x += 32) {
    const v = 95 + r() * 35;
    ctx.fillStyle = `rgb(${v + 20},${v - 5},${v - 40})`;
    ctx.fillRect(x, 0, 31, H);
    ctx.strokeStyle = 'rgba(40,25,10,0.25)';
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      const xx = x + r() * 30;
      ctx.moveTo(xx, 0);
      ctx.bezierCurveTo(xx + 4, H / 3, xx - 4, (2 * H) / 3, xx + 2, H);
      ctx.stroke();
    }
  }
  noise(ctx, W, H, 16, r);
  return finish(c);
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** سحابة دخان ناعمة متكتلة */
export function smokeTexture(seed = 9) {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.45, y = S / 2 + (r() - 0.5) * S * 0.45, rad = S * (0.12 + r() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** خامة راية: لون الفريق مع شعار الحصن الذهبي */
export function bannerTexture(hex: string, emblem: 'tower' | 'crown' = 'tower') {
  const W = 128, H = 256;
  const [c, ctx] = canvas(W, H);
  const col = new THREE.Color(hex);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, `#${col.clone().multiplyScalar(0.75).getHexString()}`);
  g.addColorStop(0.5, `#${col.getHexString()}`);
  g.addColorStop(1, `#${col.clone().multiplyScalar(0.75).getHexString()}`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H - 40);
  ctx.lineTo(W / 2, H);
  ctx.lineTo(0, H - 40);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e2bd62';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#e8c56a';
  const cx = W / 2, cy = 100;
  if (emblem === 'crown') {
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy + 20);
    ctx.lineTo(cx - 34, cy - 14);
    ctx.lineTo(cx - 17, cy + 4);
    ctx.lineTo(cx, cy - 26);
    ctx.lineTo(cx + 17, cy + 4);
    ctx.lineTo(cx + 34, cy - 14);
    ctx.lineTo(cx + 34, cy + 20);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(cx - 22, cy - 10, 44, 42);
    for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * 16 - 6, cy - 24, 12, 16);
    ctx.fillStyle = `#${col.clone().multiplyScalar(0.6).getHexString()}`;
    ctx.beginPath();
    ctx.arc(cx, cy + 32, 9, Math.PI, 0);
    ctx.rect(cx - 9, cy + 32, 18, 0);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
