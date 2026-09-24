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

/** 模板按关键词过滤：名称或内容包含即命中，空关键词返回全部 */
export function filterTemplates(templates: TemplateItem[], query: string): TemplateItem[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return templates;
  return templates.filter(
    (t) => t.name.toLowerCase().includes(keyword) || t.content.toLowerCase().includes(keyword),
  );
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

export function createFolderItem(
  name: string,
  now = Date.now(),
  order?: number,
  parentId: string | null = null,
): FolderItem {
  return {
    id: generateId(),
    name: name.trim() || '未命名目录',
    createdAt: now,
    updatedAt: now,
    parentId,
    ...(order === undefined ? {} : { order }),
  };
}

/** 目录的子目录 id（含自身），用于级联删除 */
export function folderSubtreeIds(folders: FolderItem[], id: string): string[] {
  const ids = [id];
  for (const folder of folders) {
    if (folder.parentId === id) ids.push(...folderSubtreeIds(folders, folder.id));
  }
  return ids;
}

/** 该目录能否再放子目录（只有顶层目录可以，最多两层） */
export function canNestUnder(folders: FolderItem[], parentId: string): boolean {
  const parent = folders.find((f) => f.id === parentId);
  return !!parent && !parent.parentId;
}

/** 该目录是否已有子目录（有子目录的目录不能再被拖动嵌套） */
export function hasChildFolders(folders: FolderItem[], id: string): boolean {
  return folders.some((f) => f.parentId === id);
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

/** 新建目录追加到末尾时使用的 order（按同层目录计算） */
export function bottomFolderOrderIn(folders: FolderItem[], parentId: string | null = null): number {
  const siblings = folders.filter((f) => (f.parentId ?? null) === parentId);
  const ordered = siblings.map(folderOrderOf).filter((value) => value !== Number.MAX_SAFE_INTEGER);
  return ordered.length > 0 ? Math.max(...ordered) + 1 : siblings.length;
}

/**
 * 目录拖拽落点：把 draggedId 放到目标层级（targetParentId）的 beforeId 之前（null = 末尾）。
 * 层级约束：最多两层 —— 目标父目录必须是顶层，且被拖动的目录本身没有子目录，否则退化为放到顶层。
 */
export function computeFolderDropOrder(
  folders: FolderItem[],
  draggedId: string,
  targetParentId: string | null,
  beforeId: string | null,
): FolderItem[] {
  const dragged = folders.find((f) => f.id === draggedId);
  if (!dragged) return folders;

  let parentId = targetParentId;
  if (parentId) {
    const legalParent = canNestUnder(folders, parentId);
    const draggedHasChildren = hasChildFolders(folders, draggedId);
    if (!legalParent || draggedHasChildren || parentId === draggedId) parentId = null;
  }

  const siblings = sortFolders(
    folders.filter((f) => f.id !== draggedId && (f.parentId ?? null) === parentId),
  );
  const insertIndex = beforeId ? siblings.findIndex((f) => f.id === beforeId) : siblings.length;
  const ordered = [...siblings];
  ordered.splice(insertIndex === -1 ? siblings.length : insertIndex, 0, dragged);
  const orderById = new Map(ordered.map((folder, index) => [folder.id, index]));

  return folders.map((folder) => {
    const order = orderById.get(folder.id);
    if (folder.id === draggedId) return { ...folder, parentId, order: order ?? 0 };
    return order === undefined ? folder : { ...folder, order };
  });
}

export interface FolderSection<T> {
  folder: FolderItem;
  items: T[];
  /** 子目录分组（最多一层） */
  children: FolderSection<T>[];
}

export interface GroupedByFolder<T> {
  sections: FolderSection<T>[];
  /** 未分组条目（含 folderId 指向已删除目录的） */
  ungrouped: T[];
}

/**
 * 按目录分组为两层结构：顶层目录 → 子目录。
 * 父目录不存在的目录按顶层处理，避免出现孤儿分组。
 */
export function groupByFolder<T extends { folderId?: string | null }>(
  items: T[],
  folders: FolderItem[],
): GroupedByFolder<T> {
  const sorted = sortFolders(folders);
  const byId = new Map(sorted.map((f) => [f.id, f]));
  const topLevel: FolderItem[] = [];
  const childMap = new Map<string, FolderItem[]>();

  for (const folder of sorted) {
    const parentId = folder.parentId && byId.has(folder.parentId) ? folder.parentId : null;
    if (!parentId) {
      topLevel.push(folder);
      continue;
    }
    const siblings = childMap.get(parentId) ?? [];
    siblings.push(folder);
    childMap.set(parentId, siblings);
  }

  const build = (folder: FolderItem): FolderSection<T> => ({
    folder,
    items: items.filter((item) => item.folderId === folder.id),
    children: (childMap.get(folder.id) ?? []).map(build),
  });

  const known = new Set(sorted.map((f) => f.id));
  return {
    sections: topLevel.map(build),
    ungrouped: items.filter((item) => !item.folderId || !known.has(item.folderId)),
  };
}

export function groupPromptsByFolder(
  prompts: PromptItem[],
  folders: FolderItem[],
): GroupedByFolder<PromptItem> {
  return groupByFolder(prompts, folders);
}

export function groupTemplatesByFolder(
  templates: TemplateItem[],
  folders: FolderItem[],
): GroupedByFolder<TemplateItem> {
  return groupByFolder(templates, folders);
}

/** 模板排序：手动顺序优先，其次最近修改（回退创建时间） */
export function sortTemplates(templates: TemplateItem[]): TemplateItem[] {
  const orderOf = (t: TemplateItem) =>
    typeof t.order === 'number' ? t.order : Number.MAX_SAFE_INTEGER;
  return [...templates].sort(
    (a, b) =>
      orderOf(a) - orderOf(b) || (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
  );
}

/** 模板插入到分组顶部时使用的 order */
export function topTemplateOrderIn(templates: TemplateItem[], folderId: string | null): number {
  const siblings = templates.filter((t) => (t.folderId ?? null) === folderId);
  if (siblings.length === 0) return 0;
  const orders = siblings.map((t) => t.order).filter((o): o is number => typeof o === 'number');
  return orders.length > 0 ? Math.min(...orders) - 1 : siblings.length;
}

/** 模板拖拽落点：与 Prompt 同构（重排目标分组 order、更新 folderId） */
export function computeTemplateDropOrder(
  templates: TemplateItem[],
  draggedId: string,
  targetFolderId: string | null,
  beforeId: string | null,
): TemplateItem[] {
  const dragged = templates.find((t) => t.id === draggedId);
  if (!dragged) return templates;
  const siblings = sortTemplates(
    templates.filter((t) => t.id !== draggedId && (t.folderId ?? null) === targetFolderId),
  );
  const insertIndex = beforeId ? siblings.findIndex((t) => t.id === beforeId) : siblings.length;
  const ordered = [...siblings];
  ordered.splice(insertIndex === -1 ? siblings.length : insertIndex, 0, dragged);
  const orderById = new Map(ordered.map((item, index) => [item.id, index]));
  return templates.map((item) => {
    const nextOrder = orderById.get(item.id);
    if (item.id === draggedId) return { ...item, folderId: targetFolderId, order: nextOrder ?? 0 };
    return nextOrder === undefined ? item : { ...item, order: nextOrder };
  });
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
