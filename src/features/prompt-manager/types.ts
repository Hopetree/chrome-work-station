export interface PromptItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  /** 所属目录 id；undefined/null 表示未分组（默认目录） */
  folderId?: string | null;
  /** 手动排序位置（拖动产生）；未设置时按最近修改排序 */
  order?: number;
  /** 置顶：常用的 Prompt 排在列表最前 */
  pinned?: boolean;
  /** 累计复制次数 */
  copyCount?: number;
  lastUsedAt?: number;
}

/** 目录（仅一层，不支持子目录） */
export interface FolderItem {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  /** 手动排序位置（拖动目录产生）；未设置时按创建时间排序 */
  order?: number;
  /** 父目录 id；为空表示顶层目录。最多两层：子目录不能再有子目录 */
  parentId?: string | null;
}

export interface TemplateItem {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  /** 最近修改时间，编辑模板时更新；旧数据可能缺失，回退用 createdAt */
  updatedAt?: number;
  /** 所属目录 id；undefined/null 表示未分组 */
  folderId?: string | null;
  /** 手动排序位置（拖动模板产生） */
  order?: number;
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved';
