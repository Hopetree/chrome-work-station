import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FolderItem, PromptItem, SaveStatus, TemplateItem } from '../types';
import type { LastActiveState } from '../storage';
import {
  loadCollapsedGroups,
  loadEditorWrap,
  loadLastActive,
  loadListCollapsed,
  loadFolders,
  loadPrompts,
  loadTemplates,
  saveCollapsedGroups,
  saveEditorWrap,
  saveLastActive,
  saveListCollapsed,
  saveFolders,
  savePrompts,
  saveTemplates,
} from '../storage';
import {
  bottomFolderOrderIn,
  computeDropOrder,
  computeFolderDropOrder,
  computeTemplateDropOrder,
  createFolderItem,
  createPromptFromTemplate,
  createPromptItem,
  createTemplateFromPrompt,
  folderSubtreeIds,
  sortPrompts,
  sortTemplates,
  topOrderIn,
  topTemplateOrderIn,
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
  /** 折叠的分组 key（目录 id 或未分组哨兵），持久化以在刷新后保留 */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  /** 编辑器是否自动换行（默认开启） */
  const [wrapEnabled, setWrapEnabledState] = useState(true);
  /** 列表栏是否手动收起（默认展开） */
  const [listCollapsed, setListCollapsedState] = useState(false);
  /** 上次会话状态（重新打开时恢复同一张卡片/视图） */
  const [lastActive, setLastActiveState] = useState<LastActiveState>({});
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
    Promise.all([
      loadPrompts(),
      loadTemplates(),
      loadFolders(),
      loadCollapsedGroups(),
      loadEditorWrap(),
      loadListCollapsed(),
      loadLastActive(),
    ]).then(([items, templateItems, folderItems, collapsed, wrap, collapsedList, last]) => {
      if (cancelled) return;
      setPrompts(items);
      setTemplates(templateItems);
      setFolders(folderItems);
      setCollapsedGroups(new Set(collapsed));
      setWrapEnabledState(wrap);
      setListCollapsedState(collapsedList);
      setLastActiveState(last);
      // 恢复上次查看的卡片；不存在（已删除）时回退到最近编辑的一条
      const restored = last.promptId ? items.find((item) => item.id === last.promptId) : undefined;
      const first = restored ?? sortPrompts(items)[0];
      if (first) setActiveId(first.id);
      setLoading(false);
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

  /** 更新并持久化上次会话状态（视图 / 选中的模板由 UI 传入） */
  const updateLastActive = useCallback((patch: LastActiveState) => {
    setLastActiveState((prev) => {
      const next = { ...prev, ...patch };
      void saveLastActive(next);
      return next;
    });
  }, []);

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
      const item = {
        ...createPromptItem(Date.now(), folderId),
        order: topOrderIn(prompts, folderId),
      };
      const next = sortPrompts([item, ...prompts]);
      setPrompts(next);
      setActiveId(item.id);
      updateLastActive({ promptId: item.id });
      await savePrompts(next);
      setStatus('saved');
    },
    [persist, prompts, updateLastActive],
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
      updateLastActive({ promptId: item.id });
      await savePrompts(next);
      setStatus('saved');
    },
    [persist, prompts, updateLastActive],
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

  const selectPrompt = useCallback(
    (id: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setActiveId(id);
      setStatus('idle');
      updateLastActive({ promptId: id });
    },
    [updateLastActive],
  );

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
    async (name: string, parentId: string | null = null): Promise<string> => {
      const folder = createFolderItem(
        name,
        Date.now(),
        bottomFolderOrderIn(folders, parentId),
        parentId,
      );
      const next = [...folders, folder];
      setFolders(next);
      await saveFolders(next);
      return folder.id;
    },
    [folders],
  );

  /** 手动收起/展开列表栏（持久化） */
  const setListCollapsed = useCallback((collapsed: boolean) => {
    setListCollapsedState(collapsed);
    void saveListCollapsed(collapsed);
  }, []);

  /** 切换编辑器自动换行（持久化） */
  const setWrapEnabled = useCallback((enabled: boolean) => {
    setWrapEnabledState(enabled);
    void saveEditorWrap(enabled);
  }, []);

  /** 折叠/展开某个分组（持久化） */
  const toggleGroupCollapsed = useCallback(
    (key: string) => {
      const next = new Set(collapsedGroups);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setCollapsedGroups(next);
      void saveCollapsedGroups([...next]);
    },
    [collapsedGroups],
  );

  /** 展开指定分组（新建 Prompt 时确保可见） */
  const expandGroup = useCallback(
    (key: string) => {
      if (!collapsedGroups.has(key)) return;
      const next = new Set(collapsedGroups);
      next.delete(key);
      setCollapsedGroups(next);
      void saveCollapsedGroups([...next]);
    },
    [collapsedGroups],
  );

  /**
   * 拖拽移动目录：放到 targetParentId 层级、beforeId 之前（null = 该层末尾）。
   * 层级约束由 computeFolderDropOrder 保证（最多两层）。
   */
  const moveFolder = useCallback(
    async (draggedId: string, targetParentId: string | null, beforeId: string | null) => {
      const next = computeFolderDropOrder(folders, draggedId, targetParentId, beforeId);
      setFolders(next);
      await saveFolders(next);
    },
    [folders],
  );

  /** 新建空模板（可指定目录） */
  const addTemplate = useCallback(async (folderId: string | null = null) => {
    if (templateTimer.current) clearTimeout(templateTimer.current);
    const now = Date.now();
    const template = {
      id: createFolderItem('x', now).id,
      name: '未命名模板',
      content: '',
      createdAt: now,
      updatedAt: now,
      folderId,
      order: topTemplateOrderIn(templatesRef.current, folderId),
    };
    const next = sortTemplates([template, ...templatesRef.current]);
    templatesRef.current = next;
    setTemplates(next);
    await saveTemplates(next);
    return template.id;
  }, []);

  /** 拖拽模板：放进目标分组并排在 beforeId 之前（null = 末尾；prepend 时置顶） */
  const dropTemplate = useCallback(
    async (
      draggedId: string,
      targetFolderId: string | null,
      beforeId: string | null,
      prepend = false,
    ) => {
      if (templateTimer.current) clearTimeout(templateTimer.current);
      const siblings = sortTemplates(
        templatesRef.current.filter(
          (t) => t.id !== draggedId && (t.folderId ?? null) === targetFolderId,
        ),
      );
      const anchor = prepend ? (siblings[0]?.id ?? null) : beforeId;
      const next = computeTemplateDropOrder(
        templatesRef.current,
        draggedId,
        targetFolderId,
        anchor,
      );
      const sorted = sortTemplates(next);
      templatesRef.current = sorted;
      setTemplates(sorted);
      await saveTemplates(sorted);
    },
    [],
  );

  /** 菜单移动模板到目录（插入目标分组顶部） */
  const moveTemplate = useCallback(
    (id: string, folderId: string | null) => {
      void dropTemplate(id, folderId, null, true);
    },
    [dropTemplate],
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

  /** 删除目录（含子目录）：其中的 Prompt 与模板回到未分组，条目不随目录删除 */
  const removeFolder = useCallback(
    async (id: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestDraft.current) await persist();
      const removed = new Set(folderSubtreeIds(folders, id));
      const nextFolders = folders.filter((f) => !removed.has(f.id));
      setFolders(nextFolders);

      // 一并清掉被删目录的折叠记录，避免残留无用状态
      if ([...removed].some((key) => collapsedGroups.has(key))) {
        const nextCollapsed = new Set([...collapsedGroups].filter((key) => !removed.has(key)));
        setCollapsedGroups(nextCollapsed);
        void saveCollapsedGroups([...nextCollapsed]);
      }

      const current = await loadPrompts();
      const nextPrompts = current.map((p) =>
        p.folderId && removed.has(p.folderId) ? { ...p, folderId: null } : p,
      );
      const nextTemplates = templatesRef.current.map((t) =>
        t.folderId && removed.has(t.folderId) ? { ...t, folderId: null } : t,
      );
      templatesRef.current = nextTemplates;
      setTemplates(nextTemplates);
      await Promise.all([
        saveFolders(nextFolders),
        savePrompts(nextPrompts),
        saveTemplates(nextTemplates),
      ]);
      setPrompts((prev) =>
        sortPrompts(
          prev.map((p) => (p.folderId && removed.has(p.folderId) ? { ...p, folderId: null } : p)),
        ),
      );
    },
    [collapsedGroups, folders, persist],
  );

  /**
   * 拖拽落点：把 Prompt 放进目标分组并排在 beforeId 之前（beforeId=null 时追加到末尾；
   * prepend=true 时插入到顶部）。同时重算该分组的 order。
   */
  const dropPrompt = useCallback(
    async (
      draggedId: string,
      targetFolderId: string | null,
      beforeId: string | null,
      prepend = false,
    ) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestDraft.current) await persist();
      const current = await loadPrompts();
      const siblings = sortPrompts(
        current.filter((p) => p.id !== draggedId && (p.folderId ?? null) === targetFolderId),
      );
      const anchor = prepend ? (siblings[0]?.id ?? null) : beforeId;
      const next = computeDropOrder(current, draggedId, targetFolderId, anchor);
      await savePrompts(next);
      setPrompts(sortPrompts(next));
    },
    [persist],
  );

  /** 移动 Prompt 到目录（null = 未分组），插入到目标分组顶部 */
  const movePrompt = useCallback(
    (id: string, folderId: string | null) => {
      void dropPrompt(id, folderId, null, true);
    },
    [dropPrompt],
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
    addTemplate,
    dropTemplate,
    moveTemplate,
    collapsedGroups,
    lastActive,
    updateLastActive,
    listCollapsed,
    setListCollapsed,
    wrapEnabled,
    setWrapEnabled,
    toggleGroupCollapsed,
    expandGroup,
    moveFolder,
    renameFolder,
    removeFolder,
    movePrompt,
    dropPrompt,
  };
}
