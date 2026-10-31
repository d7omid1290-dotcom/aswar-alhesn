import * as THREE from 'three';
import { smokeTexture, radialTexture } from './textures';
import { mats } from './materials';

// ───────────── نظام جسيمات خفيف (دخان، نار، غبار، شرر) ─────────────
interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; s0: number; s1: number;
  r0: number; g0: number; b0: number; r1: number; g1: number; b1: number;
  a: number; drag: number; grav: number; spin: number;
}

const VS = `
attribute float aSize; attribute vec4 aColor; attribute float aRot;
varying vec4 vColor; varying float vRot;
uniform float uScale;
void main(){
  vColor = aColor; vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uMap; varying vec4 vColor; varying float vRot;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vRot), co = cos(vRot);
  c = mat2(co,-s,s,co) * c + 0.5;
  vec4 t = texture2D(uMap, c);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.003) discard;
}`;

class Pool {
  ps: P[] = [];
  geo = new THREE.BufferGeometry();
  pos: Float32Array; col: Float32Array; size: Float32Array; rot: Float32Array;
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
  constructor(public max: number, map: THREE.Texture, additive: boolean) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: map }, uScale: { value: 600 } },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
  }
  spawn(p: P) {
    if (this.ps.length >= this.max) this.ps.shift();
    this.ps.push(p);
  }
  update(dt: number) {
    const alive: P[] = [];
    for (const p of this.ps) {
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.pow(1 - p.drag, dt * 60);
      p.vx *= k; p.vy = p.vy * k + p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      alive.push(p);
    }
    this.ps = alive;
    const n = alive.length;
    for (let i = 0; i < n; i++) {
      const p = alive[i];
      const t = p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 4] = p.r0 + (p.r1 - p.r0) * t;
      this.col[i * 4 + 1] = p.g0 + (p.g1 - p.g0) * t;
      this.col[i * 4 + 2] = p.b0 + (p.b1 - p.b0) * t;
      this.col[i * 4 + 3] = p.a * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      this.size[i] = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      this.rot[i] = p.spin * p.life;
    }
    this.geo.setDrawRange(0, n);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aRot as THREE.BufferAttribute).needsUpdate = true;
  }
}

export interface Emitter {
  pos: THREE.Vector3;
  rate: number;
  kind: 'smoke' | 'fire' | 'steam';
  acc: number;
  scale: number;
  until?: number;
}

interface Chunk { m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; ground: number; life: number }

