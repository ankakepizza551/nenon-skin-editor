import { useRef, useState } from 'react';
import type { SkinModel, Tool } from '../types';
import { MAX_BRUSH_SIZE } from '../types';
import type { BodySide } from '../utils/skinMirror';

interface Props {
  tool: Tool;
  onToolChange: (t: Tool) => void;
  color: string;
  onColorChange: (c: string) => void;
  recentColors: string[];
  /** Colors the user saved; kept between launches */
  customPalette: string[];
  onAddCustomColor: () => void;
  onRemoveCustomColor: (c: string) => void;
  onOpenReference: () => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  model: SkinModel;
  onModelChange: (m: SkinModel) => void;
  mirror: boolean;
  onToggleMirror: () => void;
  shade: boolean;
  onToggleShade: () => void;
  showRegions: boolean;
  onToggleRegions: () => void;
  showOverlay: boolean;
  onToggleOverlay: () => void;
  onSave: () => void;
  /** Only available in the desktop app, where saving goes to a remembered file */
  onSaveAs?: () => void;
  onImport: () => void;
  /** Copy one half of the character (its own right/left) onto the other, mirrored */
  onMirrorHalf: (from: BodySide) => void;
  onClear: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
}

const MODELS: { id: SkinModel; label: string; title: string }[] = [
  { id: 'classic', label: '標準',   title: 'クラシック / Steve 体型（腕 4px）' },
  { id: 'slim',    label: 'スリム', title: 'スリム / Alex 体型（腕 3px）' },
];

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'pen',        icon: '✏️', label: 'ペン (P)',      key: 'P' },
  { id: 'eraser',     icon: '🧹', label: '消しゴム (E)',  key: 'E' },
  { id: 'fill',       icon: '🪣', label: '塗りつぶし (F)', key: 'F' },
  { id: 'eyedropper', icon: '💉', label: 'スポイト (I)',   key: 'I' },
  { id: 'lighten',    icon: '☀️', label: '明るく (L)：なぞった所を一段明るくする', key: 'L' },
  { id: 'darken',     icon: '🌙', label: '暗く (D)：なぞった所を一段暗くする',     key: 'D' },
  { id: 'select',     icon: '⬚', label: '範囲選択 (S)：ドラッグで選択。選択範囲をドラッグか矢印キーで移動、Ctrl+ドラッグで複製、Delete で消去、Esc で解除', key: 'S' },
];

const BRUSH_SIZES = Array.from({ length: MAX_BRUSH_SIZE }, (_, i) => i + 1);

const PALETTE_COLORS = [
  '#ffffff', '#c8c8c8', '#888888', '#444444', '#000000',
  '#ff0000', '#ff7700', '#ffff00', '#00bb00', '#0000ff',
  '#8800ff', '#ff00ff', '#00ffff', '#ff9999', '#ffcc99',
  '#99ff99', '#9999ff', '#ffff99', '#ffccff', '#ccffff',
  '#8b4513', '#a0522d', '#deb887', '#f5deb3', '#ffd700',
  '#2f4f4f', '#006400', '#00008b', '#8b0000', '#4b0082',
];

