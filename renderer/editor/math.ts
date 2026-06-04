import type { MilkdownPlugin } from '@milkdown/ctx';
import { $ctx, $nodeSchema, $prose, $remark } from '@milkdown/utils';
import katex from 'katex';
import remarkMath from 'remark-math';
import { Fragment } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { KatexOptions } from 'katex';

/* ---- Module-level editor view reference (set by plugin) ---- */
let editorView: EditorView | null = null;
let inlineType: any = null;
let blockType: any = null;

function onMathClick(this: HTMLElement, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (!editorView || !inlineType || !blockType) return;

  const el = e.currentTarget as HTMLElement;
  const formula = el.dataset.value || '';
  const isBlock = el.dataset.type === 'math_block';

  // Find node position
  const { state } = editorView;
  let foundPos = -1;
  let foundNode: any = null;

  state.doc.descendants((node, pos) => {
    if (foundPos >= 0) return false;
    if (node.type === inlineType || node.type === blockType) {
      const nodeFormula = node.type === blockType ? node.attrs.value : node.textContent;
      if (nodeFormula === formula) {
        const dom = editorView!.nodeDOM(pos);
        if (dom === el || (dom && dom.contains(el))) {
          foundPos = pos;
          foundNode = node;
          return false;
        }
      }
    }
    return true;
  });

  if (foundPos < 0 || !foundNode) return;

  showMathPopup(el, formula, isBlock, foundPos, foundNode);
}

function showMathPopup(
  anchorEl: HTMLElement,
  formula: string,
  isBlock: boolean,
  pos: number,
  node: any
) {
  // Remove existing popup
  const existing = document.querySelector('.math-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'math-popup';
  popup.innerHTML = `
    <textarea class="math-popup-input" rows="${isBlock ? 4 : 1}">${escapeHtml(formula)}</textarea>
    <div class="math-popup-preview"></div>
    <div class="math-popup-actions">
      <button class="math-popup-ok">确定</button>
      <button class="math-popup-cancel">取消</button>
    </div>
  `;

  const textarea = popup.querySelector('.math-popup-input') as HTMLTextAreaElement;
  const preview = popup.querySelector('.math-popup-preview') as HTMLElement;
  const btnOk = popup.querySelector('.math-popup-ok') as HTMLElement;
  const btnCancel = popup.querySelector('.math-popup-cancel') as HTMLElement;

  // Live preview
  const updatePreview = () => {
    try {
      katex.render(textarea.value, preview, {
        throwOnError: false,
        displayMode: isBlock,
      });
    } catch {
      preview.textContent = '公式无效';
    }
  };
  updatePreview();
  textarea.addEventListener('input', updatePreview);

  // Position popup near the anchor
  const rect = anchorEl.getBoundingClientRect();
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

  // Auto-focus and select
  textarea.focus();
  textarea.select();

  const close = () => {
    popup.remove();
    editorView?.focus();
  };

  btnOk.addEventListener('click', () => {
    if (!editorView) return;
    const newFormula = textarea.value.trim();
    if (!newFormula) { close(); return; }

    const { state: st } = editorView;
    const $pos = st.doc.resolve(pos);

    if (!isBlock) {
      // Update inline math text content
      const start = $pos.start() + 1;
      const end = $pos.end() - 1;
      if (start < end) {
        editorView.dispatch(st.tr.replaceWith(start, end, st.schema.text(newFormula)));
      }
    } else {
      // Update block math attrs
      editorView.dispatch(
        st.tr.setNodeAttribute(pos, 'value', newFormula)
      );
    }
    close();
  });

  btnCancel.addEventListener('click', close);

  // Close on Escape
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onKey, true); }
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); btnOk.click(); document.removeEventListener('keydown', onKey, true); }
  };
  document.addEventListener('keydown', onKey, true);

  // Close on click outside
  setTimeout(() => {
    const onClickOutside = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) {
        close();
        document.removeEventListener('click', onClickOutside);
      }
    };
    document.addEventListener('click', onClickOutside);
  }, 0);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---- KaTeX Options ---- */
export const katexOptionsCtx = $ctx<KatexOptions, 'katexOptions'>(
  { output: 'html', throwOnError: false },
  'katexOptions'
);

