"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSET_SCHEME = void 0;
exports.setCurrentFile = setCurrentFile;
exports.registerAssetProtocol = registerAssetProtocol;
exports.registerFileHandlers = registerFileHandlers;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const url_1 = require("url");
exports.ASSET_SCHEME = 'md-asset';
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/;
/** The document the user actually opened or saved. IPC writes are restricted to it. */
let currentFile = null;
const allowedAssetDirs = new Set();
function setCurrentFile(filePath) {
    currentFile = filePath;
    if (filePath)
        allowAssetDir(path_1.default.dirname(filePath));
}
function allowAssetDir(dir) {
    allowedAssetDirs.add(path_1.default.resolve(dir));
}
function isInside(parent, child) {
    const rel = path_1.default.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path_1.default.isAbsolute(rel));
}
function isAllowedAssetPath(filePath) {
    const resolved = path_1.default.resolve(filePath);
    for (const dir of allowedAssetDirs) {
        if (isInside(dir, resolved))
            return true;
    }
    return false;
}
function textResponse(body, status) {
    return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}
/** Write through a same-directory temp file so a crash cannot leave a truncated document. */
function writeFileAtomic(filePath, data) {
    const tmp = path_1.default.join(path_1.default.dirname(filePath), '.' + path_1.default.basename(filePath) + '.' + crypto_1.default.randomUUID() + '.tmp');
    fs_1.default.writeFileSync(tmp, data);
    try {
        fs_1.default.renameSync(tmp, filePath);
    }
    catch {
        fs_1.default.copyFileSync(tmp, filePath);
        fs_1.default.rmSync(tmp, { force: true });
    }
}
/**
 * Serve local files to the renderer over a dedicated, allow-listed scheme.
 * This replaces the previous "webSecurity: false", which disabled the same-origin
 * policy for the whole window.
 */
