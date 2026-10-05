import { useCallback, useMemo, useRef } from 'react';
import type { SkinModel, SkinPixel, Tool } from '../types';
import { SKIN_W, SKIN_H, hexToRgba, rgbaToHex } from '../types';
import { findSkinFace, getSkinFaces } from '../utils/skinLayout';
import { mirrorPixel } from '../utils/skinMirror';

interface Options {
  pixelData: Uint8ClampedArray;
  tool: Tool;
  color: string;
  model: SkinModel;
  /** Pen and eraser also paint the left-right mirror image on the character */
  mirror: boolean;
  /** Pen and fill vary the brightness of each pixel a little */
  shade: boolean;
  onStrokeStart: () => void;
  onPixelChange: (pixels: Uint8ClampedArray) => void;
  onColorPick: (hex: string) => void;
  onColorUsed: (hex: string) => void;
}

/** Applies the current tool at skin pixels. Shared by the 2D editor and the 3D preview. */
export interface SkinPainter {
  /** Pointer pressed at a skin pixel (may be outside the skin) */
  begin: (x: number, y: number) => void;
  /**
   * Pointer moved to a skin pixel during a stroke. With `sameFaceOnly`, the gap from the
   * previous pixel is only filled in when both are on the same face (used by the 3D preview,
   * where a straight line across the texture would cut through unrelated parts).
   */
  move: (x: number, y: number, sameFaceOnly?: boolean) => void;
  end: () => void;
}

// How far the shading pen moves brightness either way
const SHADE_STRENGTH = 0.12;

// Stable pseudo-random value in [0, 1) per pixel and stroke, so re-plotting a pixel
// during the same stroke does not change its shade
function noise(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const isInside = (x: number, y: number) => x >= 0 && y >= 0 && x < SKIN_W && y < SKIN_H;

export function useSkinPainter({
  pixelData, tool, color, model, mirror, shade,
  onStrokeStart, onPixelChange, onColorPick, onColorUsed,
}: Options): SkinPainter {
  const working = useRef<Uint8ClampedArray | null>(null);
  // The undo snapshot is taken on the first pixel a stroke actually changes,
  // so clicking outside the skin does not use up an undo step
  const committed = useRef(false);
  const last = useRef<SkinPixel | null>(null);
  const seed = useRef(0);

  const faces = useMemo(() => getSkinFaces(model), [model]);

  const colorAt = useCallback((x: number, y: number): [number, number, number, number] => {
    if (tool === 'eraser') return [0, 0, 0, 0];
    const [r, g, b, a] = hexToRgba(color);
    if (!shade) return [r, g, b, a];
    const f = 1 + (noise(x, y, seed.current) * 2 - 1) * SHADE_STRENGTH;
    return [r * f, g * f, b * f, a];
  }, [tool, color, shade]);

  // Returns true when the pixel was inside the skin
  const plot = useCallback((px: number, py: number, pixels: Uint8ClampedArray): boolean => {
    if (!isInside(px, py)) return false;
    const [r, g, b, a] = colorAt(px, py);
    const put = (x: number, y: number) => {
      const idx = (y * SKIN_W + x) * 4;
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = a;
    };
    put(px, py);
    if (mirror) {
      const mirrored = mirrorPixel(px, py, model);
      if (mirrored) put(mirrored[0], mirrored[1]);
    }
    return true;
  }, [colorAt, mirror, model]);

  // Returns true when any pixel of the line was inside the skin
  const line = useCallback((x0: number, y0: number, x1: number, y1: number, pixels: Uint8ClampedArray): boolean => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let drawn = false;
    while (true) {
      if (plot(x0, y0, pixels)) drawn = true;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return drawn;
  }, [plot]);

  // Returns true when anything was filled
  const floodFill = useCallback((startX: number, startY: number, pixels: Uint8ClampedArray): boolean => {
    const idx = (startY * SKIN_W + startX) * 4;
    const tr = pixels[idx], tg = pixels[idx + 1], tb = pixels[idx + 2], ta = pixels[idx + 3];
    const [fr, fg, fb, fa] = hexToRgba(color);
    if (!shade && tr === fr && tg === fg && tb === fb && ta === fa) return false;

    // Shaded fill colors can land back on the target color, so track visits explicitly
    const visited = new Uint8Array(SKIN_W * SKIN_H);
    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (!isInside(x, y) || visited[y * SKIN_W + x]) continue;
      const i = (y * SKIN_W + x) * 4;
      if (pixels[i] !== tr || pixels[i + 1] !== tg || pixels[i + 2] !== tb || pixels[i + 3] !== ta) continue;
      visited[y * SKIN_W + x] = 1;
      const [r, g, b, a] = colorAt(x, y);
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return true;
  }, [color, shade, colorAt]);

  const commit = useCallback(() => {
    if (!working.current) return;
    if (!committed.current) {
      committed.current = true;
      onStrokeStart();
      if (tool === 'pen') onColorUsed(color);
    }
    onPixelChange(new Uint8ClampedArray(working.current));
  }, [tool, color, onStrokeStart, onPixelChange, onColorUsed]);

  const begin = useCallback((px: number, py: number) => {
    if (tool === 'eyedropper') {
      if (isInside(px, py)) {
        const idx = (py * SKIN_W + px) * 4;
        if (pixelData[idx + 3] > 0) {
          onColorPick(rgbaToHex(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]));
        }
      }
      return;
    }

    seed.current = Math.floor(Math.random() * 0x7fffffff);

    if (tool === 'fill') {
      if (isInside(px, py)) {
        const next = new Uint8ClampedArray(pixelData);
        if (floodFill(px, py, next)) {
          onStrokeStart();
          onColorUsed(color);
          onPixelChange(next);
        }
      }
      return;
    }

    committed.current = false;
    working.current = new Uint8ClampedArray(pixelData);
    last.current = { x: px, y: py };
    if (plot(px, py, working.current)) commit();
  }, [tool, color, pixelData, plot, floodFill, commit, onStrokeStart, onPixelChange, onColorPick, onColorUsed]);

  const move = useCallback((px: number, py: number, sameFaceOnly = false) => {
    const prev = last.current;
    if (!working.current || !prev || (px === prev.x && py === prev.y)) return;
    const connect = !sameFaceOnly || findSkinFace(faces, prev.x, prev.y) === findSkinFace(faces, px, py);
    const drawn = connect
      ? line(prev.x, prev.y, px, py, working.current)
      : plot(px, py, working.current);
    last.current = { x: px, y: py };
    if (drawn) commit();
  }, [faces, line, plot, commit]);

  const end = useCallback(() => {
    working.current = null;
    last.current = null;
  }, []);

  return useMemo(() => ({ begin, move, end }), [begin, move, end]);
}
