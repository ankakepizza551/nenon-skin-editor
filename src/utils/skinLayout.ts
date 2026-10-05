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
  name: string;
  color: string;                      // guide color in the 2D editor
  size: [number, number, number];     // w, h, d in skin pixels
  pos: [number, number, number];      // centre of the box
  base: [number, number];             // skin block of the base layer
  overlay: [number, number];          // skin block of the overlay layer
  inflate: number;                    // how much bigger the overlay box is
  swing: number;                      // walk-cycle direction: 0 = fixed, ±1 = hinged at the top
}

// Feet-to-head: legs span y -6..6, body/arms 6..18, head 18..26.
function getParts(model: SkinModel): PartDef[] {
  // Slim arms are 3px wide and stay flush against the body
  const armW = model === 'slim' ? 3 : 4;
  const armX = 4 + armW / 2;
  return [
    { name: '頭',   color: '#ff8a8a', size: [8, 8, 8],     pos: [0, 22, 0],     base: [0, 0],   overlay: [32, 0],  inflate: 1, swing:  0 },
    { name: '胴',   color: '#8aa8ff', size: [8, 12, 4],    pos: [0, 12, 0],     base: [16, 16], overlay: [16, 32], inflate: 0.5, swing:  0 },
    { name: '右腕', color: '#e08ae0', size: [armW, 12, 4], pos: [-armX, 12, 0], base: [40, 16], overlay: [40, 32], inflate: 0.5, swing:  1 },
    { name: '左腕', color: '#ffc46a', size: [armW, 12, 4], pos: [armX, 12, 0],  base: [32, 48], overlay: [48, 48], inflate: 0.5, swing: -1 },
    { name: '右脚', color: '#7ad67a', size: [4, 12, 4],    pos: [-2, 0, 0],     base: [0, 16],  overlay: [0, 32],  inflate: 0.5, swing: -1 },
    { name: '左脚', color: '#5ad6c8', size: [4, 12, 4],    pos: [2, 0, 0],      base: [16, 48], overlay: [0, 48],  inflate: 0.5, swing:  1 },
  ];
}

/** One face of one body part, as a rectangle on the skin. 右/左 are the character's own right/left. */
export interface SkinFace {
  x: number; y: number; w: number; h: number;
  part: string;
  face: '前' | '後' | '右' | '左' | '上' | '下';
  overlay: boolean;
  color: string;
}

/** The unused d×d corner of a part's block, where the editor writes the part name */
export interface SkinBlockLabel {
  x: number; y: number; size: number;
  part: string;
  overlay: boolean;
  color: string;
}

export function getSkinFaces(model: SkinModel): SkinFace[] {
  return getParts(model).flatMap(({ name, color, size: [w, h, d], base, overlay }) =>
    [base, overlay].flatMap(([u, v], layer) => {
      const common = { part: name, overlay: layer === 1, color };
      return [
        { ...common, face: '右', x: u,             y: v + d, w: d, h },
        { ...common, face: '前', x: u + d,         y: v + d, w,    h },
        { ...common, face: '左', x: u + d + w,     y: v + d, w: d, h },
        { ...common, face: '後', x: u + d + w + d, y: v + d, w,    h },
        { ...common, face: '上', x: u + d,         y: v,     w,    h: d },
        { ...common, face: '下', x: u + d + w,     y: v,     w,    h: d },
      ] satisfies SkinFace[];
    })
  );
}

export function getSkinBlockLabels(model: SkinModel): SkinBlockLabel[] {
  return getParts(model).flatMap(({ name, color, size, base, overlay }) =>
    [base, overlay].map(([u, v], layer) => ({
      x: u, y: v, size: size[2], part: name, overlay: layer === 1, color,
    }))
  );
}

export function findSkinFace(faces: SkinFace[], x: number, y: number): SkinFace | null {
  return faces.find(f => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) ?? null;
}

function makePart(
  [w, h, d]: [number, number, number],
  [u, v]: [number, number],
  inflate: number,
  material: THREE.Material,
  offsetY: number
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w + inflate, h + inflate, d + inflate);
  setGeometryUVs(geo, boxUVs(u, v, w, h, d));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = offsetY;
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

  // Each part is a pivot group holding its base and overlay boxes.
  // Arms and legs pivot at their top edge (shoulder / hip) so they can swing.
  for (const part of getParts(model)) {
    const [px, py, pz] = part.pos;
    const hinge = part.swing !== 0 ? part.size[1] / 2 : 0;
    const pivot = new THREE.Group();
    pivot.position.set(px, py + hinge, pz);
    pivot.userData.swing = part.swing;
    pivot.userData.part = part.name;

    pivot.add(makePart(part.size, part.base, 0, baseMat, -hinge));
    const overlay = makePart(part.size, part.overlay, part.inflate, overlayMat, -hinge);
    overlay.userData.overlay = true;
    pivot.add(overlay);
    group.add(pivot);
  }

  return group;
}

export const PART_NAMES = ['頭', '胴', '右腕', '左腕', '右脚', '左脚'] as const;

/** Hide whole body parts in the preview, e.g. an arm that is in the way of the body's side */
export function setHiddenParts(character: THREE.Group, hidden: ReadonlySet<string>) {
  for (const pivot of character.children) {
    pivot.visible = !hidden.has(pivot.userData.part as string);
  }
}

export function setOverlayVisible(character: THREE.Group, visible: boolean) {
  character.traverse(obj => {
    if (obj.userData.overlay) obj.visible = visible;
  });
}

// Sideways angle of each limb in the spread pose: arms straight out, legs slightly apart
const SPREAD_ANGLES: Record<string, number> = {
  右腕: -Math.PI / 2,
  左腕: Math.PI / 2,
  右脚: -0.25,
  左脚: 0.25,
};

/**
 * Pose the limbs: `swing` radians back and forth (the walk cycle), and
 * `spread` from 0 (hanging down) to 1 (arms out, legs apart).
 */
export function poseCharacter(character: THREE.Group, swing: number, spread: number) {
  for (const pivot of character.children) {
    pivot.rotation.x = swing * (pivot.userData.swing as number);
    pivot.rotation.z = spread * (SPREAD_ANGLES[pivot.userData.part as string] ?? 0);
  }
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
