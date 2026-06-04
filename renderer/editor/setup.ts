import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorStateCtx,
  serializerCtx,
  parserCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { nord } from '@milkdown/theme-nord';
import { clipboard } from '@milkdown/plugin-clipboard';
import { prism } from '@milkdown/plugin-prism';
import { math } from './math';
import { commandsCtx } from '@milkdown/core';
import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { history } from 'prosemirror-history';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';

import 'katex/dist/katex.min.css';
import './style.css';

const historyPlugin = $prose(() => history());

let baseDir: string | null = null;
export function setImageBaseDir(dir: string | null) { baseDir = dir; }

const imageResizePlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('IMAGE_RESIZE'),
    view(v: EditorView) {
      const update = () => {
        v.dom.querySelectorAll('img').forEach((img) => {
          const pos = v.posAtDOM(img, 0);
          const $pos = v.state.doc.resolve(pos);
          const node = $pos.nodeAfter;
          if (node?.type.name === 'image') {
            const src = node.attrs.src as string;
            // Resolve relative paths to file:///
            if (baseDir && src && !src.includes('://') && !src.startsWith('data:')) {
              const abs = src.replace(/\\/g, '/');
              const resolved = 'file:///' + baseDir.replace(/\\/g, '/') + '/' + abs;
              if ((img as HTMLImageElement).src !== resolved) {
                (img as HTMLImageElement).src = resolved;
              }
            }
            // Apply width
            try {
              const meta = JSON.parse((node.attrs.title as string) || '{}');
              if (meta.w) (img as HTMLImageElement).style.width = meta.w + 'px';
            } catch { /* ignore */ }
          }
        });
      };
      const obs = new MutationObserver(update);
      obs.observe(v.dom, { childList: true, subtree: true });
      update();
      return { destroy() { obs.disconnect(); } };
    },
  });
});

const trailingParagraph = $prose(() => {
  return new Plugin({
    key: new PluginKey('TRAILING_PARAGRAPH'),
    appendTransaction(_trs, _oldState, newState) {
      const doc = newState.doc;
      const last = doc.lastChild;
      if (!last) return null;
      // If last node is a non-editable block (code block, math block, hr, etc.),
      // ensure there's an empty paragraph after it
      const nonTextBlocks = ['code_block', 'math_block', 'horizontal_rule', 'blockquote'];
      if (nonTextBlocks.includes(last.type.name)) {
        const para = newState.schema.nodes.paragraph;
        if (para) {
          const tr = newState.tr;
          tr.insert(doc.content.size, para.create());
          // Place cursor in the new paragraph
          tr.setSelection(TextSelection.create(tr.doc, doc.content.size + 1));
          return tr;
        }
      }
      return null;
    },
    props: {
      handleKeyDown(view, event) {
        // Arrow down at the end of doc: if last node is special, jump to trailing para
        if (event.key === 'ArrowDown' && !event.shiftKey) {
          const { state } = view;
          const { $head } = state.selection;
          if ($head.pos >= state.doc.content.size - 1) {
            const last = state.doc.lastChild;
            const nonTextBlocks = ['code_block', 'math_block', 'horizontal_rule'];
            if (last && nonTextBlocks.includes(last.type.name)) {
              // Already handled by appendTransaction
              return false;
            }
          }
        }
        return false;
      },
    },
  });
});

const strikethroughKeymap = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey('STRIKETHROUGH_CTRLD'),
    props: {
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
          event.preventDefault();
          const cmds = ctx.get(commandsCtx);
          cmds.call('ToggleStrikethrough');
          return true;
        }
        return false;
      },
    },
  });
});

export async function createEditor(root: HTMLElement): Promise<Editor> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, '# Welcome\n\nType **Markdown** here. All syntax is supported.\n\n## Math\n\nInline formula: $E=mc^2$\n\nBlock formula:\n\n$$\na^2 + b^2 = c^2\n$$\n\n## Code\n\n```js\nconst greeting = "Hello";\n```');
    })
    .config(nord)
    .use(commonmark)
    .use(gfm)
    .use(clipboard)
    .use(prism)
    .use(math)
    .use(historyPlugin)
    .use(imageResizePlugin)
    .use(trailingParagraph)
    .use(strikethroughKeymap)
    .create();

  return editor;
}

export function getMarkdown(editor: Editor): string {
  return editor.action((ctx) => {
    const doc = ctx.get(editorStateCtx).doc;
    const serializer = ctx.get(serializerCtx);
    return serializer(doc);
  });
}

export function loadMarkdown(editor: Editor, markdown: string): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const parser = ctx.get(parserCtx);
    const doc = parser(markdown);
    if (!doc) return;

    const state = view.state;
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    view.dispatch(tr);
  });
}
