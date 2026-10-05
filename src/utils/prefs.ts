const KEY = 'minecraft-skin-editor.prefs';

/** Small settings remembered between launches */
export interface Prefs {
  customPalette: string[];
  /** Index into the 3D preview's background choices */
  previewBackground: number;
}

const DEFAULTS: Prefs = { customPalette: [], previewBackground: 0 };

export function loadPrefs(): Prefs {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      customPalette: Array.isArray(data.customPalette)
        ? data.customPalette.filter((c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c))
        : DEFAULTS.customPalette,
      previewBackground: Number.isInteger(data.previewBackground) ? data.previewBackground : DEFAULTS.previewBackground,
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(changes: Partial<Prefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...changes }));
  } catch {
    // Storage unavailable: settings just do not persist
  }
}
