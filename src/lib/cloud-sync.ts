import {
  loadFolders,
  loadPrompts,
  loadTemplates,
  saveFolders,
  savePrompts,
  saveTemplates,
} from '@/features/prompt-manager/storage';
import type { FolderItem, PromptItem, TemplateItem } from '@/features/prompt-manager/types';
import { buildBackup, mergeBackup, type BackupFile, type MergeResult } from './backup';
import {
  GitHubSyncError,
  isConfigured,
  loadSyncConfig,
  normalizeAutoPushDelay,
  pullSnapshot,
  pushSnapshot,
  saveSyncConfig,
} from './github-sync';

/**
 * 云端同步的编排层：把 Prompt 模块的存储读写和 GitHub 传输层接起来。
 * 传输层（github-sync）不认识业务数据，这里负责快照的采集与落盘。
 */

/**
 * 启动时补传的延迟，给页面加载留出余量。
 * 固定 10 秒、不跟随配置的间隔：这里推的是上次会话遗留的改动，不是一次连续编辑，
 * 没必要再等用户设置的分钟数。
 */
const STARTUP_PUSH_DELAY_MS = 10 * 1000;

/** 配置里的间隔（分钟）→ 防抖毫秒；非法值回落到默认 5 分钟 */
export function autoPushDelayMs(minutes: unknown): number {
  return normalizeAutoPushDelay(minutes) * 60_000;
}

export async function collectSnapshot(): Promise<BackupFile> {
  const [prompts, templates, folders] = await Promise.all([
    loadPrompts(),
    loadTemplates(),
    loadFolders(),
  ]);
  return buildBackup(prompts, templates, folders);
}

/**
 * 把云端快照合并进本地并落盘。
 * 合并语义与「导入数据」一致：按 id 对齐、时间戳新者胜；本地唯一有、云端没有的条目不受影响。
 */
export async function applySnapshot(incoming: unknown): Promise<MergeResult> {
  const [prompts, templates, folders] = await Promise.all([
    loadPrompts(),
    loadTemplates(),
    loadFolders(),
  ]);
  const result = mergeBackup(prompts, templates, folders, incoming);
  await Promise.all([
    savePrompts(result.prompts),
    saveTemplates(result.templates),
    saveFolders(result.folders),
  ]);
  return result;
}

/** 本地数据里最新的修改时间，用来判断是否还有没上传的改动 */
export function newestStamp(
  prompts: PromptItem[],
  templates: TemplateItem[],
  folders: FolderItem[],
): number {
  let newest = 0;
  for (const item of [...prompts, ...templates, ...folders]) {
    const stamp = item.updatedAt ?? item.createdAt;
    if (stamp > newest) newest = stamp;
  }
  return newest;
}

export interface UploadSummary {
  created: boolean;
  prompts: number;
  templates: number;
  bytes: number;
}

/** 立即上传：用本地数据覆盖云端快照 */
export async function uploadToCloud(): Promise<UploadSummary> {
  const config = await loadSyncConfig();
  if (!isConfigured(config)) throw new GitHubSyncError('请先填写仓库与访问令牌');
  const snapshot = await collectSnapshot();
  const result = await pushSnapshot(config, snapshot);
  await saveSyncConfig({ lastPushedAt: Date.now() });
  return {
    created: result.created,
    prompts: snapshot.prompts.length,
    templates: snapshot.templates.length,
    bytes: result.bytes,
  };
}

/** 立即恢复：把云端快照合并到本地；云端还没有文件时返回 null */
export async function restoreFromCloud(): Promise<MergeResult | null> {
  const config = await loadSyncConfig();
  if (!isConfigured(config)) throw new GitHubSyncError('请先填写仓库与访问令牌');
  const snapshot = await pullSnapshot(config);
  if (!snapshot) return null;
  return applySnapshot(snapshot);
}

let autoPushTimer: ReturnType<typeof setTimeout> | null = null;
/** 读取配置是异步的，用它保证只有最后一次调度能真正起定时器 */
let scheduleSeq = 0;

/**
 * 数据落盘后安排一次延迟上传；连续编辑只会合并成最后一次。
 * 间隔从配置里读（设置页可调 1–120 分钟），传了 delayMs 则以传入值为准。
 */
export async function scheduleAutoPush(delayMs?: number): Promise<void> {
  scheduleSeq += 1;
  const seq = scheduleSeq;
  if (autoPushTimer) clearTimeout(autoPushTimer);
  let delay = delayMs;
  if (delay === undefined) {
    const config = await loadSyncConfig();
    if (seq !== scheduleSeq) return;
    delay = autoPushDelayMs(config.autoPushDelayMinutes);
  }
  autoPushTimer = setTimeout(() => {
    autoPushTimer = null;
    void runAutoPush();
  }, delay);
}

async function runAutoPush(): Promise<void> {
  try {
    const config = await loadSyncConfig();
    if (!config.autoPush || !isConfigured(config)) return;
    const snapshot = await collectSnapshot();
    await pushSnapshot(config, snapshot);
    await saveSyncConfig({ lastPushedAt: Date.now() });
  } catch (error) {
    // 不上报给 UI：自动上传失败时不打断编辑，下次落盘或下次启动会再次尝试
    console.warn('[cloud-sync] 自动上传失败，稍后重试', error);
  }
}

/**
 * 启动时的补传检查：上次上传之后本地又改过（比如关侧边栏前刚编辑完），
 * 此时自动上传的定时器已经被丢弃，需要在这里补上。
 */
export async function initAutoPush(): Promise<void> {
  try {
    const config = await loadSyncConfig();
    if (!config.autoPush || !isConfigured(config)) return;
    const [prompts, templates, folders] = await Promise.all([
      loadPrompts(),
      loadTemplates(),
      loadFolders(),
    ]);
    if (newestStamp(prompts, templates, folders) > (config.lastPushedAt ?? 0)) {
      scheduleAutoPush(STARTUP_PUSH_DELAY_MS);
    }
  } catch (error) {
    console.warn('[cloud-sync] 检查待上传改动失败', error);
  }
}
