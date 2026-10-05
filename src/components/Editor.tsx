import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { SkinModel, SkinPixel, Tool } from '../types';
import { SKIN_W, SKIN_H, hexToRgba, rgbaToHex } from '../types';
import { SLIM_UNUSED_RECTS, findSkinFace, getSkinBlockLabels, getSkinFaces } from '../utils/skinLayout';
import { mirrorPixel } from '../utils/skinMirror';

interface Props {
  pixelData: Uint8ClampedArray;
  tool: Tool;
  color: string;
  model: SkinModel;
  /** Pen and eraser also paint the left-right mirror image on the character */
  mirror: boolean;
  showRegions: boolean;
  /** Skin pixel under the cursor, in this editor or on the 3D preview */
  hover: SkinPixel | null;
  onHover: (pixel: SkinPixel | null) => void;
  onStrokeStart: () => void;
  onPixelChange: (pixels: Uint8ClampedArray) => void;
  onColorPick: (hex: string) => void;
  onColorUsed: (hex: string) => void;
}

const MIN_ZOOM = 2;
const MAX_ZOOM = 32;

export default function Editor({
  pixelData, tool, color, model, mirror, showRegions, hover, onHover,
  onStrokeStart, onPixelChange, onColorPick, onColorUsed,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(8);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDrawing = useRef(false);
  // The undo snapshot is taken on the first pixel a stroke actually changes,
  // so clicking outside the skin does not use up an undo step
  const strokeCommitted = useRef(false);
  const lastPixel = useRef<{ x: number; y: number } | null>(null);
  const panStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const workingPixels = useRef<Uint8ClampedArray | null>(null);

  const faces = useMemo(() => getSkinFaces(model), [model]);
  const blockLabels = useMemo(() => getSkinBlockLabels(model), [model]);
  const hoverFace = hover ? findSkinFace(faces, hover.x, hover.y) : null;

  // Draw the canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Checkerboard (one cell per skin pixel) with the skin pixels on top
    for (let py = 0; py < SKIN_H; py++) {
      for (let px = 0; px < SKIN_W; px++) {
        const x = offset.x + px * zoom;
        const y = offset.y + py * zoom;
        const idx = (py * SKIN_W + px) * 4;
        const a = pixelData[idx + 3];
        if (a < 255) {
          ctx.fillStyle = (px + py) % 2 === 0 ? '#888' : '#666';
          ctx.fillRect(x, y, zoom, zoom);
        }
        if (a === 0) continue;
        ctx.fillStyle = `rgba(${pixelData[idx]},${pixelData[idx + 1]},${pixelData[idx + 2]},${a / 255})`;
        ctx.fillRect(x, y, zoom, zoom);
      }
    }

    // Columns a slim (3px) arm does not use
    if (model === 'slim') {
      ctx.fillStyle = 'rgba(10,10,24,0.75)';
      for (const r of SLIM_UNUSED_RECTS) {
        ctx.fillRect(offset.x + r.x * zoom, offset.y + r.y * zoom, r.w * zoom, r.h * zoom);
      }
    }

    // Grid lines
    if (zoom >= 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.5;
      for (let px = 0; px <= SKIN_W; px++) {
        const x = offset.x + px * zoom;
        if (x < 0 || x > W) continue;
        ctx.beginPath();
        ctx.moveTo(x, Math.max(0, offset.y));
        ctx.lineTo(x, Math.min(H, offset.y + SKIN_H * zoom));
        ctx.stroke();
      }
      for (let py = 0; py <= SKIN_H; py++) {
        const y = offset.y + py * zoom;
        if (y < 0 || y > H) continue;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, offset.x), y);
        ctx.lineTo(Math.min(W, offset.x + SKIN_W * zoom), y);
        ctx.stroke();
      }
    }

    // Skin boundary
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(offset.x + 0.5, offset.y + 0.5, SKIN_W * zoom, SKIN_H * zoom);

    // Part guide: one outline per face (dashed for overlay layers), labelled with the
    // face name, and the part name written in the unused corner of each block
    if (showRegions) {
      const outlined = (text: string, x: number, y: number) => {
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      };
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';

      for (const face of faces) {
        const rx = offset.x + face.x * zoom;
        const ry = offset.y + face.y * zoom;
        const rw = face.w * zoom;
        const rh = face.h * zoom;
        ctx.strokeStyle = face.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(face.overlay ? [4, 3] : []);
        ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
        ctx.setLineDash([]);
        if (Math.min(rw, rh) >= 18) {
          ctx.font = 'bold 11px sans-serif';
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.lineWidth = 3;
          ctx.fillStyle = '#ffffff';
          outlined(face.face, rx + rw / 2, ry + rh / 2);
        }
      }

      for (const label of blockLabels) {
        const size = label.size * zoom;
        if (size < 26) continue;
        const cx = offset.x + label.x * zoom + size / 2;
        const cy = offset.y + label.y * zoom + size / 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.fillStyle = label.color;
        ctx.font = 'bold 12px sans-serif';
        if (!label.overlay) {
          outlined(label.part, cx, cy);
        } else if (size >= 40) {
          outlined(label.part, cx, cy - 7);
          ctx.font = 'bold 9px sans-serif';
          outlined('重ね着', cx, cy + 7);
        } else {
          outlined(label.part + '+', cx, cy);
        }
      }

      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // Hovered pixel (from this canvas or from the 3D preview)
    if (hover) {
      const hx = offset.x + hover.x * zoom;
      const hy = offset.y + hover.y * zoom;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(hx - 1.5, hy - 1.5, zoom + 3, zoom + 3);
      ctx.strokeStyle = '#ffff00';
      ctx.strokeRect(hx - 0.5, hy - 0.5, zoom + 1, zoom + 1);
    }
  }, [pixelData, zoom, offset, model, showRegions, faces, blockLabels, hover]);

  const renderRef = useRef(render);
  useEffect(() => {
    renderRef.current = render;
    render();
  }, [render]);

  // Fit skin in view on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(Math.min(width / SKIN_W, height / SKIN_H))));
    setZoom(z);
    setOffset({
      x: Math.floor((width - SKIN_W * z) / 2),
      y: Math.floor((height - SKIN_H * z) / 2),
    });
  }, []);

  // Canvas size follows container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      renderRef.current();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const getSkinCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const px = Math.floor((mx - offset.x) / zoom);
    const py = Math.floor((my - offset.y) / zoom);
    return { px, py, mx, my };
  }, [offset, zoom]);

  // Returns true when the pixel was inside the skin
  const drawPixel = useCallback((px: number, py: number, pixels: Uint8ClampedArray): boolean => {
    if (px < 0 || py < 0 || px >= SKIN_W || py >= SKIN_H) return false;
    const [r, g, b, a] = tool === 'pen' ? hexToRgba(color) : [0, 0, 0, 0];
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
  }, [tool, color, mirror, model]);

  // Returns true when anything was filled
  const floodFill = useCallback((startX: number, startY: number, pixels: Uint8ClampedArray): boolean => {
    const idx = (startY * SKIN_W + startX) * 4;
    const tr = pixels[idx], tg = pixels[idx + 1], tb = pixels[idx + 2], ta = pixels[idx + 3];
    const [fr, fg, fb, fa] = hexToRgba(color);
    if (tr === fr && tg === fg && tb === fb && ta === fa) return false;

    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= SKIN_W || y >= SKIN_H) continue;
      const i = (y * SKIN_W + x) * 4;
      if (pixels[i] !== tr || pixels[i + 1] !== tg || pixels[i + 2] !== tb || pixels[i + 3] !== ta) continue;
      pixels[i] = fr; pixels[i + 1] = fg; pixels[i + 2] = fb; pixels[i + 3] = fa;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return true;
  }, [color]);

  // Returns true when any pixel of the line was inside the skin
  const drawLine = useCallback((x0: number, y0: number, x1: number, y1: number, pixels: Uint8ClampedArray): boolean => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let drawn = false;
    while (true) {
      if (drawPixel(x0, y0, pixels)) drawn = true;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return drawn;
  }, [drawPixel]);

  const commitStroke = useCallback(() => {
    if (!workingPixels.current) return;
    if (!strokeCommitted.current) {
      strokeCommitted.current = true;
      onStrokeStart();
      if (tool === 'pen') onColorUsed(color);
    }
    onPixelChange(new Uint8ClampedArray(workingPixels.current));
  }, [tool, color, onStrokeStart, onPixelChange, onColorUsed]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+Click → pan
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      panStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
      return;
    }
    if (e.button !== 0) return;

    const { px, py } = getSkinCoords(e);
    const inside = px >= 0 && py >= 0 && px < SKIN_W && py < SKIN_H;

    if (tool === 'eyedropper') {
      if (inside) {
        const idx = (py * SKIN_W + px) * 4;
        if (pixelData[idx + 3] > 0) {
          onColorPick(rgbaToHex(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]));
        }
      }
      return;
    }

    if (tool === 'fill') {
      if (inside) {
        const next = new Uint8ClampedArray(pixelData);
        if (floodFill(px, py, next)) {
          onStrokeStart();
          onColorUsed(color);
          onPixelChange(next);
        }
      }
      return;
    }

    // Keep receiving moves when the cursor leaves the canvas mid-stroke
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    strokeCommitted.current = false;
    workingPixels.current = new Uint8ClampedArray(pixelData);
    lastPixel.current = { x: px, y: py };
    if (drawPixel(px, py, workingPixels.current)) commitStroke();
  }, [getSkinCoords, tool, color, pixelData, offset, drawPixel, floodFill, commitStroke, onStrokeStart, onPixelChange, onColorPick, onColorUsed]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panStart.current) {
      const dx = e.clientX - panStart.current.mx;
      const dy = e.clientY - panStart.current.my;
      setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy });
      return;
    }

    const { px, py } = getSkinCoords(e);
    onHover(px >= 0 && py >= 0 && px < SKIN_W && py < SKIN_H ? { x: px, y: py } : null);

    if (!isDrawing.current || !workingPixels.current) return;
    const last = lastPixel.current;
    if (last && (px !== last.x || py !== last.y)) {
      const drawn = drawLine(last.x, last.y, px, py, workingPixels.current);
      lastPixel.current = { x: px, y: py };
      if (drawn) commitStroke();
    }
  }, [getSkinCoords, drawLine, commitStroke, onHover]);

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
    workingPixels.current = null;
    lastPixel.current = null;
    panStart.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta * Math.ceil(zoom * 0.2)));

    // Zoom toward mouse position; whole-pixel offsets keep the grid crisp
    setOffset(prev => ({
      x: Math.round(mx - (mx - prev.x) * (newZoom / zoom)),
      y: Math.round(my - (my - prev.y) * (newZoom / zoom)),
    }));
    setZoom(newZoom);
  }, [zoom]);

  return (
    <div ref={containerRef} className="editor-container" data-tool={tool}>
      <canvas
        ref={canvasRef}
        className="editor-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => onHover(null)}
        onWheel={handleWheel}
      />
      {hover && (
        <div className="editor-hover-label">
          {hoverFace
            ? `${hoverFace.part}${hoverFace.overlay ? '（重ね着）' : ''}・${hoverFace.face}`
            : '未使用の領域'}
          <span className="editor-hover-coords">x {hover.x}  y {hover.y}</span>
        </div>
      )}
      <div className="editor-zoom-label">×{zoom}</div>
    </div>
  );
}
