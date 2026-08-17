import { contextBridge, ipcRenderer } from 'electron';

export interface OpenFileResult {
  path: string;
  content: string;
}

export interface SaveFileResult {
  path: string;
}

contextBridge.exposeInMainWorld('app', {
  platform: process.platform,

  openFile: (): Promise<OpenFileResult | null> =>
    ipcRenderer.invoke('file:open'),

  saveFile: (filePath: string, content: string): Promise<SaveFileResult> =>
    ipcRenderer.invoke('file:save', filePath, content),

  saveFileAs: (content: string): Promise<SaveFileResult | null> =>
    ipcRenderer.invoke('file:save-as', content),

  onMenuNew: (callback: () => void) =>
    ipcRenderer.on('menu:new', callback),

  onMenuOpen: (callback: () => void) =>
    ipcRenderer.on('menu:open', callback),

  onMenuSave: (callback: () => void) =>
    ipcRenderer.on('menu:save', callback),

  onMenuSaveAs: (callback: () => void) =>
    ipcRenderer.on('menu:save-as', callback),

  saveImage: (dataUrl: string, currentPath: string | null): Promise<string | null> =>
    ipcRenderer.invoke('file:save-image', dataUrl, currentPath),

  exportPdf: (html: string, css: string): Promise<string | null> =>
    ipcRenderer.invoke('file:export-pdf', html, css),

  onMenuExportPdf: (callback: () => void) =>
    ipcRenderer.on('menu:export-pdf', callback),

  onMenuUndo: (callback: () => void) =>
    ipcRenderer.on('menu:undo', callback),

  onMenuRedo: (callback: () => void) =>
    ipcRenderer.on('menu:redo', callback),

  onMenuOpenFile: (callback: (data: OpenFileResult) => void) =>
    ipcRenderer.on('menu:open-file', (_event, data) => callback(data)),

  onRequestClose: (callback: () => void) =>
    ipcRenderer.on('app:request-close', callback),

  confirmClose: (): Promise<number> =>
    ipcRenderer.invoke('app:confirm-close'),

  doClose: (): void =>
    ipcRenderer.send('app:do-close'),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-external', url),
});
