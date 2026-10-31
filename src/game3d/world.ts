import * as THREE from 'three';
import { mats, teamMats } from './materials';
import { figureGeometry, MOUND } from './castle';

// ───────────── الضجيج والتضاريس ─────────────
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

export function castleLayout(n: number): THREE.Vector2[] {
  const P = (x: number, z: number) => new THREE.Vector2(x, z);
  if (n <= 2) return [P(-125, 10), P(125, 10)];
  if (n === 3) return [P(-140, 60), P(140, 60), P(0, -95)];
  if (n === 4) return [P(-140, -72), P(140, -72), P(-140, 82), P(140, 82)];
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2 + (n % 2 ? 0 : Math.PI / n);
    out.push(P(Math.cos(a) * 230, Math.sin(a) * 140));
  }
  return out;
}

export interface WorldInfo {
  group: THREE.Group;
  heightAt(x: number, z: number): number;
  castlePositions: THREE.Vector3[];
  update(t: number): void;
  setNight(v: boolean): void;
}

const SIZE_X = 1500, SIZE_Z = 1100;

function distToPolyline(px: number, pz: number, pts: THREE.Vector2[]) {
  let best = Infinity, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.y - a.y;
    const l2 = dx * dx + dz * dz;
    let t = ((px - a.x) * dx + (pz - a.y) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (a.x + dx * t), pz - (a.y + dz * t));
    if (d < best) { best = d; bt = i + t; }
  }
  return { d: best, t: bt };
}

