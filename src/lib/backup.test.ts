import { describe, expect, it } from 'vitest';
import { buildBackup, mergeBackup } from './backup';
import type { FolderItem, PromptItem, TemplateItem } from '@/features/prompt-manager/types';

const prompt = (id: string, updatedAt: number, over: Partial<PromptItem> = {}): PromptItem => ({
  id,
  title: id,
  content: `内容 ${id}`,
  createdAt: 1,
  updatedAt,
  ...over,
});

const template = (id: string, updatedAt: number): TemplateItem => ({
  id,
  name: id,
  content: `模板 ${id}`,
  createdAt: 1,
  updatedAt,
});

const folder = (id: string, updatedAt: number): FolderItem => ({
  id,
  name: id,
  createdAt: 1,
  updatedAt,
});

describe('buildBackup', () => {
  it('wraps data with metadata', () => {
    const file = buildBackup([prompt('a', 1)], [template('t', 1)], [folder('f', 1)]);
    expect(file.app).toBe('chrome-work-station');
    expect(file.version).toBe(1);
    expect(file.prompts).toHaveLength(1);
    expect(file.templates).toHaveLength(1);
    expect(file.folders).toHaveLength(1);
    expect(file.exportedAt).toBeTruthy();
  });
});

describe('mergeBackup', () => {
  it('adds new items and reports counts', () => {
    const result = mergeBackup([prompt('a', 1)], [], [], {
      prompts: [prompt('a', 1), prompt('b', 5)],
      templates: [template('t', 1)],
    });
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.prompts.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('overwrites local when incoming is newer', () => {
    const result = mergeBackup(
      [prompt('a', 10, { title: '本地新' })],
      [template('t', 10)],
      [folder('f', 10)],
      {
        prompts: [prompt('a', 20, { title: '导入新' })],
        templates: [template('t', 20)],
        folders: [folder('f', 20)],
      },
    );
    expect(result.updated).toBe(3);
    expect(result.prompts[0].title).toBe('导入新');
    expect(result.templates[0].name).toBe('t');
  });

  it('keeps local when local is newer', () => {
    const result = mergeBackup([prompt('a', 99, { title: '本地新' })], [], [], {
      prompts: [prompt('a', 20, { title: '导入旧' })],
      templates: [],
    });
    expect(result.updated).toBe(0);
    expect(result.prompts[0].title).toBe('本地新');
  });

  it('skips malformed items instead of failing', () => {
    const result = mergeBackup([], [], [], {
      prompts: [prompt('a', 1), { id: 'bad' }, null, 'junk'],
      templates: [template('t', 1)],
      folders: [folder('f', 1), { id: '' }],
    });
    expect(result.prompts).toHaveLength(1);
    expect(result.templates).toHaveLength(1);
    expect(result.folders).toHaveLength(1);
  });

  it('rejects invalid backup payloads', () => {
    expect(() => mergeBackup([], [], [], null)).toThrow('无效的备份文件');
    expect(() => mergeBackup([], [], [], { app: 'x' })).toThrow();
  });
});

describe('mergeBackup 兼容旧备份', () => {
  it('accepts payload without folders field', () => {
    const result = mergeBackup([], [], [], {
      prompts: [prompt('a', 1)],
      templates: [],
    });
    expect(result.prompts).toHaveLength(1);
    expect(result.folders).toEqual([]);
  });
});

describe('历史数据兼容', () => {
  // 模拟早期版本导出的备份：模板没有 updatedAt、Prompt 没有 folderId/order/pinned/copyCount
  const legacyBackup = {
    app: 'chrome-work-station',
    version: 1,
    exportedAt: '2026-09-05T00:00:00.000Z',
    prompts: [
      { id: 'old-1', title: '旧 Prompt', content: '旧内容', createdAt: 100, updatedAt: 200 },
      { id: 'old-2', title: '更旧的 Prompt', content: '内容', createdAt: 50, updatedAt: 60 },
    ],
    templates: [{ id: 'old-t1', name: '旧模板', content: '模板内容', createdAt: 10 }],
    // 没有 folders 字段
  };

  it('导入旧版备份不丢条目（模板缺 updatedAt 也能识别）', () => {
    const result = mergeBackup([], [], [], legacyBackup);
    expect(result.prompts).toHaveLength(2);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].name).toBe('旧模板');
    expect(result.added).toBe(3);
  });

  it('旧备份缺 folders 字段时按空目录处理，不抛错', () => {
    const result = mergeBackup(
      [prompt('a', 1)],
      [template('t', 1)],
      [folder('f', 1)],
      legacyBackup,
    );
    expect(result.folders.map((f) => f.id)).toEqual(['f']);
  });

  it('旧数据缺 updatedAt 时用 createdAt 比较，不覆盖更新的本地数据', () => {
    const result = mergeBackup([], [template('old-t1', 999)], [], legacyBackup);
    expect(result.updated).toBe(0); // 本地 999 比导入的 createdAt=10 新
    expect(result.templates[0].updatedAt).toBe(999);
  });

  it('导出后重新导入到空库，数据完全一致（往返一致）', () => {
    const prompts = [
      prompt('p1', 10, { folderId: 'f1', order: 0, pinned: true, copyCount: 3, lastUsedAt: 20 }),
      prompt('p2', 20, { folderId: null, order: 1 }),
    ];
    const templates = [{ id: 't1', name: '模板', content: '内容', createdAt: 1, updatedAt: 2 }];
    const folders = [folder('f1', 5)];
    const exported = buildBackup(prompts, templates, folders);
    const roundTripped = mergeBackup([], [], [], JSON.parse(JSON.stringify(exported)));
    expect(roundTripped.prompts).toEqual(prompts);
    expect(roundTripped.templates).toEqual(templates);
    expect(roundTripped.folders).toEqual(folders);
  });

  it('导入后目录引用可解析（Prompt.folderId 指向备份内的目录）', () => {
    const exported = buildBackup([prompt('p1', 1, { folderId: 'f9' })], [], [folder('f9', 1)]);
    const result = mergeBackup([], [], [], exported);
    const folderIds = new Set(result.folders.map((f) => f.id));
    expect(folderIds.has(result.prompts[0].folderId as string)).toBe(true);
  });

  it('畸形条目跳过而不影响其它条目', () => {
    const result = mergeBackup([], [], [], {
      prompts: [{ id: 'ok', title: 't', content: 'c', createdAt: 1, updatedAt: 2 }, { id: '' }, 42],
      templates: [],
    });
    expect(result.prompts).toHaveLength(1);
  });
});