export class Fx {
  group = new THREE.Group();
  smoke: Pool;
  glow: Pool;
  emitters: Emitter[] = [];
  chunks: Chunk[] = [];
  rings: { m: THREE.Mesh; life: number; max: number; scale: number }[] = [];
  flash: THREE.PointLight;
  flashLife = 0;
  level: 'full' | 'reduced' | 'off' = 'full';
  time = 0;
  constructor() {
    this.smoke = new Pool(2600, smokeTexture(), false);
    this.glow = new Pool(1400, radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), true);
    this.group.add(this.smoke.points, this.glow.points);
    this.flash = new THREE.PointLight(0xffa040, 0, 120, 1.6);
    this.group.add(this.flash);
  }
  setScale(px: number) {
    this.smoke.mat.uniforms.uScale.value = px;
    this.glow.mat.uniforms.uScale.value = px;
  }
  private mul() { return this.level === 'full' ? 1 : this.level === 'reduced' ? 0.4 : 0.15; }

  puff(at: THREE.Vector3, o: Partial<P> & { spread?: number; up?: number; count?: number; dark?: number; glow?: boolean }) {
    const n = Math.max(1, Math.round((o.count ?? 1) * this.mul()));
    const pool = o.glow ? this.glow : this.smoke;
    for (let i = 0; i < n; i++) {
      const sp = o.spread ?? 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * sp;
      const d = o.dark ?? 0.5;
      pool.spawn({
        x: at.x + Math.cos(a) * r * 0.3, y: at.y, z: at.z + Math.sin(a) * r * 0.3,
        vx: Math.cos(a) * r + (o.vx ?? 0), vy: (o.up ?? 2) * (0.6 + Math.random() * 0.8) + (o.vy ?? 0), vz: Math.sin(a) * r + (o.vz ?? 0),
        life: 0, max: (o.max ?? 3) * (0.7 + Math.random() * 0.6), s0: o.s0 ?? 2, s1: o.s1 ?? 8,
        r0: o.r0 ?? d, g0: o.g0 ?? d * 0.95, b0: o.b0 ?? d * 0.9, r1: o.r1 ?? d * 0.9, g1: o.g1 ?? d * 0.88, b1: o.b1 ?? d * 0.86,
        a: o.a ?? 0.8, drag: o.drag ?? 0.02, grav: o.grav ?? 0, spin: (Math.random() - 0.5) * 1.2,
      });
    }
  }

  fireball(at: THREE.Vector3, power = 1) {
    // وميض + كرة نار + دخان كثيف + شرر + حطام + موجة غبار
    this.flash.position.copy(at).add(new THREE.Vector3(0, 4, 0));
    this.flash.intensity = 4000 * power;
    this.flashLife = 0.7;
    this.puff(at, { glow: true, count: 40 * power, spread: 9 * power, up: 6, s0: 5, s1: 16 * power, max: 0.9, r0: 1, g0: 0.85, b0: 0.45, r1: 0.9, g1: 0.25, b1: 0.05, a: 1, drag: 0.08 });
    this.puff(at, { glow: true, count: 60 * power, spread: 26 * power, up: 14, s0: 0.6, s1: 0.2, max: 1.4, r0: 1, g0: 0.8, b0: 0.3, r1: 1, g1: 0.3, b1: 0, a: 1, drag: 0.03, grav: -22 });
    this.puff(at, { count: 50 * power, spread: 8 * power, up: 7, s0: 6, s1: 22 * power, max: 5, dark: 0.18, a: 0.85, drag: 0.04 });
    this.puff(at.clone().setY(at.y - 0.5), { count: 40 * power, spread: 22 * power, up: 0.8, s0: 3, s1: 12, max: 3, dark: 0.62, r0: 0.66, g0: 0.6, b0: 0.5, a: 0.7, drag: 0.06 });
    this.ring(at, 26 * power);
    this.debris(at, Math.round(26 * power * this.mul()) + 4);
  }

  ring(at: THREE.Vector3, scale: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(at).setY(at.y + 0.3);
    this.group.add(m);
    this.rings.push({ m, life: 0, max: 0.8, scale });
  }

  debris(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.55, 0), i % 4 ? mats().stoneDark : mats().darkWood);
      m.castShadow = true;
      m.position.copy(at).add(new THREE.Vector3(0, 1, 0));
      const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 16;
      this.group.add(m);
      this.chunks.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 10 + Math.random() * 18, Math.sin(a) * sp), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), ground: at.y, life: 0 });
    }
  }

  addEmitter(e: Omit<Emitter, 'acc'>) {
    const em = { ...e, acc: 0 };
    this.emitters.push(em);
    return em;
  }
  removeEmitter(e: Emitter) {
    this.emitters = this.emitters.filter((x) => x !== e);
  }
  clearEmitters() { this.emitters = []; }

  update(dt: number) {
    this.time += dt;
    for (const e of this.emitters) {
      if (e.until && this.time > e.until) continue;
      e.acc += dt * e.rate * (this.level === 'off' ? 0.25 : this.mul());
      while (e.acc >= 1) {
        e.acc -= 1;
        if (e.kind === 'smoke') this.smoke.spawn(mk(e.pos, 0.6 * e.scale, 3 + Math.random() * 2, 6, 2 * e.scale, 11 * e.scale, 0.22, 0.6, 0.012, 0.6, 0.5));
        else if (e.kind === 'steam') this.smoke.spawn(mk(e.pos, 1.2 * e.scale, 1.5, 1.6, 1.2 * e.scale, 6 * e.scale, 0.92, 0.75, 0.05, 1.8, 0.4));
        else {
          this.glow.spawn({ ...mk(e.pos, 0.5 * e.scale, 3, 0.9, 1.6 * e.scale, 0.4 * e.scale, 1, 0.9, 0.03, 0.4, 0.4), r0: 1, g0: 0.7, b0: 0.25, r1: 0.9, g1: 0.2, b1: 0.02 });
        }
      }
    }
    this.smoke.update(dt);
    this.glow.update(dt);
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity *= Math.pow(0.02, dt);
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }
    for (const r of this.rings) {
      r.life += dt;
      const t = r.life / r.max;
      r.m.scale.setScalar(1 + t * r.scale);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
      if (t >= 1) this.group.remove(r.m);
    }
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const c of this.chunks) {
      c.life += dt;
      c.v.y -= 32 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt;
      c.m.rotation.y += c.w.y * dt;
      if (c.m.position.y < c.ground + 0.2) {
        c.m.position.y = c.ground + 0.2;
        c.v.multiplyScalar(0.35);
        c.v.y = Math.abs(c.v.y) * 0.4;
        c.w.multiplyScalar(0.5);
      }
      if (c.life > 6) {
        const mat = c.m.material as THREE.Material;
        void mat;
        this.group.remove(c.m);
        c.m.geometry.dispose();
      }
    }
    this.chunks = this.chunks.filter((c) => c.life <= 6);
  }
}

function mk(pos: THREE.Vector3, spread: number, up: number, max: number, s0: number, s1: number, c0: number, a: number, drag: number, spin: number, c1: number): P {
  const ang = Math.random() * Math.PI * 2;
  const r = Math.random() * spread;
  return {
    x: pos.x + Math.cos(ang) * r, y: pos.y, z: pos.z + Math.sin(ang) * r,
    vx: Math.cos(ang) * r * 0.3 + 0.8, vy: up * (0.7 + Math.random() * 0.6), vz: Math.sin(ang) * r * 0.3,
    life: 0, max: max * (0.7 + Math.random() * 0.6), s0, s1,
    r0: c0, g0: c0 * 0.97, b0: c0 * 0.94, r1: c1, g1: c1 * 0.97, b1: c1 * 0.95,
    a, drag, grav: 0, spin: (Math.random() - 0.5) * spin,
  };
}
