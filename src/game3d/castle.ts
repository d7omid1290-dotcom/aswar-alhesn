import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mats, teamMats, boxUV, cylUV } from './materials';
import type { ElementKind } from '@/engine/types';

// ───────────── قلعة إجرائية كبيرة ─────────────
// الأبعاد بالمتر تقريبًا. مركز القلعة في الأصل، ومستوى الأرض y=0.

export const MOUND = 2.4;
const L = 48; // طول ضلع السور
const T = 2.8; // سماكة السور
const WH = 9; // ارتفاع السور
const TR = 4.8; // نصف قطر البرج الركني
const TH = 17; // ارتفاع البرج الركني
export const CASTLE_RADIUS = 46;

type GeoBucket = Map<THREE.Material, THREE.BufferGeometry[]>;
function add(bucket: GeoBucket, mat: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4) {
  if (m) geo.applyMatrix4(m);
  const g = geo.index ? geo.toNonIndexed() : geo;
  // توحيد السمات حتى يمكن الدمج
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  let arr = bucket.get(mat);
  if (!arr) bucket.set(mat, (arr = []));
  arr.push(g);
}
function flush(bucket: GeoBucket, parent: THREE.Object3D, shadows = true) {
  for (const [mat, geos] of bucket) {
    if (!geos.length) continue;
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
  bucket.clear();
}
const M = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

function stoneBox(b: GeoBucket, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  // إسقاط الخامة بعد التحويل للحصول على حجارة بحجم ثابت
  g.applyMatrix4(M(x, y, z, ry));
  boxUV(g, 7);
  add(b, mat, g);
}
function stoneCyl(b: GeoBucket, mat: THREE.Material, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 20) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false);
  g.translate(0, h / 2, 0);
  cylUV(g, 7);
  g.translate(x, y, z);
  add(b, mat, g);
}

/** صف شرفات (أسنان السور) على خط مستقيم */
function merlonsLine(b: GeoBucket, mat: THREE.Material, x1: number, z1: number, x2: number, z2: number, y: number, size = 1.1) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.floor(len / (size * 2));
  const ang = Math.atan2(x2 - x1, z2 - z1);
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0.5 : i / n;
    const g = new THREE.BoxGeometry(size * 0.55, size * 1.25, size);
    g.translate(0, (size * 1.25) / 2, 0);
    g.applyMatrix4(M(x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t, ang));
    boxUV(g, 7);
    add(b, mat, g);
  }
}
function merlonsRing(b: GeoBucket, mat: THREE.Material, cx: number, cz: number, r: number, y: number, size = 1.1) {
  const n = Math.max(8, Math.floor((Math.PI * 2 * r) / (size * 2)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = new THREE.BoxGeometry(size, size * 1.25, size * 0.55);
    g.translate(0, (size * 1.25) / 2, 0);
    g.applyMatrix4(M(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, -a + Math.PI / 2));
    boxUV(g, 7);
    add(b, mat, g);
  }
}

function cone(b: GeoBucket, mat: THREE.Material, r: number, h: number, x: number, y: number, z: number, seg = 16) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true);
  g.translate(x, y + h / 2, z);
  cylUV(g, 3);
  add(b, mat, g);
}

function gableRoof(b: GeoBucket, mat: THREE.Material, w: number, d: number, h: number, x: number, y: number, z: number, ry = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.25, 0);
  shape.lineTo(w / 2 + 0.25, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d + 0.5, bevelEnabled: false });
  g.translate(0, 0, -(d + 0.5) / 2);
  g.applyMatrix4(M(x, y, z, ry));
  boxUV(g, 3);
  add(b, mat, g);
}

// ───────── شخصيات صغيرة (جنود ومارة) ─────────
let figureGeo: { body: THREE.BufferGeometry; head: THREE.BufferGeometry } | null = null;
export function figureGeometry() {
  if (!figureGeo) {
    const body = new THREE.CylinderGeometry(0.28, 0.42, 1.2, 7);
    body.translate(0, 0.6, 0);
    const head = mergeGeometries([
      new THREE.SphereGeometry(0.24, 8, 6).translate(0, 1.42, 0),
      new THREE.ConeGeometry(0.28, 0.32, 8).translate(0, 1.7, 0),
    ].map((g) => g.toNonIndexed()))!;
    figureGeo = { body, head };
  }
  return figureGeo;
}

