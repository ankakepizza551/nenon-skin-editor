import type { SkinModel } from '../types';

// A box's skin block at `from` mirrors onto the block at `to` (itself for head and body)
interface MirrorBox {
  from: [number, number];
  to: [number, number];
  w: number;
  h: number;
  d: number;
}

function getMirrorBoxes(model: SkinModel): MirrorBox[] {
  const armW = model === 'slim' ? 3 : 4;
  const self = (u: number, v: number, w: number, h: number, d: number): MirrorBox[] =>
    [{ from: [u, v], to: [u, v], w, h, d }];
  const pair = (a: [number, number], b: [number, number], w: number): MirrorBox[] => [
    { from: a, to: b, w, h: 12, d: 4 },
    { from: b, to: a, w, h: 12, d: 4 },
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

/**
 * The skin pixel that is the left-right mirror image of (x, y) on the character:
 * head and body fold onto themselves, each arm and leg maps to the opposite one.
 * Returns null for pixels outside every body part.
 */
export function mirrorPixel(x: number, y: number, model: SkinModel): [number, number] | null {
  for (const { from: [u, v], to: [U, V], w, h, d } of getMirrorBoxes(model)) {
    const lx = x - u;
    const ly = y - v;
    if (lx < 0 || ly < 0 || ly >= d + h) continue;

    if (ly < d) {
      // Top and bottom faces flip within themselves
      if (lx >= d && lx < d + w) return [U + d + (w - 1 - (lx - d)), V + ly];
      if (lx >= d + w && lx < d + 2 * w) return [U + d + w + (w - 1 - (lx - d - w)), V + ly];
      continue;
    }

    // Side strip: right | front | left | back
    if (lx < d) return [U + d + w + (d - 1 - lx), V + ly];                                    // right → left
    if (lx < d + w) return [U + d + (w - 1 - (lx - d)), V + ly];                              // front
    if (lx < 2 * d + w) return [U + (d - 1 - (lx - d - w)), V + ly];                          // left → right
    if (lx < 2 * d + 2 * w) return [U + 2 * d + w + (w - 1 - (lx - 2 * d - w)), V + ly];      // back
  }
  return null;
}
