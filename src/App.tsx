import { useState, useCallback, useEffect, useRef } from 'react';
import Editor from './components/Editor';
import Preview3D from './components/Preview3D';
import ReferenceImage from './components/ReferenceImage';
import Toolbar from './components/Toolbar';
import { loadPrefs, savePrefs } from './utils/prefs';
import type { SkinModel, SkinPixel, Tool } from './types';
import { MAX_BRUSH_SIZE, SKIN_W, SKIN_H, createEmptySkin } from './types';
import { useSkinPainter } from './hooks/useSkinPainter';
import type { BodySide } from './utils/skinMirror';
import { mirrorHalf } from './utils/skinOps';
import { getRestoredSession, saveSession } from './utils/autosave';
import { createDefaultSkin } from './utils/defaultSkin';
import { LEGACY_SKIN_H, convertLegacySkin, detectModel } from './utils/skinConvert';
import './App.css';

const MAX_UNDO = 100;
const MAX_RECENT_COLORS = 10;

export default function App() {
  const [pixelData, setPixelData] = useState<Uint8ClampedArray>(() => getRestoredSession()?.pixels ?? createDefaultSkin());
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#ff5500');
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [brushSize, setBrushSize] = useState(1);
  const [model, setModel] = useState<SkinModel>(() => getRestoredSession()?.model ?? 'classic');
  const [mirror, setMirror] = useState(false);
  const [shade, setShade] = useState(false);
  const [showRegions, setShowRegions] = useState(true);
  const [hover, setHover] = useState<SkinPixel | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [dirty, setDirty] = useState(() => getRestoredSession() !== null);
  // File that Ctrl+S overwrites (desktop app only)
  const [filePath, setFilePath] = useState<string | null>(() => getRestoredSession()?.filePath ?? null);
  const undoStack = useRef<Uint8ClampedArray[]>([]);
  const redoStack = useRef<Uint8ClampedArray[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [customPalette, setCustomPalette] = useState<string[]>(() => loadPrefs().customPalette);

  const updateCustomPalette = useCallback((next: string[]) => {
    setCustomPalette(next);
    savePrefs({ customPalette: next });
  }, []);

  const handleReferenceFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReferenceUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const closeReference = useCallback(() => {
    setReferenceUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

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

  const handleHover = useCallback((pixel: SkinPixel | null) => {
    setHover(prev => (prev?.x === pixel?.x && prev?.y === pixel?.y ? prev : pixel));
  }, []);

  const handleColorUsed =useCallback((hex: string) => {
    setRecentColors(prev => (prev[0] === hex ? prev : [hex, ...prev.filter(c => c !== hex)].slice(0, MAX_RECENT_COLORS)));
  }, []);

  const painter = useSkinPainter({
    pixelData, tool, color, brushSize, model, mirror, shade,
    onStrokeStart: handleStrokeStart,
    onPixelChange: handlePixelChange,
    onColorPick: setColor,
    onColorUsed: handleColorUsed,
  });

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

  const handleMirrorHalf = useCallback((from: BodySide) => {
    handleStrokeStart();
    setPixelData(mirrorHalf(pixelDataRef.current, model, from));
  }, [handleStrokeStart, model]);

  const handleClear = useCallback(() => {
    if (!confirm('スキンデータを全クリアしますか？')) return;
    handleStrokeStart();
    setPixelData(createEmptySkin());
  }, [handleStrokeStart]);

  const save = useCallback(async (saveAs: boolean) => {
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
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const savedPath = await window.electronAPI.savePng(bytes, saveAs ? null : filePath, filePath);
        if (savedPath) {
          setFilePath(savedPath);
          setDirty(false);
        }
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
  }, [filePath]);

  const handleSave = useCallback(() => { save(false); }, [save]);
  const handleSaveAs = useCallback(() => { save(true); }, [save]);

  const handleImport = useCallback(() => {
    importRef.current?.click();
  }, []);

  const loadSkinFile = useCallback((file: File) => {
    const path = window.electronAPI?.getPathForFile(file) || null;
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
      // 旧形式は変換した時点で元ファイルと内容が変わるので、未保存扱いにして
      // 元ファイルを黙って上書きしないよう保存先も引き継がない
      setDirty(isLegacy);
      setFilePath(isLegacy ? null : path);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      alert('画像を読み込めませんでした。');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [handleStrokeStart]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadSkinFile(file);
    e.target.value = '';
  }, [loadSkinFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      alert('PNG ファイルをドロップしてください。');
      return;
    }
    loadSkinFile(file);
  }, [loadSkinFile]);

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

  // Autosave shortly after each change, so a crash or an accidental close loses nothing
  useEffect(() => {
    const timer = setTimeout(() => saveSession({ pixels: pixelData, model, filePath, dirty }), 500);
    return () => clearTimeout(timer);
  }, [pixelData, model, filePath, dirty]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey) {
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
        else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
        else if (key === 's') { e.preventDefault(); save(e.shiftKey); }
        return;
      }
      if (e.metaKey || e.altKey) return;
      switch (key) {
        case 'p': setTool('pen'); break;
        case 'e': setTool('eraser'); break;
        case 'f': setTool('fill'); break;
        case 'i': setTool('eyedropper'); break;
        case 'l': setTool('lighten'); break;
        case 'd': setTool('darken'); break;
        case 's': setTool('select'); break;
        case 'm': setMirror(v => !v); break;
        case 'n': setShade(v => !v); break;
        case '[': setBrushSize(s => Math.max(1, s - 1)); break;
        case ']': setBrushSize(s => Math.min(MAX_BRUSH_SIZE, s + 1)); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo, save]);

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : null;

  return (
    <div className="app" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <header className="app-header">
        <div className="app-title">
          <span className="app-icon">⛏️</span>
          <h1>Minecraft Skin Editor</h1>
          {fileName && <span className="file-name" title={filePath ?? undefined}>{fileName}</span>}
          {dirty && <span className="unsaved-badge">未保存</span>}
        </div>
        <div className="app-header-actions">
          <span className="shortcut-hint">P: ペン  E: 消しゴム  F: 塗りつぶし  I: スポイト  S: 範囲選択  L/D: 明るく/暗く  M: 左右対称  N: 色むら  Ctrl+Z: 元に戻す  Ctrl+Y: やり直す  Ctrl+S: 保存</span>
        </div>
      </header>

      <div className="app-body">
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          recentColors={recentColors}
          customPalette={customPalette}
          onAddCustomColor={() => {
            if (!customPalette.includes(color)) updateCustomPalette([...customPalette, color]);
          }}
          onRemoveCustomColor={c => updateCustomPalette(customPalette.filter(x => x !== c))}
          onOpenReference={() => referenceRef.current?.click()}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          model={model}
          onModelChange={setModel}
          mirror={mirror}
          onToggleMirror={() => setMirror(v => !v)}
          shade={shade}
          onToggleShade={() => setShade(v => !v)}
          showRegions={showRegions}
          onToggleRegions={() => setShowRegions(v => !v)}
          showOverlay={showOverlay}
          onToggleOverlay={() => setShowOverlay(v => !v)}
          onSave={handleSave}
          onSaveAs={window.electronAPI ? handleSaveAs : undefined}
          onImport={handleImport}
          onMirrorHalf={handleMirrorHalf}
          onClear={handleClear}
          onUndo={handleUndo}
          canUndo={canUndo}
          onRedo={handleRedo}
          canRedo={canRedo}
        />

        <Editor
          pixelData={pixelData}
          tool={tool}
          brushSize={brushSize}
          model={model}
          showRegions={showRegions}
          hover={hover}
          onHover={handleHover}
          painter={painter}
          onStrokeStart={handleStrokeStart}
          onPixelChange={handlePixelChange}
        />

        <Preview3D pixelData={pixelData} model={model} showOverlay={showOverlay} hover={hover} onHover={handleHover} painter={painter} />
        {referenceUrl && (
          <ReferenceImage url={referenceUrl} onColorPick={setColor} onClose={closeReference} />
        )}
      </div>

      <input
        ref={referenceRef}
        type="file"
        accept="image/*"
        onChange={handleReferenceFile}
        style={{ display: 'none' }}
      />
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