export function buildWorld(teamCount: number, colors: string[]): WorldInfo {
  const group = new THREE.Group();
  const layout = castleLayout(teamCount);

  // مسار النهر: يتعرج عبر الخريطة ويبتعد عن الحصون
  const river: THREE.Vector2[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const z = -SIZE_Z / 2 - 20 + t * (SIZE_Z + 40);
    let x = -60 + Math.sin(t * 5.2) * 90 + Math.sin(t * 13) * 18;
    const p = new THREE.Vector2(x, z);
    for (let k = 0; k < 6; k++) for (const [c, rad] of [...layout.map((l) => [l, 92] as const), [new THREE.Vector2(0, 30), 46] as const]) {
      const d = p.distanceTo(c);
      if (d < rad) p.add(p.clone().sub(c).normalize().multiplyScalar(rad - d));
    }
    x = p.x;
    river.push(p);
  }
  // الطرق: من بوابة كل حصن إلى ساحة مركزية، وبين الحصون المتجاورة
  const hub = new THREE.Vector2(0, 30);
  const roads: THREE.Vector2[][] = [];
  layout.forEach((c) => {
    const gate = new THREE.Vector2(c.x, c.y + 62);
    const mid = new THREE.Vector2((gate.x + hub.x) / 2 + (c.y - hub.y) * 0.15, (gate.y + hub.y) / 2);
    const pts: THREE.Vector2[] = [];
    const curve = new THREE.QuadraticBezierCurve(new THREE.Vector2(c.x, c.y + 40), mid, hub);
    for (let i = 0; i <= 30; i++) pts.push(curve.getPoint(i / 30));
    roads.push(pts);
  });

  const castleFlat = (x: number, z: number) => {
    let w = 0, moat = 0;
    for (const c of layout) {
      const dx = Math.abs(x - c.x), dz = Math.abs(z - c.y);
      const cheb = Math.max(dx, dz) + Math.min(dx, dz) * 0.08;
      const r = Math.hypot(x - c.x, z - c.y);
      if (cheb > 34.5 && cheb < 41.5) moat = Math.max(moat, 1 - Math.abs(cheb - 38) / 3.5);
      w = Math.max(w, 1 - THREE.MathUtils.smoothstep(r, 58, 95));
    }
    return { w, moat };
  };

  const heightAt = (x: number, z: number) => {
    let h = (fbm(x * 0.006, z * 0.006) - 0.45) * 16 + (fbm(x * 0.02 + 9, z * 0.02) - 0.5) * 3;
    // الجبال على أطراف الخريطة
    const e = Math.hypot(x / 400, z / 285);
    if (e > 0.9) h += Math.pow(e - 0.9, 1.25) * 260 * (0.55 + 0.6 * fbm(x * 0.012 + 3, z * 0.012 - 2));
    // تلال داخلية
    h += Math.max(0, fbm(x * 0.01 - 5, z * 0.01 + 7) - 0.58) * 70;
    const { w, moat } = castleFlat(x, z);
    h = h * (1 - w) + 0.2 * w;
    if (moat > 0) h = Math.min(h, THREE.MathUtils.lerp(h, -2.2, Math.min(1, moat * 1.6)));
    const rv = distToPolyline(x, z, river).d;
    if (rv < 22) h = THREE.MathUtils.lerp(h, -2.5, 1 - THREE.MathUtils.smoothstep(rv, 6, 22));
    let rd = Infinity;
    for (const r of roads) rd = Math.min(rd, distToPolyline(x, z, r).d);
    if (rd < 12) h = THREE.MathUtils.lerp(h, Math.max(0.3, Math.min(h, 4)), 1 - THREE.MathUtils.smoothstep(rd, 4, 12));
    return h;
  };

  // ── شبكة التضاريس بألوان الرؤوس ──
  const SEG_X = 300, SEG_Z = 220;
  const geo = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, SEG_X, SEG_Z);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors3 = new Float32Array(pos.count * 3);
  const cGrass1 = new THREE.Color('#5f8240'), cGrass2 = new THREE.Color('#86a057'), cGrass3 = new THREE.Color('#4b6e38');
  const cDirt = new THREE.Color('#9a8160'), cSand = new THREE.Color('#cdb889'), cRock = new THREE.Color('#857c70'), cSnow = new THREE.Color('#f2f4f6');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.03, z * 0.03, 3);
    tmp.copy(cGrass1).lerp(cGrass2, n).lerp(cGrass3, Math.max(0, fbm(x * 0.008 + 4, z * 0.008, 3) - 0.45) * 2);
    const rv = distToPolyline(x, z, river).d;
    if (rv < 26) tmp.lerp(cSand, 1 - THREE.MathUtils.smoothstep(rv, 9, 26));
    let rd = Infinity;
    for (const r of roads) rd = Math.min(rd, distToPolyline(x, z, r).d);
    if (rd < 7) tmp.lerp(cDirt, 1 - THREE.MathUtils.smoothstep(rd, 3, 7));
    const { w } = castleFlat(x, z);
    if (w > 0.8) tmp.lerp(cDirt, (w - 0.8) * 1.2);
    if (h > 18) tmp.lerp(cRock, THREE.MathUtils.smoothstep(h, 18, 45));
    if (h > 70) tmp.lerp(cSnow, THREE.MathUtils.smoothstep(h + n * 20, 75, 105));
    colors3[i * 3] = tmp.r;
    colors3[i * 3 + 1] = tmp.g;
    colors3[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors3, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: grassDetail(), bumpMap: grassDetail(), bumpScale: 0.6 }));
  terrain.receiveShadow = true;
  group.add(terrain);

  // ── الماء: النهر والخنادق ──
  const waterNormal = makeWaterNormal();
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3a8fa8, roughness: 0.12, metalness: 0.25, normalMap: waterNormal, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  {
    const shape: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < river.length; i++) {
      const a = river[Math.max(0, i - 1)], b = river[Math.min(river.length - 1, i + 1)];
      const dir = b.clone().sub(a).normalize();
      const nrm = new THREE.Vector2(-dir.y, dir.x);
      const w = 13 + Math.sin(i * 0.7) * 2;
      const p = river[i];
      shape.push(p.x + nrm.x * w, -0.9, p.y + nrm.y * w, p.x - nrm.x * w, -0.9, p.y - nrm.y * w);
      uv.push(0, i * 0.5, 1, i * 0.5);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(shape, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const rmesh = new THREE.Mesh(g, waterMat);
    rmesh.renderOrder = 1;
    rmesh.receiveShadow = true;
    group.add(rmesh);
  }
  const castlePositions = layout.map((c) => new THREE.Vector3(c.x, 0, c.y));
  for (const c of castlePositions) {
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(86, 86), waterMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(c.x, -0.8, c.z);
    ring.receiveShadow = true;
    group.add(ring);
  }

  // ── الطرق والجسور ──
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xa48a66, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const r of roads) {
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[Math.max(0, i - 1)], b = r[Math.min(r.length - 1, i + 1)];
      const dir = b.clone().sub(a).normalize();
      const nrm = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(3.4);
      for (const s of [1, -1]) {
        const x = r[i].x + nrm.x * s, z = r[i].y + nrm.y * s;
        verts.push(x, Math.max(heightAt(x, z), -0.7) + 0.25, z);
      }
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, roadMat);
    mesh.receiveShadow = true;
    group.add(mesh);
    // جسر حيث يعبر الطريق النهر
    for (let i = 1; i < r.length; i++) {
      const d = distToPolyline(r[i].x, r[i].y, river).d;
      if (d < 4) {
        const dir = r[Math.min(r.length - 1, i + 1)].clone().sub(r[i - 1]);
        const bridge = new THREE.Group();
        const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 34), mats().wood);
        deck.position.y = 1.4;
        const arch = new THREE.Mesh(new THREE.TorusGeometry(9, 1.4, 6, 16, Math.PI), mats().stone);
        arch.rotation.y = Math.PI / 2;
        arch.position.y = -6.8;
        arch.scale.set(1, 0.9, 1);
        bridge.add(deck, arch);
        for (const s of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 34), mats().darkWood);
          rail.position.set(s * 3.8, 2.4, 0);
          bridge.add(rail);
        }
        bridge.position.set(r[i].x, 0, r[i].y);
        bridge.rotation.y = Math.atan2(dir.x, dir.y);
        bridge.traverse((o) => { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
        group.add(bridge);
        break;
      }
    }
  }

  // ── الأشجار ──
  const avoid = (x: number, z: number, h: number) => {
    if (h > 55 || h < 0) return true;
    for (const c of layout) if (Math.hypot(x - c.x, z - c.y) < 70) return true;
    if (distToPolyline(x, z, river).d < 17) return true;
    for (const r of roads) if (distToPolyline(x, z, r).d < 9) return true;
    if (Math.hypot(x - hub.x, z - hub.y) < 40) return true;
    return false;
  };
  const conifer: THREE.Matrix4[] = [];
  const broad: THREE.Matrix4[] = [];
  const palms: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  for (let x = -SIZE_X / 2 + 10; x < SIZE_X / 2; x += 7.5) {
    for (let z = -SIZE_Z / 2 + 10; z < SIZE_Z / 2; z += 7.5) {
      const jx = x + (hash(x, z) - 0.5) * 7, jz = z + (hash(z, x) - 0.5) * 7;
      const forest = fbm(jx * 0.009 + 11, jz * 0.009 - 4, 4);
      const e = Math.hypot(jx / 400, jz / 285);
      const thresh = e > 0.85 ? 0.42 : 0.56;
      if (forest < thresh) continue;
      const h = heightAt(jx, jz);
      if (avoid(jx, jz, h)) continue;
      const s = 0.8 + hash(jx * 3, jz) * 0.7;
      q.setFromEuler(new THREE.Euler(0, hash(jx, jz * 2) * 6, 0));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(jx, h - 0.3, jz), q, new THREE.Vector3(s, s * (0.9 + hash(jz, jx) * 0.4), s));
      (e > 0.8 || h > 12 ? conifer : forest > 0.65 ? conifer : broad).push(m);
    }
  }
  // نخيل قرب الحصون والساحة
  for (const c of [...layout, hub]) {
    for (let k = 0; k < 10; k++) {
      const a = hash(c.x + k, c.y) * Math.PI * 2, d = 66 + hash(k, c.x) * 22;
      const x = c.x + Math.cos(a) * d, z = c.y + Math.sin(a) * d;
      if (distToPolyline(x, z, river).d < 14) continue;
      let onRoad = false;
      for (const r of roads) if (distToPolyline(x, z, r).d < 8) onRoad = true;
      if (onRoad) continue;
      const s = 0.9 + hash(k, c.y) * 0.4;
      palms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(s, s, s)));
    }
  }
  addTrees(group, conifer, broad, palms);

  // ── القرى ──
  const houses: THREE.Matrix4[] = [];
  const spots: THREE.Vector2[] = [];
  for (let i = 0; i < 260 && spots.length < 7; i++) {
    const x = (hash(i, 1) - 0.5) * 760, z = (hash(1, i) - 0.5) * 520;
    const h = heightAt(x, z);
    if (h > 10 || avoid(x, z, h) || spots.some((s) => s.distanceTo(new THREE.Vector2(x, z)) < 110)) continue;
    spots.push(new THREE.Vector2(x, z));
  }
  for (const sp of spots) for (let k = 0; k < 9; k++) {
    const x = sp.x + (hash(k, sp.x) - 0.5) * 40, z = sp.y + (hash(sp.y, k) - 0.5) * 34;
    const h = heightAt(x, z);
    if (avoid(x, z, h)) continue;
    houses.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.round(hash(x, z) * 4) * (Math.PI / 2) + 0.2, 0)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.9 + hash(z, x) * 0.5)));
  }
  addHouses(group, houses);

  // ── سوق خارجي أمام كل حصن، بمارة يتجولون ──
  const walkers: { mesh: THREE.InstancedMesh; head: THREE.InstancedMesh; data: { c: THREE.Vector2; a: number; r: number; s: number }[] }[] = [];
  layout.forEach((c, ci) => {
    const tm = teamMats(colors[ci] || '#888888');
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1;
      const x = c.x + side * (12 + (k >> 1) * 7), z = c.y + 52 + (k >> 1) * 4;
      const stall = new THREE.Group();
      for (const [px, pz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), mats().darkWood);
        p.position.set(px, 1.3, pz);
        stall.add(p);
      }
      const awn = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.3, 4), k % 3 === 0 ? tm.cloth : k % 3 === 1 ? mats().roofTerracotta : mats().plaster);
      awn.rotation.y = Math.PI / 4;
      awn.position.y = 3.1;
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 1.6), mats().wood);
      table.position.y = 0.45;
      stall.add(awn, table);
      for (let g = 0; g < 4; g++) {
        const good = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), new THREE.MeshStandardMaterial({ color: [0xd8562a, 0xe8c040, 0x6aa040, 0xa04060][g] }));
        good.position.set(-0.9 + g * 0.6, 1.05, 0);
        stall.add(good);
      }
      stall.position.set(x, heightAt(x, z), z);
      stall.rotation.y = side * 0.25;
      stall.traverse((o) => { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
      group.add(stall);
    }
    const fg = figureGeometry();
    const N = 14;
    const robe = new THREE.InstancedMesh(fg.body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), N);
    const head = new THREE.InstancedMesh(fg.head, mats().skin, N);
    const palette = [0xc9b48f, 0x8a5a3a, 0x3e5c8a, 0xa8432f, 0xe0d4b8, 0x5f7f4a];
    const data = [];
    for (let k = 0; k < N; k++) {
      robe.setColorAt(k, new THREE.Color(palette[k % palette.length]));
      data.push({ c: new THREE.Vector2(c.x + (hash(k, ci) - 0.5) * 30, c.y + 58 + hash(ci, k) * 8), a: hash(k * 2, ci) * 6, r: 2 + hash(k, k) * 5, s: 0.2 + hash(ci * 3, k) * 0.3 });
    }
    robe.castShadow = head.castShadow = true;
    group.add(robe, head);
    walkers.push({ mesh: robe, head, data });
  });

  const mtx = new THREE.Matrix4();
  return {
    group,
    heightAt,
    castlePositions,
    update(t) {
      waterNormal.offset.set(t * 0.012, t * 0.02);
      for (const w of walkers) {
        w.data.forEach((d, i) => {
          const a = d.a + t * d.s;
          const x = d.c.x + Math.cos(a) * d.r, z = d.c.y + Math.sin(a) * d.r * 0.5;
          mtx.compose(new THREE.Vector3(x, heightAt(x, z) + 0.05, z), q.setFromEuler(new THREE.Euler(0, -a, 0)), new THREE.Vector3(1.2, 1.2, 1.2));
          w.mesh.setMatrixAt(i, mtx);
          w.head.setMatrixAt(i, mtx);
        });
        w.mesh.instanceMatrix.needsUpdate = true;
        w.head.instanceMatrix.needsUpdate = true;
      }
    },
    setNight(v) {
      waterMat.color.set(v ? 0x1b3a52 : 0x2d84a8);
    },
  };
}

