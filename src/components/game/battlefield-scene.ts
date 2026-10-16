/**
 * مشهد Phaser لساحة المعركة: قلاع إيزومترية لكل فريق، خانات قابلة للنقر،
 * ومؤثرات الضربة (قذيفة بمسار قوسي، انفجار جزيئات، اهتزاز الكاميرا).
 */
import Phaser from 'phaser';
import { asset } from '@/lib/utils';

export const ELEMENT_IDS = ['king', 'knight', 'cannon', 'guard', 'market', 'trap', 'empty'] as const;
const TW = 128, TH = 64;

export interface CastleData {
  id: string;
  name: string;
  color: string;
  score: number;
  layout: (string | null)[] | null;
  hits: Record<number, string>;
  reveal: boolean;
  highlight?: 'turn' | 'target' | 'dim' | null;
  kingDown?: boolean;
  targetable?: boolean;
  /** في المحرر: كل الخانات قابلة للنقر وتُعرض الأرقام فوق العناصر */
  editor?: boolean;
}

export interface BoardData {
  gridSize: number;
  dark: boolean;
  castles: CastleData[];
  colors: Record<string, string>;
  selected?: { teamId: string; cell: number } | null;
  last?: { teamId: string; cell: number } | null;
  showHeader?: boolean;
}

export interface StrikeAnim { id: string; attacker: string; target: string; cell: number; el: string; points: number }

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n: number) => String(n).replace(/\d/g, (d) => AR[+d]);

interface Built { c: Phaser.GameObjects.Container; scale: number; tiles: Phaser.GameObjects.Image[] }

export class BattlefieldScene extends Phaser.Scene {
  private data_: BoardData | null = null;
  private pending: BoardData | null = null;
  private animating = false;
  private built = new Map<string, Built>();
  private layer!: Phaser.GameObjects.Container;
  onTile: (teamId: string, cell: number) => void = () => {};
  private ready = false;
  private queue: (() => void)[] = [];

  constructor() { super('battlefield'); }

