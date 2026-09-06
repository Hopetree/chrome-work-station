import { useEffect, useMemo } from 'react';
import { Copy, FileText, X } from 'lucide-react';
import { extractVariables, fillVariables } from '../utils';

/**
 * 复制对话框：内容含 {{变量}} 时先填空再复制；
 * 也保留「复制原文」。变量填写值跨打开保留（由父组件持有）。
 */
export default function CopyDialog({
  content,
  values,
  onValuesChange,
  onCopy,
  onClose,
}: {
  content: string;
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  onCopy: (filled: string) => void;
  onClose: () => void;
}) {
  const variables = useMemo(() => extractVariables(content), [content]);
  const filled = useMemo(() => fillVariables(content, values), [content, values]);
  const hasVariables = variables.length > 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="复制 Prompt"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">复制 Prompt</h2>
          <button
            onClick={onClose}
            title="关闭"
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasVariables ? (
          <>
            <p className="mt-1 text-xs text-zinc-500">这个 Prompt 包含变量，填写后复制填充结果。</p>
            <div className="mt-4 space-y-3">
              {variables.map((name) => (
                <label key={name} className="block">
                  <span className="mb-1 block font-mono text-[11px] text-zinc-500">{`{{ ${name} }}`}</span>
                  <input
                    value={values[name] ?? ''}
                    onChange={(e) => onValuesChange({ ...values, [name]: e.target.value })}
                    placeholder={`填写 ${name}`}
                    autoFocus
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[13px] text-zinc-800 outline-none transition placeholder:text-zinc-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
            <FileText className="h-3.5 w-3.5" />该 Prompt 没有变量，直接复制全文。
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          {hasVariables && (
            <button
              onClick={() => onCopy(content)}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              复制原文
            </button>
          )}
          <button
            onClick={() => onCopy(hasVariables ? filled : content)}
            autoFocus={!hasVariables}
            className="flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-1.5 text-xs text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <Copy className="h-3.5 w-3.5" />
            {hasVariables ? '复制填充结果' : '复制全文'}
          </button>
        </div>
      </div>
    </div>
  );
}
