import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SKIN_W, SKIN_H } from '../types';

export interface Rect { x: number; y: number; w: number; h: number }

interface Options {
  /** The selection tool is the current tool */
  active: boolean;
  pixelData: Uint8ClampedArray;
  onStrokeStart: () => void;
  onPixelChange: (pixels: Uint8ClampedArray) => void;
}

/** Rectangular selection in the 2D editor: drag to select, then drag or nudge to move the pixels. */
export interface SkinSelection {
  rect: Rect | null;
  contains: (x: number, y: number) => boolean;
  /** Pointer pressed at a skin pixel. `copy` leaves the original pixels in place. */
  begin: (x: number, y: number, copy: boolean) => void;
  move: (x: number, y: number) => void;
  end: () => void;
}

// The selected pixels lifted off the skin, and the skin they were lifted from
interface Floating {
  base: Uint8ClampedArray;
  content: Uint8ClampedArray;
  w: number;
  h: number;
  /** The skin as last produced by placing this content; stale once anything else edits the skin */
  composed: Uint8ClampedArray | null;
}

type Drag =
  | { kind: 'new'; sx: number; sy: number }
  | { kind: 'move'; sx: number; sy: number; origin: Rect; committed: boolean };

const clampX = (x: number) => Math.max(0, Math.min(SKIN_W - 1, x));
const clampY = (y: number) => Math.max(0, Math.min(SKIN_H - 1, y));
const isInside = (x: number, y: number) => x >= 0 && y >= 0 && x < SKIN_W && y < SKIN_H;

export function useSelection({ active, pixelData, onStrokeStart, onPixelChange }: Options): SkinSelection {
  const [rect, setRect] = useState<Rect | null>(null);
  const floating = useRef<Floating | null>(null);
  const drag = useRef<Drag | null>(null);

  const lift = useCallback((sel: Rect, copy: boolean) => {
    const base = new Uint8ClampedArray(pixelData);
    const content = new Uint8ClampedArray(sel.w * sel.h * 4);
    for (let y = 0; y < sel.h; y++) {
      for (let x = 0; x < sel.w; x++) {
        if (!isInside(sel.x + x, sel.y + y)) continue;
        const s = ((sel.y + y) * SKIN_W + sel.x + x) * 4;
        content.set(pixelData.subarray(s, s + 4), (y * sel.w + x) * 4);
        if (!copy) base.fill(0, s, s + 4);
      }
    }
    floating.current = { base, content, w: sel.w, h: sel.h, composed: null };
  }, [pixelData]);

  // Keep moving the same lifted pixels across consecutive moves, so what they pass over
  // is not picked up. Lift afresh when the skin was edited in between, or to make a copy.
  const ensureFloating = useCallback((sel: Rect, copy: boolean) => {
    if (copy || !floating.current || floating.current.composed !== pixelData) lift(sel, copy);
  }, [lift, pixelData]);

  const place = useCallback((x: number, y: number) => {
    const f = floating.current;
    if (!f) return;
    const composed = new Uint8ClampedArray(f.base);
    for (let cy = 0; cy < f.h; cy++) {
      for (let cx = 0; cx < f.w; cx++) {
        const s = (cy * f.w + cx) * 4;
        // Transparent pixels of the selection do not erase what is underneath
        if (f.content[s + 3] === 0 || !isInside(x + cx, y + cy)) continue;
        composed.set(f.content.subarray(s, s + 4), ((y + cy) * SKIN_W + x + cx) * 4);
      }
    }
    f.composed = composed;
    onPixelChange(composed);
    setRect({ x, y, w: f.w, h: f.h });
  }, [onPixelChange]);

  const contains = useCallback((x: number, y: number) =>
    rect !== null && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h,
  [rect]);

  const begin = useCallback((px: number, py: number, copy: boolean) => {
    if (rect && contains(px, py)) {
      ensureFloating(rect, copy);
      drag.current = { kind: 'move', sx: px, sy: py, origin: rect, committed: false };
      return;
    }
    // A plain click outside just deselects; the new rectangle appears once the pointer moves
    setRect(null);
    floating.current = null;
    drag.current = { kind: 'new', sx: clampX(px), sy: clampY(py) };
  }, [rect, contains, ensureFloating]);

  const move = useCallback((px: number, py: number) => {
    const d = drag.current;
    if (!d) return;

    if (d.kind === 'new') {
      const cx = clampX(px), cy = clampY(py);
      if (!rect && cx === d.sx && cy === d.sy) return;
      setRect({
        x: Math.min(d.sx, cx),
        y: Math.min(d.sy, cy),
        w: Math.abs(cx - d.sx) + 1,
        h: Math.abs(cy - d.sy) + 1,
      });
      return;
    }

    const x = d.origin.x + px - d.sx;
    const y = d.origin.y + py - d.sy;
    if (rect && x === rect.x && y === rect.y) return;
    if (!d.committed) {
      d.committed = true;
      onStrokeStart();
    }
    place(x, y);
  }, [rect, place, onStrokeStart]);

  const end = useCallback(() => {
    drag.current = null;
  }, []);

  const nudge = useCallback((dx: number, dy: number) => {
    if (!rect) return;
    ensureFloating(rect, false);
    onStrokeStart();
    place(rect.x + dx, rect.y + dy);
  }, [rect, ensureFloating, place, onStrokeStart]);

  const erase = useCallback(() => {
    if (!rect) return;
    const next = new Uint8ClampedArray(pixelData);
    for (let y = Math.max(0, rect.y); y < Math.min(SKIN_H, rect.y + rect.h); y++) {
      const x0 = Math.max(0, rect.x), x1 = Math.min(SKIN_W, rect.x + rect.w);
      if (x1 > x0) next.fill(0, (y * SKIN_W + x0) * 4, (y * SKIN_W + x1) * 4);
    }
    floating.current = null;
    onStrokeStart();
    onPixelChange(next);
  }, [rect, pixelData, onStrokeStart, onPixelChange]);

  // Arrow keys nudge, Delete erases, Escape deselects
  useEffect(() => {
    if (!active || !rect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? 4 : 1;
      switch (e.key) {
        case 'ArrowLeft': nudge(-step, 0); break;
        case 'ArrowRight': nudge(step, 0); break;
        case 'ArrowUp': nudge(0, -step); break;
        case 'ArrowDown': nudge(0, step); break;
        case 'Delete':
        case 'Backspace': erase(); break;
        case 'Escape': setRect(null); floating.current = null; break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, rect, nudge, erase]);

  return useMemo(
    () => ({ rect: active ? rect : null, contains, begin, move, end }),
    [active, rect, contains, begin, move, end]
  );
}
