import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('wxt/storage', () => ({
  storage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import { storage } from 'wxt/storage';
import type { FolderItem, PromptItem, TemplateItem } from '@/features/prompt-manager/types';
import { buildBackup } from './backup';
import {
  DEFAULT_SYNC_CONFIG,
  MAX_AUTO_PUSH_DELAY_MINUTES,
  MIN_AUTO_PUSH_DELAY_MINUTES,
  decodeBase64Utf8,
  encodeBase64Utf8,
  isConfigured,
  loadSyncConfig,
  normalizeAutoPushDelay,
  parseRepoInput,
  pullSnapshot,
  pushSnapshot,
  saveSyncConfig,
  testConnection,
  type GitHubSyncConfig,
} from './github-sync';

const prompt: PromptItem = {
  id: 'p1',
  title: '接口排查',
  content: '第一步：确认网关\n第二步：看日志 {{traceId}}',
  createdAt: 1,
  updatedAt: 2,
};
const template: TemplateItem = { id: 't1', name: '模板', content: '内容', createdAt: 3 };
const folder: FolderItem = { id: 'f1', name: '日常', createdAt: 4 };

const snapshot = buildBackup([prompt], [template], [folder]);

const config = (over: Partial<GitHubSyncConfig> = {}): GitHubSyncConfig => ({
  ...DEFAULT_SYNC_CONFIG,
  repo: 'hopetree/cws-data',
  token: 'github_pat_test',
  ...over,
});

/** 只实现被测代码真正用到的字段，避免依赖运行环境的 Response 实现 */
function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function remoteFile(text: string, sha = 'sha-1'): Response {
  return reply(200, { sha, encoding: 'base64', content: encodeBase64Utf8(text) });
}

const mockFetch = vi.fn();

function installed() {
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
  vi.mocked(storage.getItem).mockReset();
  vi.mocked(storage.setItem).mockReset();
});

describe('parseRepoInput', () => {
  it('接受 owner/repo 形式', () => {
    expect(parseRepoInput('hopetree/chrome-work-station-data')).toBe(
      'hopetree/chrome-work-station-data',
    );
  });

  it('接受仓库网页地址、SSH 地址与尾部 .git', () => {
    expect(parseRepoInput('https://github.com/hopetree/data')).toBe('hopetree/data');
    expect(parseRepoInput('https://github.com/hopetree/data/')).toBe('hopetree/data');
    expect(parseRepoInput('git@github.com:hopetree/data.git')).toBe('hopetree/data');
  });

  it('去掉首尾空白', () => {
    expect(parseRepoInput('  hopetree/data  ')).toBe('hopetree/data');
  });

  it('无法识别时返回 null', () => {
    expect(parseRepoInput('')).toBeNull();
    expect(parseRepoInput('   ')).toBeNull();
    expect(parseRepoInput('只有一段')).toBeNull();
    expect(parseRepoInput('a/b/c')).toBeNull();
  });
});

describe('base64 编解码', () => {
  it('中文、emoji 与换行都能原样往返', () => {
    const text = '中文内容\n第二行\t制表符 🎉 done';
    expect(decodeBase64Utf8(encodeBase64Utf8(text))).toBe(text);
  });

  it('空字符串正常往返', () => {
    expect(decodeBase64Utf8(encodeBase64Utf8(''))).toBe('');
  });

  it('能解开 GitHub 返回的带换行 base64', () => {
    const encoded = encodeBase64Utf8('中文');
    const wrapped = `${encoded.slice(0, 2)}\n${encoded.slice(2)}`;
    expect(decodeBase64Utf8(wrapped)).toBe('中文');
  });
});

describe('pushSnapshot', () => {
  it('云端没有文件时不带 sha，并返回 created', async () => {
    const fetchMock = installed();
    fetchMock.mockResolvedValueOnce(reply(404, { message: 'Not Found' }));
    fetchMock.mockResolvedValueOnce(reply(201, { content: { sha: 'new-sha' } }));

    const result = await pushSnapshot(config(), snapshot);

    expect(result.created).toBe(true);
    expect(result.sha).toBe('new-sha');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(putInit.method).toBe('PUT');
    expect(String(putUrl)).toContain(
      '/repos/hopetree/cws-data/contents/data/chrome-work-station.json',
    );
    const body = JSON.parse(String(putInit.body)) as { content: string; sha?: string };
    expect(body.sha).toBeUndefined();
    expect(decodeBase64Utf8(body.content)).toBe(JSON.stringify(snapshot, null, 2));
  });

  it('云端已有文件时带上当前 sha', async () => {
    const fetchMock = installed();
    fetchMock.mockResolvedValueOnce(remoteFile('{}', 'existing-sha'));
    fetchMock.mockResolvedValueOnce(reply(200, { content: { sha: 'next-sha' } }));

    const result = await pushSnapshot(config(), snapshot);

    expect(result.created).toBe(false);
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((JSON.parse(String(putInit.body)) as { sha?: string }).sha).toBe('existing-sha');
  });

  it('提交信息里带条目数量', async () => {
    const fetchMock = installed();
    fetchMock.mockResolvedValueOnce(reply(404, {}));
    fetchMock.mockResolvedValueOnce(reply(201, { content: { sha: 's' } }));

    await pushSnapshot(config(), snapshot);

    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const message = (JSON.parse(String(putInit.body)) as { message: string }).message;
    expect(message).toContain('1 条 Prompt');
    expect(message).toContain('1 个模板');
  });

  it('遇到 409 冲突时重新取 sha 并重试一次', async () => {
    const fetchMock = installed();
    fetchMock.mockResolvedValueOnce(remoteFile('{}', 'stale-sha'));
    fetchMock.mockResolvedValueOnce(reply(409, { message: 'Conflict' }));
    fetchMock.mockResolvedValueOnce(remoteFile('{}', 'fresh-sha'));
    fetchMock.mockResolvedValueOnce(reply(200, { content: { sha: 'final-sha' } }));

    const result = await pushSnapshot(config(), snapshot);

    expect(result.sha).toBe('final-sha');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, putInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect((JSON.parse(String(putInit.body)) as { sha?: string }).sha).toBe('fresh-sha');
  });

  it('409 重试后仍冲突则报错', async () => {
    const fetchMock = installed();
    fetchMock.mockResolvedValueOnce(remoteFile('{}', 'stale-sha'));
    fetchMock.mockResolvedValueOnce(reply(409, {}));
    fetchMock.mockResolvedValueOnce(remoteFile('{}', 'fresh-sha'));
    fetchMock.mockResolvedValueOnce(reply(409, {}));

    await expect(pushSnapshot(config(), snapshot)).rejects.toThrow('请重试');
  });

  it('令牌无效时给出中文提示且不发起写入', async () => {
    const fetchMock = installed();
    fetchMock.mockResolvedValueOnce(reply(401, { message: 'Bad credentials' }));

    await expect(pushSnapshot(config(), snapshot)).rejects.toThrow('访问令牌无效或已过期');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('仓库格式不对时在发请求前就报错', async () => {
    const fetchMock = installed();

    await expect(pushSnapshot(config({ repo: '没有斜杠' }), snapshot)).rejects.toThrow(
      '仓库格式应为 owner/repo',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('pullSnapshot', () => {
  it('解出云端快照', async () => {
    installed().mockResolvedValueOnce(remoteFile(JSON.stringify(snapshot)));
    await expect(pullSnapshot(config())).resolves.toMatchObject({
      prompts: [expect.objectContaining({ id: 'p1' })],
    });
  });

  it('云端还没有文件时返回 null', async () => {
    installed().mockResolvedValueOnce(reply(404, { message: 'Not Found' }));
    await expect(pullSnapshot(config())).resolves.toBeNull();
  });

  it('云端内容不是 JSON 时报错', async () => {
    installed().mockResolvedValueOnce(remoteFile('这不是 JSON'));
    await expect(pullSnapshot(config())).rejects.toThrow('不是合法的 JSON');
  });

  it('文件过大拿不到内联内容时报错', async () => {
    installed().mockResolvedValueOnce(reply(200, { sha: 'sha-1', size: 2_000_000 }));
    await expect(pullSnapshot(config())).rejects.toThrow('无法通过 Contents API 读取');
  });
});

describe('testConnection', () => {
  it('返回仓库名、可见性与云端文件是否存在', async () => {
    const fetchMock = installed();
    fetchMock.mockResolvedValueOnce(reply(200, { full_name: 'hopetree/data', private: true }));
    fetchMock.mockResolvedValueOnce(remoteFile('{}'));

    await expect(testConnection(config())).resolves.toEqual({
      repo: 'hopetree/data',
      visibility: '私有',
      fileExists: true,
    });
  });

  it('云端还没有文件时 fileExists 为 false', async () => {
    const fetchMock = installed();
    fetchMock.mockResolvedValueOnce(reply(200, { full_name: 'hopetree/data', private: true }));
    fetchMock.mockResolvedValueOnce(reply(404, { message: 'Not Found' }));

    await expect(testConnection(config())).resolves.toMatchObject({ fileExists: false });
  });

  it('仓库不可见时提示仓库名或授权问题', async () => {
    installed().mockResolvedValueOnce(reply(404, { message: 'Not Found' }));
    await expect(testConnection(config())).rejects.toThrow('找不到仓库或文件');
  });

  it('没填令牌时直接报错', async () => {
    const fetchMock = installed();
    await expect(testConnection(config({ token: '' }))).rejects.toThrow('请先填写访问令牌');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('同步配置', () => {
  it('缺省字段回落到默认值', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce({ repo: 'hopetree/data' });
    await expect(loadSyncConfig()).resolves.toEqual({
      ...DEFAULT_SYNC_CONFIG,
      repo: 'hopetree/data',
    });
  });

  it('未配置过时返回默认配置', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce(null);
    await expect(loadSyncConfig()).resolves.toEqual(DEFAULT_SYNC_CONFIG);
  });

  it('保存时只覆盖传入的字段', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce({
      repo: 'hopetree/data',
      token: 'github_pat_x',
    });
    const next = await saveSyncConfig({ lastPushedAt: 123 });

    expect(next.repo).toBe('hopetree/data');
    expect(next.token).toBe('github_pat_x');
    expect(next.lastPushedAt).toBe(123);
    expect(vi.mocked(storage.setItem)).toHaveBeenCalledWith(
      'local:settings:sync:github',
      expect.objectContaining({ repo: 'hopetree/data', lastPushedAt: 123 }),
    );
  });

  it('只有仓库和令牌都填了才算配置完成', () => {
    expect(isConfigured(config())).toBe(true);
    expect(isConfigured(config({ token: '' }))).toBe(false);
    expect(isConfigured(config({ repo: '' }))).toBe(false);
  });
});

describe('自动上传间隔', () => {
  it('范围内的整数原样保留', () => {
    expect(normalizeAutoPushDelay(1)).toBe(1);
    expect(normalizeAutoPushDelay(30)).toBe(30);
    expect(normalizeAutoPushDelay(120)).toBe(120);
  });

  it('超范围时收敛到边界，小数四舍五入', () => {
    expect(normalizeAutoPushDelay(0)).toBe(MIN_AUTO_PUSH_DELAY_MINUTES);
    expect(normalizeAutoPushDelay(-5)).toBe(MIN_AUTO_PUSH_DELAY_MINUTES);
    expect(normalizeAutoPushDelay(999)).toBe(MAX_AUTO_PUSH_DELAY_MINUTES);
    expect(normalizeAutoPushDelay(7.4)).toBe(7);
    expect(normalizeAutoPushDelay(7.6)).toBe(8);
  });

  it('非数字一律回落到默认 5 分钟', () => {
    expect(normalizeAutoPushDelay(undefined)).toBe(5);
    expect(normalizeAutoPushDelay(null)).toBe(5);
    expect(normalizeAutoPushDelay('30')).toBe(5);
    expect(normalizeAutoPushDelay(Number.NaN)).toBe(5);
    expect(normalizeAutoPushDelay(Number.POSITIVE_INFINITY)).toBe(5);
  });

  it('存储里的旧值非法时读取即归一化', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce({ autoPushDelayMinutes: 'abc' as never });
    const loaded = await loadSyncConfig();
    expect(loaded.autoPushDelayMinutes).toBe(DEFAULT_SYNC_CONFIG.autoPushDelayMinutes);
  });

  it('保存时把传入值归一化后再落盘', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce({ autoPushDelayMinutes: 30 });
    const next = await saveSyncConfig({ autoPushDelayMinutes: 500 });
    expect(next.autoPushDelayMinutes).toBe(MAX_AUTO_PUSH_DELAY_MINUTES);
    expect(vi.mocked(storage.setItem)).toHaveBeenCalledWith(
      'local:settings:sync:github',
      expect.objectContaining({ autoPushDelayMinutes: MAX_AUTO_PUSH_DELAY_MINUTES }),
    );
  });

  it('不传间隔时不改动已有值', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce({ autoPushDelayMinutes: 30 });
    const next = await saveSyncConfig({ autoPush: true });
    expect(next.autoPushDelayMinutes).toBe(30);
  });
});