function registerAssetProtocol() {
    allowAssetDir(path_1.default.join(electron_1.app.getPath('documents'), 'markdown-editor'));
    electron_1.protocol.handle(exports.ASSET_SCHEME, async (request) => {
        try {
            const url = new URL(request.url);
            if (url.hostname !== 'local')
                return textResponse('Not found', 404);
            const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
            if (!path_1.default.isAbsolute(filePath) || !isAllowedAssetPath(filePath)) {
                return textResponse('Forbidden', 403);
            }
            return await electron_1.net.fetch((0, url_1.pathToFileURL)(path_1.default.resolve(filePath)).toString());
        }
        catch {
            return textResponse('Not found', 404);
        }
    });
}
function showError(title, err) {
    electron_1.dialog.showErrorBox(title, err instanceof Error ? err.message : String(err));
}
function registerFileHandlers() {
    electron_1.ipcMain.handle('file:open', async (event) => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!win)
            return null;
        const result = await electron_1.dialog.showOpenDialog(win, {
            title: '打开 Markdown 文件',
            filters: [
                { name: 'Markdown 文件', extensions: ['md', 'markdown', 'mdown'] },
                { name: '所有文件', extensions: ['*'] },
            ],
            properties: ['openFile'],
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        const filePath = result.filePaths[0];
        try {
            if (!fs_1.default.statSync(filePath).isFile())
                return null;
            const content = fs_1.default.readFileSync(filePath, 'utf-8');
            setCurrentFile(filePath);
            return { path: filePath, content };
        }
        catch (err) {
            showError('无法打开文件', err);
            return null;
        }
    });
    electron_1.ipcMain.handle('file:save', async (event, filePath, content) => {
        if (!electron_1.BrowserWindow.fromWebContents(event.sender))
            return null;
        if (typeof filePath !== 'string' || typeof content !== 'string')
            return null;
        // Only the document the user actually opened or saved may be overwritten.
        if (!currentFile || path_1.default.resolve(filePath) !== path_1.default.resolve(currentFile))
            return null;
        try {
            writeFileAtomic(currentFile, content);
            return { path: currentFile };
        }
        catch (err) {
            showError('保存失败', err);
            return null;
        }
    });
    electron_1.ipcMain.handle('file:save-as', async (event, content) => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!win || typeof content !== 'string')
            return null;
        const result = await electron_1.dialog.showSaveDialog(win, {
            title: '保存 Markdown 文件',
            filters: [
                { name: 'Markdown 文件', extensions: ['md'] },
                { name: '所有文件', extensions: ['*'] },
            ],
            defaultPath: currentFile ? path_1.default.basename(currentFile) : '未命名.md',
        });
        if (result.canceled || !result.filePath)
            return null;
        try {
            writeFileAtomic(result.filePath, content);
            setCurrentFile(result.filePath);
            return { path: result.filePath };
        }
        catch (err) {
            showError('保存失败', err);
            return null;
        }
    });
    electron_1.ipcMain.handle('file:save-image', async (event, dataUrl) => {
        if (!electron_1.BrowserWindow.fromWebContents(event.sender))
            return null;
        if (typeof dataUrl !== 'string')
            return null;
        try {
            const matches = dataUrl.match(IMAGE_DATA_URL_RE);
            if (!matches)
                return null;
            const ext = matches[1] === 'jpeg' || matches[1] === 'jpg' ? 'jpg' : matches[1];
            const data = Buffer.from(matches[2], 'base64');
            if (data.length === 0 || data.length > MAX_IMAGE_BYTES)
                return null;
            const assetsDir = currentFile
                ? path_1.default.join(path_1.default.dirname(currentFile), 'assets')
                : path_1.default.join(electron_1.app.getPath('documents'), 'markdown-editor', 'assets');
            fs_1.default.mkdirSync(assetsDir, { recursive: true });
            allowAssetDir(assetsDir);
            const filename = crypto_1.default.randomUUID() + '.' + ext;
            const abs = path_1.default.join(assetsDir, filename);
            fs_1.default.writeFileSync(abs, data);
            const absPosix = abs.replace(/\\/g, '/');
            return { ref: currentFile ? 'assets/' + filename : absPosix, abs: absPosix };
        }
        catch {
            return null;
        }
    });
    electron_1.ipcMain.handle('file:export-pdf', async (event, html, css) => {
        const parent = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!parent || typeof html !== 'string' || typeof css !== 'string')
            return null;
        const result = await electron_1.dialog.showSaveDialog(parent, {
            title: '导出 PDF',
            filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
            defaultPath: currentFile
                ? path_1.default.basename(currentFile).replace(/\.(md|markdown|mdown)$/i, '.pdf')
                : '未命名.pdf',
        });
        if (result.canceled || !result.filePath)
            return null;
        const outPath = result.filePath;
        const csp = [
            "default-src 'none'",
            "style-src 'unsafe-inline'",
            'img-src data: file: ' + exports.ASSET_SCHEME + ': https: http:',
            'font-src data: file:',
            "script-src 'none'",
            "object-src 'none'",
            "base-uri 'none'",
        ].join('; ');
        const fullHtml = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n' +
            '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n<style>\n' +
            css +
            '\n  body { display:block; height:auto; overflow:visible; background:#FFFFFF !important; font-family:\'Microsoft YaHei\',\'PingFang SC\',sans-serif; font-size:16px; line-height:1.8; color:#333; max-width:800px; margin:48px auto; padding:0 24px; }\n' +
            '  .milkdown-theme-nord { background:transparent !important; margin:0 !important; padding:0 !important; max-width:none !important; min-height:0 !important; }\n' +
            '</style>\n</head>\n<body>' + html + '</body>\n</html>';
        // A temp file avoids Chromium's data: URL length limit, which could make large
        // documents hang forever waiting for a load that never happens.
        const tmpHtml = path_1.default.join(electron_1.app.getPath('temp'), 'md-export-' + crypto_1.default.randomUUID() + '.html');
        try {
            fs_1.default.writeFileSync(tmpHtml, fullHtml, 'utf-8');
        }
        catch (err) {
            showError('导出失败', err);
            return null;
        }
        const printWin = new electron_1.BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
            },
        });
        return await new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const finish = (value) => {
                if (settled)
                    return;
                settled = true;
                if (timer)
                    clearTimeout(timer);
                try {
                    fs_1.default.rmSync(tmpHtml, { force: true });
                }
                catch { /* ignore */ }
                try {
                    if (!printWin.isDestroyed())
                        printWin.destroy();
                }
                catch { /* ignore */ }
                resolve(value);
            };
            timer = setTimeout(() => finish(null), 60_000);
            printWin.webContents.on('did-fail-load', () => finish(null));
            printWin.webContents.once('did-finish-load', () => {
                void (async () => {
                    // Wait for in-flight images. A CSP that blocks injected scripts must not
                    // abort the export, so this step is best-effort.
                    try {
                        await printWin.webContents.executeJavaScript('new Promise((resolve) => {\n' +
                            '  const pending = Array.from(document.images).filter((img) => !img.complete);\n' +
                            '  if (pending.length === 0) return resolve(true);\n' +
                            '  let remaining = pending.length;\n' +
                            '  const done = () => { if (--remaining <= 0) resolve(true); };\n' +
                            '  for (const img of pending) {\n' +
                            '    img.addEventListener(\'load\', done, { once: true });\n' +
                            '    img.addEventListener(\'error\', done, { once: true });\n' +
                            '  }\n' +
                            '  setTimeout(() => resolve(true), 8000);\n' +
                            '})', true);
                    }
                    catch { /* ignore */ }
                    try {
                        const pdfData = await printWin.webContents.printToPDF({
                            printBackground: true,
                            preferCSSPageSize: true,
                        });
                        fs_1.default.writeFileSync(outPath, pdfData);
                        finish(outPath);
                    }
                    catch (err) {
                        console.error('PDF export failed:', err);
                        showError('导出失败', err);
                        finish(null);
                    }
                })();
            });
            printWin.loadFile(tmpHtml).catch(() => finish(null));
        });
    });
    electron_1.ipcMain.handle('shell:open-external', async (event, url) => {
        if (!electron_1.BrowserWindow.fromWebContents(event.sender))
            return;
        if (typeof url !== 'string')
            return;
        let target;
        try {
            target = new URL(url);
        }
        catch {
            return;
        }
        // Only real web/mail links may reach the OS. Anything else (file:, ms-msdt:,
        // custom protocols, ...) can launch local programs on Windows.
        if (!ALLOWED_EXTERNAL_PROTOCOLS.has(target.protocol))
            return;
        try {
            await electron_1.shell.openExternal(target.toString());
        }
        catch { /* ignore */ }
    });
    electron_1.ipcMain.on('app:forget-current-file', (event) => {
        if (!electron_1.BrowserWindow.fromWebContents(event.sender))
            return;
        currentFile = null;
    });
}
//# sourceMappingURL=file.js.map