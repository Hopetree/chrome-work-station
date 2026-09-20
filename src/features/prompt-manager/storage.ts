import { storage } from 'wxt/storage';
import type { FolderItem, PromptItem, TemplateItem } from './types';

const PROMPTS_KEY = 'local:prompt-manager:prompts';
const TEMPLATES_KEY = 'local:prompt-manager:templates';
const FOLDERS_KEY = 'local:prompt-manager:folders';

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