// ───────── الصاروخ ومنصة الإطلاق ─────────
export function buildRocket(color: string) {
  const m = mats();
  const tm = teamMats(color);
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 6.2, 18), m.white);
  body.position.y = 3.6;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.9, 18), tm.tabard);
  band.position.y = 5.2;
  const band2 = band.clone();
  band2.position.y = 1.4;
  band2.scale.set(1, 0.4, 1);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.9, 18), m.white);
  nose.position.y = 7.65;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 12), tm.tabard);
  tip.position.y = 8.6;
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 0.6, 14, 1, true), m.darkMetal);
  bell.position.y = 0.3;
  g.add(body, band, band2, nose, tip, bell);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 1.0), tm.tabard);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    fin.position.set(Math.cos(a) * 0.75, 1.2, Math.sin(a) * 0.75);
    fin.rotation.y = -a;
    g.add(fin);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export interface LaunchPad {
  group: THREE.Group;
  rocket: THREE.Group;
  arm: THREE.Group;
  top: THREE.Vector3; // في إحداثيات القلعة
  lights: THREE.Mesh[];
  vent: THREE.Vector3;
}

function buildPad(color: string): Omit<LaunchPad, 'top' | 'vent'> {
  const m = mats();
  const group = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.5, 28), m.darkMetal);
  pad.position.y = 0.25;
  pad.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 6, 36), m.padYellow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.52;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.1, 6, 28), m.padYellow);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.52;
  group.add(pad, ring, ring2);
  // برج الخدمة (شبكة حديدية)
  const gantry = new THREE.Group();
  const H = 10;
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, H, 0.16), m.metal);
    leg.position.set(x, H / 2, z);
    gantry.add(leg);
  }
  for (let y = 1; y < H; y += 1.25) {
    for (const [w, d, x, z] of [[1.3, 0.1, 0, -0.6], [1.3, 0.1, 0, 0.6], [0.1, 1.3, -0.6, 0], [0.1, 1.3, 0.6, 0]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), m.metal);
      bar.position.set(x, y, z);
      gantry.add(bar);
    }
    const diag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.08), m.metal);
    diag.position.set(0, y + 0.6, -0.6);
    diag.rotation.z = 0.75;
    gantry.add(diag);
  }
  const lights: THREE.Mesh[] = [];
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
  lamp.position.set(0, H + 0.2, 0);
  gantry.add(lamp);
  lights.push(lamp);
  gantry.position.set(-2.2, 0.5, 0);
  gantry.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  group.add(gantry);
  // ذراع الخدمة يدور بعيدًا قبل الإطلاق
  const arm = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.5), m.metal);
  beam.position.x = 0.8;
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.9), m.padYellow);
  clamp.position.x = 1.6;
  arm.add(beam, clamp);
  arm.position.set(-1.6, 7.6, 0);
  group.add(arm);
  const rocket = buildRocket(color);
  rocket.position.y = 0.55;
  group.add(rocket);
  return { group, rocket, arm, lights };
}

// ───────── المباني الصغيرة داخل الأسوار ─────────
type PlotKind = 'house' | 'towerhouse' | 'tent' | 'store' | 'well' | 'hay' | 'garden';
const GENERIC: PlotKind[] = ['house', 'towerhouse', 'store', 'house', 'tent', 'well', 'hay', 'garden', 'house', 'store'];

