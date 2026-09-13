"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    platform: process.platform,
    openFile: () => electron_1.ipcRenderer.invoke('file:open'),
    saveFile: (filePath, content) => electron_1.ipcRenderer.invoke('file:save', filePath, content),
    saveFileAs: (content) => electron_1.ipcRenderer.invoke('file:save-as', content),
    saveImage: (dataUrl) => electron_1.ipcRenderer.invoke('file:save-image', dataUrl),
    exportPdf: (html, css) => electron_1.ipcRenderer.invoke('file:export-pdf', html, css),
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:open-external', url),
    confirmClose: () => electron_1.ipcRenderer.invoke('app:confirm-close'),
    confirmUnsaved: () => electron_1.ipcRenderer.invoke('app:confirm-unsaved'),
    doClose: () => electron_1.ipcRenderer.send('app:do-close'),
    notifyReady: () => electron_1.ipcRenderer.send('app:renderer-ready'),
    notifyFileHandlersReady: () => electron_1.ipcRenderer.send('app:file-handlers-ready'),
    getStartupFile: () => electron_1.ipcRenderer.invoke('app:get-startup-file'),
    forgetCurrentFile: () => electron_1.ipcRenderer.send('app:forget-current-file'),
    onMenuNew: (callback) => { electron_1.ipcRenderer.on('menu:new', () => callback()); },
    onMenuOpen: (callback) => { electron_1.ipcRenderer.on('menu:open', () => callback()); },
    onMenuSave: (callback) => { electron_1.ipcRenderer.on('menu:save', () => callback()); },
    onMenuSaveAs: (callback) => { electron_1.ipcRenderer.on('menu:save-as', () => callback()); },
    onMenuExportPdf: (callback) => { electron_1.ipcRenderer.on('menu:export-pdf', () => callback()); },
    onMenuUndo: (callback) => { electron_1.ipcRenderer.on('menu:undo', () => callback()); },
    onMenuRedo: (callback) => { electron_1.ipcRenderer.on('menu:redo', () => callback()); },
    onMenuToggleSourceView: (callback) => {
        electron_1.ipcRenderer.on('menu:toggle-source-view', (_event, checked) => callback(checked === true));
    },
    setSourceViewChecked: (checked) => electron_1.ipcRenderer.send('app:set-source-view', checked === true),
    onMenuOpenFile: (callback) => {
        electron_1.ipcRenderer.on('menu:open-file', (_event, data) => callback(data));
    },
    onRequestClose: (callback) => {
        electron_1.ipcRenderer.on('app:request-close', () => callback());
    },
};
electron_1.contextBridge.exposeInMainWorld('app', api);
//# sourceMappingURL=preload.js.map