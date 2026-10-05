import type { SkinModel } from '../types';
import { SKIN_W, SKIN_H } from '../types';

export const LEGACY_SKIN_H = 32;

function copyRectMirrored(
  pixels: Uint8ClampedArray,
  sx: number, sy: number, w: number, h: number,
  dx: number, dy: number
) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((sy + y) * SKIN_W + sx + x) * 4;
      const d = ((dy + y) * SKIN_W + dx + (w - 1 - x)) * 4;
      pixels[d] = pixels[s]; pixels[d + 1] = pixels[s + 1];
      pixels[d + 2] = pixels[s + 2]; pixels[d + 3] = pixels[s + 3];
    }
  }
}

// Mirror a 4×12×4 limb block at (u, v) into the block at (U, V), swapping its right and left faces
function mirrorLimb(pixels: Uint8ClampedArray, u: number, v: number, U: number, V: number) {
  const w = 4, h = 12, d = 4;
  copyRectMirrored(pixels, u + d,         v,     w, d, U + d,         V);     // top
  copyRectMirrored(pixels, u + d + w,     v,     w, d, U + d + w,     V);     // bottom
  copyRectMirrored(pixels, u,             v + d, d, h, U + d + w,     V + d); // right → left
  copyRectMirrored(pixels, u + d,         v + d, w, h, U + d,         V + d); // front
  copyRectMirrored(pixels, u + d + w,     v + d, d, h, U,             V + d); // left → right
  copyRectMirrored(pixels, u + d + w + d, v + d, w, h, U + d + w + d, V + d); // back
}

/**
 * Convert a pre-1.8 64×32 skin to the 64×64 layout.
 * The old format has no left arm/leg of its own: the game mirrored the right ones.
 */
export function convertLegacySkin(legacy: Uint8ClampedArray): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(SKIN_W * SKIN_H * 4);
  pixels.set(legacy.subarray(0, SKIN_W * LEGACY_SKIN_H * 4));
  mirrorLimb(pixels, 0, 16, 16, 48);  // right leg → left leg
  mirrorLimb(pixels, 40, 16, 32, 48); // right arm → left arm
  return pixels;
}

function rectHasOpaque(pixels: Uint8ClampedArray, x: number, y: number, w: number, h: number): boolean {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (pixels[(py * SKIN_W + px) * 4 + 3] > 0) return true;
    }
  }
  return false;
}

/**
 * Guess the arm width of an imported skin: a slim skin leaves the last two columns
 * of the classic right-arm strip (x=54..55) empty while the arm itself is painted.
 */
export function detectModel(pixels: Uint8ClampedArray): SkinModel {
  const armPainted = rectHasOpaque(pixels, 44, 20, 3, 12);
  const classicOnlyColumns = rectHasOpaque(pixels, 54, 20, 2, 12);
  return armPainted && !classicOnlyColumns ? 'slim' : 'classic';
}
