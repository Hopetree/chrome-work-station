import { storage } from 'wxt/storage';
import type { PromptItem } from './types';

const PROMPTS_KEY = 'local:prompt-manager:prompts';

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
