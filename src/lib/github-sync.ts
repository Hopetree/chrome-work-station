import { storage } from 'wxt/storage';
import type { BackupFile } from './backup';

/**
 * 用 GitHub 私有仓库当云端存储：一份 JSON 快照对应仓库里的一个文件。
 * 只依赖 api.github.com 一个域名（gist.github.com 在部分网络下不可达）。
 * 每次上传都是一个 commit，因此云端天然保留历史版本。
 */

const CONFIG_KEY = 'local:settings:sync:github';
const API_BASE = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 20_000;
/** Contents API 只对小于 1MB 的文件内联返回 base64 内容 */
const INLINE_CONTENT_LIMIT = 1_000_000;

export interface GitHubSyncConfig {
  /** owner/repo */
  repo: string;
  /** 仓库内的文件路径 */
  path: string;
  token: string;
  /** 编辑落盘后是否自动上传 */
  autoPush: boolean;
  /** 自动上传的静默间隔（分钟）：编辑停止这么久之后才上传 */
  autoPushDelayMinutes: number;
  /** 上次上传成功的时间戳；用于判断本地是否还有未上传的改动 */
  lastPushedAt: number | null;
}

export const DEFAULT_SYNC_CONFIG: GitHubSyncConfig = {
  repo: '',
  path: 'data/chrome-work-station.json',
  token: '',
  autoPush: false,
  autoPushDelayMinutes: 5,
  lastPushedAt: null,
};

export const MIN_AUTO_PUSH_DELAY_MINUTES = 1;
export const MAX_AUTO_PUSH_DELAY_MINUTES = 120;

/** 间隔只接受范围内的整数分钟，其余（缺失、字符串、NaN、超范围）一律回落到默认值 */
export function normalizeAutoPushDelay(value: unknown): number {
  const fallback = DEFAULT_SYNC_CONFIG.autoPushDelayMinutes;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(
    MAX_AUTO_PUSH_DELAY_MINUTES,
    Math.max(MIN_AUTO_PUSH_DELAY_MINUTES, Math.round(value)),
  );
}

export class GitHubSyncError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GitHubSyncError';
    this.status = status;
  }
}

/** 把 HTTP 状态码翻译成用户能照着修的中文提示 */
function messageForStatus(status: number): string {
  switch (status) {
    case 401:
      return '访问令牌无效或已过期，请重新生成 Token';
    case 403:
      return '令牌权限不足或已触发 GitHub 限流：请确认 Token 对该仓库有 Contents 读写权限';
    case 404:
      return '找不到仓库或文件：请确认仓库名正确，且 Token 已授权该仓库';
    case 409:
      return '云端文件刚被其它设备修改，请重试';
    case 422:
      return '请求被 GitHub 拒绝：仓库名、分支或文件路径不合法';
    default:
      return `GitHub 接口返回 HTTP ${status}`;
  }
}

/**
 * 归一化仓库输入：支持 `owner/repo`、仓库网页地址、SSH 地址。
 * 无法识别时返回 null，由调用方提示用户。
 */
export function parseRepoInput(input: string): string | null {
  const trimmed = input
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/github\.com[/:]([^/\s]+)\/([^/\s]+)$/i);
  const candidate = fromUrl ? `${fromUrl[1]}/${fromUrl[2]}` : trimmed;
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(candidate) ? candidate : null;
}