function buildPlotProp(kind: PlotKind | ElementKind, s: number, seed: number, color: string): THREE.Group {
  const m = mats();
  const tm = teamMats(color);
  const g = new THREE.Group();
  const b: GeoBucket = new Map();
  const roofMat = seed % 3 === 0 ? m.roofSlate : m.roofTerracotta;
  const plaster = seed % 2 ? m.plaster : m.plasterB;
  const k = s / 4.6; // مقياس
  switch (kind) {
    case 'house': {
      const w = 3.6 * k, d = 3 * k, h = 2.6 * k;
      stoneBox(b, plaster, w, h, d, 0, 0, 0, (seed % 4) * (Math.PI / 2));
      gableRoof(b, roofMat, w, d, 1.6 * k, 0, h, 0, (seed % 4) * (Math.PI / 2));
      stoneBox(b, m.darkWood, 0.8 * k, 1.4 * k, 0.1, 0, 0, d / 2 + 0.02, (seed % 4) * (Math.PI / 2));
      break;
    }
    case 'towerhouse': {
      stoneCyl(b, m.stone, 1.4 * k, 1.6 * k, 4.4 * k, 0, 0, 0, 14);
      cone(b, roofMat, 1.9 * k, 2.6 * k, 0, 4.4 * k, 0, 14);
      break;
    }
    case 'store': {
      stoneBox(b, m.wood, 4.2 * k, 2.2 * k, 2.6 * k, 0, 0, 0, (seed % 2) * (Math.PI / 2));
      gableRoof(b, roofMat, 4.2 * k, 2.6 * k, 1.3 * k, 0, 2.2 * k, 0, (seed % 2) * (Math.PI / 2) + Math.PI / 2);
      break;
    }
    case 'tent': {
      const c = new THREE.Mesh(new THREE.ConeGeometry(2.0 * k, 2.6 * k, 6), seed % 2 ? m.plaster : tm.cloth);
      c.position.y = 1.3 * k;
      c.castShadow = true;
      g.add(c);
      break;
    }
    case 'well': {
      stoneCyl(b, m.stone, 1.1 * k, 1.2 * k, 1.0 * k, 0, 0, 0, 14);
      stoneBox(b, m.darkWood, 0.2, 2.2 * k, 0.2, -0.9 * k, 0, 0);
      stoneBox(b, m.darkWood, 0.2, 2.2 * k, 0.2, 0.9 * k, 0, 0);
      gableRoof(b, roofMat, 2.2 * k, 1.4 * k, 0.8 * k, 0, 2.2 * k, 0, Math.PI / 2);
      for (let i = 0; i < 3; i++) stoneCyl(b, m.darkWood, 0.35 * k, 0.4 * k, 0.9 * k, 2 * k, 0, (i - 1) * 0.9 * k, 10);
      break;
    }
    case 'hay': {
      for (let i = 0; i < 3; i++) {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * k, 0.8 * k, 1.4 * k, 12), m.hay);
        h.rotation.z = Math.PI / 2;
        h.position.set((i - 1) * 1.5 * k, 0.8 * k, 0);
        h.castShadow = true;
        g.add(h);
      }
      for (let i = -2; i <= 2; i++) stoneBox(b, m.darkWood, 0.15, 1.0 * k, 0.15, i * 1.0 * k, 0, 1.6 * k);
      stoneBox(b, m.darkWood, 4.2 * k, 0.12, 0.12, 0, 0.8 * k, 1.6 * k);
      break;
    }
    case 'garden': {
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 * k, 0), new THREE.MeshStandardMaterial({ color: 0x4f8a3a, flatShading: true }));
        t.position.set(Math.cos(i * 1.6) * 1.4 * k, 1.2 * k, Math.sin(i * 1.6) * 1.4 * k);
        t.castShadow = true;
        g.add(t);
        stoneBox(b, m.darkWood, 0.18, 0.8 * k, 0.18, t.position.x, 0, t.position.z);
      }
      break;
    }
    // ───── عناصر ظاهرة (نمط الأرقام المخفية، وعند الكشف) ─────
    case 'king': {
      stoneCyl(b, m.stone, 2.0 * k, 2.2 * k, 3.4 * k, 0, 0, 0, 16);
      cone(b, tm.roof, 2.5 * k, 2.4 * k, 0, 3.4 * k, 0, 16);
      const crown = buildCrown(0.9 * k);
      crown.position.y = 6.2 * k;
      g.add(crown);
      break;
    }
    case 'knight': {
      stoneBox(b, m.wood, 4.4 * k, 2.0 * k, 2.2 * k, 0, 0, -0.8 * k);
      gableRoof(b, roofMat, 4.4 * k, 2.2 * k, 1.0 * k, 0, 2.0 * k, -0.8 * k, Math.PI / 2);
      for (let i = 0; i < 2; i++) {
        const h = buildHorse(k);
        h.position.set((i - 0.5) * 2.2 * k, 0, 1.4 * k);
        g.add(h);
      }
      break;
    }
    case 'guard': {
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) stoneBox(b, m.darkWood, 0.25, 3.6 * k, 0.25, x * k, 0, z * k);
      stoneBox(b, m.wood, 2.6 * k, 0.3, 2.6 * k, 0, 3.6 * k, 0);
      cone(b, roofMat, 2.0 * k, 1.4 * k, 0, 4.6 * k, 0, 4);
      break;
    }
    case 'artillery': {
      stoneBox(b, m.stone, 3.6 * k, 0.9 * k, 3.6 * k, 0, 0, 0);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * k, 0.5 * k, 3 * k, 12), m.darkMetal);
      barrel.rotation.x = -Math.PI / 2.6;
      barrel.position.set(0, 1.8 * k, 0.4 * k);
      barrel.castShadow = true;
      g.add(barrel);
      for (const x of [-0.7, 0.7]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * k, 0.6 * k, 0.2, 12), m.darkWood);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x * k, 1.4 * k, 0);
        g.add(wheel);
      }
      break;
    }
    case 'market': {
      for (let i = 0; i < 2; i++) {
        const x = (i - 0.5) * 2.6 * k;
        for (const [px, pz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) stoneBox(b, m.darkWood, 0.12, 1.8 * k, 0.12, x + px * k, 0, pz * k);
        const awn = new THREE.Mesh(new THREE.ConeGeometry(1.6 * k, 0.9 * k, 4), i ? tm.cloth : m.roofTerracotta);
        awn.rotation.y = Math.PI / 4;
        awn.position.set(x, 2.2 * k, 0);
        awn.castShadow = true;
        g.add(awn);
        stoneBox(b, m.wood, 1.6 * k, 0.6 * k, 1.0 * k, x, 0, 0);
      }
      break;
    }
    case 'empty':
    case 'custom':
    default: {
      for (let i = 0; i < 3; i++) stoneBox(b, m.wood, 0.9 * k, 0.9 * k, 0.9 * k, (i - 1) * 1.1 * k, 0, (seed % 3) * 0.3 * k, i * 0.4);
      break;
    }
  }
  flush(b, g);
  return g;
}

