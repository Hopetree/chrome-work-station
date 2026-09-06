import { useMemo, useState } from 'react';
import { Check, Copy, FileText, Loader2, PenLine, Plus, Search, Trash2 } from 'lucide-react';
import { usePromptManager } from '../hooks/usePromptManager';
import { filterPrompts, formatCount, formatUpdatedAt } from '../utils';
import type { SaveStatus } from '../types';

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  dirty: '有未保存修改',
  saving: '保存中…',
  saved: '已保存',
};

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
  } = usePromptManager();
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const visible = useMemo(() => filterPrompts(prompts, query), [prompts, query]);

  const copyActive = async () => {
    if (!activePrompt?.content) return;
    await navigator.clipboard.writeText(activePrompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const deleteActive = () => {
    if (!activePrompt) return;
    if (window.confirm(`确定删除「${activePrompt.title}」？该操作不可撤销。`)) {
      removePrompt(activePrompt.id);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 列表栏 */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
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

        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
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
                支持换行，修改后自动保存
              </span>
            </div>

            <textarea
              value={activePrompt.content}
              onChange={(e) => updateActive({ content: e.target.value })}
              placeholder="在这里编写 Prompt，可以自由换行…"
              spellCheck={false}
              className="mt-2 min-h-0 flex-1 resize-none bg-[linear-gradient(transparent_calc(100%_-_1px),theme(colors.zinc.100)_1px)] bg-[size:100%_1.75rem] px-5 font-mono text-[13px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-300"
            />

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
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