export default function Toolbar({
  tool, onToolChange, color, onColorChange, recentColors,
  customPalette, onAddCustomColor, onRemoveCustomColor, onOpenReference,
  brushSize, onBrushSizeChange,
  model, onModelChange, mirror, onToggleMirror, shade, onToggleShade,
  showRegions, onToggleRegions, showOverlay, onToggleOverlay,
  onSave, onSaveAs, onImport, onMirrorHalf, onClear, onUndo, canUndo, onRedo, canRedo,
}: Props) {
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Text field keeps its own draft so a half-typed value never becomes the active color
  const [draft, setDraft] = useState(color);
  const [prevColor, setPrevColor] = useState(color);
  if (color !== prevColor) {
    setPrevColor(color);
    setDraft(color);
  }

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
        <div className="brush-size-row" title="ブラシの太さ（[ と ] で変更）。ペン・消しゴム・明るく・暗くに効きます">
          <span className="brush-size-label">太さ</span>
          {BRUSH_SIZES.map(size => (
            <button
              key={size}
              className={`brush-size-btn ${brushSize === size ? 'active' : ''}`}
              onClick={() => onBrushSizeChange(size)}
            >
              {size}
            </button>
          ))}
        </div>
        <button
          className={`option-btn ${mirror ? 'active' : ''}`}
          onClick={onToggleMirror}
          title="ペンと消しゴムを、キャラクターの左右対称の位置にも適用 (M)"
        >
          🪞 左右対称
        </button>
        <button
          className={`option-btn ${shade ? 'active' : ''}`}
          onClick={onToggleShade}
          title="ペンと塗りつぶしの色を、1ピクセルごとに少しだけ明るく／暗くばらつかせる (N)"
        >
          🎲 色むら
        </button>
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
          onChange={e => onColorChange(e.target.value)}
          className="color-input-hidden"
        />
        <input
          type="text"
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
              onColorChange(e.target.value.toLowerCase());
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
              onClick={() => onColorChange(c)}
              title={c}
            />
          ))}
        </div>
      </section>

      {/* Saved colors */}
      <section className="toolbar-section">
        <div className="toolbar-label">マイパレット</div>
        <div className="palette-grid">
          {customPalette.map(c => (
            <button
              key={c}
              className={`palette-btn ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => onColorChange(c)}
              onContextMenu={e => { e.preventDefault(); onRemoveCustomColor(c); }}
              title={`${c}（右クリックで削除）`}
            />
          ))}
          <button
            className="palette-btn palette-add"
            onClick={onAddCustomColor}
            title="いまの色をマイパレットに追加"
          >
            ＋
          </button>
        </div>
      </section>

      {/* Recent colors (colors actually painted with) */}
      {recentColors.length > 0 && (
        <section className="toolbar-section">
          <div className="toolbar-label">最近使った色</div>
          <div className="palette-grid">
            {recentColors.map(c => (
              <button
                key={c}
                className={`palette-btn ${color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => onColorChange(c)}
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
          🗺️ パーツガイド
        </button>
        <button
          className={`option-btn ${showOverlay ? 'active' : ''}`}
          onClick={onToggleOverlay}
          title="3Dプレビューの重ね着レイヤーを表示"
        >
          🧥 重ね着表示
        </button>
      </section>

      {/* Whole-body operations */}
      <section className="toolbar-section">
        <div className="toolbar-label">反転コピー</div>
        <button
          className="action-btn"
          onClick={() => onMirrorHalf('right')}
          title="キャラクター自身から見た右半身（右腕・右脚と、頭・胴の右半分）を、左半身へ鏡写しでコピー"
        >
          🪞 右半身 → 左半身
        </button>
        <button
          className="action-btn"
          onClick={() => onMirrorHalf('left')}
          title="キャラクター自身から見た左半身（左腕・左脚と、頭・胴の左半分）を、右半身へ鏡写しでコピー"
        >
          🪞 左半身 → 右半身
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
        <button className="action-btn primary" onClick={onSave}>
          💾 PNG で保存
        </button>
        {onSaveAs && (
          <button className="action-btn" onClick={onSaveAs}>
            📝 名前を付けて保存
          </button>
        )}
        <button className="action-btn" onClick={onImport}>
          📂 PNG を読込
        </button>
        <button
          className="action-btn"
          onClick={onOpenReference}
          title="見本にする画像を、エディタの上に重ねて表示。画像をクリックすると色を取得"
        >
          🖼️ 参考画像を開く
        </button>
      </section>

      <div className="toolbar-hint">
        <div>Alt+ドラッグ: 移動</div>
        <div>ホイール: ズーム</div>
        <div>Ctrl+Z: 元に戻す</div>
        <div>Ctrl+Y: やり直す</div>
        <div>Ctrl+S: 保存</div>
        <div>[ / ]: ブラシの太さ</div>
        <div>選択中 矢印: 移動 / Del: 消去</div>
        <div>PNG をドロップ: 読込</div>
      </div>
    </aside>
  );
}
