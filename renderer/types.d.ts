interface OpenFileResult {
  path: string;
  content: string;
}

interface SaveFileResult {
  path: string;
}

interface AppAPI {
  platform: string;
  openFile: () => Promise<OpenFileResult | null>;
  saveFile: (filePath: string, content: string) => Promise<SaveFileResult>;
  saveFileAs: (content: string) => Promise<SaveFileResult | null>;
  onMenuNew: (callback: () => void) => void;
  onMenuOpen: (callback: () => void) => void;
  onMenuSave: (callback: () => void) => void;
  onMenuSaveAs: (callback: () => void) => void;
  saveImage: (dataUrl: string, currentPath: string | null) => Promise<string | null>;
  exportPdf: (html: string, css: string) => Promise<string | null>;
  onMenuExportPdf: (callback: () => void) => void;
  onMenuUndo: (callback: () => void) => void;
  onMenuRedo: (callback: () => void) => void;
  onMenuOpenFile: (callback: (data: OpenFileResult) => void) => void;
  onRequestClose: (callback: () => void) => void;
  confirmClose: () => Promise<number>;
  doClose: () => void;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    app: AppAPI;
  }
}

export {};
