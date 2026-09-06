export interface PromptItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateItem {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved';
