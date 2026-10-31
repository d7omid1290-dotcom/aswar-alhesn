import * as THREE from 'three';
import { stoneTexture, cobbleTexture, roofTexture, woodTexture, bannerTexture } from './textures';

let cache: ReturnType<typeof build> | null = null;

function build() {
  const stone = stoneTexture([182, 170, 150], 7);
  const stoneDark = stoneTexture([150, 140, 126], 13);
  const cob = cobbleTexture();
  const wood = woodTexture();
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  return {
    stone: std({ map: stone.map, bumpMap: stone.bump, bumpScale: 1.4, color: 0xffffff }),
    stoneDark: std({ map: stoneDark.map, bumpMap: stoneDark.bump, bumpScale: 1.4, color: 0xe8e2d8 }),
    cobble: std({ map: cob.map, bumpMap: cob.bump, bumpScale: 1.0, color: 0xb8ab96 }),
    rock: std({ color: 0x8a8174, flatShading: true }),
    plaster: std({ color: 0xe6d8bd }),
    plasterB: std({ color: 0xd9c4a0 }),
    wood: std({ map: wood, color: 0xffffff }),
    darkWood: std({ map: wood, color: 0x7a5a3a }),
    roofTerracotta: std({ map: roofTexture('#b4563a', 3), roughness: 0.75 }),
    roofSlate: std({ map: roofTexture('#55606e', 4), roughness: 0.7 }),
    metal: std({ color: 0x9aa3ad, metalness: 0.75, roughness: 0.35 }),
    darkMetal: std({ color: 0x3a3f46, metalness: 0.6, roughness: 0.45 }),
    white: std({ color: 0xf4f4f2, roughness: 0.45, metalness: 0.1 }),
    padYellow: std({ color: 0xd9a42a, roughness: 0.6 }),
    gold: std({ color: 0xe0b44c, metalness: 0.85, roughness: 0.25, emissive: 0x3a2a00, emissiveIntensity: 0.4 }),
    void: std({ color: 0x15110d, roughness: 1 }),
    windowGlow: std({ color: 0x2a1c0c, emissive: 0xffb050, emissiveIntensity: 0 }),
    hay: std({ color: 0xd8b860 }),
    skin: std({ color: 0xd9a77e }),
    steel: std({ color: 0xb8c0c8, metalness: 0.6, roughness: 0.4 }),
    horse: std({ color: 0x6b4428 }),
    rubble: std({ color: 0x6e665c, flatShading: true }),
    scorch: new THREE.MeshBasicMaterial({ color: 0x0c0907, transparent: true, opacity: 0.55, depthWrite: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x2f7fa6, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

export function mats() {
  if (!cache) cache = build();
  return cache;
}

const teamCache = new Map<string, { roof: THREE.Material; cloth: THREE.Material; banner: THREE.Material; royal: THREE.Material; tabard: THREE.Material }>();
export function teamMats(hex: string) {
  let m = teamCache.get(hex);
  if (!m) {
    m = {
      roof: new THREE.MeshStandardMaterial({ map: roofTexture(hex, 21), roughness: 0.7 }),
      cloth: new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, side: THREE.DoubleSide }),
      banner: new THREE.MeshStandardMaterial({ map: bannerTexture(hex, 'tower'), roughness: 0.8, side: THREE.DoubleSide, transparent: true, alphaTest: 0.3 }),
      royal: new THREE.MeshStandardMaterial({ map: bannerTexture(hex, 'crown'), roughness: 0.8, side: THREE.DoubleSide, transparent: true, alphaTest: 0.3 }),
      tabard: new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }),
    };
    teamCache.set(hex, m);
  }
  return m;
}

/** إسقاط إحداثيات الخامة حسب أبعاد الشكل حتى لا تتمدد الحجارة */
export function boxUV(geo: THREE.BufferGeometry, tile = 6) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function cylUV(geo: THREE.BufferGeometry, tile = 6) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.9) { uv[i * 2] = x / tile; uv[i * 2 + 1] = z / tile; continue; }
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    uv[i * 2] = ((a + Math.PI) * Math.max(r, 0.5)) / tile;
    uv[i * 2 + 1] = y / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
