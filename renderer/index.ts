import { createEditor, getMarkdown, loadMarkdown, setImageBaseDir } from './editor/setup';
import { createOutline, toggleOutline } from './outline/index';
import {
  editorViewCtx,
  schemaCtx,
} from '@milkdown/core';
import { undo as pmUndo, redo as pmRedo } from '@milkdown/prose/history';
import type { Editor } from '@milkdown/core';

let currentPath: string | null = null;
let isSaved = true;
let editor: Editor | null = null;

const root = document.getElementById('editor');
if (!root) throw new Error('Editor container #editor not found');

const titleFilename = document.getElementById('title-filename') as HTMLElement;
const statusFile = document.getElementById('status-file') as HTMLElement;
const statusSaved = document.getElementById('status-saved') as HTMLElement;
const statusWords = document.getElementById('status-words') as HTMLElement;

createEditor(root).then((ed) => {
  editor = ed;
  createOutline(ed);
  setupFileHandlers();
  setupStatusBar();

  // Outline toggle
  document.getElementById('btn-outline-toggle')?.addEventListener('click', toggleOutline);
  document.getElementById('btn-outline-close')?.addEventListener('click', toggleOutline);
});

/* ---- File handlers ---- */
function setupFileHandlers(): void {
  if (!editor) return;

  window.app.onMenuOpen(() => openFile());
  window.app.onMenuSave(() => saveFile());
  window.app.onMenuSaveAs(() => saveFileAs());
  window.app.onMenuNew(() => newFile());
  window.app.onMenuExportPdf(() => exportPdf());
  window.app.onMenuUndo(() => undo());
  window.app.onMenuRedo(() => redo());
  window.app.onMenuOpenFile((data) => {
    if (!editor) return;
    loadMarkdown(editor, data.content);
    currentPath = data.path;
    setImageBaseDir(getDirName(data.path));
    document.title = getFileName(data.path) + ' - Markdown 编辑器';
    markSaved();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      e.shiftKey ? saveFileAs() : saveFile();
    }
  });

  const view = editor.action((ctx) => ctx.get(editorViewCtx));

  // Ctrl+Click to open links, Click to edit images
  view.dom.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey) {
      const link = target.closest('a');
      if (link && link.href) {
        e.preventDefault();
        e.stopPropagation();
        window.app.openExternal(link.href);
      }
      return;
    }
    // Click on image to edit
    if (target.tagName === 'IMG' && target.closest('.milkdown-theme-nord')) {
      e.preventDefault();
      e.stopPropagation();
      handleImageClick(target as HTMLImageElement, view);
    }
  });

  view.dom.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo(); else undo();
    }
  }, true);
  view.dom.addEventListener('paste', handleImagePaste, true);
}

/* ---- Status Bar ---- */
function setupStatusBar(): void {
  if (!editor) return;
  updateStatusBar();
  setInterval(() => {
    const wc = countWords();
    statusWords.textContent = `${wc} 字`;
    if (isSaved && wc > 0) {
      // Detect unsaved changes by tracking initial word count
    }
  }, 500);
}

function updateStatusBar(): void {
  updateTitleDisplay();
  statusSaved.textContent = '已保存';
  statusWords.textContent = `${countWords()} 字`;
}

function updateTitleDisplay(): void {
  if (currentPath) {
    const name = getFileName(currentPath);
    titleFilename.textContent = name;
    statusFile.textContent = name;
  } else {
    titleFilename.textContent = '未命名';
    statusFile.textContent = '未命名';
  }
}

function markSaved(): void {
  isSaved = true;
  statusSaved.textContent = '已保存';
  updateTitleDisplay();
}

function countWords(): number {
  if (!editor) return 0;
  try {
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    const text = view.state.doc.textContent;
    if (!text.trim()) return 0;
    const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const words = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    return cjk + words;
  } catch {
    return 0;
  }
}

/* ---- Image paste ---- */
async function handleImagePaste(e: ClipboardEvent): Promise<void> {
  if (!editor) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      e.stopPropagation();
      const blob = item.getAsFile();
      if (!blob) continue;
      const dataUrl = await blobToDataUrl(blob);
      const imagePath = await window.app.saveImage(dataUrl, currentPath);
      if (imagePath) {
        // Convert to file:// URL for rendering
        const src = imagePath.startsWith('assets/') && currentPath
          ? 'file:///' + currentPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '/') + imagePath
          : 'file:///' + imagePath.replace(/\\/g, '/');
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const schema = ctx.get(schemaCtx);
          const imageType = schema.nodes.image;
          if (!imageType) return;
          const node = imageType.create({ src, alt: 'image', title: null });
          const { from, to } = view.state.selection;
          const tr = view.state.tr.replaceWith(from, to, node);
          view.dispatch(tr);
          view.focus();
        });
      }
      break;
    }
  }
}

