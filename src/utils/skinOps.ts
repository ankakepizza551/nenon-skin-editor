import type { SkinModel } from '../types';
import { SKIN_W, SKIN_H } from '../types';
import type { BodySide } from './skinMirror';
import { mirrorPixel, pixelSide } from './skinMirror';

/** Copy one half of the character onto the other half as its mirror image. */
export function mirrorHalf(pixels: Uint8ClampedArray, model: SkinModel, from: BodySide): Uint8ClampedArray {
  const next = new Uint8ClampedArray(pixels);
  for (let y = 0; y < SKIN_H; y++) {
    for (let x = 0; x < SKIN_W; x++) {
      if (pixelSide(x, y, model) !== from) continue;
      const mirrored = mirrorPixel(x, y, model);
      if (!mirrored) continue;
      const s = (y * SKIN_W + x) * 4;
      const d = (mirrored[1] * SKIN_W + mirrored[0]) * 4;
      next[d] = pixels[s]; next[d + 1] = pixels[s + 1];
      next[d + 2] = pixels[s + 2]; next[d + 3] = pixels[s + 3];
    }
  }
  return next;
}
