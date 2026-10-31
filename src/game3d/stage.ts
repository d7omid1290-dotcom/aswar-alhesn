import * as THREE from 'three';
import { buildWorld, type WorldInfo } from './world';
import { buildCastle, buildRocket, CASTLE_RADIUS, type CastleHandle } from './castle';
import { Fx, type Emitter } from './fx';
import { mats } from './materials';
import { ELEMENT_META } from '@/engine/defaults';
import type { ElementKind, PublicTeam } from '@/engine/types';

// ───────────── المسرح: الخريطة، القلاع، الكاميرا السينمائية، مشهد الضربة ─────────────

export interface StageTeam { id: string; name: string; color: string }
export interface StrikeParams {
  attackerId: string;
  targetId: string;
  visualSlot: number;
  kind: ElementKind;
  name: string;
  points: number;
  kingFell: boolean;
}
export type StrikePhase = 'approach' | 'prep' | 'countdown' | 'ignition' | 'flight' | 'impact' | 'reveal' | 'return' | 'done';

interface CamState { target: THREE.Vector3; dist: number; az: number; el: number }
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
  sun = new THREE.DirectionalLight(0xfff1d6, 2.8);
  hemi = new THREE.HemisphereLight(0xbcd8ff, 0x5a6b3a, 0.9);
  fx = new Fx();
  world: WorldInfo | null = null;
  castles = new Map<string, CastleHandle>();
  teams: StageTeam[] = [];
  private teamKey = '';
  private container: HTMLElement;
  private labelLayer: HTMLDivElement;
  private castleLabels = new Map<string, HTMLButtonElement>();
  private slotLabels: HTMLButtonElement[] = [];
  private slotLayerTeam: string | null = null;
  private cam: CamState = { target: new THREE.Vector3(), dist: 600, az: -0.18, el: 0.95 };
  private follow: { obj: THREE.Object3D; dist: number; el: number; az: number } | null = null;
  private shake = 0;
  private clock = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private skipping = false;
  private busy = false;
  private persistentEmitters = new Map<string, Emitter>();
  private markers = new Map<string, THREE.Sprite>();
  private highlightRing: THREE.Mesh;
  private pickableCastles = new Set<string>();
  private night = false;
  private hiddenNumbers = false;
  private slotCount = 15;
  private layout: string[] | null = null;
  private kinds: Record<string, ElementKind> = {};
  private animating = new Set<string>(); // مواضع قيد التحريك الآن (لا تطبق مزامنتها)
  mode: 'map' | 'fortress' = 'map';
  focusTeamId: string | null = null;
  onCastlePick: ((teamId: string) => void) | null = null;
  onSlotPick: ((slot: number) => void) | null = null;
  onSlotHover: ((slot: number | null) => void) | null = null;
  effects: 'full' | 'reduced' | 'off' = 'full';
  /** للتصوير والاختبار: ينفذ الحركات فورًا */
  instant = false;
  private pickableSlots = new Set<number>();
  private ro: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    let low = false;
    try { low = localStorage.getItem('aswar:quality') === 'low'; } catch { /* */ }
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(low ? Math.min(window.devicePixelRatio, 1) * 0.6 : Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'stage-canvas';
    container.appendChild(this.renderer.domElement);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'stage-labels';
    container.appendChild(this.labelLayer);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.fx.group);
    this.scene.fog = new THREE.Fog(0xcfe0ea, 900, 2400);

    this.highlightRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.95 }));
    this.highlightRing.rotation.x = Math.PI / 2;
    this.highlightRing.visible = false;
    this.scene.add(this.highlightRing);

    this.setTheme('day');
    this.renderer.domElement.addEventListener('pointerdown', this.onPointer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  // ───────── الإعداد ─────────
  setup(teams: StageTeam[], slotCount: number, layout: string[] | null, kinds: Record<string, ElementKind>) {
    const key = JSON.stringify([teams.map((t) => [t.id, t.color]), slotCount, layout]);
    this.teams = teams;
    this.kinds = kinds;
    // الأسماء يمكن أن تتغير دون إعادة البناء
    for (const t of teams) {
      const l = this.castleLabels.get(t.id);
      if (l) l.querySelector('.cl-name')!.textContent = t.name;
    }
    if (key === this.teamKey) return;
    this.teamKey = key;
    this.slotCount = slotCount;
    this.layout = layout;
    this.hiddenNumbers = !!layout;
    if (this.world) {
      this.scene.remove(this.world.group);
      dispose(this.world.group);
    }
    for (const c of this.castles.values()) {
      this.scene.remove(c.group);
      dispose(c.group);
    }
    this.castles.clear();
    this.fx.clearEmitters();
    this.persistentEmitters.clear();
    for (const m of this.markers.values()) this.scene.remove(m);
    this.markers.clear();
    this.castleLabels.forEach((l) => l.remove());
    this.castleLabels.clear();
    this.clearSlotLabels();

    this.world = buildWorld(teams.length, teams.map((t) => t.color));
    this.scene.add(this.world.group);
    teams.forEach((t, i) => {
      const c = buildCastle({ color: t.color, slotCount, seed: i * 5 + 1, showElements: layout, elementKinds: kinds });
      const p = this.world!.castlePositions[i];
      c.group.position.set(p.x, 0, p.z);
      this.scene.add(c.group);
      this.castles.set(t.id, c);
      const label = document.createElement('button');
      label.className = 'castle-label';
      label.style.setProperty('--team', t.color);
      label.innerHTML = `<span class="cl-dot"></span><span class="cl-name"></span><span class="cl-state"></span>`;
      label.querySelector('.cl-name')!.textContent = t.name;
      label.onclick = (e) => { e.stopPropagation(); this.onCastlePick?.(t.id); };
      this.labelLayer.appendChild(label);
      this.castleLabels.set(t.id, label);
    });
    this.setNightLights();
    this.showMap(false);
  }

  /** يطبق حالة الدمار الدائمة من حالة المباراة */
  sync(teams: PublicTeam[], rebuildRequired = 3) {
    for (const t of teams) {
      const c = this.castles.get(t.id);
      if (!c) continue;
      for (const [slotStr, hit] of Object.entries(t.hits)) {
        const vs = hit.visualSlot;
        const key = `${t.id}:${vs}`;
        if (this.animating.has(key) || c.hitVisuals.has(vs)) continue;
        c.setPlot(vs, 'destroyed', hit.kind);
        this.addPersistentDamage(t.id, vs, hit.kind, false);
        void slotStr;
      }
      if (!this.animating.has(`${t.id}:king`)) {
        if (t.kingDown) c.setKingState('fallen', t.rebuild.active ? Math.max(0.12, t.rebuild.progress / rebuildRequired) : 0);
        else c.setKingState('standing');
      }
      c.setEliminated(t.eliminated);
      const label = this.castleLabels.get(t.id);
      if (label) {
        label.classList.toggle('is-out', t.eliminated);
        label.classList.toggle('is-down', t.kingDown && !t.eliminated);
        label.querySelector('.cl-state')!.textContent = t.eliminated ? 'سقط' : t.rebuild.active ? `إعادة بناء ${t.rebuild.progress}/${rebuildRequired}` : t.kingDown ? 'سقط الملك' : '';
      }
      if (t.eliminated && !this.persistentEmitters.has(t.id + ':out')) {
        const p = c.group.position.clone().add(new THREE.Vector3(0, 20, -8));
        this.persistentEmitters.set(t.id + ':out', this.fx.addEmitter({ pos: p, rate: 4, kind: 'smoke', scale: 2.2 }));
      }
    }
  }

  private addPersistentDamage(teamId: string, vs: number, kind: ElementKind, fresh: boolean) {
    const c = this.castles.get(teamId)!;
    const key = `${teamId}:${vs}`;
    const world = c.group.localToWorld(c.anchors[vs].clone());
    if (!this.persistentEmitters.has(key)) {
      this.persistentEmitters.set(key, this.fx.addEmitter({ pos: world.clone().add(new THREE.Vector3(0, 1, 0)), rate: fresh ? 3 : 1.4, kind: 'smoke', scale: 0.9 }));
      if (kind !== 'empty') this.persistentEmitters.set(key + ':f', this.fx.addEmitter({ pos: world.clone().add(new THREE.Vector3(0, 0.6, 0)), rate: fresh ? 8 : 3, kind: 'fire', scale: 0.8 }));
    }
    if (!this.markers.has(key)) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(kind), depthTest: false, transparent: true }));
      sp.scale.setScalar(5.5);
      sp.position.copy(world).add(new THREE.Vector3(0, 9, 0));
      sp.renderOrder = 20;
      sp.visible = false;
      this.scene.add(sp);
      this.markers.set(key, sp);
    }
  }

  setTheme(theme: 'day' | 'night') {
    this.night = theme === 'night';
    if (this.night) {
      // غروب هادئ: شمس دافئة منخفضة وسماء زرقاء عميقة، مع مشاعل ونوافذ مضيئة
      this.sun.color.set(0xffc58a);
      this.sun.intensity = 2.1;
      this.hemi.color.set(0x7d95c4);
      this.hemi.groundColor.set(0x3d4a2c);
      this.hemi.intensity = 0.85;
      this.scene.background = gradientTex('#14223d', '#5a5f78');
      (this.scene.fog as THREE.Fog).color.set(0x4a5470);
      this.renderer.toneMappingExposure = 1.1;
    } else {
      this.sun.color.set(0xfff0d2);
      this.sun.intensity = 2.9;
      this.hemi.color.set(0xc4dcff);
      this.hemi.groundColor.set(0x6a7a44);
      this.hemi.intensity = 0.95;
      this.scene.background = gradientTex('#9fc4e6', '#e9eef0');
      (this.scene.fog as THREE.Fog).color.set(0xdfe8ee);
      this.renderer.toneMappingExposure = 1.02;
    }
    this.setNightLights();
  }
  private setNightLights() {
    const m = mats();
    (m.windowGlow as THREE.MeshStandardMaterial).emissiveIntensity = this.night ? 2.2 : 0;
    this.world?.setNight(this.night);
    for (const c of this.castles.values()) for (const t of c.torches) t.visible = this.night;
  }

  setEffects(level: 'full' | 'reduced' | 'off') {
    this.effects = level;
    this.fx.level = level;
  }

  // ───────── الكاميرا ─────────
  private mapState(): CamState {
    const ps = this.world?.castlePositions ?? [new THREE.Vector3()];
    const box = new THREE.Box3();
    ps.forEach((p) => box.expandByPoint(p));
    box.expandByScalar(CASTLE_RADIUS + 30);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const aspect = this.camera.aspect || 1.6;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const el = 0.8;
    const needH = Math.max(size.z * Math.sin(el) + 60, size.x / aspect);
    const dist = (needH / 2 / Math.tan(vfov / 2)) * 1.08;
    return { target: center.add(new THREE.Vector3(0, 0, 18)), dist: Math.max(dist, 380), az: -0.12, el };
  }
  private fortressState(teamId: string): CamState {
    const c = this.castles.get(teamId)!;
    const aspect = this.camera.aspect || 1.6;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const need = Math.max(70, 112 / aspect);
    const dist = (need / 2 / Math.tan(vfov / 2)) * 1.12;
    return { target: c.group.position.clone().add(new THREE.Vector3(0, 8, 4)), dist, az: -0.32, el: 0.6 };
  }
  private flyTo(s: CamState, duration = 1.6) {
    const from: CamState = { target: this.cam.target.clone(), dist: this.cam.dist, az: this.cam.az, el: this.cam.el };
    return this.tween(duration, (t) => {
      const k = ease(t);
      this.cam.target.lerpVectors(from.target, s.target, k);
      // قوس للمسافة: يبتعد قليلًا في المنتصف ليبدو التحرك كطيران
      this.cam.dist = THREE.MathUtils.lerp(from.dist, s.dist, k) + Math.sin(k * Math.PI) * Math.min(from.dist, s.dist) * 0.12;
      this.cam.az = THREE.MathUtils.lerp(from.az, s.az, k);
      this.cam.el = THREE.MathUtils.lerp(from.el, s.el, k);
    });
  }
  private applyCamera(dt: number, t: number) {
    if (this.follow) {
      const p = this.follow.obj.getWorldPosition(new THREE.Vector3());
      const k = 1 - Math.pow(0.02, dt);
      this.cam.target.lerp(p, k);
      this.cam.dist += (this.follow.dist - this.cam.dist) * k;
      this.cam.el += (this.follow.el - this.cam.el) * k;
      this.cam.az += (this.follow.az - this.cam.az) * k;
    }
    const drift = this.busy ? 0 : Math.sin(t * 0.15) * 0.012;
    const az = this.cam.az + drift;
    const off = new THREE.Vector3(Math.sin(az) * Math.cos(this.cam.el), Math.sin(this.cam.el), Math.cos(az) * Math.cos(this.cam.el)).multiplyScalar(this.cam.dist);
    this.camera.position.copy(this.cam.target).add(off);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 2.2;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    this.camera.lookAt(this.cam.target);
    // الظل يتبع الكاميرا بدقة مناسبة للمسافة
    const sc = Math.min(700, Math.max(90, this.cam.dist * 0.62));
    const sh = this.sun.shadow.camera as THREE.OrthographicCamera;
    if (Math.abs(sh.right - sc) > 4) {
      sh.left = -sc; sh.right = sc; sh.top = sc; sh.bottom = -sc;
      sh.near = 10; sh.far = 2000;
      sh.updateProjectionMatrix();
    }
    this.sun.target.position.copy(this.cam.target);
    this.sun.position.copy(this.cam.target).add(new THREE.Vector3(-320, 520, 260));
    this.fx.setScale(this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  showMap(animated = true) {
    this.mode = 'map';
    this.focusTeamId = null;
    this.clearSlotLabels();
    this.highlightRing.visible = false;
    this.markers.forEach((m) => (m.visible = false));
    const s = this.mapState();
    if (!animated) { this.cam = { ...s, target: s.target.clone() }; return Promise.resolve(); }
    return this.flyTo(s, 1.8);
  }

  focusTeam(teamId: string, opts: { pick?: boolean; pickable?: number[] } = {}) {
    if (!this.castles.has(teamId)) return Promise.resolve();
    this.mode = 'fortress';
    this.focusTeamId = teamId;
    this.pickableSlots = new Set(opts.pick ? opts.pickable ?? [] : []);
    this.buildSlotLabels(teamId, !!opts.pick);
    this.markers.forEach((m, k) => (m.visible = k.startsWith(teamId + ':')));
    return this.flyTo(this.fortressState(teamId), 1.7);
  }

  setPickableCastles(ids: string[]) {
    this.pickableCastles = new Set(ids);
    this.castleLabels.forEach((l, id) => l.classList.toggle('is-pickable', this.pickableCastles.has(id)));
  }

  highlightSlot(i: number | null) {
    if (i == null || !this.focusTeamId) { this.highlightRing.visible = false; return; }
    const c = this.castles.get(this.focusTeamId)!;
    const vs = this.hiddenNumbers ? null : i;
    if (vs == null) { this.highlightRing.visible = false; return; }
    this.highlightRing.visible = true;
    this.highlightRing.position.copy(c.group.localToWorld(c.anchors[vs].clone())).add(new THREE.Vector3(0, 0.5, 0));
    this.highlightRing.scale.setScalar(c.slotSize * 0.52);
    this.slotLabels.forEach((l, k) => l.classList.toggle('is-selected', k === i));
  }

  private buildSlotLabels(teamId: string, pick: boolean) {
    this.clearSlotLabels();
    if (this.hiddenNumbers) return; // في نمط الأرقام المخفية لا تظهر الأرقام على القلعة
    const c = this.castles.get(teamId)!;
    this.slotLayerTeam = teamId;
    for (let i = 0; i < c.slotCount; i++) {
      const b = document.createElement('button');
      b.className = 'slot-label';
      b.textContent = String(i + 1);
      b.style.setProperty('--team', c.color);
      const isHit = c.hitVisuals.has(i);
      b.disabled = !pick || !this.pickableSlots.has(i);
      b.classList.toggle('is-hit', isHit);
      if (isHit) b.classList.add('is-hit');
      b.onclick = (e) => { e.stopPropagation(); if (!b.disabled) this.onSlotPick?.(i); };
      b.onpointerenter = () => !b.disabled && this.onSlotHover?.(i);
      b.onpointerleave = () => this.onSlotHover?.(null);
      this.labelLayer.appendChild(b);
      this.slotLabels.push(b);
    }
  }
  private clearSlotLabels() {
    this.slotLabels.forEach((l) => l.remove());
    this.slotLabels = [];
    this.slotLayerTeam = null;
  }

  private updateLabels() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    for (const [id, label] of this.castleLabels) {
      const c = this.castles.get(id);
      if (!c) continue;
      v.copy(c.group.position).add(this.mode === 'map' ? new THREE.Vector3(0, 0, 50) : new THREE.Vector3(0, 0, 54)).project(this.camera);
      const visible = this.mode === 'map' || id === this.focusTeamId;
      label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      label.style.opacity = visible && v.z < 1 ? '1' : '0';
      label.style.pointerEvents = visible && this.mode === 'map' ? 'auto' : 'none';
    }
    if (this.slotLayerTeam) {
      const c = this.castles.get(this.slotLayerTeam)!;
      this.slotLabels.forEach((l, i) => {
        v.copy(c.anchors[i]).add(new THREE.Vector3(0, c.slotSize * 0.75 + 2, 0));
        c.group.localToWorld(v);
        v.project(this.camera);
        l.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      });
    }
  }

  private onPointer = (e: PointerEvent) => {
    if (this.mode !== 'map' || !this.onCastlePick) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    let best: string | null = null, bd = Infinity;
    for (const [id, c] of this.castles) {
      const sphere = new THREE.Sphere(c.group.position.clone().add(new THREE.Vector3(0, 10, 0)), CASTLE_RADIUS);
      const hit = ray.ray.intersectSphere(sphere, new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(this.camera.position);
        if (d < bd) { bd = d; best = id; }
      }
    }
    if (best) this.onCastlePick(best);
  };

  // ───────── مشهد الضربة ─────────
  skip() { this.skipping = true; }
  get isBusy() { return this.busy; }

  async playStrike(p: StrikeParams, onPhase: (ph: StrikePhase, data?: any) => void) {
    const att = this.castles.get(p.attackerId);
    const tgt = this.castles.get(p.targetId);
    if (!att || !tgt) return;
    this.busy = true;
    this.skipping = false;
    const key = `${p.targetId}:${p.visualSlot}`;
    this.animating.add(key);
    if (p.kingFell) this.animating.add(`${p.targetId}:king`);
    this.clearSlotLabels();
    this.highlightRing.visible = false;
    const fast = this.effects === 'off';
    const reduced = this.effects === 'reduced';
    const targetWorld = tgt.group.localToWorld(tgt.anchors[p.visualSlot].clone());

    try {
      if (!fast) {
        // 1) أقرب برج للهدف
        const pad = att.pads.reduce((best, pd) => {
          const w = att.group.localToWorld(pd.top.clone());
          return w.distanceTo(targetWorld) < att.group.localToWorld(best.top.clone()).distanceTo(targetWorld) ? pd : best;
        });
        const padWorld = att.group.localToWorld(pad.top.clone());
        onPhase('approach');
        await this.flyTo({ target: padWorld.clone().add(new THREE.Vector3(0, 6, 0)), dist: 70, az: Math.atan2(padWorld.x - att.group.position.x, padWorld.z - att.group.position.z) * 0.35 - 0.2, el: 0.42 }, reduced ? 1.2 : 1.8);

        // 2) التجهيز: بخار الوقود، دوران ذراع الخدمة، عد تنازلي
        onPhase('prep');
        const vent = this.fx.addEmitter({ pos: padWorld.clone().add(new THREE.Vector3(0, 1.2, 0)), rate: 30, kind: 'steam', scale: 1.4 });
        await this.tween(1.2, (t) => (pad.arm.rotation.y = -ease(t) * 1.7));
        for (const n of [3, 2, 1]) {
          onPhase('countdown', n);
          await this.wait(reduced ? 0.55 : 0.8);
        }
        this.fx.removeEmitter(vent);

        // 3) الاشتعال والإقلاع
        onPhase('ignition');
        const rocket = pad.rocket;
        this.scene.attach(rocket);
        const start = rocket.position.clone();
        const tail = () => rocket.localToWorld(new THREE.Vector3(0, -0.4, 0));
        this.fx.puff(start, { count: 45, spread: 14, up: 1.5, s0: 4, s1: 16, max: 3.5, dark: 0.85, a: 0.9, drag: 0.05 });
        this.shake = 0.5;
        const climb = start.clone().add(new THREE.Vector3(0, 46, 0));
        this.follow = { obj: rocket, dist: 85, el: 0.32, az: this.cam.az };
        await this.tween(1.5, (t) => {
          rocket.position.lerpVectors(start, climb, t * t);
          const tp = tail();
          this.fx.puff(tp, { glow: true, count: 3, spread: 1.2, up: -14, s0: 3.2, s1: 1, max: 0.35, r0: 1, g0: 0.9, b0: 0.6, r1: 1, g1: 0.35, b1: 0.05, a: 1 });
          this.fx.puff(tp, { count: 2, spread: 2, up: -3, s0: 2.5, s1: 10, max: 3, dark: 0.88, a: 0.6, drag: 0.03 });
        });

        // 4) الطيران في قوس نحو الهدف والكاميرا تتابع
        onPhase('flight');
        const dist = climb.distanceTo(targetWorld);
        const ctrl = climb.clone().lerp(targetWorld, 0.5).add(new THREE.Vector3(0, 60 + dist * 0.28, 0));
        const curve = new THREE.QuadraticBezierCurve3(climb, ctrl, targetWorld.clone().add(new THREE.Vector3(0, 1, 0)));
        const dirTo = new THREE.Vector3().subVectors(targetWorld, climb);
        this.follow = { obj: rocket, dist: 110, el: 0.5, az: Math.atan2(dirTo.x, dirTo.z) + Math.PI + 0.5 };
        const up = new THREE.Vector3(0, 1, 0);
        await this.tween(reduced ? 2.0 : 2.8, (t) => {
          const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const pos = curve.getPoint(k);
          const tan = curve.getTangent(Math.min(0.999, k + 0.001)).normalize();
          rocket.position.copy(pos);
          rocket.quaternion.setFromUnitVectors(up, tan);
          const tp = tail();
          this.fx.puff(tp, { glow: true, count: 2, spread: 0.6, up: 0, s0: 2.6, s1: 0.6, max: 0.3, r0: 1, g0: 0.85, b0: 0.5, r1: 1, g1: 0.3, b1: 0, a: 1 });
          this.fx.puff(tp, { count: 1, spread: 0.8, up: 0.4, s0: 2, s1: 7, max: 2.6, dark: 0.9, a: 0.45, drag: 0.02 });
          if (t > 0.55 && this.follow && this.follow.obj === rocket) {
            // اقتراب من الحصن المستهدف
            const fs = this.fortressState(p.targetId);
            this.follow.dist = THREE.MathUtils.lerp(110, fs.dist * 0.75, (t - 0.55) / 0.45);
            this.follow.el = THREE.MathUtils.lerp(0.5, 0.8, (t - 0.55) / 0.45);
            this.follow.az = THREE.MathUtils.lerp(this.follow.az, fs.az, 0.04);
          }
        });
        this.follow = null;
        this.scene.remove(rocket);
        // إعادة تذخير المنصة لاحقًا
        setTimeout(() => this.reloadPad(att, pad), 2500);
      }

      // 5) الاصطدام
      onPhase('impact');
      if (fast) this.cam = { ...this.fortressState(p.targetId), target: this.fortressState(p.targetId).target.clone() };
      this.fx.fireball(targetWorld, p.kind === 'empty' ? 0.6 : p.kingFell ? 1.4 : 1);
      this.shake = p.kingFell ? 1.4 : 1;
      tgt.setPlot(p.visualSlot, 'destroyed', p.kind);
      this.animating.delete(key);
      this.addPersistentDamage(p.targetId, p.visualSlot, p.kind, true);
      const mk = this.markers.get(key);
      if (p.kind === 'empty') this.fx.puff(targetWorld, { count: 30, spread: 12, up: 2, s0: 3, s1: 12, max: 2.5, dark: 0.68, r0: 0.72, g0: 0.64, b0: 0.52, a: 0.7 });
      await this.wait(fast ? 0.1 : 0.9);

      // 6) سقوط الملك: انهيار البرج المركزي
      if (p.kingFell) {
        const top = tgt.keepTop;
        const base = top.position.clone();
        const kw = tgt.group.localToWorld(base.clone());
        this.fx.fireball(kw.clone().add(new THREE.Vector3(0, 6, 0)), 1.2);
        if (!fast) await this.flyTo({ target: kw.clone().add(new THREE.Vector3(0, 10, 0)), dist: 95, az: -0.3, el: 0.42 }, 0.9);
        await this.tween(fast ? 0.01 : 1.8, (t) => {
          const k = t * t;
          top.rotation.z = k * 0.6;
          top.rotation.x = -k * 0.25;
          top.position.y = base.y - k * 18;
          if (Math.random() < 0.5) this.fx.puff(kw.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 10, 0)), { count: 3, spread: 6, up: 2, s0: 4, s1: 14, max: 3, dark: 0.55, a: 0.8 });
        });
        this.fx.debris(kw.clone().add(new THREE.Vector3(0, 3, 0)), 30);
        tgt.setKingState('fallen', 0);
        this.animating.delete(`${p.targetId}:king`);
        this.persistentEmitters.set(p.targetId + ':king', this.fx.addEmitter({ pos: kw.clone().add(new THREE.Vector3(0, 2, 0)), rate: 5, kind: 'smoke', scale: 2 }));
      }

      // 7) الكشف وعرض النقاط
      if (mk) { mk.visible = true; mk.scale.setScalar(0.1); this.tween(0.5, (t) => mk.scale.setScalar(0.1 + easeOut(t) * 5.4)); }
      onPhase('reveal', { kind: p.kind, name: p.name, points: p.points, kingFell: p.kingFell });
      await this.wait(fast ? 2.2 : 3.4);

      // 8) العودة إلى الخريطة
      onPhase('return');
      await this.showMap(true);
    } finally {
      this.follow = null;
      this.animating.delete(key);
      this.animating.delete(`${p.targetId}:king`);
      this.busy = false;
      this.skipping = false;
      onPhase('done');
    }
  }

  private reloadPad(c: CastleHandle, pad: CastleHandle['pads'][number]) {
    if (this.disposed) return;
    const rocket = buildRocket(c.color);
    rocket.position.y = 0.55 - 8;
    pad.group.add(rocket);
    pad.rocket = rocket;
    pad.arm.rotation.y = 0;
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 1400);
      rocket.position.y = 0.55 - 8 * (1 - easeOut(t));
      if (t < 1 && !this.disposed) requestAnimationFrame(step);
    };
    step();
  }

  // ───────── أدوات التحريك ─────────
  private tweens: { dur: number; t: number; fn: (t: number) => void; done: () => void }[] = [];
  private tween(duration: number, fn: (t: number) => void) {
    return new Promise<void>((done) => {
      if (this.skipping || this.instant || duration <= 0.02) { fn(1); done(); return; }
      this.tweens.push({ dur: duration, t: 0, fn, done });
    });
  }
  private wait(sec: number) { return this.tween(sec, () => {}); }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.getElapsed();
    const active = this.tweens;
    this.tweens = [];
    for (const tw of active) {
      tw.t += dt;
      const k = this.skipping ? 1 : Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) tw.done();
      else this.tweens.push(tw);
    }
    this.world?.update(t);
    for (const c of this.castles.values()) c.update(t, dt);
    this.fx.update(dt);
    if (this.highlightRing.visible) (this.highlightRing.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 6) * 0.35;
    this.applyCamera(dt, t);
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.busy) {
      if (this.mode === 'map') { const s = this.mapState(); this.cam = { ...s, target: s.target.clone() }; }
      else if (this.focusTeamId) { const s = this.fortressState(this.focusTeamId); this.cam = { ...s, target: s.target.clone() }; }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointer);
    dispose(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
  }
}

function dispose(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

function gradientTex(top: string, bottom: string) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const markerCache = new Map<string, THREE.Texture>();
function markerTexture(kind: ElementKind) {
  let t = markerCache.get(kind);
  if (t) return t;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const meta = ELEMENT_META[kind];
  ctx.fillStyle = 'rgba(12,20,38,0.9)';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = meta.tint;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.fillStyle = meta.tint;
  ctx.font = 'bold 64px "Noto Sans Symbols 2", "Segoe UI Symbol", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(meta.glyph, S / 2, S / 2 + 4);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  markerCache.set(kind, t);
  return t;
}
