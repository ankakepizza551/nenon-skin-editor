import { useRef, useState } from 'react';
import { rgbaToHex } from '../types';

interface Props {
  url: string;
  onColorPick: (hex: string) => void;
  onClose: () => void;
}

/** A floating reference picture over the editor: drag the header to move, click the picture to pick a color. */
export default function ReferenceImage({ url, onColorPick, onClose }: Props) {
  const [pos, setPos] = useState({ x: 190, y: 16 });
  const [opacity, setOpacity] = useState(1);
  const drag = useRef<{ mx: number; my: number; x: number; y: number } | null>(null);

  const handlePick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    // Draw just the clicked pixel of the full-size picture
    const sx = Math.floor(((e.clientX - rect.left) / rect.width) * img.naturalWidth);
    const sy = Math.floor(((e.clientY - rect.top) / rect.height) * img.naturalHeight);
    ctx.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a > 0) onColorPick(rgbaToHex(r, g, b));
  };

  return (
    <div className="reference" style={{ left: pos.x, top: pos.y }}>
      <div
        className="reference-header"
        onPointerDown={e => {
          if (e.target !== e.currentTarget) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (d) setPos({ x: d.x + e.clientX - d.mx, y: Math.max(0, d.y + e.clientY - d.my) });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        参考画像
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={opacity}
          onChange={e => setOpacity(Number(e.target.value))}
          title="不透明度"
        />
        <button onClick={onClose} title="閉じる">✕</button>
      </div>
      <div className="reference-body">
        <img
          src={url}
          alt="参考画像"
          draggable={false}
          style={{ opacity }}
          onClick={handlePick}
          title="クリックで色を取得"
        />
      </div>
    </div>
  );
}