function grassDetail() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x * 0.09, y * 0.09, 3) * 0.6 + Math.random() * 0.4;
    const v = 200 + n * 55;
    const i = (y * S + x) * 4;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 66);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeWaterNormal() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f = (u: number, v: number) => fbm(u * 0.05, v * 0.05, 3);
    const dx = f(x + 1, y) - f(x - 1, y), dy = f(x, y + 1) - f(x, y - 1);
    const i = (y * S + x) * 4;
    img.data[i] = 128 + dx * 600;
    img.data[i + 1] = 128 + dy * 600;
    img.data[i + 2] = 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function addTrees(group: THREE.Group, conifer: THREE.Matrix4[], broad: THREE.Matrix4[], palms: THREE.Matrix4[]) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 1 });
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], tint?: [number, number]) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => {
      im.setMatrixAt(i, m);
      if (tint) {
        const c = new THREE.Color().setHSL(tint[0] + (Math.random() - 0.5) * 0.04, 0.45, tint[1] + (Math.random() - 0.5) * 0.08);
        im.setColorAt(i, c);
      }
    });
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  };
  // صنوبر
  const cg = [new THREE.ConeGeometry(3.4, 5, 8).translate(0, 4.5, 0), new THREE.ConeGeometry(2.7, 4.4, 8).translate(0, 7.2, 0), new THREE.ConeGeometry(1.8, 3.6, 8).translate(0, 9.8, 0)];
  const cmerged = new THREE.BufferGeometry();
  {
    const geos = cg.map((g) => g.toNonIndexed());
    const total = geos.reduce((s, g) => s + g.attributes.position.count, 0);
    const p = new Float32Array(total * 3), n = new Float32Array(total * 3);
    let o = 0;
    for (const g of geos) { p.set(g.attributes.position.array as Float32Array, o * 3); n.set(g.attributes.normal.array as Float32Array, o * 3); o += g.attributes.position.count; }
    cmerged.setAttribute('position', new THREE.BufferAttribute(p, 3));
    cmerged.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  }
  mk(cmerged, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), conifer, [0.33, 0.24]);
  mk(new THREE.CylinderGeometry(0.4, 0.55, 3, 6).translate(0, 1.5, 0), trunkMat, conifer);
  // أشجار عريضة
  mk(new THREE.IcosahedronGeometry(3.6, 1).translate(0, 6.2, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), broad, [0.26, 0.33]);
  mk(new THREE.CylinderGeometry(0.45, 0.65, 4.4, 6).translate(0, 2.2, 0), trunkMat, broad);
  // نخيل
  const trunk = new THREE.CylinderGeometry(0.35, 0.55, 9, 6).translate(0, 4.5, 0);
  mk(trunk, trunkMat, palms);
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const l = new THREE.BoxGeometry(0.9, 0.12, 5).translate(0, 0, 2.6);
    l.rotateX(0.45);
    l.rotateY((i / 7) * Math.PI * 2);
    l.translate(0, 9, 0);
    leaves.push(l.toNonIndexed());
  }
  const lg = new THREE.BufferGeometry();
  {
    const total = leaves.reduce((s, g) => s + g.attributes.position.count, 0);
    const p = new Float32Array(total * 3), n = new Float32Array(total * 3);
    let o = 0;
    for (const g of leaves) { p.set(g.attributes.position.array as Float32Array, o * 3); n.set(g.attributes.normal.array as Float32Array, o * 3); o += g.attributes.position.count; }
    lg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    lg.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  }
  mk(lg, new THREE.MeshStandardMaterial({ color: 0x4f8a34, roughness: 0.8, side: THREE.DoubleSide }), palms);
}

function addHouses(group: THREE.Group, list: THREE.Matrix4[]) {
  if (!list.length) return;
  const body = new THREE.BoxGeometry(5, 3.4, 4).translate(0, 1.7, 0);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-2.9, 0);
  roofShape.lineTo(2.9, 0);
  roofShape.lineTo(0, 2.4);
  roofShape.closePath();
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 4.6, bevelEnabled: false }).translate(0, 3.4, -2.3);
  const a = new THREE.InstancedMesh(body, mats().plaster, list.length);
  const b = new THREE.InstancedMesh(roof, mats().roofTerracotta, list.length);
  list.forEach((m, i) => { a.setMatrixAt(i, m); b.setMatrixAt(i, m); });
  a.castShadow = b.castShadow = true;
  a.receiveShadow = b.receiveShadow = true;
  group.add(a, b);
}

export { MOUND };