/** btoa 只接受 Latin-1，含中文的内容必须先转成字节再编码 */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function apiHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function request(url: string, init: RequestInit = {}): Promise<Response> {
  // 超时兜底，避免网络卡住时设置页一直转圈
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/** 仓库 + 文件路径的必填校验，集中在发请求之前 */
function requireTarget(config: GitHubSyncConfig): { repo: string; path: string } {
  const repo = parseRepoInput(config.repo);
  if (!repo) {
    throw new GitHubSyncError('仓库格式应为 owner/repo（也可以直接粘贴仓库地址）');
  }
  const path = config.path.trim().replace(/^\/+/, '');
  if (!path) throw new GitHubSyncError('请填写云端文件路径');
  return { repo, path };
}

export async function loadSyncConfig(): Promise<GitHubSyncConfig> {
  const stored = await storage.getItem<Partial<GitHubSyncConfig>>(CONFIG_KEY);
  const merged = { ...DEFAULT_SYNC_CONFIG, ...(stored ?? {}) };
  return { ...merged, autoPushDelayMinutes: normalizeAutoPushDelay(merged.autoPushDelayMinutes) };
}

export async function saveSyncConfig(patch: Partial<GitHubSyncConfig>): Promise<GitHubSyncConfig> {
  const next = { ...(await loadSyncConfig()), ...patch };
  if (patch.autoPushDelayMinutes !== undefined) {
    next.autoPushDelayMinutes = normalizeAutoPushDelay(patch.autoPushDelayMinutes);
  }
  await storage.setItem(CONFIG_KEY, next);
  return next;
}

/** 仓库、令牌都填了才认为是可用配置 */
export function isConfigured(config: GitHubSyncConfig): boolean {
  return Boolean(parseRepoInput(config.repo) && config.token.trim());
}

export interface RemoteFile {
  sha: string;
  text: string;
}

/** 读取云端文件；文件不存在（404）返回 null，真正出错抛异常 */
async function fetchRemoteFile(
  config: GitHubSyncConfig,
  repo: string,
  path: string,
): Promise<RemoteFile | null> {
  const response = await request(`${API_BASE}/repos/${repo}/contents/${encodeURI(path)}`, {
    headers: apiHeaders(config.token),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new GitHubSyncError(messageForStatus(response.status), response.status);

  const data = (await response.json()) as { sha?: string; content?: string; size?: number };
  if (typeof data.sha !== 'string') {
    throw new GitHubSyncError('云端返回的数据缺少 sha 字段，无法继续');
  }
  if (typeof data.content !== 'string') {
    throw new GitHubSyncError(
      `云端文件超过 ${INLINE_CONTENT_LIMIT / 1_000_000}MB，无法通过 Contents API 读取，请改用更小的文件`,
    );
  }
  return { sha: data.sha, text: decodeBase64Utf8(data.content) };
}

export interface PushResult {
  /** 云端原本没有这个文件时表示新建 */
  created: boolean;
  sha: string;
  bytes: number;
}

/** 用本地快照覆盖云端文件；云端原有的历史版本仍可在仓库提交记录里找回 */
export async function pushSnapshot(
  config: GitHubSyncConfig,
  snapshot: BackupFile,
): Promise<PushResult> {
  const { repo, path } = requireTarget(config);
  const serialized = JSON.stringify(snapshot, null, 2);
  const bytes = new TextEncoder().encode(serialized).length;
  const message = `chore(sync): 更新快照（${snapshot.prompts.length} 条 Prompt、${snapshot.templates.length} 个模板）`;

  // 更新已存在的文件必须带上当前 sha；用它也能顺带区分「新建」和「更新」
  let existing = await fetchRemoteFile(config, repo, path);
  for (let attempt = 0; ; attempt += 1) {
    const response = await request(`${API_BASE}/repos/${repo}/contents/${encodeURI(path)}`, {
      method: 'PUT',
      headers: { ...apiHeaders(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: encodeBase64Utf8(serialized),
        ...(existing ? { sha: existing.sha } : {}),
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as { content?: { sha?: string } };
      return {
        created: !existing,
        sha: data.content?.sha ?? existing?.sha ?? '',
        bytes,
      };
    }
    // 409 表示取 sha 之后云端被改动过：重新取一次 sha 再试，仅重试一次
    if (response.status === 409 && attempt === 0) {
      existing = await fetchRemoteFile(config, repo, path);
      continue;
    }
    throw new GitHubSyncError(messageForStatus(response.status), response.status);
  }
}

export interface PullResult {
  snapshot: BackupFile;
  sha: string;
}

/** 读取云端快照；云端还没有文件时返回 null */
export async function pullSnapshot(config: GitHubSyncConfig): Promise<BackupFile | null> {
  const { repo, path } = requireTarget(config);
  const remote = await fetchRemoteFile(config, repo, path);
  if (!remote) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(remote.text);
  } catch {
    throw new GitHubSyncError('云端文件不是合法的 JSON，可能已被手动改坏');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new GitHubSyncError('云端文件内容不是一份数据快照');
  }
  return parsed as BackupFile;
}

export interface ConnectionResult {
  repo: string;
  visibility: '私有' | '公开';
  fileExists: boolean;
}

/** 校验令牌与仓库是否可用（写入权限要等真正上传时才能确认） */
export async function testConnection(config: GitHubSyncConfig): Promise<ConnectionResult> {
  const { repo, path } = requireTarget(config);
  if (!config.token.trim()) throw new GitHubSyncError('请先填写访问令牌');

  const response = await request(`${API_BASE}/repos/${repo}`, {
    headers: apiHeaders(config.token),
  });
  if (!response.ok) throw new GitHubSyncError(messageForStatus(response.status), response.status);

  const data = (await response.json()) as { full_name?: string; private?: boolean };
  const remote = await fetchRemoteFile(config, repo, path);
  return {
    repo: data.full_name ?? repo,
    visibility: data.private ? '私有' : '公开',
    fileExists: remote !== null,
  };
}
