import { useState, useCallback, useEffect, useRef } from 'react';
import Editor from './components/Editor';
import Preview3D from './components/Preview3D';
import Toolbar from './components/Toolbar';
import type { SkinModel, Tool } from './types';
import { SKIN_W, SKIN_H, createEmptySkin } from './types';
import { LEGACY_SKIN_H, convertLegacySkin, detectModel } from './utils/skinConvert';
import './App.css';

const MAX_UNDO = 30;

export default function App() {
  const [pixelData, setPixelData] = useState<Uint8ClampedArray>(createEmptySkin);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#ff5500');
  const [model, setModel] = useState<SkinModel>('classic');
  const [showRegions, setShowRegions] = useState(false);
  const [dirty, setDirty] = useState(false);
  const undoStack = useRef<Uint8ClampedArray[]>([]);
  const redoStack = useRef<Uint8ClampedArray[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const pixelDataRef = useRef<Uint8ClampedArray>(pixelData);
  useEffect(() => { pixelDataRef.current = pixelData; }, [pixelData]);

  const handleStrokeStart = useCallback(() => {
    undoStack.current = [
      new Uint8ClampedArray(pixelDataRef.current),
      ...undoStack.current,
    ].slice(0, MAX_UNDO);
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
    setDirty(true);
  }, []);

  const handlePixelChange = useCallback((pixels: Uint8ClampedArray) => {
    setPixelData(pixels);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.shift()!;
    redoStack.current.unshift(new Uint8ClampedArray(pixelDataRef.current));
    setPixelData(prev);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    setDirty(true);
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.shift()!;
    undoStack.current.unshift(new Uint8ClampedArray(pixelDataRef.current));
    setPixelData(next);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    setDirty(true);
  }, []);

  const handleClear = useCallback(() => {
    if (!confirm('スキンデータを全クリアしますか？')) return;
    handleStrokeStart();
    setPixelData(createEmptySkin());
  }, [handleStrokeStart]);

  const handleExport = useCallback(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = SKIN_W;
    canvas.height = SKIN_H;
    const ctx = canvas.getContext('2d')!;
    const imageData = new ImageData(new Uint8ClampedArray(pixelDataRef.current), SKIN_W, SKIN_H);
    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    if (window.electronAPI) {
      try {
        const saved = await window.electronAPI.savePng(new Uint8Array(await blob.arrayBuffer()));
        if (saved) setDirty(false);
      } catch {
        alert('保存に失敗しました。');
      }
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'minecraft_skin.png';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setDirty(false);
  }, []);

  const handleImport = useCallback(() => {
    importRef.current?.click();
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const isLegacy = img.width === SKIN_W && img.height === LEGACY_SKIN_H;
      if (!isLegacy && (img.width !== SKIN_W || img.height !== SKIN_H)) {
        alert(`スキンサイズが正しくありません。${SKIN_W}×${SKIN_H}（または旧形式の ${SKIN_W}×${LEGACY_SKIN_H}）のPNGを選択してください。`);
        URL.revokeObjectURL(url);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const loaded = new Uint8ClampedArray(ctx.getImageData(0, 0, img.width, img.height).data);
      const pixels = isLegacy ? convertLegacySkin(loaded) : loaded;
      handleStrokeStart();
      setPixelData(pixels);
      setModel(isLegacy ? 'classic' : detectModel(pixels));
      // 旧形式は変換した時点で元ファイルと内容が変わるので未保存扱いのままにする
      setDirty(isLegacy);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      alert('画像を読み込めませんでした。');
      URL.revokeObjectURL(url);
    };
    img.src = url;
    e.target.value = '';
  }, [handleStrokeStart]);

  // Warn before losing unsaved work. Electron shows its own dialog from the main
  // process; a beforeunload handler there would just silently block the close.
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.setDirty(dirty);
      return;
    }
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey) {
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
        else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
        else if (key === 's') { e.preventDefault(); handleExport(); }
        return;
      }
      if (e.metaKey || e.altKey) return;
      switch (key) {
        case 'p': setTool('pen'); break;
        case 'e': setTool('eraser'); break;
        case 'f': setTool('fill'); break;
        case 'i': setTool('eyedropper'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo, handleExport]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-icon">⛏️</span>
          <h1>Minecraft Skin Editor</h1>
          {dirty && <span className="unsaved-badge">未保存</span>}
        </div>
        <div className="app-header-actions">
          <span className="shortcut-hint">P: ペン  E: 消しゴム  F: 塗りつぶし  I: スポイト  Ctrl+Z: 元に戻す  Ctrl+Y: やり直す  Ctrl+S: 保存</span>
        </div>
      </header>

      <div className="app-body">
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          model={model}
          onModelChange={setModel}
          showRegions={showRegions}
          onToggleRegions={() => setShowRegions(v => !v)}
          onExport={handleExport}
          onImport={handleImport}
          onClear={handleClear}
          onUndo={handleUndo}
          canUndo={canUndo}
          onRedo={handleRedo}
          canRedo={canRedo}
        />

        <Editor
          pixelData={pixelData}
          tool={tool}
          color={color}
          showRegions={showRegions}
          onStrokeStart={handleStrokeStart}
          onPixelChange={handlePixelChange}
          onColorPick={setColor}
        />

        <Preview3D pixelData={pixelData} model={model} />
      </div>

      <input
        ref={importRef}
        type="file"
        accept=".png,image/png"
        onChange={handleFileImport}
        style={{ display: 'none' }}
      />
    </div>
  );
}
