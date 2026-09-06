import { useEffect, useRef, useState } from 'react';
import { Check, Download, Loader2, Upload } from 'lucide-react';
import {
  loadPrompts,
  loadTemplates,
  savePrompts,
  saveTemplates,
} from '@/features/prompt-manager/storage';
import { visibleFeatures } from '@/features/registry';
import { buildBackup, mergeBackup } from '@/lib/backup';
import Select from '@/components/ui/Select';
import { getDefaultFeatureId, setDefaultFeatureId } from '@/lib/settings';

type Feedback = { kind: 'ok' | 'error'; text: string } | null;

export default function OptionsApp() {
  const [defaultId, setDefaultId] = useState('');
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDefaultFeatureId().then((id) => setDefaultId(id ?? visibleFeatures[0]?.id ?? ''));
  }, []);

  const changeDefault = async (id: string) => {
    setDefaultId(id);
    await setDefaultFeatureId(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExport = async () => {
    const [prompts, templates] = await Promise.all([loadPrompts(), loadTemplates()]);
    const backup = buildBackup(prompts, templates);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chrome-work-station-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback({
      kind: 'ok',
      text: `已导出 ${prompts.length} 条 Prompt、${templates.length} 个模板`,
    });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setFeedback(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const [prompts, templates] = await Promise.all([loadPrompts(), loadTemplates()]);
      const result = mergeBackup(prompts, templates, parsed);
      await Promise.all([savePrompts(result.prompts), saveTemplates(result.templates)]);
      setFeedback({
        kind: 'ok',
        text: `导入完成：新增 ${result.added} 条，更新 ${result.updated} 条`,
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : '导入失败，请检查文件格式',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-6 py-10 text-zinc-800">
      <header className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-500/90 font-mono text-sm font-bold text-zinc-900">
          站
        </div>
        <div>
          <h1 className="text-base font-semibold text-zinc-900">设置</h1>
          <p className="text-xs text-zinc-500">
            Chrome 工作站 · v{browser.runtime.getManifest().version}
          </p>
        </div>
      </header>

      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <span id="default-feature-label" className="block text-[13px] font-medium">
          点击「打开工作台」时默认进入
        </span>
        <p className="mt-1 text-xs text-zinc-500">
          在 popup 中点工具卡片始终直达对应功能，不受此项影响。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Select
            ariaLabel="点击「打开工作台」时默认进入"
            value={defaultId}
            options={visibleFeatures.map((feature) => ({ value: feature.id, label: feature.name }))}
            onChange={changeDefault}
            className="w-44"
          />
          {saved && (
            <span className="flex items-center gap-1 text-xs text-teal-700" role="status">
              <Check className="h-3 w-3" />
              已保存
            </span>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-[13px] font-medium">数据备份</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          导出全部 Prompt 与模板为 JSON 文件；导入时按条目合并，两边都有时保留修改时间较新的一份。
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 transition hover:border-teal-600 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <Download className="h-3.5 w-3.5" />
            导出数据
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 transition hover:border-teal-600 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-wait disabled:opacity-60"
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {importing ? '导入中…' : '导入数据'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
        </div>
        {feedback && (
          <p
            role="status"
            className={`mt-3 text-xs ${feedback.kind === 'ok' ? 'text-teal-700' : 'text-red-600'}`}
          >
            {feedback.text}
          </p>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-[13px] font-medium">关于数据存储</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          所有数据（Prompt、模板、配置）仅保存在浏览器本地的扩展存储中，不会上传到任何服务器。清除浏览器数据会一并删除这些内容，重要数据请定期导出备份。
        </p>
      </section>
    </div>
  );
}
