import { describe, expect, it } from 'vitest';
import {
  computeDropOrder,
  createFolderItem,
  createPromptFromTemplate,
  createPromptItem,
  createTemplateFromPrompt,
  extractVariables,
  filterPrompts,
  fillVariables,
  formatUpdatedAt,
  groupPromptsByFolder,
  sortFolders,
  sortPrompts,
  topOrderIn,
} from './utils';

describe('createTemplateFromPrompt', () => {
  it('copies title as name and content', () => {
    const prompt = { id: 'p1', title: '审查', content: '正文', createdAt: 1, updatedAt: 2 };
    const t = createTemplateFromPrompt(prompt, 100);
    expect(t).toEqual({ id: t.id, name: '审查', content: '正文', createdAt: 100, updatedAt: 100 });
    expect(t.id).not.toBe(prompt.id);
  });
});

describe('createPromptFromTemplate', () => {
  it('creates a fresh prompt from template content', () => {
    const t = { id: 't1', name: '周报', content: '模板内容', createdAt: 1 };
    const p = createPromptFromTemplate(t, 200);
    expect(p).toEqual({
      id: p.id,
      title: '周报',
      content: '模板内容',
      createdAt: 200,
      updatedAt: 200,
    });
    expect(p.id).not.toBe(t.id);
  });
});

describe('createPromptItem', () => {
  it('creates an untitled prompt with timestamps', () => {
    const item = createPromptItem(1000);
    expect(item.title).toBe('未命名 Prompt');
    expect(item.content).toBe('');
    expect(item.createdAt).toBe(1000);
    expect(item.updatedAt).toBe(1000);
    expect(item.id).toBeTruthy();
  });

  it('generates unique ids', () => {
    const a = createPromptItem();
    const b = createPromptItem();
    expect(a.id).not.toBe(b.id);
  });
});

describe('createFolderItem', () => {
  it('trims name and falls back when blank', () => {
    expect(createFolderItem('  工作  ', 10)).toMatchObject({ name: '工作', createdAt: 10 });
    expect(createFolderItem('   ').name).toBe('未命名目录');
  });
});

describe('sortFolders', () => {
  it('orders by creation time without mutating input', () => {
    const input = [
      { id: 'b', name: 'B', createdAt: 20 },
      { id: 'a', name: 'A', createdAt: 10 },
    ];
    expect(sortFolders(input).map((f) => f.id)).toEqual(['a', 'b']);
    expect(input[0].id).toBe('b');
  });
});

describe('groupPromptsByFolder', () => {
  const folders = [
    { id: 'f1', name: '工作', createdAt: 1 },
    { id: 'f2', name: '生活', createdAt: 2 },
  ];

  it('groups prompts by folder with ungrouped last', () => {
    const prompts = [
      { id: 'p1', title: '', content: '', createdAt: 1, updatedAt: 1, folderId: 'f1' },
      { id: 'p2', title: '', content: '', createdAt: 1, updatedAt: 1 },
      { id: 'p3', title: '', content: '', createdAt: 1, updatedAt: 1, folderId: 'f2' },
    ];
    const sections = groupPromptsByFolder(prompts, folders);
    expect(sections.map((s) => s.folder?.id ?? null)).toEqual(['f1', 'f2', null]);
    expect(sections[0].prompts.map((p) => p.id)).toEqual(['p1']);
    expect(sections[2].prompts.map((p) => p.id)).toEqual(['p2']);
  });

  it('treats prompts of deleted folders as ungrouped', () => {
    const prompts = [
      { id: 'p1', title: '', content: '', createdAt: 1, updatedAt: 1, folderId: 'gone' },
    ];
    const sections = groupPromptsByFolder(prompts, folders);
    expect(sections[2].prompts.map((p) => p.id)).toEqual(['p1']);
  });

  it('keeps empty folders visible', () => {
    const sections = groupPromptsByFolder([], folders);
    expect(sections).toHaveLength(3);
    expect(sections[1].prompts).toEqual([]);
  });
});

describe('filterPrompts', () => {
  const prompts = [
    { id: '1', title: '代码审查', content: '请审查这段 TypeScript', createdAt: 1, updatedAt: 1 },
    { id: '2', title: '翻译助手', content: 'translate to english', createdAt: 2, updatedAt: 2 },
  ];

  it('returns all for blank query', () => {
    expect(filterPrompts(prompts, '  ')).toHaveLength(2);
  });

  it('matches title case-insensitively', () => {
    expect(filterPrompts(prompts, '审查').map((p) => p.id)).toEqual(['1']);
  });

  it('matches content case-insensitively', () => {
    expect(filterPrompts(prompts, 'ENGLISH').map((p) => p.id)).toEqual(['2']);
  });
});

