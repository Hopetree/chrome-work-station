export interface PromptItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  /** 置顶：常用的 Prompt 排在列表最前 */
  pinned?: boolean;
  /** 累计复制次数 */
  copyCount?: number;
  lastUsedAt?: number;
}

export interface TemplateItem {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  /** 最近修改时间，编辑模板时更新；旧数据可能缺失，回退用 createdAt */
  updatedAt?: number;
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved';
