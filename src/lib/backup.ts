import type { PromptItem, TemplateItem } from '@/features/prompt-manager/types';

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  prompts: PromptItem[];
  templates: TemplateItem[];
}

export interface MergeResult {
  prompts: PromptItem[];
  templates: TemplateItem[];
  /** 导入新增的条数 */
  added: number;
  /** 以导入数据覆盖本地的条数 */
  updated: number;
}

export function buildBackup(prompts: PromptItem[], templates: TemplateItem[]): BackupFile {
  return {
    app: 'chrome-work-station',
    version: 1,
    exportedAt: new Date().toISOString(),
    prompts,
    templates,
  };
}

const templateTime = (t: TemplateItem) => t.updatedAt ?? t.createdAt;

/**
 * 把导入的数据合并进本地：按 id 对齐，新者胜。
 * 本地没有的条目新增；两边都有且导入更新则覆盖本地。
 */
export function mergeBackup(
  localPrompts: PromptItem[],
  localTemplates: TemplateItem[],
  incoming: unknown,
): MergeResult {
  if (typeof incoming !== 'object' || incoming === null) {
    throw new Error('无效的备份文件');
  }
  const data = incoming as Partial<BackupFile>;
  if (!Array.isArray(data.prompts) || !Array.isArray(data.templates)) {
    throw new Error('备份文件缺少 prompts 或 templates 数据');
  }

  let added = 0;
  let updated = 0;

  const localPromptMap = new Map(localPrompts.map((p) => [p.id, p]));
  for (const item of data.prompts) {
    if (!isValidPrompt(item)) continue;
    const local = localPromptMap.get(item.id);
    if (!local) {
      localPromptMap.set(item.id, item);
      added += 1;
    } else if (item.updatedAt > local.updatedAt) {
      localPromptMap.set(item.id, { ...local, ...item });
      updated += 1;
    }
  }

  const localTemplateMap = new Map(localTemplates.map((t) => [t.id, t]));
  for (const item of data.templates) {
    if (!isValidTemplate(item)) continue;
    const local = localTemplateMap.get(item.id);
    if (!local) {
      localTemplateMap.set(item.id, item);
      added += 1;
    } else if (templateTime(item) > templateTime(local)) {
      localTemplateMap.set(item.id, { ...local, ...item });
      updated += 1;
    }
  }

  return {
    prompts: [...localPromptMap.values()],
    templates: [...localTemplateMap.values()],
    added,
    updated,
  };
}

function isItemShape(item: unknown): item is Record<string, unknown> & { id: string } {
  if (typeof item !== 'object' || item === null) return false;
  const it = item as Record<string, unknown>;
  return (
    typeof it.id === 'string' &&
    it.id.length > 0 &&
    typeof it.createdAt === 'number' &&
    typeof it.updatedAt === 'number' &&
    typeof it.content === 'string'
  );
}

function isValidPrompt(item: unknown): item is PromptItem {
  return isItemShape(item) && typeof (item as unknown as PromptItem).title === 'string';
}

function isValidTemplate(item: unknown): item is TemplateItem {
  return isItemShape(item) && typeof (item as unknown as TemplateItem).name === 'string';
}
