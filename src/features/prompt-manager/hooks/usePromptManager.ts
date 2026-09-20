import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FolderItem, PromptItem, SaveStatus, TemplateItem } from '../types';
import {
  loadFolders,
  loadPrompts,
  loadTemplates,
  saveFolders,
  savePrompts,
  saveTemplates,
} from '../storage';
import {
  createFolderItem,
  createPromptFromTemplate,
  createPromptItem,
  createTemplateFromPrompt,
  sortPrompts,
} from '../utils';

// 停止输入后延迟落盘；输入过程中不保存，避免打断输入和造成卡顿
const AUTOSAVE_DELAY_MS = 1500;

/**
 * Prompt 管理器的状态中枢：列表加载、选中、防抖自动保存。
 * 保存状态通过 SaveStatus 暴露给 UI 展示「保存中…/已保存」。
 */
export function usePromptManager() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraft = useRef<{ id: string; patch: Partial<PromptItem> } | null>(null);
  const templateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templatesRef = useRef<TemplateItem[]>(templates);
  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);

  useEffect(() => {
    let cancelled = false;
    loadPrompts().then((items) => {
      if (cancelled) return;
      setPrompts(items);
      // 默认选中最近编辑的一条，方便回来继续修改
      const first = sortPrompts(items)[0];
      if (first) setActiveId(first.id);
      setLoading(false);
    });
    loadTemplates().then((items) => {
      if (!cancelled) setTemplates(items);
    });
    loadFolders().then((items) => {
      if (!cancelled) setFolders(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // 卸载时把还没落盘的模板修改立即写入
      if (templateTimer.current) {
        clearTimeout(templateTimer.current);
        void saveTemplates(templatesRef.current);
      }
    },
    [],
  );

  const persist = useCallback(async () => {
    const draft = latestDraft.current;
    if (!draft) return;
    setStatus('saving');
    try {
      const current = await loadPrompts();
      const next = current.map((item) =>
        item.id === draft.id
          ? { ...item, ...draft.patch, updatedAt: draft.patch.updatedAt ?? Date.now() }
          : item,
      );
      await savePrompts(next);
      if (latestDraft.current === draft) latestDraft.current = null;
      // 只重排本地状态；不能用存储值整体替换，否则会覆盖用户正在输入的新内容并导致光标跳到末尾
      setPrompts((prev) => sortPrompts(prev));
      setStatus('saved');
    } catch (error) {
      console.error('[prompt-manager] 自动保存失败', error);
      setStatus('dirty');
      // 5 秒后重试一次，避免一次瞬时失败导致数据一直停留「有未保存修改」
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persist, 5000);
    }
  }, []);

  /** 编辑当前选中的 prompt：先更新本地状态，再防抖落盘。防抖窗口内的多次修改合并为一次草稿 */
  const updateActive = useCallback(
    (patch: Partial<Omit<PromptItem, 'id'>>) => {
      if (!activeId) return;
      const updatedAt = Date.now();
      setPrompts((prev) =>
        sortPrompts(
          prev.map((item) => (item.id === activeId ? { ...item, ...patch, updatedAt } : item)),
        ),
      );
      const previous = latestDraft.current;
      const mergedPatch =
        previous && previous.id === activeId
          ? { ...previous.patch, ...patch, updatedAt }
          : { ...patch, updatedAt };
      latestDraft.current = { id: activeId, patch: mergedPatch };
      setStatus('dirty');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persist, AUTOSAVE_DELAY_MS);
    },
    [activeId, persist],
  );

  const addPrompt = useCallback(
    async (folderId: string | null = null) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestDraft.current) await persist();
      const item = createPromptItem(Date.now(), folderId);
      const next = sortPrompts([item, ...prompts]);
      setPrompts(next);
      setActiveId(item.id);
      await savePrompts(next);
      setStatus('saved');
    },
    [persist, prompts],
  );

  /** 基于模板创建新 Prompt */
  const createFromTemplate = useCallback(
    async (template: TemplateItem) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestDraft.current) await persist();
      const item = createPromptFromTemplate(template);
      const next = sortPrompts([item, ...prompts]);
      setPrompts(next);
      setActiveId(item.id);
      await savePrompts(next);
      setStatus('saved');
    },
    [persist, prompts],
  );

  const removePrompt = useCallback(
    async (id: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const next = prompts.filter((item) => item.id !== id);
      setPrompts(next);
      if (activeId === id) setActiveId(null);
      await savePrompts(next);
      setStatus('idle');
    },
    [activeId, prompts],
  );

  const selectPrompt = useCallback((id: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setActiveId(id);
    setStatus('idle');
  }, []);

  const activePrompt = useMemo(
    () => prompts.find((item) => item.id === activeId) ?? null,
    [prompts, activeId],
  );

  /** 把当前选中的 Prompt 保存为模板 */
  const saveAsTemplate = useCallback(async () => {
    if (templateTimer.current) clearTimeout(templateTimer.current);
    if (!activePrompt?.content) return;
    const template = createTemplateFromPrompt(activePrompt);
    const next = [template, ...templates];
    templatesRef.current = next;
    setTemplates(next);
    await saveTemplates(next);
  }, [activePrompt, templates]);

  /** 编辑模板（名称/内容）：本地即时更新，防抖落盘 */
  const updateTemplate = useCallback(
    (id: string, patch: Partial<Omit<TemplateItem, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const next = templatesRef.current.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t,
      );
      templatesRef.current = next;
      setTemplates(next);
      if (templateTimer.current) clearTimeout(templateTimer.current);
      templateTimer.current = setTimeout(() => void saveTemplates(next), AUTOSAVE_DELAY_MS);
    },
    [],
  );

  /** 删除模板（不影响已创建的 Prompt） */
  const removeTemplate = useCallback(async (id: string) => {
    if (templateTimer.current) clearTimeout(templateTimer.current);
    const next = templatesRef.current.filter((t) => t.id !== id);
    templatesRef.current = next;
    setTemplates(next);
    await saveTemplates(next);
  }, []);

  /** 按 id 直接修改 prompt 元数据（置顶/使用统计）：先冲刷未保存草稿，再立即落盘 */
  const patchPrompt = useCallback(
    async (id: string, patch: Partial<PromptItem>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestDraft.current) await persist();
      const current = await loadPrompts();
      const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
      await savePrompts(next);
      // 本地按函数式更新，避免覆盖输入中的内容
      setPrompts((prev) =>
        sortPrompts(prev.map((item) => (item.id === id ? { ...item, ...patch } : item))),
      );
    },
    [persist],
  );

  /** 新建目录，返回新目录 id */
  const addFolder = useCallback(
    async (name: string): Promise<string> => {
      const folder = createFolderItem(name);
      const next = [...folders, folder];
      setFolders(next);
      await saveFolders(next);
      return folder.id;
    },
    [folders],
  );

  /** 重命名目录 */
  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const next = folders.map((f) =>
        f.id === id ? { ...f, name: name.trim() || f.name, updatedAt: Date.now() } : f,
      );
      setFolders(next);
      await saveFolders(next);
    },
    [folders],
  );

  /** 删除目录：其中的 Prompt 回到未分组，不随目录一起删除 */
  const removeFolder = useCallback(
    async (id: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestDraft.current) await persist();
      const nextFolders = folders.filter((f) => f.id !== id);
      setFolders(nextFolders);
      const current = await loadPrompts();
      const nextPrompts = current.map((p) => (p.folderId === id ? { ...p, folderId: null } : p));
      await Promise.all([saveFolders(nextFolders), savePrompts(nextPrompts)]);
      setPrompts((prev) =>
        sortPrompts(prev.map((p) => (p.folderId === id ? { ...p, folderId: null } : p))),
      );
    },
    [folders, persist],
  );

  /** 移动 Prompt 到目录（null = 未分组） */
  const movePrompt = useCallback(
    (id: string, folderId: string | null) => {
      void patchPrompt(id, { folderId });
    },
    [patchPrompt],
  );

  /** 置顶/取消置顶 */
  const togglePin = useCallback(
    (id: string) => {
      const item = prompts.find((p) => p.id === id);
      if (!item) return;
      void patchPrompt(id, { pinned: !item.pinned });
    },
    [patchPrompt, prompts],
  );

  /** 记录一次复制使用 */
  const recordCopy = useCallback(
    (id: string) => {
      const item = prompts.find((p) => p.id === id);
      if (!item) return;
      void patchPrompt(id, { copyCount: (item.copyCount ?? 0) + 1, lastUsedAt: Date.now() });
    },
    [patchPrompt, prompts],
  );

  return {
    prompts,
    templates,
    folders,
    activePrompt,
    loading,
    status,
    selectPrompt,
    updateActive,
    addPrompt,
    removePrompt,
    saveAsTemplate,
    createFromTemplate,
    removeTemplate,
    updateTemplate,
    togglePin,
    recordCopy,
    addFolder,
    renameFolder,
    removeFolder,
    movePrompt,
  };
}
