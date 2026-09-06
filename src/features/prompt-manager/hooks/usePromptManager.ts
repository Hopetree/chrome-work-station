import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PromptItem, SaveStatus, TemplateItem } from '../types';
import { loadPrompts, loadTemplates, savePrompts, saveTemplates } from '../storage';
import {
  createPromptFromTemplate,
  createPromptItem,
  createTemplateFromPrompt,
  sortByUpdatedAtDesc,
} from '../utils';

const AUTOSAVE_DELAY_MS = 600;

/**
 * Prompt 管理器的状态中枢：列表加载、选中、防抖自动保存。
 * 保存状态通过 SaveStatus 暴露给 UI 展示「保存中…/已保存」。
 */
export function usePromptManager() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
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
      const first = sortByUpdatedAtDesc(items)[0];
      if (first) setActiveId(first.id);
      setLoading(false);
    });
    loadTemplates().then((items) => {
      if (!cancelled) setTemplates(items);
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
      setPrompts(sortByUpdatedAtDesc(next));
      setStatus('saved');
    } catch (error) {
      console.error('[prompt-manager] 自动保存失败', error);
      setStatus('dirty');
    }
  }, []);

  /** 编辑当前选中的 prompt：先更新本地状态，再防抖落盘。防抖窗口内的多次修改合并为一次草稿 */
  const updateActive = useCallback(
    (patch: Partial<Omit<PromptItem, 'id'>>) => {
      if (!activeId) return;
      const updatedAt = Date.now();
      setPrompts((prev) =>
        sortByUpdatedAtDesc(
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

  const addPrompt = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (latestDraft.current) await persist();
    const item = createPromptItem();
    const next = sortByUpdatedAtDesc([item, ...prompts]);
    setPrompts(next);
    setActiveId(item.id);
    await savePrompts(next);
    setStatus('saved');
  }, [persist, prompts]);

  /** 基于模板创建新 Prompt */
  const createFromTemplate = useCallback(
    async (template: TemplateItem) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestDraft.current) await persist();
      const item = createPromptFromTemplate(template);
      const next = sortByUpdatedAtDesc([item, ...prompts]);
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
    (id: string, patch: Partial<Omit<TemplateItem, 'id' | 'createdAt'>>) => {
      const next = templatesRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t));
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

  return {
    prompts,
    templates,
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
  };
}
