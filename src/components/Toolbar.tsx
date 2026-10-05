import { useRef, useState } from 'react';
import type { SkinModel, Tool } from '../types';

interface Props {
  tool: Tool;
  onToolChange: (t: Tool) => void;
  color: string;
  onColorChange: (c: string) => void;
  model: SkinModel;
  onModelChange: (m: SkinModel) => void;
  showRegions: boolean;
  onToggleRegions: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
}

const MODELS: { id: SkinModel; label: string; title: string }[] = [
  { id: 'classic', label: 'クラシック', title: 'Steve 体型（腕 4px）' },
  { id: 'slim',    label: 'スリム',     title: 'Alex 体型（腕 3px）' },
];

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'pen',        icon: '✏️', label: 'ペン (P)',      key: 'P' },
  { id: 'eraser',     icon: '🧹', label: '消しゴム (E)',  key: 'E' },
  { id: 'fill',       icon: '🪣', label: '塗りつぶし (F)', key: 'F' },
  { id: 'eyedropper', icon: '💉', label: 'スポイト (I)',   key: 'I' },
];

const PALETTE_COLORS = [
  '#ffffff', '#c8c8c8', '#888888', '#444444', '#000000',
  '#ff0000', '#ff7700', '#ffff00', '#00bb00', '#0000ff',
  '#8800ff', '#ff00ff', '#00ffff', '#ff9999', '#ffcc99',
  '#99ff99', '#9999ff', '#ffff99', '#ffccff', '#ccffff',
  '#8b4513', '#a0522d', '#deb887', '#f5deb3', '#ffd700',
  '#2f4f4f', '#006400', '#00008b', '#8b0000', '#4b0082',
];

export default function Toolbar({
  tool, onToolChange, color, onColorChange,
  model, onModelChange,
  showRegions, onToggleRegions,
  onExport, onImport, onClear, onUndo, canUndo, onRedo, canRedo,
}: Props) {
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Text field keeps its own draft so a half-typed value never becomes the active color
  const [draft, setDraft] = useState(color);
  const [prevColor, setPrevColor] = useState(color);
  if (color !== prevColor) {
    setPrevColor(color);
    setDraft(color);
  }

  const handleColorChange = (c: string) => {
    onColorChange(c);
    setRecentColors(prev => {
      const filtered = prev.filter(x => x !== c);
      return [c, ...filtered].slice(0, 8);
    });
  };

  return (
    <aside className="toolbar">
      {/* Tools */}
      <section className="toolbar-section">
        <div className="toolbar-label">ツール</div>
        <div className="tool-grid">
          {TOOLS.map(t => (
            <button
              key={t.id}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              onClick={() => onToolChange(t.id)}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </section>

      {/* Color picker */}
      <section className="toolbar-section">
        <div className="toolbar-label">カラー</div>
        <div
          className="color-preview"
          style={{ background: color }}
          onClick={() => colorInputRef.current?.click()}
          title="クリックして色を選択"
        />
        <input
          ref={colorInputRef}
          type="color"
          value={color}
          onChange={e => handleColorChange(e.target.value)}
          className="color-input-hidden"
        />
        <input
          type="text"
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
              handleColorChange(e.target.value.toLowerCase());
            }
          }}
          onBlur={() => setDraft(color)}
          className="color-text-input"
          maxLength={7}
        />
      </section>

      {/* Palette */}
      <section className="toolbar-section">
        <div className="toolbar-label">パレット</div>
        <div className="palette-grid">
          {PALETTE_COLORS.map(c => (
            <button
              key={c}
              className={`palette-btn ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => handleColorChange(c)}
              title={c}
            />
          ))}
        </div>
      </section>

      {/* Recent colors */}
      {recentColors.length > 0 && (
        <section className="toolbar-section">
          <div className="toolbar-label">最近使った色</div>
          <div className="palette-grid">
            {recentColors.map(c => (
              <button
                key={c}
                className={`palette-btn ${color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => handleColorChange(c)}
                title={c}
              />
            ))}
          </div>
        </section>
      )}

      {/* Model */}
      <section className="toolbar-section">
        <div className="toolbar-label">体型</div>
        <div className="tool-grid">
          {MODELS.map(m => (
            <button
              key={m.id}
              className={`option-btn model-btn ${model === m.id ? 'active' : ''}`}
              onClick={() => onModelChange(m.id)}
              title={m.title}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      {/* Options */}
      <section className="toolbar-section">
        <div className="toolbar-label">表示</div>
        <button
          className={`option-btn ${showRegions ? 'active' : ''}`}
          onClick={onToggleRegions}
        >
          🗺️ パーツ表示
        </button>
      </section>

      {/* Actions */}
      <section className="toolbar-section">
        <div className="toolbar-label">操作</div>
        <button className="action-btn" onClick={onUndo} disabled={!canUndo}>
          ↩️ 元に戻す
        </button>
        <button className="action-btn" onClick={onRedo} disabled={!canRedo}>
          ↪️ やり直す
        </button>
        <button className="action-btn danger" onClick={onClear}>
          🗑️ 全クリア
        </button>
      </section>

      <section className="toolbar-section">
        <div className="toolbar-label">ファイル</div>
        <button className="action-btn primary" onClick={onExport}>
          💾 PNG で保存
        </button>
        <button className="action-btn" onClick={onImport}>
          📂 PNG を読込
        </button>
      </section>

      <div className="toolbar-hint">
        <div>Alt+ドラッグ: 移動</div>
        <div>ホイール: ズーム</div>
        <div>Ctrl+Z: 元に戻す</div>
        <div>Ctrl+Y: やり直す</div>
        <div>Ctrl+S: 保存</div>
      </div>
    </aside>
  );
}
