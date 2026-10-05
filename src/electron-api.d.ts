// Exposed by electron/preload.js. Undefined when the app runs in a plain browser.
interface ElectronAPI {
  setDirty: (dirty: boolean) => void;
  /**
   * Writes to `targetPath`, or asks where to save (starting at `defaultPath`) when it is null.
   * Resolves to the saved path, or null when the user cancels the dialog.
   */
  savePng: (bytes: Uint8Array, targetPath: string | null, defaultPath: string | null) => Promise<string | null>;
  /** Path on disk of a file picked or dropped by the user ('' if it has none) */
  getPathForFile: (file: File) => string;
}

interface Window {
  electronAPI?: ElectronAPI;
}