/* ---- Inline Math Node ---- */
export const mathInlineSchema = $nodeSchema('math_inline', (ctx) => ({
  group: 'inline',
  inline: true,
  atom: true,
  content: 'text*',
  parseDOM: [
    {
      tag: 'span[data-type="math_inline"]',
      getContent: (dom, schema) => {
        if (!(dom instanceof HTMLElement)) return Fragment.empty;
        return Fragment.from(schema.text(dom.dataset.value || ''));
      },
    },
  ],
  toDOM: (node) => {
    const formula = node.textContent;
    const span = document.createElement('span');
    span.dataset.type = 'math_inline';
    span.dataset.value = formula;
    span.className = 'math-inline';
    span.addEventListener('click', onMathClick);
    try {
      katex.render(formula, span, ctx.get(katexOptionsCtx.key));
    } catch {
      span.textContent = formula;
      span.style.color = 'red';
    }
    return span;
  },
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => {
      state.openNode(type).addText(node.value as string).closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.textContent);
    },
  },
}));

/* ---- Block Math Node ---- */
export const mathBlockSchema = $nodeSchema('math_block', (ctx) => ({
  group: 'block',
  atom: true,
  isolating: true,
  content: 'text*',
  marks: '',
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'div[data-type="math_block"]',
      preserveWhitespace: 'full',
      getAttrs: (dom) => ({
        value: (dom as HTMLElement).dataset.value || '',
      }),
    },
  ],
  toDOM: (node) => {
    const formula = node.attrs.value as string;
    const div = document.createElement('div');
    div.dataset.type = 'math_block';
    div.dataset.value = formula;
    div.className = 'math-block';
    div.addEventListener('click', onMathClick);
    try {
      katex.render(formula, div, {
        ...ctx.get(katexOptionsCtx.key),
        displayMode: true,
      });
    } catch {
      div.textContent = formula;
      div.style.color = 'red';
    }
    return div;
  },
  parseMarkdown: {
    match: (node) => node.type === 'math',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, node.attrs.value);
    },
  },
}));

/* ---- Auto-detect $...$ in text and convert to math nodes ---- */
export const mathAutoDetectPlugin = $prose((ctx) => {
  inlineType = mathInlineSchema.type(ctx);
  blockType = mathBlockSchema.type(ctx);

  return new Plugin({
    key: new PluginKey('MATH_AUTO'),
    view(v: EditorView) {
      editorView = v;
      return { destroy() { editorView = null; } };
    },
    appendTransaction(_transactions, _oldState, newState) {
      const tr = newState.tr;
      let changed = false;

      newState.doc.descendants((node, pos) => {
        if (!node.isTextblock || node.type.spec.code) return true;

        const text = node.textContent;
        const blockStart = pos + 1;

        // 1. Handle block math: $$...$$
        const blockRegex = /\$\$([^$]+)\$\$/g;
        let bm: RegExpExecArray | null;
        while ((bm = blockRegex.exec(text)) !== null) {
          const formula = bm[1]!.trim();
          if (!formula) continue;
          const start = blockStart + bm.index;
          const end = start + bm[0].length;
          try {
            const mathBlock = blockType.create({ value: formula }, newState.schema.text(formula));
            tr.replaceWith(start, end, mathBlock);
            changed = true;
          } catch { /* skip */ }
        }

        // 2. Handle inline math: $...$ (but NOT $$...$$)
        const inlineRegex = /(?<!\$)\$([^$]+)\$(?!\$)/g;
        let im: RegExpExecArray | null;
        while ((im = inlineRegex.exec(text)) !== null) {
          const formula = im[1]!.trim();
          if (!formula) continue;
          const start = blockStart + im.index;
          const end = start + im[0].length;
          try {
            const mathNode = inlineType.create({}, newState.schema.text(formula));
            tr.replaceWith(start, end, mathNode);
            changed = true;
          } catch { /* skip */ }
        }

        return true;
      });

      if (changed) return tr;
      return null;
    },
  });
});

/* ---- Remark Math Plugin ---- */
export const remarkMathPlugin = $remark('remarkMath', () => remarkMath);

/* ---- All Math Plugins ---- */
export const math: MilkdownPlugin[] = [
  remarkMathPlugin,
  katexOptionsCtx,
  mathInlineSchema,
  mathBlockSchema,
  mathAutoDetectPlugin,
].flat();

/* ---- Click-to-edit helpers ---- */
export function getMathTypes(ctx: any) {
  return {
    inline: mathInlineSchema.type(ctx),
    block: mathBlockSchema.type(ctx),
  };
}