export function buildCrown(s = 1) {
  const m = mats();
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1 * s, 0.9 * s, 0.7 * s, 16, 1, true), m.gold);
  g.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 0.8 * s, 6), m.gold);
    spike.position.set(Math.cos(a) * 0.95 * s, 0.7 * s, Math.sin(a) * 0.95 * s);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 6, 5), new THREE.MeshStandardMaterial({ color: 0xc8243a, emissive: 0x500010, roughness: 0.2 }));
    gem.position.set(Math.cos(a) * 1.0 * s, 0, Math.sin(a) * 1.0 * s);
    g.add(spike, gem);
  }
  return g;
}

function buildHorse(k: number) {
  const m = mats();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6 * k, 0.6 * k, 1.5 * k), m.horse);
  body.position.y = 1.0 * k;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35 * k, 0.8 * k, 0.4 * k), m.horse);
  neck.position.set(0, 1.5 * k, 0.75 * k);
  neck.rotation.x = 0.5;
  g.add(body, neck);
  for (const [x, z] of [[-0.2, -0.55], [0.2, -0.55], [-0.2, 0.55], [0.2, 0.55]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14 * k, 0.8 * k, 0.14 * k), m.horse);
    leg.position.set(x * k, 0.4 * k, z * k);
    g.add(leg);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

function buildRubble(s: number, seed: number) {
  const m = mats();
  const g = new THREE.Group();
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(s * 0.55, 20), m.scorch);
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.12;
  g.add(scorch);
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const b: GeoBucket = new Map();
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * s * 0.4;
    const geo = new THREE.DodecahedronGeometry(0.3 + rnd() * 0.7, 0);
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, 0.2 + rnd() * 0.4, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), new THREE.Vector3(1, 0.6 + rnd() * 0.6, 1)));
    add(b, i % 3 ? m.rubble : m.stoneDark, geo);
  }
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BoxGeometry(0.2, 0.2, 1.8 + rnd() * 1.5);
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((rnd() - 0.5) * s * 0.5, 0.5, (rnd() - 0.5) * s * 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() - 0.5, rnd() * 3, 0.3)), new THREE.Vector3(1, 1, 1)));
    add(b, mats().darkWood, geo);
  }
  flush(b, g);
  return g;
}

// ───────── بناء القلعة الكاملة ─────────
export interface CastleHandle {
  group: THREE.Group;
  color: string;
  slotCount: number;
  slotSize: number;
  anchors: THREE.Vector3[]; // نقاط المواقع (محلية)
  plots: THREE.Group[]; // مجموعة لكل موضع مرئي
  pads: LaunchPad[];
  banners: { mesh: THREE.Mesh; base: Float32Array; phase: number }[];
  keepTop: THREE.Group; // الجزء العلوي من برج الملك (ينهار عند سقوط الملك)
  keepBanner: THREE.Mesh;
  scaffold: THREE.Group;
  windows: THREE.Mesh[];
  soldiers: { mesh: THREE.InstancedMesh; head: THREE.InstancedMesh; paths: { a: THREE.Vector3; b: THREE.Vector3; t: number; speed: number }[] };
  torches: THREE.Mesh[];
  hitVisuals: Set<number>;
  setPlot(i: number, mode: 'generic' | 'element' | 'destroyed', kind?: ElementKind): void;
  setKingState(state: 'standing' | 'fallen', rebuild?: number): void;
  setEliminated(v: boolean): void;
  update(t: number, dt: number): void;
}

