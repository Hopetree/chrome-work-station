import type { PromptItem } from './types';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPromptItem(now = Date.now()): PromptItem {
  return {
    id: generateId(),
    title: '未命名 Prompt',
    content: '',
    createdAt: now,
    updatedAt: now,
  };
}

/** 按关键词过滤：标题或正文包含即命中，空关键词返回全部 */
export function filterPrompts(prompts: PromptItem[], query: string): PromptItem[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return prompts;
  return prompts.filter(
    (p) => p.title.toLowerCase().includes(keyword) || p.content.toLowerCase().includes(keyword),
  );
}

/** 最近修改的排前面 */
export function sortByUpdatedAtDesc(prompts: PromptItem[]): PromptItem[] {
  return [...prompts].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function formatCount(content: string): string {
  const chars = content.length;
  const lines = content ? content.split('\n').length : 0;
  return `${chars} 字 · ${lines} 行`;
}

/** 简洁的相对时间：刚刚 / n 分钟前 / 今天 HH:mm / MM-DD / YYYY-MM-DD */
export function formatUpdatedAt(timestamp: number, now = Date.now()): string {
  const diffMs = now - timestamp;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;

  const date = new Date(timestamp);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) {
    return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const sameYear = date.getFullYear() === today.getFullYear();
  const md = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return sameYear ? md : `${date.getFullYear()}-${md}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
