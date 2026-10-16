import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CloudDownload,
  CloudUpload,
  Download,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Upload,
} from 'lucide-react';
import { visibleFeatures } from '@/features/registry';
import { applySnapshot, collectSnapshot, restoreFromCloud, uploadToCloud } from '@/lib/cloud-sync';
import {
  DEFAULT_SYNC_CONFIG,
  MAX_AUTO_PUSH_DELAY_MINUTES,
  MIN_AUTO_PUSH_DELAY_MINUTES,
  loadSyncConfig,
  normalizeAutoPushDelay,
  parseRepoInput,
  saveSyncConfig,
  testConnection,
  type GitHubSyncConfig,
} from '@/lib/github-sync';
import Checkbox from '@/components/ui/Checkbox';
import Select from '@/components/ui/Select';
import { getDefaultFeatureId, setDefaultFeatureId } from '@/lib/settings';

type Feedback = { kind: 'ok' | 'error'; text: string } | null;
type SyncBusy = 'test' | 'push' | 'pull' | null;

const INPUT_CLASS =
  'w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-800 transition placeholder:text-zinc-400 focus-visible:border-teal-600 focus-visible:outline-none';
const BUTTON_CLASS =
  'flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 transition hover:border-teal-600 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-wait disabled:opacity-60';

/** 网络类异常在浏览器里只有英文原文，这里换成能照着排查的中文提示 */
function describeSyncError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError') return '连接 GitHub 超时，请检查网络后重试';
  if (name === 'TypeError') return '无法连接 GitHub，请检查网络或代理设置';
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTime(stamp: number): string {
  return new Date(stamp).toLocaleString('zh-CN', { hour12: false });
}