function computeAnchors(n: number) {
  // منطقة المواقع: الساحة الأمامية + جانبا برج الملك
  const inner = L / 2 - T / 2 - 2.6;
  const keepHalfW = 9, keepBack = -inner, keepFront = 1;
  const inside = (x: number, z: number) => Math.abs(x) <= inner && Math.abs(z) <= inner && !(Math.abs(x) < keepHalfW && z < keepFront) && !(Math.abs(x) < 4.5 && z > inner - 4);
  const area = (2 * inner) ** 2 - 2 * keepHalfW * (keepFront - keepBack);
  let s = Math.sqrt(area / n) * 0.95;
  let pts: THREE.Vector3[] = [];
  for (let iter = 0; iter < 30; iter++) {
    pts = [];
    for (let z = -inner + s / 2; z <= inner - s / 2 + 0.01; z += s)
      for (let x = -inner + s / 2; x <= inner - s / 2 + 0.01; x += s) if (inside(x, z)) pts.push(new THREE.Vector3(x, 0, z));
    if (pts.length >= n) break;
    s *= 0.95;
  }
  // اختيار أبعد النقاط عن بعضها لتوزيع متوازن
  const chosen: THREE.Vector3[] = [pts[Math.floor(pts.length / 2)]];
  while (chosen.length < n) {
    let best = pts[0], bd = -1;
    for (const p of pts) {
      if (chosen.includes(p)) continue;
      let d = Infinity;
      for (const c of chosen) d = Math.min(d, p.distanceToSquared(c));
      if (d > bd) { bd = d; best = p; }
    }
    chosen.push(best);
  }
  // ترقيم من الخلف إلى الأمام، ومن اليمين إلى اليسار
  chosen.sort((a, b) => (Math.abs(a.z - b.z) > s * 0.5 ? a.z - b.z : b.x - a.x));
  return { anchors: chosen.map((p) => new THREE.Vector3(p.x, MOUND, p.z)), size: Math.min(s, 8) };
}

