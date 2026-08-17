import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface OpenFileResult {
  path: string;
  content: string;
}

export interface SaveFileResult {
  path: string;
}

export function registerFileHandlers(): void {
  ipcMain.handle('file:open', async (): Promise<OpenFileResult | null> => {
    const result = await dialog.showOpenDialog({
      title: '打开 Markdown 文件',
      filters: [
        { name: 'Markdown 文件', extensions: ['md', 'markdown', 'mdown'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');

    return { path: filePath, content };
  });

  ipcMain.handle(
    'file:save',
    async (_event, filePath: string, content: string): Promise<SaveFileResult> => {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { path: filePath };
    }
  );

  ipcMain.handle(
    'file:save-as',
    async (_event, content: string): Promise<SaveFileResult | null> => {
      const result = await dialog.showSaveDialog({
        title: '保存 Markdown 文件',
        filters: [
          { name: 'Markdown 文件', extensions: ['md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        defaultPath: '未命名.md',
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { path: result.filePath };
    }
  );

  ipcMain.handle(
    'file:save-image',
    async (
      _event,
      dataUrl: string,
      currentFilePath: string | null
    ): Promise<string | null> => {
      try {
        const matches = dataUrl.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/);
        if (!matches) return null;

        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const data = Buffer.from(matches[2], 'base64');

        // Determine assets directory
        let assetsDir: string;
        if (currentFilePath) {
          assetsDir = path.join(path.dirname(currentFilePath), 'assets');
        } else {
          // Fallback: save to documents folder
          assetsDir = path.join(app.getPath('documents'), 'markdown-editor', 'assets');
        }

        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
        }

        const filename = `${crypto.randomUUID()}.${ext}`;
        const filePath = path.join(assetsDir, filename);

        fs.writeFileSync(filePath, data);

        // Return relative path for markdown reference
        if (currentFilePath) {
          return `assets/${filename}`;
        }
        return filePath;
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    'file:export-pdf',
    async (_event, html: string, css: string): Promise<string | null> => {
      const result = await dialog.showSaveDialog({
        title: '导出 PDF',
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        defaultPath: '未命名.pdf',
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      return new Promise((resolve) => {
        const win = new BrowserWindow({
          width: 800,
          height: 600,
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });

        const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  ${css}
  /* ---- 导出专用覆盖：白底、去掉编辑器淡灰背景与编辑器容器样式 ---- */
  body {
    display: block;
    height: auto;
    overflow: visible;
    background: #FFFFFF !important;
    font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
    font-size: 16px;
    line-height: 1.8;
    color: #333;
    max-width: 800px;
    margin: 48px auto;
    padding: 0 24px;
  }
  .milkdown-theme-nord {
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    max-width: none !important;
    min-height: 0 !important;
  }
</style>
</head>
<body>${html}</body>
</html>`;

        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

        win.webContents.on('did-finish-load', async () => {
          try {
            const pdfData = await win.webContents.printToPDF({
              printBackground: true,
              preferCSSPageSize: true,
            });

            fs.writeFileSync(result.filePath!, pdfData);
            win.close();
            resolve(result.filePath!);
          } catch (err) {
            win.close();
            console.error('PDF export failed:', err);
            resolve(null);
          }
        });
      });
    }
  );

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });
}