describe('sortPrompts', () => {
  it('puts pinned first, then newest, without mutating input', () => {
    const input = [
      { id: 'a', title: '', content: '', createdAt: 1, updatedAt: 10 },
      { id: 'b', title: '', content: '', createdAt: 1, updatedAt: 30 },
      { id: 'c', title: '', content: '', createdAt: 1, updatedAt: 20, pinned: true },
      { id: 'd', title: '', content: '', createdAt: 1, updatedAt: 5, pinned: true },
    ];
    const sorted = sortPrompts(input);
    expect(sorted.map((p) => p.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(input[0].id).toBe('a');
  });
});

describe('extractVariables', () => {
  it('extracts unique variables in order of appearance', () => {
    expect(extractVariables('把 {{语言}} 翻译成 {{语言}}，语气 {{语气}}')).toEqual([
      '语言',
      '语气',
    ]);
  });

  it('returns empty when no variables', () => {
    expect(extractVariables('普通文本 { 不是变量 }')).toEqual([]);
  });

  it('trims whitespace inside braces', () => {
    expect(extractVariables('{{  语言  }}')).toEqual(['语言']);
  });
});

describe('fillVariables', () => {
  it('fills provided values and keeps missing ones as-is', () => {
    const filled = fillVariables('把 {{语言}} 翻译成 {{语言}}，{{ 语气 }}', { 语言: '英语' });
    expect(filled).toBe('把 英语 翻译成 英语，{{ 语气 }}');
  });

  it('treats empty string as not provided', () => {
    expect(fillVariables('{{a}}', { a: '  ' })).toBe('{{a}}');
  });
});

describe('formatUpdatedAt', () => {
  const now = new Date('2026-09-06T12:00:00').getTime();

  it('formats just now / minutes', () => {
    expect(formatUpdatedAt(now - 10_000, now)).toBe('刚刚');
    expect(formatUpdatedAt(now - 5 * 60_000, now)).toBe('5 分钟前');
  });

  it('formats today with time', () => {
    const morning = new Date('2026-09-06T08:05:00').getTime();
    expect(formatUpdatedAt(morning, now)).toBe('今天 08:05');
  });

  it('formats other days without year in same year', () => {
    const earlier = new Date('2026-03-01T10:00:00').getTime();
    expect(formatUpdatedAt(earlier, now)).toBe('03-01');
  });
});

describe('sortPrompts 手动顺序', () => {
  const base = { title: '', content: '', createdAt: 1 };
  it('honours order before updatedAt', () => {
    const list = [
      { ...base, id: 'a', updatedAt: 100, order: 2 },
      { ...base, id: 'b', updatedAt: 1, order: 0 },
      { ...base, id: 'c', updatedAt: 50, order: 1 },
    ];
    expect(sortPrompts(list).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps un-ordered items after ordered ones, by recency', () => {
    const list = [
      { ...base, id: 'a', updatedAt: 100 },
      { ...base, id: 'b', updatedAt: 1, order: 5 },
      { ...base, id: 'c', updatedAt: 50 },
    ];
    expect(sortPrompts(list).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('computeDropOrder', () => {
  const base = { title: '', content: '', createdAt: 1 };
  const prompts = [
    { ...base, id: 'a', updatedAt: 3, folderId: 'f1' },
    { ...base, id: 'b', updatedAt: 2, folderId: 'f1' },
    { ...base, id: 'c', updatedAt: 1, folderId: null },
  ];

  it('reorders within the same folder before a target card', () => {
    const next = computeDropOrder(prompts, 'c', 'f1', 'b');
    const f1 = next
      .filter((p) => p.folderId === 'f1')
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
      .map((p) => p.id);
    expect(f1).toEqual(['a', 'c', 'b']);
    expect(next.find((p) => p.id === 'c')?.folderId).toBe('f1');
  });

  it('appends when beforeId is null', () => {
    const next = computeDropOrder(prompts, 'c', 'f1', null);
    const f1 = next
      .filter((p) => p.folderId === 'f1')
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
      .map((p) => p.id);
    expect(f1).toEqual(['a', 'b', 'c']);
  });

  it('moves into an empty folder with order 0', () => {
    const next = computeDropOrder(prompts, 'a', 'empty', null);
    const moved = next.find((p) => p.id === 'a');
    expect(moved?.folderId).toBe('empty');
    expect(moved?.order).toBe(0);
  });
});

describe('topOrderIn', () => {
  const base = { title: '', content: '', createdAt: 1 };
  it('returns a value smaller than existing orders', () => {
    const prompts = [
      { ...base, id: 'a', updatedAt: 1, folderId: 'f1', order: 3 },
      { ...base, id: 'b', updatedAt: 1, folderId: 'f1', order: 7 },
    ];
    expect(topOrderIn(prompts, 'f1')).toBe(2);
  });

  it('returns 0 for an empty group', () => {
    expect(topOrderIn([], null)).toBe(0);
  });
});