export default function OptionsApp() {
  const [defaultId, setDefaultId] = useState('');
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [syncRepo, setSyncRepo] = useState('');
  const [syncPath, setSyncPath] = useState(DEFAULT_SYNC_CONFIG.path);
  const [syncToken, setSyncToken] = useState('');
  const [autoPush, setAutoPush] = useState(false);
  const [syncDelayText, setSyncDelayText] = useState(
    String(DEFAULT_SYNC_CONFIG.autoPushDelayMinutes),
  );
  const [lastPushedAt, setLastPushedAt] = useState<number | null>(null);
  const [revealToken, setRevealToken] = useState(false);
  const [syncBusy, setSyncBusy] = useState<SyncBusy>(null);
  const [syncFeedback, setSyncFeedback] = useState<Feedback>(null);

  useEffect(() => {
    getDefaultFeatureId().then((id) => setDefaultId(id ?? visibleFeatures[0]?.id ?? ''));
    void loadSyncConfig().then((config) => {
      setSyncRepo(config.repo);
      setSyncPath(config.path);
      setSyncToken(config.token);
      setAutoPush(config.autoPush);
      setSyncDelayText(String(config.autoPushDelayMinutes));
      setLastPushedAt(config.lastPushedAt);
    });
  }, []);

  // 输入即落盘：三个文本框都不需要额外的「保存」动作
  const updateSync = (patch: Partial<GitHubSyncConfig>) => {
    void saveSyncConfig(patch);
  };

  const showSync = (kind: 'ok' | 'error', text: string) => {
    setSyncFeedback({ kind, text });
    setTimeout(() => setSyncFeedback(null), kind === 'ok' ? 6000 : 12000);
  };

  const changeDefault = async (id: string) => {
    setDefaultId(id);
    await setDefaultFeatureId(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExport = async () => {
    const snapshot = await collectSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chrome-work-station-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback({
      kind: 'ok',
      text: `已导出 ${snapshot.prompts.length} 条 Prompt、${snapshot.templates.length} 个模板`,
    });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setFeedback(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = await applySnapshot(parsed);
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

  const handleTest = async () => {
    setSyncBusy('test');
    setSyncFeedback(null);
    try {
      const result = await testConnection(await loadSyncConfig());
      showSync(
        'ok',
        `连接成功：${result.repo}（${result.visibility}仓库）${
          result.fileExists ? '，云端已有备份文件' : '，云端还没有备份文件'
        }`,
      );
    } catch (error) {
      showSync('error', describeSyncError(error));
    } finally {
      setSyncBusy(null);
    }
  };

  const handlePush = async () => {
    setSyncBusy('push');
    setSyncFeedback(null);
    try {
      const result = await uploadToCloud();
      setLastPushedAt(Date.now());
      showSync(
        'ok',
        `${result.created ? '已创建' : '已更新'}云端备份：${result.prompts} 条 Prompt、${
          result.templates
        } 个模板（${formatBytes(result.bytes)}）`,
      );
    } catch (error) {
      showSync('error', describeSyncError(error));
    } finally {
      setSyncBusy(null);
    }
  };

  const handlePull = async () => {
    setSyncBusy('pull');
    setSyncFeedback(null);
    try {
      const result = await restoreFromCloud();
      if (!result) {
        showSync('error', '云端还没有备份文件，请先点「立即上传」');
        return;
      }
      showSync(
        'ok',
        `已合并云端备份：新增 ${result.added} 条，更新 ${result.updated} 条。请重新打开侧边栏或工作台查看结果`,
      );
    } catch (error) {
      showSync('error', describeSyncError(error));
    } finally {
      setSyncBusy(null);
    }
  };

  const repoInvalid = syncRepo.trim().length > 0 && !parseRepoInput(syncRepo);

  // 输入过程中允许空串/半截数字，界面上始终展示真正会生效的间隔
  const parsedDelay = Number.parseInt(syncDelayText, 10);
  const effectiveDelay = normalizeAutoPushDelay(parsedDelay);
  const delayOutOfRange =
    syncDelayText.trim() !== '' &&
    (!Number.isFinite(parsedDelay) || parsedDelay !== effectiveDelay);

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
          <button onClick={handleExport} className={BUTTON_CLASS}>
            <Download className="h-3.5 w-3.5" />
            导出数据
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className={BUTTON_CLASS}
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
        <h2 className="text-[13px] font-medium">云端同步（GitHub）</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          把全部 Prompt、模板与目录备份到你自己建的 GitHub{' '}
          <span className="font-medium text-zinc-700">私有仓库</span>
          。每次上传都是一次 commit，云端保留完整历史版本，误删可从仓库提交记录里找回。
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="sync-repo" className="block text-[13px] font-medium">
              仓库
            </label>
            <input
              id="sync-repo"
              value={syncRepo}
              placeholder="你的用户名/仓库名"
              onChange={(e) => {
                setSyncRepo(e.target.value);
                updateSync({ repo: e.target.value });
              }}
              className={`mt-1.5 ${INPUT_CLASS} ${repoInvalid ? 'border-red-300' : ''}`}
            />
            {repoInvalid ? (
              <p className="mt-1 text-xs text-red-600">
                格式应为 owner/repo，也可以直接粘贴仓库地址
              </p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                填一个专门放数据的私有仓库（例如 <code>你的用户名/cws-data</code>
                ），不要用代码仓库，避免每次同步都在项目历史里留提交。
              </p>
            )}
          </div>

          <div>
            <label htmlFor="sync-path" className="block text-[13px] font-medium">
              文件路径
            </label>
            <input
              id="sync-path"
              value={syncPath}
              placeholder={DEFAULT_SYNC_CONFIG.path}
              onChange={(e) => {
                setSyncPath(e.target.value);
                updateSync({ path: e.target.value });
              }}
              className={`mt-1.5 ${INPUT_CLASS}`}
            />
            <p className="mt-1 text-xs text-zinc-500">仓库内的存放位置，目录不存在会自动创建。</p>
          </div>

          <div>
            <label htmlFor="sync-token" className="block text-[13px] font-medium">
              访问令牌
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="sync-token"
                type={revealToken ? 'text' : 'password'}
                value={syncToken}
                placeholder="github_pat_..."
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setSyncToken(e.target.value);
                  updateSync({ token: e.target.value });
                }}
                className={`${INPUT_CLASS} font-mono`}
              />
              <button
                type="button"
                onClick={() => setRevealToken((prev) => !prev)}
                aria-label={revealToken ? '隐藏令牌' : '显示令牌'}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-teal-600 hover:text-teal-700"
              >
                {revealToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              到 GitHub{' '}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
                className="text-teal-700 underline decoration-dotted hover:decoration-solid"
              >
                新建一个 Fine-grained token
              </a>
              ，仓库访问范围选「Only select repositories」只勾这一个仓库，权限只给{' '}
              <code>Contents: Read and write</code>。令牌保存在浏览器本地扩展存储中，随时可到 GitHub
              撤销。
            </p>
          </div>

          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="sync-auto"
              checked={autoPush}
              ariaLabel="自动上传"
              onCheckedChange={(checked) => {
                setAutoPush(checked);
                updateSync({ autoPush: checked });
              }}
            />
            <div className="min-w-0 flex-1">
              <label htmlFor="sync-auto" className="cursor-pointer text-xs leading-4 text-zinc-700">
                自动上传
              </label>
              <p className="mt-0.5 text-xs leading-4 text-zinc-500">
                {/* 用模板字符串固定数字两侧的空格，JSX 换行会吃掉表达式相邻的空白 */}
                {`编辑停止 ${effectiveDelay} 分钟后自动上传一次，长时间连续编辑只产生一个版本。仅在侧边栏或工作台打开时运行；关闭前没来得及上传的改动，会在下次打开时补传。`}
              </p>
              {autoPush && (
                <div className="mt-2 flex items-center gap-2">
                  <label htmlFor="sync-delay" className="shrink-0 text-xs text-zinc-600">
                    上传间隔
                  </label>
                  <input
                    id="sync-delay"
                    type="text"
                    inputMode="numeric"
                    value={syncDelayText}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setSyncDelayText(raw);
                      // 只在能解析成正整数时落盘，非法输入由 normalize 归一化
                      if (/^\d+$/.test(raw)) {
                        updateSync({ autoPushDelayMinutes: Number(raw) });
                      }
                    }}
                    className={`w-16 rounded-md border px-2 py-1 text-xs text-zinc-800 transition focus-visible:border-teal-600 focus-visible:outline-none ${
                      delayOutOfRange ? 'border-red-300' : 'border-zinc-200'
                    }`}
                  />
                  <span className="text-xs text-zinc-500">
                    分钟（可填 {MIN_AUTO_PUSH_DELAY_MINUTES}–{MAX_AUTO_PUSH_DELAY_MINUTES}）
                    {delayOutOfRange && `，当前按 ${effectiveDelay} 分钟执行`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={handleTest} disabled={syncBusy !== null} className={BUTTON_CLASS}>
            {syncBusy === 'test' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            测试连接
          </button>
          <button onClick={handlePush} disabled={syncBusy !== null} className={BUTTON_CLASS}>
            {syncBusy === 'push' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CloudUpload className="h-3.5 w-3.5" />
            )}
            立即上传
          </button>
          <button onClick={handlePull} disabled={syncBusy !== null} className={BUTTON_CLASS}>
            {syncBusy === 'pull' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CloudDownload className="h-3.5 w-3.5" />
            )}
            从云端恢复
          </button>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          {lastPushedAt ? `上次上传：${formatTime(lastPushedAt)}` : '还没有上传过'}
        </p>

        {syncFeedback && (
          <p
            role="status"
            className={`mt-2 text-xs leading-5 ${
              syncFeedback.kind === 'ok' ? 'text-teal-700' : 'text-red-600'
            }`}
          >
            {syncFeedback.text}
          </p>
        )}

        <p className="mt-3 border-t border-zinc-100 pt-3 text-xs leading-5 text-zinc-500">
          「立即上传」会用本地数据覆盖云端文件，云端原有的版本仍留在仓库提交记录里。「从云端恢复」按条目合并，两边都有时保留修改时间较新的一份，
          <span className="font-medium text-zinc-700">
            本地已删除而云端还存在的条目会被恢复回来
          </span>
          ；需要连删除一起同步时，请改用导出备份手动处理。
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-[13px] font-medium">关于数据存储</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          默认情况下所有数据（Prompt、模板、配置）只保存在浏览器本地的扩展存储中，不会上传到任何服务器。只有你在上方「云端同步」里配置了仓库与令牌并执行上传（或勾选自动上传）后，数据才会发送到你自己指定的
          GitHub
          仓库，本扩展不经过任何第三方服务器。清除浏览器数据会一并删除本地内容，重要数据请确认云端已有备份。
        </p>
      </section>
    </div>
  );
}
