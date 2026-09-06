import { describe, expect, it } from 'vitest';
import { createPromptItem, filterPrompts, formatUpdatedAt, sortByUpdatedAtDesc } from './utils';

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

describe('sortByUpdatedAtDesc', () => {
  it('sorts newest first without mutating input', () => {
    const input = [
      { id: 'a', title: '', content: '', createdAt: 1, updatedAt: 10 },
      { id: 'b', title: '', content: '', createdAt: 1, updatedAt: 30 },
      { id: 'c', title: '', content: '', createdAt: 1, updatedAt: 20 },
    ];
    const sorted = sortByUpdatedAtDesc(input);
    expect(sorted.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(input[0].id).toBe('a');
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
