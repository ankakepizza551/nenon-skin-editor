import type { SkinModel } from '../types';
import { SKIN_W, SKIN_H } from '../types';

// Also cleared by electron/main.js when the user closes without saving
const KEY = 'minecraft-skin-editor.autosave';

export interface Session {
  pixels: Uint8ClampedArray;
  model: SkinModel;
  filePath: string | null;
  dirty: boolean;
}

function toBase64(bytes: Uint8ClampedArray): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8ClampedArray {
  const binary = atob(text);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Keep the current work in browser storage so it survives a crash or an accidental close. */
export function saveSession(session: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      pixels: toBase64(session.pixels),
      model: session.model,
      filePath: session.filePath,
      dirty: session.dirty,
    }));
  } catch {
    // Storage unavailable or full: autosave is best-effort
  }
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const pixels = fromBase64(data.pixels);
    if (pixels.length !== SKIN_W * SKIN_H * 4) return null;
    return {
      pixels,
      model: data.model === 'slim' ? 'slim' : 'classic',
      filePath: typeof data.filePath === 'string' ? data.filePath : null,
      dirty: data.dirty === true,
    };
  } catch {
    return null;
  }
}

let restored: Session | null | undefined;

/**
 * Unsaved work left over from the previous run, if the user agrees to bring it back.
 * Asks at most once per launch; later calls return the same answer.
 */
export function getRestoredSession(): Session | null {
  if (restored === undefined) {
    const session = loadSession();
    restored = session?.dirty && confirm('前回、保存せずに終了した作業があります。復元しますか？')
      ? session
      : null;
  }
  return restored;
}
