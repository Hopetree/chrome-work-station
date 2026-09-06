import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PromptItem, SaveStatus } from '../types';
import { loadPrompts, savePrompts } from '../storage';
import { createPromptItem, sortByUpdatedAtDesc } from '../utils';

const AUTOSAVE_DELAY_MS = 600;

/**
 * Prompt 管理器的状态中枢：列表加载、选中、防抖自动保存。
 * 保存状态通过 SaveStatus 暴露给 UI 展示「保存中…/已保存」。
 */
export function usePromptManager() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraft = useRef<{ id: string; patch: Partial<PromptItem> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPrompts().then((items) => {
      if (cancelled) return;
      setPrompts(items);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
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
    } catch {
      setStatus('dirty');
    }
  }, []);

  /** 编辑当前选中的 prompt：先更新本地状态，再防抖落盘 */
  const updateActive = useCallback(
    (patch: Partial<Omit<PromptItem, 'id'>>) => {
      if (!activeId) return;
      const updatedAt = Date.now();
      setPrompts((prev) =>
        sortByUpdatedAtDesc(
          prev.map((item) => (item.id === activeId ? { ...item, ...patch, updatedAt } : item)),
        ),
      );
      latestDraft.current = { id: activeId, patch: { ...patch, updatedAt } };
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

  return {
    prompts,
    activePrompt,
    loading,
    status,
    selectPrompt,
    updateActive,
    addPrompt,
    removePrompt,
  };
}
