import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, UIEvent } from 'react';
import {
  BookmarkPlus,
  Check,
  Copy,
  FileText,
  LayoutTemplate,
  Loader2,
  PenLine,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { usePromptManager } from '../hooks/usePromptManager';
import { filterPrompts, formatCount, formatUpdatedAt } from '../utils';
import type { SaveStatus } from '../types';

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  dirty: '有未保存修改',
  saving: '保存中…',
  saved: '已保存',
};

const INDENT = '    ';

/** 在编辑器里恢复光标/选区（React 受控更新后执行） */
function restoreSelection(el: HTMLTextAreaElement, start: number, end: number) {
  requestAnimationFrame(() => el.setSelectionRange(start, end));
}

export default function PromptManager() {
  const {
    prompts,
    activePrompt,
    loading,
    status,
    selectPrompt,
    updateActive,
    addPrompt,
    removePrompt,
    templates,
    saveAsTemplate,
    createFromTemplate,
    removeTemplate,
  } = usePromptManager();
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'prompts' | 'templates'>('prompts');
  const [templateSaved, setTemplateSaved] = useState(false);
  const gutterRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => filterPrompts(prompts, query), [prompts, query]);
  const lineCount = (activePrompt?.content ?? '').split('\n').length;

  const copyActive = async () => {
    if (!activePrompt?.content) return;
    await navigator.clipboard.writeText(activePrompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveAsTemplate = async () => {
    if (!activePrompt?.content) return;
    await saveAsTemplate();
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 1500);
  };

  const handleCreateFromTemplate = async (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setView('prompts');
    await createFromTemplate(template);
  };

  const deleteActive = () => {
    if (!activePrompt) return;
    if (window.confirm(`确定删除「${activePrompt.title}」？该操作不可撤销。`)) {
      removePrompt(activePrompt.id);
    }
  };

  /** Tab 键用于编辑缩进，不做焦点切换：Tab 增加缩进，Shift+Tab 减少缩进 */
  const handleEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { value, selectionStart: ss, selectionEnd: se } = el;
    const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
    const isBlock = ss !== se && value.slice(ss, se).includes('\n');

    if (e.shiftKey) {
      if (isBlock) {
        const block = value.slice(lineStart, se);
        const outdented = block.replace(/^ {1,4}/gm, '');
        updateActive({ content: value.slice(0, lineStart) + outdented + value.slice(se) });
        restoreSelection(el, lineStart, lineStart + outdented.length);
      } else {
        const lineEnd = value.indexOf('\n', ss) === -1 ? value.length : value.indexOf('\n', ss);
        const line = value.slice(lineStart, lineEnd);
        const trimmed = line.replace(/^ {1,4}/, '');
        if (trimmed.length === line.length) return;
        updateActive({ content: value.slice(0, lineStart) + trimmed + value.slice(lineEnd) });
        const cursor = Math.max(lineStart, ss - (line.length - trimmed.length));
        restoreSelection(el, cursor, cursor);
      }
    } else if (isBlock) {
      const block = value.slice(lineStart, se);
      const indented = block.replace(/^/gm, INDENT);
      updateActive({ content: value.slice(0, lineStart) + indented + value.slice(se) });
      restoreSelection(el, lineStart + INDENT.length, lineStart + indented.length);
    } else {
      updateActive({ content: value.slice(0, ss) + INDENT + value.slice(se) });
      restoreSelection(el, ss + INDENT.length, ss + INDENT.length);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 列表栏：Prompt 与模板分列表展示 */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
        <div className="px-3 pt-3">
          <div
            className="flex rounded-lg bg-zinc-200/70 p-0.5"
            role="tablist"
            aria-label="列表切换"
          >
            <button
              role="tab"
              aria-selected={view === 'prompts'}
              onClick={() => setView('prompts')}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                view === 'prompts'
                  ? 'bg-white text-teal-800 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Prompt {prompts.length}
            </button>
            <button
              role="tab"
              aria-selected={view === 'templates'}
              onClick={() => setView('templates')}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                view === 'templates'
                  ? 'bg-white text-teal-800 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <LayoutTemplate className="h-3 w-3" />
              模板 {templates.length}
            </button>
          </div>
        </div>

        {view === 'prompts' ? (
          <>
            <div className="flex items-center gap-2 px-3 pt-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索标题或正文"
                  className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-xs text-zinc-700 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <button
                onClick={addPrompt}
                title="新建 Prompt"
                className="rounded-md bg-teal-700 p-1.5 text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3 pt-1">
              {loading ? (
                <p className="px-2 py-4 text-xs text-zinc-400">加载中…</p>
              ) : visible.length === 0 ? (
                <EmptyList hasPrompts={prompts.length > 0} />
              ) : (
                <ul className="space-y-1">
                  {visible.map((item) => {
                    const active = item.id === activePrompt?.id;
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => selectPrompt(item.id)}
                          className={`w-full rounded-md px-2.5 py-2 text-left transition ${
                            active
                              ? 'bg-white shadow-sm ring-1 ring-teal-600'
                              : 'hover:bg-white hover:shadow-sm'
                          }`}
                        >
                          <span
                            className={`block truncate text-[13px] font-medium ${
                              active ? 'text-teal-900' : 'text-zinc-800'
                            }`}
                          >
                            {item.title || '未命名 Prompt'}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
                            {item.content ? item.content.split('\n')[0] : '（空）'}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-zinc-400">
                            {formatUpdatedAt(item.updatedAt)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3 pt-1">
            {templates.length === 0 ? (
              <div className="px-2 py-4 text-xs leading-5 text-zinc-400">
                还没有模板。
                <br />
                选中一条 Prompt
                后点编辑区下方的「存为模板」，它就会出现在这里，之后可一键基于它新建。
              </div>
            ) : (
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id} className="group relative">
                    <button
                      onClick={() => handleCreateFromTemplate(t.id)}
                      title="基于此模板新建 Prompt"
                      className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 pr-8 text-left transition hover:bg-white hover:shadow-sm"
                    >
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                        <LayoutTemplate className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-zinc-800">
                          {t.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
                          {t.content ? t.content.split('\n')[0] : '（空）'}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-zinc-400">
                          存于 {formatUpdatedAt(t.createdAt)}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`删除模板「${t.name}」？已创建的 Prompt 不受影响。`)) {
                          removeTemplate(t.id);
                        }
                      }}
                      title="删除模板"
                      className="absolute right-2 top-2 rounded p-1 text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>

      {/* 编辑区 */}
      <section className="flex min-w-0 flex-1 flex-col bg-white">
        {activePrompt ? (
          <>
            <div className="flex items-center gap-3 border-b border-zinc-100 px-5 pb-3 pt-4">
              <input
                value={activePrompt.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="Prompt 标题"
                className="min-w-0 flex-1 border-b border-transparent bg-transparent text-base font-semibold text-zinc-900 outline-none transition placeholder:text-zinc-300 hover:border-zinc-200 focus:border-teal-500"
              />
              <SaveStatusBadge status={status} />
            </div>

            <div className="flex items-center justify-between px-5 pt-2 text-[11px] text-zinc-400">
              <span className="font-mono">{formatCount(activePrompt.content)}</span>
              <span className="flex items-center gap-1">
                <PenLine className="h-3 w-3" />
                Tab 缩进 · 修改后自动保存
              </span>
            </div>

            <div className="flex min-h-0 flex-1">
              {/* 行号栏：随编辑器滚动同步 */}
              <div
                ref={gutterRef}
                aria-hidden
                className="w-11 shrink-0 select-none overflow-hidden border-r border-zinc-100 bg-zinc-50 py-3 text-right font-mono text-[12px] leading-7 text-zinc-300"
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className="pr-2">
                    {i + 1}
                  </div>
                ))}
              </div>
              <textarea
                value={activePrompt.content}
                onChange={(e) => updateActive({ content: e.target.value })}
                onKeyDown={handleEditorKeyDown}
                onScroll={(e: UIEvent<HTMLTextAreaElement>) => {
                  if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
                placeholder="在这里编写 Prompt，可以自由换行…"
                spellCheck={false}
                wrap="off"
                className="min-h-0 flex-1 resize-none whitespace-pre px-4 py-3 font-mono text-[13px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-300"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
              <button
                onClick={handleSaveAsTemplate}
                disabled={!activePrompt.content}
                title="把当前内容保存为模板，之后可基于它新建"
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  templateSaved
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-zinc-200 text-zinc-600 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-200 disabled:hover:bg-transparent disabled:hover:text-zinc-600'
                }`}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                {templateSaved ? '已存为模板' : '存为模板'}
              </button>
              <button
                onClick={deleteActive}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
              <button
                onClick={copyActive}
                className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs text-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  copied ? 'bg-teal-900' : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? '已复制' : '复制全文'}
              </button>
            </div>
          </>
        ) : (
          <EmptyEditor onAdd={addPrompt} />
        )}
      </section>
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span
      className={`flex shrink-0 items-center gap-1 text-[11px] ${
        status === 'saved'
          ? 'text-teal-700'
          : status === 'saving'
            ? 'text-zinc-400'
            : 'text-amber-600'
      }`}
      role="status"
    >
      {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'saved' && <Check className="h-3 w-3" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function EmptyList({ hasPrompts }: { hasPrompts: boolean }) {
  return (
    <p className="px-2 py-4 text-xs text-zinc-400">
      {hasPrompts ? '没有匹配的 Prompt' : '还没有保存的 Prompt'}
    </p>
  );
}

function EmptyEditor({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <button
        onClick={onAdd}
        className="group flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 px-12 py-10 text-zinc-400 transition hover:border-teal-500 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        <FileText className="h-8 w-8" />
        <span className="text-sm">新建一个 Prompt</span>
        <span className="max-w-56 text-center text-xs leading-5">
          编写常用的 Prompt 并自动保存，随时回来修改或一键复制
        </span>
      </button>
    </div>
  );
}
