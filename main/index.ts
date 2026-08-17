import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { registerFileHandlers } from './file';

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;
let allowClose = false;

function getFileFromArgs(): string | null {
  const args = process.argv.slice(isDev ? 2 : 1);
  for (const arg of args) {
    if (arg.endsWith('.md') || arg.endsWith('.markdown')) {
      try { if (fs.existsSync(arg)) return arg; } catch { /* ignore */ }
    }
  }
  return null;
}

function sendOpenFile(win: BrowserWindow, filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  win.webContents.send('menu:open-file', { path: filePath, content });
}

function createMenu(win: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => win.webContents.send('menu:new'),
        },
        {
          label: '打开...',
          accelerator: 'CmdOrCtrl+O',
          click: () => win.webContents.send('menu:open'),
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => win.webContents.send('menu:save'),
        },
        {
          label: '另存为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => win.webContents.send('menu:save-as'),
        },
        {
          label: '导出 PDF...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => win.webContents.send('menu:export-pdf'),
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
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
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#F8F6F1',
    title: 'Markdown Editor - Untitled',
    icon: path.join(__dirname, isDev ? '../../assets/icon.png' : '../icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  createMenu(win);
  mainWindow = win;

  // Intercept close: ask renderer whether there are unsaved changes
  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send('app:request-close');
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // Check for file path in second instance args
      for (const arg of argv.slice(1)) {
        if (arg.endsWith('.md') || arg.endsWith('.markdown')) {
          try { if (fs.existsSync(arg)) sendOpenFile(mainWindow, arg); } catch { /* ignore */ }
          break;
        }
      }
    }
  });

  app.whenReady().then(() => {
    registerFileHandlers();

    ipcMain.handle('app:confirm-close', async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return 2; // cancel
      const result = await dialog.showMessageBox(win, {
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

    ipcMain.on('app:do-close', () => {
      allowClose = true;
      mainWindow?.close();
    });

    createWindow();

    // If launched by opening a .md file
    const filePath = getFileFromArgs();
    if (filePath && mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
        sendOpenFile(mainWindow!, filePath);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
