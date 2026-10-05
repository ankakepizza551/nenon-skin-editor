import { SKIN_W, createEmptySkin, hexToRgba } from '../types';

const SKIN = '#e0aa82';
const HAIR = '#5a3a22';
const SHIRT = '#2f9c95';
const PANTS = '#3b4a9a';
const SHOES = '#55555f';
const EYE = '#ffffff';
const PUPIL = '#2b3f7a';
const MOUTH = '#a8604e';

function fill(pixels: Uint8ClampedArray, hex: string, x: number, y: number, w: number, h: number) {
  const [r, g, b, a] = hexToRgba(hex);
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const i = (py * SKIN_W + px) * 4;
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
    }
  }
}

// Paint every face of the box whose skin block starts at (u, v)
function fillBox(pixels: Uint8ClampedArray, hex: string, u: number, v: number, w: number, h: number, d: number) {
  fill(pixels, hex, u + d, v, w * 2, d);              // top + bottom
  fill(pixels, hex, u, v + d, (w + d) * 2, h);        // right, front, left, back
}

// Paint a horizontal band around the four side faces, `rows` tall, starting `top` rows down
function fillBand(pixels: Uint8ClampedArray, hex: string, u: number, v: number, w: number, d: number, top: number, rows: number) {
  fill(pixels, hex, u, v + d + top, (w + d) * 2, rows);
}

/** A plain starter character so the 3D preview is not empty on launch. */
export function createDefaultSkin(): Uint8ClampedArray {
  const p = createEmptySkin();

  // Head
  fillBox(p, SKIN, 0, 0, 8, 8, 8);
  fill(p, HAIR, 8, 0, 8, 8);            // top
  fillBand(p, HAIR, 0, 0, 8, 8, 0, 2);  // hairline all around
  fill(p, HAIR, 24, 8, 8, 6);           // back of the head
  fill(p, HAIR, 0, 8, 2, 4);            // right side, towards the back
  fill(p, HAIR, 22, 8, 2, 4);           // left side, towards the back
  fill(p, EYE, 9, 12, 2, 1);
  fill(p, PUPIL, 10, 12, 1, 1);
  fill(p, EYE, 13, 12, 2, 1);
  fill(p, PUPIL, 13, 12, 1, 1);
  fill(p, MOUTH, 11, 14, 2, 1);

  // Body
  fillBox(p, SHIRT, 16, 16, 8, 12, 4);

  // Arms: short sleeves over skin (right, then left)
  for (const [u, v] of [[40, 16], [32, 48]]) {
    fillBox(p, SKIN, u, v, 4, 12, 4);
    fill(p, SHIRT, u + 4, v, 4, 4);     // shoulder
    fillBand(p, SHIRT, u, v, 4, 4, 0, 4);
  }

  // Legs: pants with shoes (right, then left)
  for (const [u, v] of [[0, 16], [16, 48]]) {
    fillBox(p, PANTS, u, v, 4, 12, 4);
    fill(p, SHOES, u + 8, v, 4, 4);     // sole
    fillBand(p, SHOES, u, v, 4, 4, 10, 2);
  }

  return p;
}
