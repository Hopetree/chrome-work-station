import type { FolderItem, PromptItem, TemplateItem } from './types';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPromptItem(now = Date.now(), folderId: string | null = null): PromptItem {
  return {
    id: generateId(),
    title: '未命名 Prompt',
    content: '',
    createdAt: now,
    updatedAt: now,
    folderId,
  };
}

/** 把一条 Prompt 的内容沉淀为模板 */
export function createTemplateFromPrompt(prompt: PromptItem, now = Date.now()): TemplateItem {
  return {
    id: generateId(),
    name: prompt.title,
    content: prompt.content,
    createdAt: now,
    updatedAt: now,
  };
}

/** 基于模板创建新 Prompt */
export function createPromptFromTemplate(template: TemplateItem, now = Date.now()): PromptItem {
  return {
    id: generateId(),
    title: template.name.trim() || '未命名模板',
    content: template.content,
    createdAt: now,
    updatedAt: now,
  };
}

const VARIABLE_RE = /\{\{\s*([^{}\n]+?)\s*\}\}/g;

/** 提取内容中的 {{变量}}，按出现顺序去重 */
export function extractVariables(content: string): string[] {
  const seen = new Set<string>();
  for (const match of content.matchAll(VARIABLE_RE)) seen.add(match[1]);
  return [...seen];
}

/** 用 values 填充变量；空白值视为未填写，保留原文 */
export function fillVariables(content: string, values: Record<string, string>): string {
  return content.replace(VARIABLE_RE, (raw, name: string) => {
    const value = values[name];
    return value && value.trim().length > 0 ? value : raw;
  });
}

/** 排序：置顶优先 → 手动顺序 → 最近修改（未手动排序过的排在有顺序的之后） */
export function sortPrompts(prompts: PromptItem[]): PromptItem[] {
  return [...prompts].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      orderOf(a) - orderOf(b) ||
      b.updatedAt - a.updatedAt,
  );
}

function orderOf(item: PromptItem): number {
  return typeof item.order === 'number' ? item.order : Number.MAX_SAFE_INTEGER;
}

/**
 * 计算拖拽落点后的结果：把 draggedId 放进目标分组、插入到 beforeId 之前（null = 末尾），
 * 并为目标分组的全部成员重排 order。返回新的 Prompt 列表（不改动其他分组的顺序）。
 */
export function computeDropOrder(
  prompts: PromptItem[],
  draggedId: string,
  targetFolderId: string | null,
  beforeId: string | null,
): PromptItem[] {
  const dragged = prompts.find((p) => p.id === draggedId);
  if (!dragged) return prompts;

  const siblings = sortPrompts(
    prompts.filter((p) => p.id !== draggedId && (p.folderId ?? null) === targetFolderId),
  );
  const insertIndex = beforeId ? siblings.findIndex((s) => s.id === beforeId) : siblings.length;
  const ordered = [...siblings];
  ordered.splice(insertIndex === -1 ? siblings.length : insertIndex, 0, dragged);

  const orderById = new Map(ordered.map((item, index) => [item.id, index]));
  return prompts.map((item) => {
    if (item.id === draggedId) {
      return { ...item, folderId: targetFolderId, order: orderById.get(item.id) ?? 0 };
    }
    const nextOrder = orderById.get(item.id);
    return nextOrder === undefined ? item : { ...item, order: nextOrder };
  });
}

/** 新条目插入到分组顶部时使用的 order（比现有最小值更小） */
export function topOrderIn(prompts: PromptItem[], folderId: string | null): number {
  const siblings = prompts.filter((p) => (p.folderId ?? null) === folderId);
  if (siblings.length === 0) return 0;
  return Math.min(...siblings.map(orderOf)) - 1;
}

export function createFolderItem(name: string, now = Date.now(), order?: number): FolderItem {
  return {
    id: generateId(),
    name: name.trim() || '未命名目录',
    createdAt: now,
    updatedAt: now,
    ...(order === undefined ? {} : { order }),
  };
}

function folderOrderOf(folder: FolderItem): number {
  return typeof folder.order === 'number' ? folder.order : Number.MAX_SAFE_INTEGER;
}

/** 目录排序：手动顺序优先，其次创建时间 */
export function sortFolders(folders: FolderItem[]): FolderItem[] {
  return [...folders].sort(
    (a, b) => folderOrderOf(a) - folderOrderOf(b) || a.createdAt - b.createdAt,
  );
}

/** 新建目录追加到末尾时使用的 order */
export function bottomFolderOrderIn(folders: FolderItem[]): number {
  const ordered = folders.map(folderOrderOf).filter((value) => value !== Number.MAX_SAFE_INTEGER);
  return ordered.length > 0 ? Math.max(...ordered) + 1 : folders.length;
}

/** 目录拖拽落点：把 draggedId 放到 beforeId 之前（null = 末尾），并重排全部目录的 order */
export function computeFolderDropOrder(
  folders: FolderItem[],
  draggedId: string,
  beforeId: string | null,
): FolderItem[] {
  const dragged = folders.find((f) => f.id === draggedId);
  if (!dragged) return folders;
  const rest = sortFolders(folders.filter((f) => f.id !== draggedId));
  const insertIndex = beforeId ? rest.findIndex((f) => f.id === beforeId) : rest.length;
  const ordered = [...rest];
  ordered.splice(insertIndex === -1 ? rest.length : insertIndex, 0, dragged);
  const orderById = new Map(ordered.map((folder, index) => [folder.id, index]));
  return folders.map((folder) => ({ ...folder, order: orderById.get(folder.id) ?? 0 }));
}

export interface PromptSection {
  /** null 表示未分组（默认目录） */
  folder: FolderItem | null;
  prompts: PromptItem[];
}

/**
 * 按目录分组：先目录（创建顺序），最后是未分组。
 * folderId 指向已删除目录的 Prompt 自动归入未分组。
 */
export function groupPromptsByFolder(
  prompts: PromptItem[],
  folders: FolderItem[],
): PromptSection[] {
  const sorted = sortFolders(folders);
  const known = new Set(sorted.map((f) => f.id));
  const sections: PromptSection[] = sorted.map((folder) => ({
    folder,
    prompts: prompts.filter((p) => p.folderId === folder.id),
  }));
  sections.push({
    folder: null,
    prompts: prompts.filter((p) => !p.folderId || !known.has(p.folderId)),
  });
  return sections;
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