  preload() {
    for (const id of ELEMENT_IDS) this.load.svg(`el-${id}`, asset(`/assets/${id}.svg`), { width: 128, height: 128 });
    this.load.svg('tile', asset('/assets/tile.svg'), { width: 128, height: 84 });
    this.load.svg('tile-hit', asset('/assets/tile-hit.svg'), { width: 128, height: 84 });
    this.load.svg('tower', asset('/assets/tower.svg'), { width: 80, height: 150 });
    this.load.svg('flag', asset('/assets/flag.svg'), { width: 40, height: 26 });
  }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8).generateTexture('spark', 16, 16).clear();
    g.fillStyle(0x2b2b2b, 1).fillCircle(14, 14, 12).lineStyle(3, 0x111111).strokeCircle(14, 14, 12).fillStyle(0x666666).fillCircle(10, 10, 4)
      .generateTexture('ball', 28, 28).destroy();
    this.layer = this.add.container(0, 0);
    this.scale.on('resize', () => this.render());
    this.ready = true;
    this.queue.splice(0).forEach((f) => f());
  }

  private whenReady(f: () => void) { if (this.ready) f(); else this.queue.push(f); }

  setBoard(d: BoardData) {
    this.whenReady(() => {
      if (this.animating) { this.pending = d; return; }
      this.data_ = d;
      this.render();
    });
  }

  // ---------- رسم القلاع ----------
  private render() {
    const d = this.data_;
    if (!d || !this.layer) return;
    this.layer.removeAll(true);
    this.built.clear();
    const W = this.scale.width, H = this.scale.height;
    const k = d.castles.length;
    if (!k || W < 10 || H < 10) return;

    const n = d.gridSize;
    const header = d.showHeader === false ? 0 : 100;
    const above = header + 130, below = 70;
    const bw = n * TW + 110, bh = n * TH + above + below;
    // اختيار أفضل توزيع للأعمدة والصفوف
    let best = { cols: 1, rows: 1, s: 0 };
    for (let cols = 1; cols <= k; cols++) {
      const rows = Math.ceil(k / cols);
      const s = Math.min(W / cols / bw, H / rows / bh);
      if (s > best.s) best = { cols, rows, s };
    }
    const s = Math.min(best.s, 1.25);
    const cellW = W / best.cols, cellH = H / best.rows;
    d.castles.forEach((cd, i) => {
      // ترتيب من اليمين لليسار
      const col = best.cols - 1 - (i % best.cols), row = Math.floor(i / best.cols);
      const itemsInRow = Math.min(best.cols, k - row * best.cols);
      const offset = ((best.cols - itemsInRow) * cellW) / 2;
      const cx = col * cellW + cellW / 2 - offset;
      const top = row * cellH + (cellH - bh * s) / 2 + above * s;
      const built = this.buildCastle(cd, d, s);
      built.c.setPosition(cx, top);
      this.layer.add(built.c);
      this.built.set(cd.id, built);
    });
  }

  private buildCastle(cd: CastleData, d: BoardData, s: number): Built {
    const n = d.gridSize;
    const c = this.add.container(0, 0).setScale(s);
    const col = hex(cd.color);
    const half = (n * TW) / 2, depth = n * TH;
    const pad = 26;
    // أرضية الرمل تحت الحصن
    const ground = this.add.graphics();
    if (cd.highlight === 'turn') { ground.fillStyle(0xf2c641, 0.22).fillEllipse(0, depth / 2 + 10, n * TW + 160, depth + 120); }
    if (cd.highlight === 'target') { ground.fillStyle(0xdc2626, 0.18).fillEllipse(0, depth / 2 + 10, n * TW + 160, depth + 120); }
    ground.fillStyle(d.dark ? 0x6b4e2c : 0xc9a46a, 1);
    ground.fillPoints([{ x: 0, y: -pad }, { x: half + pad * 2, y: depth / 2 }, { x: 0, y: depth + pad }, { x: -half - pad * 2, y: depth / 2 }], true);
    ground.fillStyle(d.dark ? 0x4a3420 : 0xa8814a, 1);
    ground.fillPoints([{ x: -half - pad * 2, y: depth / 2 }, { x: 0, y: depth + pad }, { x: 0, y: depth + pad + 18 }, { x: -half - pad * 2, y: depth / 2 + 18 }], true);
    ground.fillStyle(d.dark ? 0x3b2918 : 0x8f6a38, 1);
    ground.fillPoints([{ x: half + pad * 2, y: depth / 2 }, { x: 0, y: depth + pad }, { x: 0, y: depth + pad + 18 }, { x: half + pad * 2, y: depth / 2 + 18 }], true);
    c.add(ground);

    // الأسوار الخلفية (عالية بشرفات)
    const wallBack = this.add.graphics();
    this.drawWall(wallBack, { x: -half - 10, y: depth / 2 - 6 }, { x: 0, y: -16 }, 38, d.dark);
    this.drawWall(wallBack, { x: 0, y: -16 }, { x: half + 10, y: depth / 2 - 6 }, 38, d.dark);
    c.add(wallBack);
    c.add(this.tower(0, -14, col, 0.95));
    c.add(this.tower(-half - 8, depth / 2 - 2, col, 0.85));
    c.add(this.tower(half + 8, depth / 2 - 2, col, 0.85));

    // الخانات
    const tiles: Phaser.GameObjects.Image[] = [];
    const objs: { d: number; o: Phaser.GameObjects.GameObject[] }[] = [];
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      const i = r * n + q;
      const x = ((q - r) * TW) / 2, y = ((q + r) * TH) / 2;
      const hitBy = cd.hits[i];
      const el = cd.layout?.[i] ?? null;
      const tile = this.add.image(x, y, hitBy ? 'tile-hit' : 'tile').setOrigin(0.5, 0);
      const list: Phaser.GameObjects.GameObject[] = [tile];
      const showEl = el && (hitBy || cd.reveal);
      const clickable = cd.editor || (cd.targetable && !hitBy);
      if (showEl) {
        const spr = this.add.image(x, y + TH / 2 + 10, `el-${el}`).setOrigin(0.5, 0.86).setScale(0.82);
        if (!hitBy && !cd.editor && cd.reveal && cd.highlight !== null && d.castles.length > 1 && !cd.targetable) spr.setAlpha(0.95);
        list.push(spr);
      }
      if (!showEl || cd.editor) {
        const t = this.add.text(x, showEl ? y + 8 : y + TH / 2 - 2, ar(i + 1), {
          fontFamily: 'Lalezar, "Readex Pro", sans-serif', fontSize: showEl ? '22px' : '34px',
          color: showEl ? '#fff7e6' : '#6b4a26', stroke: showEl ? '#3b2a1a' : '#f6e7c8', strokeThickness: showEl ? 5 : 2,
        }).setOrigin(0.5, 0.5);
        list.push(t);
      }
      if (hitBy && d.colors[hitBy]) {
        const f = this.add.image(x + 30, y + TH / 2 + 6, 'flag').setOrigin(0, 1).setScale(0.55).setTint(hex(d.colors[hitBy]));
        const pole = this.add.rectangle(x + 30, y + TH / 2 + 10, 2.5, 24, 0x3b2a1a).setOrigin(0.5, 1);
        list.push(pole, f);
      }
      const sel = d.selected && d.selected.teamId === cd.id && d.selected.cell === i;
      const last = d.last && d.last.teamId === cd.id && d.last.cell === i;
      if (sel || last) {
        const o = this.add.graphics();
        o.lineStyle(5, sel ? 0xdc2626 : 0xf2c641, 1).strokePoints(this.diamond(x, y, 0), true, true);
        list.splice(1, 0, o);
        this.tweens.add({ targets: o, alpha: 0.25, yoyo: true, repeat: -1, duration: 600 });
      }
      if (clickable) {
        tile.setInteractive(new Phaser.Geom.Polygon(this.diamond(64, 0, 0).map((p) => new Phaser.Geom.Point(p.x, p.y))), Phaser.Geom.Polygon.Contains);
        if (tile.input) tile.input.cursor = 'pointer';
        tile.on('pointerover', () => { tile.setTint(cd.editor ? 0xfff2cc : 0xffb4a8); });
        tile.on('pointerout', () => { tile.clearTint(); });
        tile.on('pointerup', () => this.onTile(cd.id, i));
        if (cd.targetable) this.tweens.add({ targets: tile, y: y - 4, yoyo: true, repeat: -1, duration: 700 + ((i * 37) % 300), ease: 'Sine.inOut' });
      }
      tiles.push(tile);
      objs.push({ d: r + q, o: list });
    }
    objs.sort((a, b) => a.d - b.d).forEach((o) => c.add(o.o));

    // الأسوار الأمامية (منخفضة) والبرج الأمامي
    const wallFront = this.add.graphics();
    this.drawWall(wallFront, { x: -half - 10, y: depth / 2 + 6 }, { x: 0, y: depth + 22 }, 14, d.dark);
    this.drawWall(wallFront, { x: 0, y: depth + 22 }, { x: half + 10, y: depth / 2 + 6 }, 14, d.dark);
    c.add(wallFront);

    if (d.showHeader !== false) {
      const name = this.add.text(12, -158, cd.name, {
        fontFamily: 'Lalezar, "Readex Pro", sans-serif', fontSize: '54px', color: cd.color, stroke: d.dark ? '#120c07' : '#fff7e6', strokeThickness: 8, rtl: true,
      }).setOrigin(0, 1);
      const score = this.add.text(-12, -158, ar(cd.score), {
        fontFamily: 'Lalezar, "Readex Pro", sans-serif', fontSize: '54px', color: d.dark ? '#f6d27a' : '#8a5a00', stroke: d.dark ? '#120c07' : '#fff7e6', strokeThickness: 8,
      }).setOrigin(1, 1);
      if (cd.kingDown) c.add(this.add.image(-22 - score.width, -170, 'el-king').setOrigin(1, 0.9).setScale(0.45).setAlpha(0.45).setAngle(-70));
      c.add([name, score]);
    }
    if (cd.highlight === 'dim') c.setAlpha(0.55);
    return { c, scale: s, tiles };
  }

  private diamond(cx: number, top: number, inset: number) {
    return [
      { x: cx, y: top + inset }, { x: cx + TW / 2 - inset * 2, y: top + TH / 2 },
      { x: cx, y: top + TH - inset }, { x: cx - TW / 2 + inset * 2, y: top + TH / 2 },
    ];
  }

  private drawWall(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, h: number, dark: boolean) {
    const face = dark ? 0xa67a40 : 0xd2a865, top = dark ? 0xc79a5c : 0xead0a0, line = dark ? 0x6f5430 : 0xa8814a;
    g.fillStyle(face, 1).fillPoints([{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: b.x, y: b.y - h }, { x: a.x, y: a.y - h }], true);
    g.lineStyle(2, line, 0.6);
    for (let y = 10; y < h; y += 12) g.lineBetween(a.x, a.y - y, b.x, b.y - y);
    g.fillStyle(top, 1).fillPoints([{ x: a.x, y: a.y - h }, { x: b.x, y: b.y - h }, { x: b.x, y: b.y - h - 6 }, { x: a.x, y: a.y - h - 6 }], true);
    const steps = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 34));
    g.fillStyle(top, 1);
    for (let k = 0; k < steps; k += 1) {
      if (k % 2) continue;
      const t0 = k / steps, t1 = (k + 0.6) / steps;
      const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 - h - 6 }, p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 - h - 6 };
      g.fillPoints([p0, p1, { x: p1.x, y: p1.y - 12 }, { x: p0.x, y: p0.y - 12 }], true);
    }
  }

  private tower(x: number, y: number, color: number, s: number) {
    const ct = this.add.container(x, y);
    const t = this.add.image(0, 0, 'tower').setOrigin(0.5, 0.93).setScale(s);
    const f = this.add.image(1, -150 * s * 0.93 + 4, 'flag').setOrigin(0, 0).setScale(s * 1.1).setTint(color);
    this.tweens.add({ targets: f, scaleX: s * 0.95, yoyo: true, repeat: -1, duration: 800 + Math.random() * 400, ease: 'Sine.inOut' });
    ct.add([t, f]);
    return ct;
  }

  private tileWorld(teamId: string, cell: number) {
    const b = this.built.get(teamId);
    if (!b || !this.data_) return null;
    const n = this.data_.gridSize, r = Math.floor(cell / n), q = cell % n;
    const lx = ((q - r) * TW) / 2, ly = ((q + r) * TH) / 2 + TH / 2;
    return { x: b.c.x + lx * b.scale, y: b.c.y + ly * b.scale, s: b.scale };
  }

  // ---------- الضربة ----------
  playStrike(st: StrikeAnim, sounds: { launch(): void; boom(): void }): Promise<void> {
    return new Promise((resolve) => this.whenReady(() => {
      const to = this.tileWorld(st.target, st.cell);
      if (!to) { resolve(); return; }
      this.animating = true;
      const fromCastle = this.built.get(st.attacker);
      const from = fromCastle ? { x: fromCastle.c.x, y: fromCastle.c.y - 60 * fromCastle.scale } : { x: this.scale.width + 40, y: -40 };
      const s = Math.max(0.5, to.s);
      const ball = this.add.image(from.x, from.y, 'ball').setScale(s * 1.4).setDepth(10);
      const trail = this.add.particles(0, 0, 'spark', {
        follow: ball, lifespan: 420, speed: { min: 10, max: 40 }, scale: { start: 0.9 * s, end: 0 }, alpha: { start: 0.9, end: 0 },
        tint: [0xffd166, 0xf77f00, 0xd62828], blendMode: 'ADD', frequency: 14,
      }).setDepth(9);
      const peak = Math.min(from.y, to.y) - 260 * s - 80;
      const mid = { x: (from.x + to.x) / 2, y: peak };
      const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(from.x, from.y), new Phaser.Math.Vector2(mid.x, mid.y), new Phaser.Math.Vector2(to.x, to.y));
      sounds.launch();
      const counter = { t: 0 };
      this.tweens.add({
        targets: counter, t: 1, duration: 1050, ease: 'Sine.in',
        onUpdate: () => { const p = curve.getPoint(counter.t); ball.setPosition(p.x, p.y).setRotation(counter.t * 8); },
        onComplete: () => {
          ball.destroy();
          trail.stop();
          this.time.delayedCall(500, () => trail.destroy());
          sounds.boom();
          this.cameras.main.shake(380, 0.012);
          this.cameras.main.flash(160, 255, 220, 160);
          const fire = this.add.particles(to.x, to.y, 'spark', {
            lifespan: { min: 400, max: 900 }, speed: { min: 80 * s, max: 380 * s }, angle: { min: 180, max: 360 }, gravityY: 500 * s,
            scale: { start: 1.6 * s, end: 0 }, tint: [0xfff3b0, 0xffb703, 0xfb8500, 0xd62828], blendMode: 'ADD', emitting: false,
          }).setDepth(11);
          fire.explode(70);
          const smoke = this.add.particles(to.x, to.y, 'spark', {
            lifespan: 1300, speed: { min: 20 * s, max: 90 * s }, angle: { min: 200, max: 340 }, scale: { start: 2.2 * s, end: 4 * s },
            alpha: { start: 0.45, end: 0 }, tint: this.data_?.dark ? 0x9a8f80 : 0x6b5b45, emitting: false,
          }).setDepth(10);
          smoke.explode(24);
          const ring = this.add.circle(to.x, to.y, 10 * s, 0xfff3b0, 0.7).setDepth(11);
          this.tweens.add({ targets: ring, radius: 120 * s, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
          this.time.delayedCall(1500, () => { fire.destroy(); smoke.destroy(); });
          // تطبيق الحالة الجديدة لحظة الإصابة
          this.animating = false;
          if (this.pending) { this.data_ = this.pending; this.pending = null; }
          this.render();
          const hitTile = this.tileWorld(st.target, st.cell);
          if (hitTile) {
            const pop = this.add.image(hitTile.x, hitTile.y + 10 * s, `el-${st.el}`).setOrigin(0.5, 0.86).setScale(0).setDepth(12);
            this.tweens.add({ targets: pop, scale: 0.82 * hitTile.s * 1.6, duration: 380, ease: 'Back.out', yoyo: true, hold: 500, onComplete: () => pop.destroy() });
          }
          resolve();
        },
      });
    }));
  }
}
