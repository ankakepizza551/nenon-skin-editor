import type { SkinModel } from '../types';

/** Which half of the character a skin pixel belongs to (the character's own right/left) */
export type BodySide = 'right' | 'left';

// A box's skin block at `from` mirrors onto the block at `to` (itself for head and body).
// `side` is the half a paired limb is on; boxes that fold onto themselves span both.
interface MirrorBox {
  from: [number, number];
  to: [number, number];
  w: number;
  h: number;
  d: number;
  side: BodySide | 'both';
}

function getMirrorBoxes(model: SkinModel): MirrorBox[] {
  const armW = model === 'slim' ? 3 : 4;
  const self = (u: number, v: number, w: number, h: number, d: number): MirrorBox[] =>
    [{ from: [u, v], to: [u, v], w, h, d, side: 'both' }];
  const pair = (right: [number, number], left: [number, number], w: number): MirrorBox[] => [
    { from: right, to: left, w, h: 12, d: 4, side: 'right' },
    { from: left, to: right, w, h: 12, d: 4, side: 'left' },
  ];
  return [
    ...self(0, 0, 8, 8, 8),             // head
    ...self(32, 0, 8, 8, 8),            // head overlay
    ...self(16, 16, 8, 12, 4),          // body
    ...self(16, 32, 8, 12, 4),          // body overlay
    ...pair([0, 16], [16, 48], 4),      // legs
    ...pair([0, 32], [0, 48], 4),       // leg overlays
    ...pair([40, 16], [32, 48], armW),  // arms
    ...pair([40, 32], [48, 48], armW),  // arm overlays
  ];
}

interface MirrorInfo {
  mirror: [number, number];
  side: BodySide;
}

function locate(x: number, y: number, model: SkinModel): MirrorInfo | null {
  for (const { from: [u, v], to: [U, V], w, h, d, side } of getMirrorBoxes(model)) {
    const lx = x - u;
    const ly = y - v;
    if (lx < 0 || ly < 0 || ly >= d + h) continue;

    // On a box that folds onto itself, the half is decided by where the pixel sits on its face.
    // `nearRight` says whether the face's low-x half is the character's right.
    const pick = (offset: number, nearRight: boolean): BodySide =>
      side !== 'both' ? side : (offset < w / 2) === nearRight ? 'right' : 'left';

    if (ly < d) {
      // Top and bottom faces flip within themselves
      if (lx >= d && lx < d + w) {
        return { mirror: [U + d + (w - 1 - (lx - d)), V + ly], side: pick(lx - d, true) };
      }
      if (lx >= d + w && lx < d + 2 * w) {
        return { mirror: [U + d + w + (w - 1 - (lx - d - w)), V + ly], side: pick(lx - d - w, true) };
      }
      continue;
    }

    // Side strip: right | front | left | back
    if (lx < d) {
      return { mirror: [U + d + w + (d - 1 - lx), V + ly], side: side === 'both' ? 'right' : side };
    }
    if (lx < d + w) {
      return { mirror: [U + d + (w - 1 - (lx - d)), V + ly], side: pick(lx - d, true) };
    }
    if (lx < 2 * d + w) {
      return { mirror: [U + (d - 1 - (lx - d - w)), V + ly], side: side === 'both' ? 'left' : side };
    }
    if (lx < 2 * d + 2 * w) {
      // The back face is seen from behind, so its low-x half is the character's left
      return { mirror: [U + 2 * d + w + (w - 1 - (lx - 2 * d - w)), V + ly], side: pick(lx - 2 * d - w, false) };
    }
  }
  return null;
}

/**
 * The skin pixel that is the left-right mirror image of (x, y) on the character:
 * head and body fold onto themselves, each arm and leg maps to the opposite one.
 * Returns null for pixels outside every body part.
 */
export function mirrorPixel(x: number, y: number, model: SkinModel): [number, number] | null {
  return locate(x, y, model)?.mirror ?? null;
}

/** Which half of the character (x, y) is on, or null outside every body part */
export function pixelSide(x: number, y: number, model: SkinModel): BodySide | null {
  return locate(x, y, model)?.side ?? null;
}
