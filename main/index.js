"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const file_1 = require("./file");
const isDev = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = 'http://localhost:5173';
const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown'];
let mainWindow = null;
let allowClose = false;
let rendererReady = false;
let fileHandlerReady = false;
let pendingOpenFile = null;
// Must run before the app is ready.
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme: file_1.ASSET_SCHEME,
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
]);
function isMarkdownPath(filePath) {
    const lower = filePath.toLowerCase();
    return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function isReadableFile(filePath) {
    try {
        return fs_1.default.statSync(filePath).isFile();
    }
    catch {
        return false;
    }
}
function getFileFromArgs() {
    const args = process.argv.slice(isDev ? 2 : 1);
    for (const arg of args) {
        if (isMarkdownPath(arg) && isReadableFile(arg))
            return arg;
    }
    return null;
}
/** Read a file and either push it to a ready renderer or hold it until it asks. */
function queueOpenFile(filePath) {
    let content;
    try {
        content = fs_1.default.readFileSync(filePath, 'utf-8');
    }
    catch {
        return;
    }
    const data = { path: filePath, content };
    (0, file_1.setCurrentFile)(filePath);
    if (mainWindow && fileHandlerReady && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('menu:open-file', data);
    }
    else {
        pendingOpenFile = data;
    }
}
function openHttpExternally(url) {
    try {
        const target = new URL(url);
        if (target.protocol === 'http:' || target.protocol === 'https:') {
            void electron_1.shell.openExternal(target.toString());
        }
    }
    catch { /* ignore */ }
}
function createMenu(win) {
    const template = [
        {
            label: '文件',
            submenu: [
                { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send('menu:new') },
                { label: '打开...', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu:open') },
                { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu:save') },
                { label: '另存为...', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('menu:save-as') },
                { label: '导出 PDF...', accelerator: 'CmdOrCtrl+Shift+E', click: () => win.webContents.send('menu:export-pdf') },
                { type: 'separator' },
                { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => electron_1.app.quit() },
            ],
        },
        {
            label: '编辑',
            submenu: [
                { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send('menu:undo') },
                { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: () => win.webContents.send('menu:redo') },
                { type: 'separator' },
                { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
                { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
            ],
        },
        {
            label: '视图',
            submenu: [
                {
                    id: 'view-source',
                    label: '源代码视图',
                    type: 'checkbox',
                    checked: false,
                    accelerator: 'CmdOrCtrl+/',
                    click: (item) => win.webContents.send('menu:toggle-source-view', item.checked),
                },
                { type: 'separator' },
                { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
                { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
                { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
            ],
        },
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
function createWindow() {
    allowClose = false;
    rendererReady = false;
    fileHandlerReady = false;
    const win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#F8F6F1',
        title: 'Markdown Editor - Untitled',
        icon: path_1.default.join(__dirname, isDev ? '../../assets/icon.png' : '../icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
    });
    createMenu(win);
    mainWindow = win;
    // Unsaved-changes handshake. Never block closing when the renderer has not
    // signalled readiness, so a broken editor cannot make the window unclosable.
    win.on('close', (e) => {
        if (allowClose || !rendererReady)
            return;
        e.preventDefault();
        if (win.webContents.isDestroyed()) {
            allowClose = true;
            win.close();
            return;
        }
        win.webContents.send('app:request-close');
    });
    win.on('closed', () => {
        if (mainWindow === win)
            mainWindow = null;
    });
    // Never let the app navigate to, or open, an untrusted page. The preload API
    // would be available to whatever loads in this window.
    win.webContents.setWindowOpenHandler(({ url }) => {
        openHttpExternally(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
        if (isDev && url.startsWith(DEV_SERVER_URL))
            return;
        event.preventDefault();
        openHttpExternally(url);
    });
    if (isDev) {
        void win.loadURL(DEV_SERVER_URL);
    }
    else {
        void win.loadFile(path_1.default.join(__dirname, '../renderer/index.html'));
    }
}
const gotSingleLock = electron_1.app.requestSingleInstanceLock();
if (!gotSingleLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', (_event, argv) => {
        if (!mainWindow)
            return;
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.focus();
        for (const arg of argv.slice(1)) {
            if (isMarkdownPath(arg) && isReadableFile(arg)) {
                queueOpenFile(arg);
                break;
            }
        }
    });
    electron_1.app.whenReady().then(() => {
        (0, file_1.registerAssetProtocol)();
        (0, file_1.registerFileHandlers)();
        electron_1.ipcMain.on('app:renderer-ready', (event) => {
            if (electron_1.BrowserWindow.fromWebContents(event.sender) !== mainWindow)
                return;
            rendererReady = true;
        });
        // Sent once the renderer has actually subscribed to menu:open-file. Until
        // then, opened files are parked and pulled via app:get-startup-file.
        electron_1.ipcMain.on('app:file-handlers-ready', (event) => {
            if (electron_1.BrowserWindow.fromWebContents(event.sender) !== mainWindow)
                return;
            fileHandlerReady = true;
        });
        // The renderer can change the view itself, so let it keep the menu checkmark honest.
        electron_1.ipcMain.on('app:set-source-view', (event, checked) => {
            if (electron_1.BrowserWindow.fromWebContents(event.sender) !== mainWindow)
                return;
            const item = electron_1.Menu.getApplicationMenu()?.getMenuItemById('view-source');
            if (item)
                item.checked = checked === true;
        });
        electron_1.ipcMain.handle('app:get-startup-file', (event) => {
            if (electron_1.BrowserWindow.fromWebContents(event.sender) !== mainWindow)
                return null;
            const data = pendingOpenFile;
            pendingOpenFile = null;
            return data;
        });
        electron_1.ipcMain.handle('app:confirm-close', async (event) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            if (!win)
                return 2; // cancel
            const result = await electron_1.dialog.showMessageBox(win, {
                type: 'warning',
                buttons: ['保存并退出', '不保存', '取消'],
                defaultId: 0,
                cancelId: 2,
                noLink: true,
                message: '有未保存的更改',
                detail: '关闭窗口前是否保存对文档的更改？',
            });
            return result.response;
        });
        electron_1.ipcMain.handle('app:confirm-unsaved', async (event) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            if (!win)
                return 2; // cancel
            const result = await electron_1.dialog.showMessageBox(win, {
                type: 'warning',
                buttons: ['保存', '不保存', '取消'],
                defaultId: 0,
                cancelId: 2,
                noLink: true,
                message: '有未保存的更改',
                detail: '切换文档前是否保存当前更改？',
            });
            return result.response;
        });
        electron_1.ipcMain.on('app:do-close', (event) => {
            if (electron_1.BrowserWindow.fromWebContents(event.sender) !== mainWindow)
                return;
            allowClose = true;
            mainWindow?.close();
        });
        createWindow();
        // Opening a .md file via file association / command line.
        const startupFile = getFileFromArgs();
        if (startupFile)
            queueOpenFile(startupFile);
        electron_1.app.on('activate', () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0)
                createWindow();
        });
    });
}
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
//# sourceMappingURL=index.js.map