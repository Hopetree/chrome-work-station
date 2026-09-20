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