export function buildCastle(opts: { color: string; slotCount: number; seed: number; showElements?: string[] | null; elementKinds?: Record<string, ElementKind> }): CastleHandle {
  const m = mats();
  const tm = teamMats(opts.color);
  const group = new THREE.Group();
  const b: GeoBucket = new Map();

  // ── التلة والخندق ──
  {
    const shape = new THREE.Shape();
    const R = L / 2 + 8, c = 10;
    shape.moveTo(-R + c, -R);
    shape.lineTo(R - c, -R);
    shape.quadraticCurveTo(R, -R, R, -R + c);
    shape.lineTo(R, R - c);
    shape.quadraticCurveTo(R, R, R - c, R);
    shape.lineTo(-R + c, R);
    shape.quadraticCurveTo(-R, R, -R, R - c);
    shape.lineTo(-R, -R + c);
    shape.quadraticCurveTo(-R, -R, -R + c, -R);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: MOUND + 2, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.6, bevelSegments: 2, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -2 - 1.2, 0);
    boxUV(geo, 7);
    add(b, m.stoneDark, geo);
    const top = new THREE.PlaneGeometry(2 * R, 2 * R);
    top.rotateX(-Math.PI / 2);
    top.translate(0, MOUND + 0.01, 0);
    boxUV(top, 9);
    add(b, m.cobble, top);
  }

  // ── الأسوار ──
  const y0 = MOUND;
  const half = L / 2;
  const walls: [number, number, number, number][] = [
    [-half, -half, half, -half],
    [half, -half, half, half],
    [-half, half, -5.5, half],
    [5.5, half, half, half],
    [-half, -half, -half, half],
  ];
  for (const [x1, z1, x2, z2] of walls) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(x2 - x1, z2 - z1);
    stoneBox(b, m.stone, T, WH, len, (x1 + x2) / 2, y0, (z1 + z2) / 2, ang);
    // إفريز بارز أعلى السور
    stoneBox(b, m.stoneDark, T + 0.6, 0.6, len, (x1 + x2) / 2, y0 + WH - 0.6, (z1 + z2) / 2, ang);
    const nx = Math.cos(ang) * (T / 2), nz = -Math.sin(ang) * (T / 2);
    merlonsLine(b, m.stone, x1 + nx, z1 + nz, x2 + nx, z2 + nz, y0 + WH);
    merlonsLine(b, m.stone, x1 - nx, z1 - nz, x2 - nx, z2 - nz, y0 + WH, 0.8);
  }

  // ── البوابة ──
  for (const sx of [-1, 1]) {
    stoneCyl(b, m.stone, 3.0, 3.2, WH + 4, sx * 6.2, y0, half + 0.6, 18);
    merlonsRing(b, m.stone, sx * 6.2, half + 0.6, 2.9, y0 + WH + 4);
    cone(b, tm.roof, 3.7, 4.5, sx * 6.2, y0 + WH + 5.3, half + 0.6, 18);
  }
  stoneBox(b, m.stone, 9, 3.5, T + 1, 0, y0 + WH - 3.5, half);
  merlonsLine(b, m.stone, -4.4, half + 1.4, 4.4, half + 1.4, y0 + WH);
  {
    // فتحة البوابة المقوسة
    const s = new THREE.Shape();
    s.moveTo(-2.6, 0);
    s.lineTo(2.6, 0);
    s.lineTo(2.6, 4.5);
    s.absarc(0, 4.5, 2.6, 0, Math.PI, false);
    s.lineTo(-2.6, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
    g.translate(0, y0, half + T / 2 + 0.55);
    add(b, m.void, g);
    // شبكة البوابة الحديدية
    for (let i = -2; i <= 2; i++) stoneBox(b, m.darkMetal, 0.15, 6.5, 0.15, i * 1.0, y0, half + T / 2 + 0.95);
    for (let j = 1; j <= 5; j++) stoneBox(b, m.darkMetal, 5, 0.15, 0.15, 0, y0 + j * 1.2, half + T / 2 + 0.95);
    // الجسر الخشبي فوق الخندق
    const bridge = new THREE.BoxGeometry(5, 0.45, 16);
    bridge.translate(0, y0 - 0.9, half + T / 2 + 8.5);
    bridge.rotateX(0);
    boxUV(bridge, 3);
    add(b, m.wood, bridge);
  }

  // ── الأبراج الركنية الأربعة مع منصات الإطلاق ──
  const pads: LaunchPad[] = [];
  const corners: [number, number][] = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (const [cx, cz] of corners) {
    stoneCyl(b, m.stone, TR, TR + 0.6, TH, cx, y0, cz, 24);
    stoneCyl(b, m.stoneDark, TR + 0.9, TR, 1.4, cx, y0 + TH - 1.4, cz, 24);
    stoneCyl(b, m.stoneDark, TR + 0.9, TR + 0.9, 0.5, cx, y0 + TH, cz, 24);
    merlonsRing(b, m.stone, cx, cz, TR + 0.6, y0 + TH + 0.5);
    // نوافذ سهمية
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      stoneBox(b, m.void, 0.5, 2.2, 0.3, cx + Math.cos(a) * (TR + 0.42), y0 + TH * 0.55, cz + Math.sin(a) * (TR + 0.42), -a + Math.PI / 2);
    }
    const pad = buildPad(opts.color);
    pad.group.position.set(cx, y0 + TH + 0.5, cz);
    pad.group.scale.setScalar(0.92);
    // البرج يوجه برج الخدمة للخارج
    pad.group.rotation.y = Math.atan2(-cz, cx) + Math.PI;
    group.add(pad.group);
    pads.push({ ...pad, top: new THREE.Vector3(cx, y0 + TH + 0.5, cz), vent: new THREE.Vector3(cx, y0 + TH + 1, cz) });
  }

  // ── برج الملك (الحصن الداخلي) ──
  const kz = -half + 13;
  stoneBox(b, m.stone, 17, 15, 13, 0, y0, kz);
  stoneBox(b, m.stoneDark, 17.8, 0.7, 13.8, 0, y0 + 14.3, kz);
  merlonsLine(b, m.stone, -8.6, kz + 6.6, 8.6, kz + 6.6, y0 + 15);
  merlonsLine(b, m.stone, -8.6, kz - 6.6, 8.6, kz - 6.6, y0 + 15);
  merlonsLine(b, m.stone, -8.6, kz - 6.6, -8.6, kz + 6.6, y0 + 15);
  merlonsLine(b, m.stone, 8.6, kz - 6.6, 8.6, kz + 6.6, y0 + 15);
  for (const [x, z] of [[-8.5, kz - 6.5], [8.5, kz - 6.5], [-8.5, kz + 6.5], [8.5, kz + 6.5]]) {
    stoneCyl(b, m.stone, 2.0, 2.2, 19, x, y0, z, 16);
    cone(b, tm.roof, 2.7, 5.2, x, y0 + 19, z, 16);
  }
  // باب ونوافذ برج الملك
  const windows: THREE.Mesh[] = [];
  {
    const s = new THREE.Shape();
    s.moveTo(-1.8, 0);
    s.lineTo(1.8, 0);
    s.lineTo(1.8, 3);
    s.absarc(0, 3, 1.8, 0, Math.PI, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false });
    g.translate(0, y0, kz + 6.55);
    add(b, m.void, g);
    for (const x of [-5.5, 5.5]) for (const y of [7, 11]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.2), m.windowGlow);
      w.position.set(x, y0 + y, kz + 6.55);
      group.add(w);
      windows.push(w);
    }
  }
  flush(b, group);

  // الجزء العلوي القابل للانهيار: البرج المركزي العالي والتاج والراية
  const keepTop = new THREE.Group();
  {
    const kb: GeoBucket = new Map();
    stoneCyl(kb, m.stone, 3.6, 3.9, 13, 0, 0, 0, 22);
    stoneCyl(kb, m.stoneDark, 4.4, 3.6, 1.2, 0, 13, 0, 22);
    merlonsRing(kb, m.stone, 0, 0, 4.1, 14.2);
    cone(kb, tm.roof, 4.6, 9, 0, 14.2, 0, 22);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      stoneBox(kb, m.void, 0.7, 2.0, 0.3, Math.cos(a) * 3.85, 7, Math.sin(a) * 3.85, -a + Math.PI / 2);
    }
    flush(kb, keepTop);
    const crown = buildCrown(1.1);
    crown.position.y = 23.6;
    crown.name = 'crown';
    keepTop.add(crown);
    keepTop.position.set(0, y0 + 15, kz - 1);
  }
  group.add(keepTop);

  // الرايات
  const banners: CastleHandle['banners'] = [];
  const mkBanner = (w: number, h: number, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    const geo = new THREE.PlaneGeometry(w, h, 6, 8);
    geo.translate(w / 2, -h / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    parent.add(mesh);
    banners.push({ mesh, base: (geo.attributes.position.array as Float32Array).slice(), phase: Math.random() * 6 });
    return mesh;
  };
  // راية فوق البرج المركزي
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), m.darkWood);
  pole.position.set(0, 26.5, 0);
  keepTop.add(pole);
  mkBanner(4.2, 2.6, tm.cloth, keepTop, 0.1, 29.3, 0);
  // راية ملكية كبيرة معلقة على واجهة برج الملك
  const keepBanner = mkBanner(3.6, 8, tm.royal, group, -1.8, y0 + 13.6, kz + 6.75);
  // رايات الأسوار
  for (const [x, z, ry] of [[-14, half + 1.6, 0], [14, half + 1.6, 0], [-half - 1.6, 0, -Math.PI / 2], [half + 1.6, 0, Math.PI / 2]] as const) {
    mkBanner(1.8, 4.2, tm.banner, group, x - 0.9, y0 + WH - 0.4, z, ry);
  }
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), m.darkWood);
    p.position.set(sx * 6.2, y0 + WH + 11.5, half + 0.6);
    group.add(p);
    mkBanner(2.4, 1.5, tm.cloth, group, sx * 6.2 + 0.05, y0 + WH + 13.3, half + 0.6);
  }

  // سقالات إعادة البناء (مخفية افتراضيًا)
  const scaffold = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 16, 0.25), m.wood);
    p.position.set(Math.cos(a) * 5, 8, Math.sin(a) * 5);
    scaffold.add(p);
  }
  for (let y = 2; y < 16; y += 3) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(5, 0.12, 4, 8), m.wood);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    scaffold.add(r);
  }
  scaffold.position.set(0, y0 + 15, kz - 1);
  scaffold.visible = false;
  group.add(scaffold);

  // ── المواقع ──
  const { anchors, size } = computeAnchors(opts.slotCount);
  const plots: THREE.Group[] = [];
  anchors.forEach((p, i) => {
    const plot = new THREE.Group();
    plot.position.copy(p);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.46, size * 0.5, 0.25, 24), m.stoneDark);
    base.position.y = 0.12;
    base.receiveShadow = true;
    base.name = 'base';
    plot.add(base);
    group.add(plot);
    plots.push(plot);
  });

  // ── جنود يتجولون على الأسوار ──
  const fg = figureGeometry();
  const paths: CastleHandle['soldiers']['paths'] = [];
  const wy = y0 + WH;
  const lanes: [number, number, number, number][] = [
    [-half + 5, half - 0.3, -7.5, half - 0.3], [7.5, half - 0.3, half - 5, half - 0.3],
    [-half - 0.2, -half + 5, -half - 0.2, half - 5], [half + 0.2, -half + 5, half + 0.2, half - 5], [-half + 5, -half, half - 5, -half],
  ];
  for (const [x1, z1, x2, z2] of lanes) for (let k = 0; k < 3; k++)
    paths.push({ a: new THREE.Vector3(x1, wy, z1), b: new THREE.Vector3(x2, wy, z2), t: Math.random(), speed: 0.02 + Math.random() * 0.03 });
  // حراس ثابتون على أبراج البوابة
  const total = paths.length;
  const body = new THREE.InstancedMesh(fg.body, tm.tabard, total);
  const head = new THREE.InstancedMesh(fg.head, m.steel, total);
  body.castShadow = head.castShadow = true;
  group.add(body, head);

  // ── المشاعل ──
  const torches: THREE.Mesh[] = [];
  for (const [x, z] of [[-3.4, half + 2], [3.4, half + 2], [-2.4, kz + 6.9], [2.4, kz + 6.9]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), m.flame.clone());
    f.position.set(x, y0 + (z > 0 && Math.abs(z) > half ? 5.2 : 3.8), z);
    group.add(f);
    torches.push(f);
  }

  const handle: CastleHandle = {
    group, color: opts.color, slotCount: opts.slotCount, slotSize: size, anchors, plots, pads, banners, keepTop, keepBanner, scaffold, windows,
    soldiers: { mesh: body, head, paths }, torches, hitVisuals: new Set(),
    setPlot(i, mode, kind) {
      const plot = plots[i];
      if (!plot) return;
      for (const c of [...plot.children]) if (c.name !== 'base') plot.remove(c);
      if (mode === 'generic') {
        const pk = GENERIC[(i * 7 + opts.seed * 3) % GENERIC.length];
        plot.add(buildPlotProp(pk, size, i + opts.seed, opts.color));
      } else if (mode === 'element') {
        plot.add(buildPlotProp(kind ?? 'empty', size, i + opts.seed, opts.color));
      } else {
        const rub = buildRubble(size, i + 1);
        rub.name = 'rubble';
        plot.add(rub);
        // بقايا العنصر المكشوف: أثر مائل محطم
        if (kind && kind !== 'empty') {
          const prop = buildPlotProp(kind, size * 0.8, i, opts.color);
          prop.rotation.z = 0.35;
          prop.rotation.x = -0.2;
          prop.position.y = -0.4;
          prop.traverse((o) => {
            const mm = o as THREE.Mesh;
            if (mm.material && (mm.material as THREE.MeshStandardMaterial).color) {
              mm.material = (mm.material as THREE.MeshStandardMaterial).clone();
              (mm.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.45);
            }
          });
          plot.add(prop);
        }
        handle.hitVisuals.add(i);
      }
    },
    setKingState(state, rebuild = 0) {
      const crown = keepTop.getObjectByName('crown');
      if (state === 'standing') {
        keepTop.visible = true;
        keepTop.rotation.set(0, 0, 0);
        keepTop.position.y = y0 + 15;
        keepTop.scale.setScalar(1);
        if (crown) crown.visible = true;
        keepBanner.visible = true;
        scaffold.visible = false;
      } else {
        keepBanner.visible = false;
        if (crown) crown.visible = false;
        if (rebuild > 0) {
          // مراحل إعادة البناء: يرتفع البرج تدريجيًا داخل السقالات
          scaffold.visible = true;
          keepTop.visible = true;
          keepTop.rotation.set(0, 0, 0);
          keepTop.scale.set(1, Math.max(0.05, rebuild), 1);
          keepTop.position.y = y0 + 15;
        } else {
          scaffold.visible = false;
          keepTop.visible = false;
        }
      }
    },
    setEliminated(v) {
      group.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh && mm.material === tm.cloth) mm.visible = !v;
      });
    },
    update(t, dt) {
      // تموج الرايات
      for (const bn of banners) {
        if (!bn.mesh.visible) continue;
        const pos = bn.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < pos.count; i++) {
          const x = bn.base[i * 3], y = bn.base[i * 3 + 1];
          arr[i * 3 + 2] = bn.base[i * 3 + 2] + Math.sin(t * 3 + x * 1.6 + y * 0.4 + bn.phase) * 0.18 * x;
        }
        pos.needsUpdate = true;
        bn.mesh.geometry.computeVertexNormals();
      }
      // الجنود
      const mtx = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      paths.forEach((p, i) => {
        p.t += p.speed * dt;
        const k = (Math.sin(p.t * Math.PI * 2) + 1) / 2;
        const pos = new THREE.Vector3().lerpVectors(p.a, p.b, k);
        const dir = Math.cos(p.t * Math.PI * 2) > 0 ? 1 : -1;
        q.setFromEuler(new THREE.Euler(0, Math.atan2(p.b.x - p.a.x, p.b.z - p.a.z) + (dir > 0 ? 0 : Math.PI), 0));
        mtx.compose(pos, q, new THREE.Vector3(1.3, 1.3, 1.3));
        body.setMatrixAt(i, mtx);
        head.setMatrixAt(i, mtx);
      });
      body.instanceMatrix.needsUpdate = true;
      head.instanceMatrix.needsUpdate = true;
      for (const f of torches) f.scale.setScalar(0.85 + Math.sin(t * 17 + f.position.x) * 0.12 + Math.random() * 0.08);
      for (const pd of pads) for (const l of pd.lights) l.visible = Math.sin(t * 4) > 0;
    },
  };
  // المواقع العامة: نماذج محايدة لا تكشف السر، أو عناصر ظاهرة في نمط الأرقام المخفية
  for (let i = 0; i < opts.slotCount; i++) {
    if (opts.showElements && opts.elementKinds) handle.setPlot(i, 'element', opts.elementKinds[opts.showElements[i]] ?? 'empty');
    else handle.setPlot(i, 'generic');
  }
  group.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh) mm.receiveShadow = true;
  });
  return handle;
}
