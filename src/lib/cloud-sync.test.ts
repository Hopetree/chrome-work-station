import { describe, expect, it, vi } from 'vitest';

vi.mock('wxt/storage', () => ({
  storage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import type { FolderItem, PromptItem, TemplateItem } from '@/features/prompt-manager/types';
import { autoPushDelayMs, newestStamp } from './cloud-sync';

describe('autoPushDelayMs', () => {
  it('按配置的分钟数换算成毫秒', () => {
    expect(autoPushDelayMs(1)).toBe(60_000);
    expect(autoPushDelayMs(5)).toBe(300_000);
    expect(autoPushDelayMs(30)).toBe(1_800_000);
    expect(autoPushDelayMs(120)).toBe(7_200_000);
  });

  it('非法值回落到默认 5 分钟', () => {
    expect(autoPushDelayMs(undefined)).toBe(300_000);
    expect(autoPushDelayMs(null)).toBe(300_000);
    expect(autoPushDelayMs('abc')).toBe(300_000);
  });

  it('越界值收敛到上下限', () => {
    expect(autoPushDelayMs(0)).toBe(60_000);
    expect(autoPushDelayMs(-3)).toBe(60_000);
    expect(autoPushDelayMs(9999)).toBe(7_200_000);
  });
});

describe('newestStamp', () => {
  // PromptItem.updatedAt 在类型上是必填，但历史数据里确实缺过，测试要覆盖回落分支
  const prompt = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, title: id, content: '', createdAt: 1, ...extra }) as unknown as PromptItem;
  const template = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, name: id, content: '', createdAt: 1, ...extra }) as unknown as TemplateItem;
  const folder = (id: string, extra: Partial<FolderItem> = {}): FolderItem => ({
    id,
    name: id,
    createdAt: 1,
    ...extra,
  });

  it('空数据返回 0', () => {
    expect(newestStamp([], [], [])).toBe(0);
  });

  it('优先取 updatedAt，缺省时回落 createdAt', () => {
    expect(newestStamp([prompt('a', { createdAt: 10, updatedAt: 20 })], [], [])).toBe(20);
    expect(newestStamp([prompt('a', { createdAt: 10 })], [], [])).toBe(10);
  });

  it('三类数据一起比较', () => {
    const stamps = newestStamp(
      [prompt('a', { updatedAt: 5 })],
      [template('b', { createdAt: 30 })],
      [folder('c', { updatedAt: 12 })],
    );
    expect(stamps).toBe(30);
  });
});
