import { useRef, useEffect, useCallback, useState } from 'react';
import type { Tool } from '../types';
import { SKIN_W, SKIN_H, hexToRgba, rgbaToHex } from '../types';
import { PART_REGIONS } from '../utils/skinLayout';

interface Props {
  pixelData: Uint8ClampedArray;
  tool: Tool;
  color: string;
  showRegions: boolean;
  onStrokeStart: () => void;
  onPixelChange: (pixels: Uint8ClampedArray) => void;
  onColorPick: (hex: string) => void;
}

const MIN_ZOOM = 2;
const MAX_ZOOM = 32;

export default function Editor({ pixelData, tool, color, showRegions, onStrokeStart, onPixelChange, onColorPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(8);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDrawing = useRef(false);
  const lastPixel = useRef<{ x: number; y: number } | null>(null);
  const panStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const workingPixels = useRef<Uint8ClampedArray | null>(null);

  // Draw the canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Checkerboard background
    const cSize = zoom >= 4 ? zoom : 4;
    for (let cy = 0; cy < H; cy += cSize) {
      for (let cx = 0; cx < W; cx += cSize) {
        const even = ((Math.floor(cx / cSize) + Math.floor(cy / cSize)) % 2 === 0);
        ctx.fillStyle = even ? '#888' : '#666';
        ctx.fillRect(cx, cy, cSize, cSize);
      }
    }

    // Skin pixels
    for (let py = 0; py < SKIN_H; py++) {
      for (let px = 0; px < SKIN_W; px++) {
        const idx = (py * SKIN_W + px) * 4;
        const r = pixelData[idx], g = pixelData[idx + 1], b = pixelData[idx + 2], a = pixelData[idx + 3];
        if (a === 0) continue;
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        ctx.fillRect(
          offset.x + px * zoom,
          offset.y + py * zoom,
          zoom, zoom
        );
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

    // Body part region overlays
    if (showRegions) {
      for (const region of PART_REGIONS) {
        const rx = offset.x + region.x * zoom;
        const ry = offset.y + region.y * zoom;
        const rw = region.w * zoom;
        const rh = region.h * zoom;
        ctx.fillStyle = region.color;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = region.color.replace('0.2', '0.8').replace('0.25', '0.8');
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
        if (zoom >= 4 && rw > 30) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = `bold ${Math.min(10, zoom * 0.8)}px sans-serif`;
          ctx.fillText(region.label, rx + 3, ry + 11);
        }
      }
    }
  }, [pixelData, zoom, offset, showRegions]);

  const renderRef = useRef(render);
  useEffect(() => {
    renderRef.current = render;
    render();
  }, [render]);

  // Fit skin in view on mount / resize
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

  const getSkinCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const px = Math.floor((mx - offset.x) / zoom);
    const py = Math.floor((my - offset.y) / zoom);
    return { px, py, mx, my };
  }, [offset, zoom]);

  const drawPixel = useCallback((px: number, py: number, pixels: Uint8ClampedArray): boolean => {
    if (px < 0 || py < 0 || px >= SKIN_W || py >= SKIN_H) return false;
    const idx = (py * SKIN_W + px) * 4;
    if (tool === 'pen') {
      const [r, g, b, a] = hexToRgba(color);
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = a;
    } else if (tool === 'eraser') {
      pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; pixels[idx + 3] = 0;
    }
    return true;
  }, [tool, color]);

  const floodFill = useCallback((startX: number, startY: number, pixels: Uint8ClampedArray) => {
    const idx = (startY * SKIN_W + startX) * 4;
    const tr = pixels[idx], tg = pixels[idx + 1], tb = pixels[idx + 2], ta = pixels[idx + 3];
    const [fr, fg, fb, fa] = hexToRgba(color);
    if (tr === fr && tg === fg && tb === fb && ta === fa) return;

    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= SKIN_W || y >= SKIN_H) continue;
      const i = (y * SKIN_W + x) * 4;
      if (pixels[i] !== tr || pixels[i + 1] !== tg || pixels[i + 2] !== tb || pixels[i + 3] !== ta) continue;
      pixels[i] = fr; pixels[i + 1] = fg; pixels[i + 2] = fb; pixels[i + 3] = fa;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }, [color]);

  const drawLine = useCallback((x0: number, y0: number, x1: number, y1: number, pixels: Uint8ClampedArray) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      drawPixel(x0, y0, pixels);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }, [drawPixel]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+Click → pan
      panStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
      return;
    }
    if (e.button !== 0) return;

    const { px, py } = getSkinCoords(e);

    if (tool === 'eyedropper') {
      if (px >= 0 && py >= 0 && px < SKIN_W && py < SKIN_H) {
        const idx = (py * SKIN_W + px) * 4;
        if (pixelData[idx + 3] > 0) {
          onColorPick(rgbaToHex(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]));
        }
      }
      return;
    }

    if (tool === 'fill') {
      if (px >= 0 && py >= 0 && px < SKIN_W && py < SKIN_H) {
        onStrokeStart();
        const next = new Uint8ClampedArray(pixelData);
        floodFill(px, py, next);
        onPixelChange(next);
      }
      return;
    }

    onStrokeStart();
    isDrawing.current = true;
    workingPixels.current = new Uint8ClampedArray(pixelData);
    lastPixel.current = { x: px, y: py };
    drawPixel(px, py, workingPixels.current);
    onPixelChange(new Uint8ClampedArray(workingPixels.current));
  }, [getSkinCoords, tool, pixelData, offset, drawPixel, floodFill, onStrokeStart, onPixelChange, onColorPick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (panStart.current) {
      const dx = e.clientX - panStart.current.mx;
      const dy = e.clientY - panStart.current.my;
      setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy });
      return;
    }

    if (!isDrawing.current || !workingPixels.current) return;
    const { px, py } = getSkinCoords(e);
    const last = lastPixel.current;
    if (last && (px !== last.x || py !== last.y)) {
      drawLine(last.x, last.y, px, py, workingPixels.current);
      lastPixel.current = { x: px, y: py };
      onPixelChange(new Uint8ClampedArray(workingPixels.current));
    }
  }, [getSkinCoords, drawLine, onPixelChange]);

  const handleMouseUp = useCallback(() => {
    isDrawing.current = false;
    workingPixels.current = null;
    lastPixel.current = null;
    panStart.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta * Math.ceil(zoom * 0.2)));

    // Zoom toward mouse position
    setOffset(prev => ({
      x: mx - (mx - prev.x) * (newZoom / zoom),
      y: my - (my - prev.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  }, [zoom]);

  return (
    <div ref={containerRef} className="editor-container" data-tool={tool}>
      <canvas
        ref={canvasRef}
        className="editor-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      <div className="editor-zoom-label">×{zoom}</div>
    </div>
  );
}
