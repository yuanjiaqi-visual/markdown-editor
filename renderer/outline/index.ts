import type { Editor } from '@milkdown/core';
import { editorViewCtx, editorStateCtx } from '@milkdown/core';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';

interface HeadingItem {
  level: number;
  text: string;
  pos: number;
}

let observer: MutationObserver | null = null;

export function createOutline(editor: Editor): void {
  const list = document.getElementById('outline-list') as HTMLElement;
  const sidebar = document.getElementById('outline-sidebar') as HTMLElement;

  function collectHeadings(): HeadingItem[] {
    return editor.action((ctx) => {
      const state = ctx.get(editorStateCtx);
      const headings: HeadingItem[] = [];

      state.doc.descendants((node: ProseNode, pos: number) => {
        if (node.type.name === 'heading') {
          headings.push({
            level: node.attrs.level as number,
            text: node.textContent,
            pos,
          });
        }
        return true;
      });

      return headings;
    });
  }

  function renderList(headings: HeadingItem[]): void {
    list.innerHTML = '';

    if (headings.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'outline-empty';
      empty.textContent = '暂无标题';
      list.appendChild(empty);
      return;
    }

    headings.forEach((h) => {
      const item = document.createElement('div');
      item.className = 'outline-item';
      item.style.paddingLeft = `${(h.level - 1) * 12 + 12}px`;
      item.textContent = h.text;
      item.dataset.pos = String(h.pos);

      item.addEventListener('click', () => {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const resolved = view.state.doc.resolve(h.pos);
          view.dispatch(
            view.state.tr.setSelection(new TextSelection(resolved))
          );
          view.focus();

          const node = view.nodeDOM(h.pos);
          if (node instanceof HTMLElement) {
            node.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

      list.appendChild(item);
    });
  }

  function highlightCurrent(headings: HeadingItem[]): void {
    if (headings.length === 0) return;

    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    const viewportTop = view.dom.scrollTop;

    let activeIdx = -1;
    for (let i = headings.length - 1; i >= 0; i--) {
      const node = view.nodeDOM(headings[i].pos);
      if (node instanceof HTMLElement) {
        const rect = node.getBoundingClientRect();
        const editorRect = view.dom.getBoundingClientRect();
        if (rect.top - editorRect.top <= viewportTop + 80) {
          activeIdx = i;
          break;
        }
      }
    }

    const items = list.querySelectorAll('.outline-item');
    items.forEach((el, idx) => {
      if (idx === activeIdx) el.classList.add('active');
      else el.classList.remove('active');
    });
  }

  function update(): void {
    const headings = collectHeadings();
    renderList(headings);
    highlightCurrent(headings);
  }

  setTimeout(update, 400);

  const view = editor.action((ctx) => ctx.get(editorViewCtx));
  view.dom.addEventListener('scroll', update, { passive: true });

  observer = new MutationObserver(update);
  observer.observe(view.dom, { childList: true, subtree: true, characterData: true });
}

export function toggleOutline(): void {
  const sidebar = document.getElementById('outline-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
  }
}