/* ---- Image click-to-edit ---- */
function handleImageClick(img: HTMLImageElement, view: any): void {
  if (!editor) return;

  const pos = view.posAtDOM(img, 0);
  const $pos = view.state.doc.resolve(pos);
  const node = $pos.nodeAfter;
  if (!node || node.type.name !== 'image') return;

  const src = node.attrs.src as string;
  const alt = node.attrs.alt as string;
  const title = node.attrs.title as string;
  let width = '';
  try { const t = JSON.parse(title || '{}'); width = t.w || ''; } catch { /* ignore */ }

  const existing = document.querySelector('.image-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'math-popup';
  popup.innerHTML = `
    <label>地址 <input class="ip-src" value="${escapeHtml(src)}" style="width:100%"></label>
    <label>描述 <input class="ip-alt" value="${escapeHtml(alt)}" style="width:100%"></label>
    <label>宽度 <input class="ip-w" value="${width}" placeholder="auto" style="width:80px" type="number" min="0"></label>
    <div class="math-popup-actions">
      <button class="math-popup-ok">确定</button>
      <button class="math-popup-cancel">取消</button>
    </div>
  `;

  const inputSrc = popup.querySelector('.ip-src') as HTMLInputElement;
  const inputAlt = popup.querySelector('.ip-alt') as HTMLInputElement;
  const inputW = popup.querySelector('.ip-w') as HTMLInputElement;

  const rect = img.getBoundingClientRect();
  popup.style.position = 'fixed';
  popup.style.left = `${Math.max(0, rect.left)}px`;
  popup.style.zIndex = '9999';
  document.body.appendChild(popup);
  // Check if popup fits below, otherwise show above
  const popupH = popup.offsetHeight;
  if (rect.bottom + 6 + popupH > window.innerHeight) {
    popup.style.top = `${Math.max(0, rect.top - popupH - 6)}px`;
  } else {
    popup.style.top = `${rect.bottom + 6}px`;
  }
  inputSrc.focus();
  inputSrc.select();

  const close = () => { popup.remove(); view.focus(); };

  popup.querySelector('.math-popup-ok')!.addEventListener('click', () => {
    const newSrc = inputSrc.value.trim();
    const newAlt = inputAlt.value.trim();
    const w = parseInt(inputW.value) || 0;
    const meta = w > 0 ? JSON.stringify({ w }) : '';
    const nodeStart = $pos.start();
    const nodeEnd = $pos.end();
    editor!.action((ctx) => {
      const v = ctx.get(editorViewCtx);
      v.dispatch(v.state.tr.replaceWith(
        nodeStart, nodeEnd,
        ctx.get(schemaCtx).nodes.image.create({ src: newSrc, alt: newAlt, title: meta })
      ));
    });
    close();
  });

  popup.querySelector('.math-popup-cancel')!.addEventListener('click', close);

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onKey, true); }
  };
  document.addEventListener('keydown', onKey, true);

  setTimeout(() => {
    const onClickOutside = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) { close(); document.removeEventListener('click', onClickOutside); }
    };
    document.addEventListener('click', onClickOutside);
  }, 0);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ---- File ops ---- */
async function openFile(): Promise<void> {
  if (!editor) return;
  const result = await window.app.openFile();
  if (!result) return;
  loadMarkdown(editor, result.content);
  currentPath = result.path;
  setImageBaseDir(getDirName(result.path));
  document.title = getFileName(result.path) + ' - Markdown 编辑器';
  markSaved();
}

async function saveFile(): Promise<void> {
  if (!editor) return;
  const content = getMarkdown(editor);
  if (currentPath) {
    await window.app.saveFile(currentPath, content);
    document.title = getFileName(currentPath) + ' - Markdown 编辑器';
    markSaved();
  } else {
    await saveFileAs();
  }
}

async function saveFileAs(): Promise<void> {
  if (!editor) return;
  const content = getMarkdown(editor);
  const result = await window.app.saveFileAs(content);
  if (!result) return;
  currentPath = result.path;
  setImageBaseDir(getDirName(result.path));
  document.title = getFileName(result.path) + ' - Markdown 编辑器';
  markSaved();
}

function newFile(): void {
  if (!editor) return;
  loadMarkdown(editor, '');
  currentPath = null;
  setImageBaseDir(null);
  document.title = '未命名 - Markdown 编辑器';
  titleFilename.textContent = '未命名';
  markSaved();
}

async function exportPdf(): Promise<void> {
  if (!editor) return;
  const view = editor.action((ctx) => ctx.get(editorViewCtx));
  const html = view.dom.innerHTML;
  let css = '';
  const styles = document.querySelectorAll('style');
  styles.forEach((s) => { if (s.textContent) css += s.textContent + '\n'; });
  await window.app.exportPdf(html, css);
}

function undo(): void {
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    pmUndo(view.state, view.dispatch);
  });
}

function redo(): void {
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    pmRedo(view.state, view.dispatch);
  });
}

function getFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

function getDirName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  parts.pop();
  return parts.join('/');
}
