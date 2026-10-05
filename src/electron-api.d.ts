// Exposed by electron/preload.js. Undefined when the app runs in a plain browser.
interface ElectronAPI {
  setDirty: (dirty: boolean) => void;
  /** Resolves to false when the user cancels the save dialog */
  savePng: (bytes: Uint8Array) => Promise<boolean>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
