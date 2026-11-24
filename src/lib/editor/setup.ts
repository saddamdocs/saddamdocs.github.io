/**
 * The CodeMirror 6 editor in source mode (PLAN 3, 4.2, 6.1): the plain Markdown text with syntax
 * highlighting, the browser's spellcheck and right-click menu, undo history, and the theme's
 * fonts and colours through CSS variables. M4 adds live preview on top of this setup.
 *
 * Parser: CommonMark with GFM (tables, task lists, strikethrough, autolinks), without subscript,
 * superscript and emoji, so parsing matches Obsidian (PLAN 6.1). `markdownLanguage` from
 * `@codemirror/lang-markdown` would add those three, so the base is `commonmarkLanguage`.
 *
 * Talks to: CodeMirror packages only. The UI passes callbacks for changes, blur and position.
 */

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { GFM } from '@lezer/markdown';

/** What the editor reports to its owner. */
export interface EditorHooks {
  /** The document changed through a user edit. */
  onEdit: () => void;
  /** The editor lost focus (PLAN 4.4: save at once). */
  onBlur: () => void;
  /** The cursor or scroll position changed, for the workspace (PLAN 4.6). */
  onPosition: (cursor: number, scroll: number) => void;
  /** Ctrl+S: save now, and from M3a sync now (PLAN 4.4, 4.12). */
  onSaveNow: () => void;
}

/** Highlighting of Markdown in source mode, in the theme's colours (PLAN 4.9). */
const sourceHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', color: 'var(--heading)' },
  { tag: tags.strong, fontWeight: '700', color: 'var(--heading)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', backgroundColor: 'var(--panel)' },
  { tag: tags.link, textDecoration: 'underline 2px var(--accent)' },
  { tag: tags.url, color: 'var(--text-muted)' },
  {
    tag: [tags.processingInstruction, tags.meta, tags.contentSeparator],
    color: 'var(--text-muted)',
  },
  { tag: tags.quote, color: 'var(--text)' },
]);

/** Layout and colours of the editor, all from CSS variables set by `settings/apply.ts`. */
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--paper)',
    color: 'var(--text)',
    fontSize: 'var(--font-size)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-text)', lineHeight: 'var(--line-height)' },
  '.cm-content': {
    maxWidth: 'var(--text-width)',
    width: '100%',
    marginInline: 'auto',
    padding: '32px 24px 40vh',
    caretColor: 'var(--text)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--selection)' },
});

/**
 * The extensions of a source-mode editor.
 *
 * @param hooks - Callbacks for edits, blur and position.
 * @returns The extension list.
 */
export function sourceExtensions(hooks: EditorHooks): Extension[] {
  return [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    markdown({ base: commonmarkLanguage, extensions: GFM }),
    syntaxHighlighting(sourceHighlight),
    editorTheme,
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          hooks.onSaveNow();
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    // PLAN 4.2: the browser's own spellcheck; autocorrect and capitalisation would rewrite Markdown.
    EditorView.contentAttributes.of({
      spellcheck: 'true',
      autocorrect: 'off',
      autocapitalize: 'off',
    }),
    EditorView.updateListener.of((update) => {
      // Every change is this device's own until M3b, which marks remote changes with an
      // annotation and leaves them out here (PLAN 6.2, "Edits made by the app").
      if (update.docChanged) hooks.onEdit();
      if (update.selectionSet || update.docChanged) {
        hooks.onPosition(update.state.selection.main.head, update.view.scrollDOM.scrollTop);
      }
      if (update.focusChanged && !update.view.hasFocus) hooks.onBlur();
    }),
    EditorView.domEventHandlers({
      scroll: (_event, view) => {
        hooks.onPosition(view.state.selection.main.head, view.scrollDOM.scrollTop);
      },
    }),
  ];
}

/**
 * The extensions of a read-only view of a text, such as a snapshot in the History view.
 *
 * @returns The extension list.
 */
export function readOnlyExtensions(): Extension[] {
  return [
    EditorView.lineWrapping,
    markdown({ base: commonmarkLanguage, extensions: GFM }),
    syntaxHighlighting(sourceHighlight),
    editorTheme,
    EditorView.theme({ '.cm-content': { padding: '12px' } }),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
  ];
}

/**
 * Creates an editor for a note.
 *
 * @param parent - The element to draw into.
 * @param text - The note's text.
 * @param cursor - Cursor offset to restore; clamped to the text.
 * @param hooks - Callbacks.
 * @returns The editor view. Call `destroy()` when the tab closes.
 */
export function createEditor(
  parent: HTMLElement,
  text: string,
  cursor: number,
  hooks: EditorHooks,
): EditorView {
  const position = Math.max(0, Math.min(cursor, text.length));
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      selection: EditorSelection.cursor(position),
      extensions: sourceExtensions(hooks),
    }),
  });
}
