import * as THREE from 'three';
import type { SkinModel } from '../types';

// [px, py, pw, ph, flipV]
type FaceUV = [number, number, number, number, boolean];

const S = 64;

/**
 * Face UVs for one body part, in Three.js BoxGeometry face order: +x, -x, +y, -y, +z, -z.
 *
 * The character faces +z, so +x is the character's LEFT and -x is its RIGHT.
 * (u, v) is the top-left corner of the part's block in the skin, laid out as:
 *
 *            [ top ][bottom]
 *   [right][front][ left ][back]
 *
 * BoxGeometry's default UVs already show every side face un-mirrored when seen
 * from outside, so only the bottom face needs a vertical flip.
 */
function boxUVs(u: number, v: number, w: number, h: number, d: number): FaceUV[] {
  return [
    [u + d + w,     v + d, d, h, false], // +x: character's left
    [u,             v + d, d, h, false], // -x: character's right
    [u + d,         v,     w, d, false], // +y: top
    [u + d + w,     v,     w, d, true ], // -y: bottom
    [u + d,         v + d, w, h, false], // +z: front
    [u + d + w + d, v + d, w, h, false], // -z: back
  ];
}

function setGeometryUVs(geo: THREE.BoxGeometry, faces: FaceUV[]) {
  const uvData = new Float32Array(6 * 4 * 2);

  // BoxGeometry with 1 segment per face: each face has 4 vertices
  // Vertex UV order per face (from Three.js buildPlane):
  //   0:(0,1), 1:(1,1), 2:(0,0), 3:(1,0)
  for (let face = 0; face < 6; face++) {
    const [px, py, pw, ph, flipV] = faces[face];
    const u1 = px / S;
    const u2 = (px + pw) / S;
    const bottom = 1 - (py + ph) / S;
    const top = 1 - py / S;
    const v1 = flipV ? top : bottom;
    const v2 = flipV ? bottom : top;

    const offset = face * 8;
    uvData[offset + 0] = u1; uvData[offset + 1] = v2; // (0,1)
    uvData[offset + 2] = u2; uvData[offset + 3] = v2; // (1,1)
    uvData[offset + 4] = u1; uvData[offset + 5] = v1; // (0,0)
    uvData[offset + 6] = u2; uvData[offset + 7] = v1; // (1,0)
  }

  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvData, 2));
}

interface PartDef {
  size: [number, number, number];     // w, h, d in skin pixels
  pos: [number, number, number];      // centre of the box
  base: [number, number];             // skin block of the base layer
  overlay: [number, number];          // skin block of the overlay layer
  inflate: number;                    // how much bigger the overlay box is
}

// Feet-to-head: legs span y -6..6, body/arms 6..18, head 18..26.
function getParts(model: SkinModel): PartDef[] {
  // Slim arms are 3px wide and stay flush against the body
  const armW = model === 'slim' ? 3 : 4;
  const armX = 4 + armW / 2;
  return [
    { size: [8, 8, 8],     pos: [0, 22, 0],     base: [0, 0],   overlay: [32, 0],  inflate: 1   }, // head
    { size: [8, 12, 4],    pos: [0, 12, 0],     base: [16, 16], overlay: [16, 32], inflate: 0.5 }, // body
    { size: [armW, 12, 4], pos: [-armX, 12, 0], base: [40, 16], overlay: [40, 32], inflate: 0.5 }, // right arm
    { size: [armW, 12, 4], pos: [armX, 12, 0],  base: [32, 48], overlay: [48, 48], inflate: 0.5 }, // left arm
    { size: [4, 12, 4],    pos: [-2, 0, 0],     base: [0, 16],  overlay: [0, 32],  inflate: 0.5 }, // right leg
    { size: [4, 12, 4],    pos: [2, 0, 0],      base: [16, 48], overlay: [0, 48],  inflate: 0.5 }, // left leg
  ];
}

function makePart(
  [w, h, d]: [number, number, number],
  [u, v]: [number, number],
  inflate: number,
  material: THREE.Material,
  [px, py, pz]: [number, number, number]
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w + inflate, h + inflate, d + inflate);
  setGeometryUVs(geo, boxUVs(u, v, w, h, d));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(px, py, pz);
  return mesh;
}

export function buildCharacter(texture: THREE.Texture, model: SkinModel): THREE.Group {
  const group = new THREE.Group();

  // The game ignores transparency on the base layer and shows those pixels black,
  // so the base material is opaque (transparent canvas pixels have black RGB)
  const baseMat = new THREE.MeshLambertMaterial({ map: texture });
  const overlayMat = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    side: THREE.DoubleSide,
  });

  for (const part of getParts(model)) {
    group.add(makePart(part.size, part.base, 0, baseMat, part.pos));
    const overlay = makePart(part.size, part.overlay, part.inflate, overlayMat, part.pos);
    overlay.userData.overlay = true;
    group.add(overlay);
  }

  return group;
}

export function disposeCharacter(group: THREE.Group) {
  const materials = new Set<THREE.Material>();
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      materials.add(obj.material as THREE.Material);
    }
  });
  materials.forEach(m => m.dispose());
}

// Skin areas a slim (3px) arm leaves unused: the last column of each face shifts left,
// freeing 2 columns at the end of the top/bottom row and of the side strip
export const SLIM_UNUSED_RECTS: { x: number; y: number; w: number; h: number }[] =
  [[40, 16], [40, 32], [32, 48], [48, 48]].flatMap(([u, v]) => [
    { x: u + 10, y: v,     w: 2, h: 4 },
    { x: u + 14, y: v + 4, w: 2, h: 12 },
  ]);

// Body part UV region hints for the 2D editor overlay
export const PART_REGIONS: { label: string; color: string; x: number; y: number; w: number; h: number }[] = [
  { label: 'Head',              color: 'rgba(255,100,100,0.25)', x: 0,  y: 0,  w: 32, h: 16 },
  { label: 'Head Overlay',      color: 'rgba(255,150,50,0.2)',   x: 32, y: 0,  w: 32, h: 16 },
  { label: 'Right Leg',         color: 'rgba(100,200,100,0.25)', x: 0,  y: 16, w: 16, h: 16 },
  { label: 'Body',              color: 'rgba(100,100,255,0.25)', x: 16, y: 16, w: 24, h: 16 },
  { label: 'Right Arm',         color: 'rgba(200,100,200,0.25)', x: 40, y: 16, w: 16, h: 16 },
  { label: 'Right Leg Overlay', color: 'rgba(100,200,150,0.2)',  x: 0,  y: 32, w: 16, h: 16 },
  { label: 'Body Overlay',      color: 'rgba(150,150,255,0.2)',  x: 16, y: 32, w: 24, h: 16 },
  { label: 'Right Arm Overlay', color: 'rgba(220,150,220,0.2)',  x: 40, y: 32, w: 16, h: 16 },
  { label: 'Left Leg Overlay',  color: 'rgba(50,220,200,0.2)',   x: 0,  y: 48, w: 16, h: 16 },
  { label: 'Left Leg',          color: 'rgba(50,220,150,0.25)',  x: 16, y: 48, w: 16, h: 16 },
  { label: 'Left Arm',          color: 'rgba(255,200,100,0.25)', x: 32, y: 48, w: 16, h: 16 },
  { label: 'Left Arm Overlay',  color: 'rgba(255,220,150,0.2)',  x: 48, y: 48, w: 16, h: 16 },
];
