import { storage } from 'wxt/storage';
import type { FolderItem, PromptItem, TemplateItem } from './types';

const PROMPTS_KEY = 'local:prompt-manager:prompts';
const TEMPLATES_KEY = 'local:prompt-manager:templates';
const FOLDERS_KEY = 'local:prompt-manager:folders';
const COLLAPSED_KEY = 'local:prompt-manager:collapsedGroups';
const EDITOR_WRAP_KEY = 'local:prompt-manager:editorWrap';

export async function loadPrompts(): Promise<PromptItem[]> {
  return (await storage.getItem<PromptItem[]>(PROMPTS_KEY)) ?? [];
}

export async function savePrompts(prompts: PromptItem[]): Promise<void> {
  await storage.setItem(PROMPTS_KEY, prompts);
}

/** 监听其它上下文（如另一个工作台标签页）对本列表的修改 */
export function watchPrompts(callback: (prompts: PromptItem[]) => void): () => void {
  return storage.watch<PromptItem[]>(PROMPTS_KEY, (value) => callback(value ?? []));
}

export async function loadTemplates(): Promise<TemplateItem[]> {
  return (await storage.getItem<TemplateItem[]>(TEMPLATES_KEY)) ?? [];
}

export async function saveTemplates(templates: TemplateItem[]): Promise<void> {
  await storage.setItem(TEMPLATES_KEY, templates);
}

export async function loadFolders(): Promise<FolderItem[]> {
  return (await storage.getItem<FolderItem[]>(FOLDERS_KEY)) ?? [];
}

export async function saveFolders(folders: FolderItem[]): Promise<void> {
  await storage.setItem(FOLDERS_KEY, folders);
}

/** 目录分组的折叠状态（目录 id 列表，'__ungrouped' 表示未分组） */
export async function loadCollapsedGroups(): Promise<string[]> {
  return (await storage.getItem<string[]>(COLLAPSED_KEY)) ?? [];
}

export async function saveCollapsedGroups(ids: string[]): Promise<void> {
  await storage.setItem(COLLAPSED_KEY, ids);
}

/** 编辑器显示模式：是否自动换行（默认开启，缺省即换行） */
export async function loadEditorWrap(): Promise<boolean> {
  return (await storage.getItem<boolean>(EDITOR_WRAP_KEY)) ?? true;
}

export async function saveEditorWrap(enabled: boolean): Promise<void> {
  await storage.setItem(EDITOR_WRAP_KEY, enabled);
}
