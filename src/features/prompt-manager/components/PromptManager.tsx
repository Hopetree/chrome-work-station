import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Copy,
  FileText,
  FolderInput,
  FolderPlus,
  GripVertical,
  LayoutTemplate,
  Loader2,
  Pencil,
  PenLine,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import CopyDialog from './CopyDialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Checkbox from '@/components/ui/Checkbox';
import EditorPane from './EditorPane';
import { usePromptManager } from '../hooks/usePromptManager';
import {
  extractVariables,
  filterPrompts,
  filterTemplates,
  formatCount,
  formatUpdatedAt,
  groupPromptsByFolder,
  groupTemplatesByFolder,
  hasChildFolders,
  sortFolders,
  sortPrompts,
  sortTemplates,
} from '../utils';
import type { FolderItem, PromptItem, SaveStatus, TemplateItem } from '../types';
import type { FolderSection } from '../utils';

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  dirty: '有未保存修改',
  saving: '保存中…',
  saved: '已保存',
};

const INDENT = '    ';

/** 未分组分组的折叠状态 key（与目录 id 同处一个集合） */
const UNGROUPED_KEY = '__ungrouped';

/** 侧边栏等窄容器（<560px）：切换为「列表 / 编辑器」单栏模式，避免两栏互相挤压 */
function useCompactLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 560px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 560px)');
    const onChange = () => setCompact(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return compact;
}

/** 在编辑器里恢复光标/选区（React 受控更新后执行） */
function restoreSelection(el: HTMLTextAreaElement, start: number, end: number) {
  requestAnimationFrame(() => el.setSelectionRange(start, end));
}

export default function PromptManager() {
  const {
    prompts,
    activePrompt,
    loading,
    status,
    selectPrompt,
    updateActive,
    addPrompt,
    removePrompt,
    templates,
    saveAsTemplate,
    createFromTemplate,
    removeTemplate,
    updateTemplate,
    togglePin,
    recordCopy,
    folders,
    addFolder,
    addTemplate,
    dropTemplate,
    moveTemplate,
    moveFolder,
    collapsedGroups,
    listCollapsed,
    setListCollapsed,
    wrapEnabled,
    setWrapEnabled,
    toggleGroupCollapsed,
    expandGroup,
    renameFolder,
    removeFolder,
    movePrompt,
    dropPrompt,
  } = usePromptManager();
  const compact = useCompactLayout();
  // 窄容器（侧边栏）默认先展示列表，选中后再进入编辑器
  const [forceList, setForceList] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 560px)').matches,
  );
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'prompts' | 'templates'>('prompts');
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [pendingCopy, setPendingCopy] = useState<{ id: string; content: string } | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [deletingPrompt, setDeletingPrompt] = useState<PromptItem | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateItem | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderItem | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  /** 正在哪个目录下新建子目录（null = 顶层） */
  const [addingFolderParent, setAddingFolderParent] = useState<string | null>(null);
  const [folderNameDraft, setFolderNameDraft] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; position: 'before' | 'after' } | null>(
    null,
  );
  const [folderDropKey, setFolderDropKey] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [folderOrderHint, setFolderOrderHint] = useState<{
    id: string;
    position: 'before' | 'after' | 'inside';
  } | null>(null);
  const [templateMoveMenuFor, setTemplateMoveMenuFor] = useState<string | null>(null);
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null);
  const [templateDropHint, setTemplateDropHint] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);
  const [templateDropKey, setTemplateDropKey] = useState<string | null>(null);

  const visible = useMemo(() => filterPrompts(prompts, query), [prompts, query]);
  const previewTemplate =
    view === 'templates' ? (templates.find((t) => t.id === previewTemplateId) ?? null) : null;
  const groupedPrompts = useMemo(() => groupPromptsByFolder(prompts, folders), [prompts, folders]);
  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const sortedTemplates = useMemo(() => sortTemplates(templates), [templates]);
  const groupedTemplates = useMemo(
    () => groupTemplatesByFolder(filterTemplates(sortedTemplates, query), folders),
    [sortedTemplates, folders, query],
  );

  /** 复制入口：有变量先弹填空面板，否则直接复制 */
  const requestCopy = (id: string, content: string) => {
    if (!content) return;
    if (extractVariables(content).length > 0) {
      setPendingCopy({ id, content });
    } else {
      void doCopy(id, content);
    }
  };

  const doCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('[prompt-manager] 复制失败', error);
      return; // 不计数、不提示已复制
    }
    recordCopy(id);
    setPendingCopy(null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyActive = () => {
    if (!activePrompt?.content) return;
    requestCopy(activePrompt.id, activePrompt.content);
  };

  /** 在指定父目录下新建子目录（null = 顶层） */
  const startAddFolder = (parentId: string | null = null) => {
    setFolderNameDraft('');
    setAddingFolderParent(parentId);
    setAddingFolder(true);
  };

  const submitNewFolder = async () => {
    const name = folderNameDraft.trim();
    const parentId = addingFolderParent;
    setAddingFolder(false);
    setFolderNameDraft('');
    setAddingFolderParent(null);
    if (name) await addFolder(name, parentId);
  };

  const cancelAddFolder = () => {
    setAddingFolder(false);
    setFolderNameDraft('');
    setAddingFolderParent(null);
  };

  const startRenameFolder = (folder: FolderItem) => {
    setEditingFolderId(folder.id);
    setFolderNameDraft(folder.name);
  };

  const submitRenameFolder = async () => {
    if (editingFolderId) await renameFolder(editingFolderId, folderNameDraft);
    setEditingFolderId(null);
    setFolderNameDraft('');
  };

  /** 在指定目录中新建模板，并展开该分组 */
  const createTemplateIn = async (folderId: string | null) => {
    expandGroup(folderId ?? UNGROUPED_KEY);
    const id = await addTemplate(folderId);
    setPreviewTemplateId(id);
  };

  /** 在指定目录中新建 Prompt，并展开该目录 */
  const createPromptIn = async (folderId: string | null) => {
    // 目标分组若处于折叠状态则展开，保证新建后立即可见
    expandGroup(folderId ?? UNGROUPED_KEY);
    await addPrompt(folderId);
  };

  const handleCardDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const clearDragState = () => {
    setDraggingId(null);
    setDropHint(null);
    setFolderDropKey(null);
    setDraggingFolderId(null);
    setFolderOrderHint(null);
    setDraggingTemplateId(null);
    setTemplateDropHint(null);
    setTemplateDropKey(null);
  };

  /** 落到某张卡片上：按鼠标在卡片上半/下半决定插到前面还是后面 */
  const handleCardDragOver = (e: React.DragEvent, item: PromptItem) => {
    if (draggingFolderId || draggingTemplateId || !draggingId || draggingId === item.id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const position: 'before' | 'after' =
      e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setFolderDropKey(null);
    setDropHint({ id: item.id, position });
  };

  const handleCardDrop = async (e: React.DragEvent, item: PromptItem) => {
    e.preventDefault();
    e.stopPropagation();
    const dragged = draggingId;
    const hint = dropHint;
    clearDragState();
    if (!dragged || dragged === item.id) return;
    const targetFolderId = item.folderId ?? null;
    // 锚点 = 插入位置后面那张卡片；落点在某卡片下半部时锚点为它的下一张（没有则追加到末尾）
    const displayed = sortPrompts(prompts.filter((p) => (p.folderId ?? null) === targetFolderId));
    const index = displayed.findIndex((p) => p.id === item.id);
    const anchor =
      hint?.id === item.id && hint.position === 'after'
        ? (displayed[index + 1]?.id ?? null)
        : item.id;
    await dropPrompt(dragged, targetFolderId, anchor);
  };

  const handleFolderDragStart = (e: React.DragEvent, id: string) => {
    if (draggingId || draggingTemplateId) return;
    setDraggingFolderId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  /**
   * 目录拖拽落点（按行的上/中/下区域）：
   * 顶层目录：上 25% 插到前面、下 25% 插到后面、中间 50% 变成它的子目录（最多两层）
   * 子目录：上半插前、下半插后（同层）
   */
  const handleFolderDragOver = (e: React.DragEvent, folder: FolderItem, depth: 1 | 2) => {
    if (!draggingFolderId || draggingFolderId === folder.id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const position: 'before' | 'after' | 'inside' =
      depth === 1
        ? ratio < 0.25
          ? 'before'
          : ratio > 0.75
            ? 'after'
            : 'inside'
        : ratio < 0.5
          ? 'before'
          : 'after';
    setFolderOrderHint({ id: folder.id, position });
  };

  const handleFolderDrop = async (e: React.DragEvent, folder: FolderItem, depth: 1 | 2) => {
    e.preventDefault();
    e.stopPropagation();
    const dragged = draggingFolderId;
    const hint = folderOrderHint;
    clearDragState();
    if (!dragged || dragged === folder.id) return;

    if (depth === 1 && hint?.id === folder.id && hint.position === 'inside') {
      await moveFolder(dragged, folder.id, null);
      return;
    }

    const parentId = folder.parentId ?? null;
    const levelIds = sortFolders(folders.filter((f) => (f.parentId ?? null) === parentId)).map(
      (f) => f.id,
    );
    const index = levelIds.indexOf(folder.id);
    const anchor =
      hint?.id === folder.id && hint.position === 'after'
        ? (levelIds[index + 1] ?? null)
        : folder.id;
    await moveFolder(dragged, parentId, anchor);
  };

  /** 落到分组的空白区域：追加到该分组末尾 */
  const handleSectionDragOver = (e: React.DragEvent, key: string) => {
    if (draggingFolderId || draggingTemplateId || !draggingId) return;
    e.preventDefault();
    setDropHint(null);
    setFolderDropKey(key);
  };

  const handleSectionDrop = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    const dragged = draggingId;
    clearDragState();
    if (!dragged) return;
    await dropPrompt(dragged, folderId, null);
  };

  const handleTemplateDragStart = (e: React.DragEvent, id: string) => {
    if (draggingId || draggingFolderId) return;
    setDraggingTemplateId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleTemplateDragOver = (e: React.DragEvent, item: TemplateItem) => {
    if (!draggingTemplateId || draggingTemplateId === item.id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setTemplateDropKey(null);
    setTemplateDropHint({
      id: item.id,
      position: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
    });
  };

  const handleTemplateDrop = async (e: React.DragEvent, item: TemplateItem) => {
    e.preventDefault();
    e.stopPropagation();
    const dragged = draggingTemplateId;
    const hint = templateDropHint;
    clearDragState();
    if (!dragged || dragged === item.id) return;
    const targetFolderId = item.folderId ?? null;
    const displayed = sortTemplates(
      templates.filter((t) => (t.folderId ?? null) === targetFolderId),
    );
    const index = displayed.findIndex((t) => t.id === item.id);
    const anchor =
      hint?.id === item.id && hint.position === 'after'
        ? (displayed[index + 1]?.id ?? null)
        : item.id;
    await dropTemplate(dragged, targetFolderId, anchor);
  };

  const handleTemplateSectionDragOver = (e: React.DragEvent, key: string) => {
    if (!draggingTemplateId) return;
    e.preventDefault();
    setTemplateDropHint(null);
    setTemplateDropKey(key);
  };

  const handleTemplateSectionDrop = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    const dragged = draggingTemplateId;
    clearDragState();
    if (!dragged) return;
    await dropTemplate(dragged, folderId, null);
  };

  const handleSaveAsTemplate = async () => {
    if (!activePrompt?.content) return;
    await saveAsTemplate();
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 1500);
  };

  const handleCreateFromTemplate = async (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setPreviewTemplateId(null);
    setView('prompts');
    await createFromTemplate(template);
  };

  const handleDeleteTemplate = async (id: string) => {
    const remaining = templates.filter((t) => t.id !== id);
    if (previewTemplateId === id) setPreviewTemplateId(remaining[0]?.id ?? null);
    await removeTemplate(id);
  };

  /** 切到模板视图时默认选中第一个模板，方便浏览 */
  const switchView = (next: 'prompts' | 'templates') => {
    setView(next);
    setForceList(true);
    if (next === 'templates' && !previewTemplateId) {
      setPreviewTemplateId(templates[0]?.id ?? null);
    }
  };

  const deleteActive = () => {
    if (!activePrompt) return;
    setDeletingPrompt(activePrompt);
  };

  /** Tab 键用于编辑缩进，不做焦点切换：Tab 增加缩进，Shift+Tab 减少缩进 */
  const handleEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { value, selectionStart: ss, selectionEnd: se } = el;
    const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
    const isBlock = ss !== se && value.slice(ss, se).includes('\n');

    if (e.shiftKey) {
      if (isBlock) {
        const block = value.slice(lineStart, se);
        const outdented = block.replace(/^ {1,4}/gm, '');
        updateActive({ content: value.slice(0, lineStart) + outdented + value.slice(se) });
        restoreSelection(el, lineStart, lineStart + outdented.length);
      } else {
        const lineEnd = value.indexOf('\n', ss) === -1 ? value.length : value.indexOf('\n', ss);
        const line = value.slice(lineStart, lineEnd);
        const trimmed = line.replace(/^ {1,4}/, '');
        if (trimmed.length === line.length) return;
        updateActive({ content: value.slice(0, lineStart) + trimmed + value.slice(lineEnd) });
        const cursor = Math.max(lineStart, ss - (line.length - trimmed.length));
        restoreSelection(el, cursor, cursor);
      }
    } else if (isBlock) {
      const block = value.slice(lineStart, se);
      const indented = block.replace(/^/gm, INDENT);
      updateActive({ content: value.slice(0, lineStart) + indented + value.slice(se) });
      restoreSelection(el, lineStart + INDENT.length, lineStart + indented.length);
    } else {
      updateActive({ content: value.slice(0, ss) + INDENT + value.slice(se) });
      restoreSelection(el, ss + INDENT.length, ss + INDENT.length);
    }
  };

  const renderTemplateCard = (item: TemplateItem, folderLabel?: string | null) => (
    <TemplateCardRow
      key={item.id}
      item={item}
      active={item.id === previewTemplateId}
      folders={folders}
      folderLabel={folderLabel}
      moveMenuOpen={templateMoveMenuFor === item.id}
      onToggleMoveMenu={setTemplateMoveMenuFor}
      onSelect={(id) => {
        setForceList(false);
        setPreviewTemplateId(id);
      }}
      onCreatePrompt={handleCreateFromTemplate}
      onRequestDelete={setDeletingTemplate}
      onMove={moveTemplate}
      dragging={draggingTemplateId === item.id}
      dropHint={templateDropHint?.id === item.id ? templateDropHint.position : null}
      onDragStart={handleTemplateDragStart}
      onDragOver={handleTemplateDragOver}
      onDrop={handleTemplateDrop}
      onDragEnd={clearDragState}
    />
  );

  const renderTemplateSection = (
    section: FolderSection<TemplateItem>,
    depth: 1 | 2,
  ): ReactElement => {
    const key = section.folder.id;
    const collapsed = collapsedGroups.has(key);
    return (
      <div
        key={key}
        onDragOver={(e) => handleTemplateSectionDragOver(e, key)}
        onDrop={(e) => void handleTemplateSectionDrop(e, section.folder.id)}
        className={`rounded-md transition ${
          templateDropKey === key ? 'bg-teal-50/70 ring-1 ring-inset ring-teal-300' : ''
        } ${depth === 2 ? 'ml-3' : ''}`}
      >
        <FolderHeader
          folder={section.folder}
          depth={depth}
          count={countInSection(section)}
          collapsed={collapsed}
          editing={editingFolderId === key}
          draftName={folderNameDraft}
          onDraftName={setFolderNameDraft}
          onToggle={() => toggleGroupCollapsed(key)}
          onAddPrompt={() => void createTemplateIn(section.folder.id)}
          onAddSubfolder={depth === 1 ? () => startAddFolder(key) : undefined}
          onStartRename={() => startRenameFolder(section.folder)}
          onDelete={() => setDeletingFolder(section.folder)}
          onSubmitName={() => void submitRenameFolder()}
          onCancelEdit={cancelEditFolder}
          dragging={draggingFolderId === key}
          dropHint={folderOrderHint?.id === key ? folderOrderHint.position : null}
          onDragStart={handleFolderDragStart}
          onDragOver={(e, folder) => handleFolderDragOver(e, folder, depth)}
          onDrop={(e, folder) => handleFolderDrop(e, folder, depth)}
          onDragEnd={clearDragState}
        />
        {!collapsed && (
          <>
            {addingFolder && addingFolderParent === key && renderNewFolderInput(section.folder.id)}
            {section.items.length > 0 ? (
              <ul className="space-y-1">{section.items.map((item) => renderTemplateCard(item))}</ul>
            ) : section.children.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-zinc-400">
                这个目录还是空的，点右上角 + 创建
              </p>
            ) : null}
            {section.children.length > 0 && (
              <div className="mt-1 space-y-1.5">
                {section.children.map((child) => renderTemplateSection(child, 2))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderUngroupedTemplates = (items: TemplateItem[]): ReactElement => {
    const collapsed = collapsedGroups.has(UNGROUPED_KEY);
    const showHeader = folders.length > 0;
    return (
      <div
        key={UNGROUPED_KEY}
        onDragOver={(e) => handleTemplateSectionDragOver(e, UNGROUPED_KEY)}
        onDrop={(e) => void handleTemplateSectionDrop(e, null)}
        className={`rounded-md transition ${
          templateDropKey === UNGROUPED_KEY ? 'bg-teal-50/70 ring-1 ring-inset ring-teal-300' : ''
        }`}
      >
        {showHeader && (
          <FolderHeader
            folder={null}
            depth={1}
            count={items.length}
            collapsed={collapsed}
            editing={false}
            draftName=""
            onDraftName={() => {}}
            onToggle={() => toggleGroupCollapsed(UNGROUPED_KEY)}
            onAddPrompt={() => void createTemplateIn(null)}
            onSubmitName={() => {}}
            onCancelEdit={() => {}}
            dragging={false}
            dropHint={null}
            onDragStart={() => {}}
            onDragOver={() => {}}
            onDrop={() => {}}
            onDragEnd={() => {}}
          />
        )}
        {!collapsed &&
          (items.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">
              {showHeader ? '没有未分组的模板' : '还没有模板'}
            </p>
          ) : (
            <ul className="space-y-1">{items.map((item) => renderTemplateCard(item))}</ul>
          ))}
      </div>
    );
  };

  const cancelEditFolder = () => {
    setEditingFolderId(null);
    setFolderNameDraft('');
  };

  /** 目录分组的条目数（含子目录里的条目） */
  const countInSection = <T,>(section: FolderSection<T>): number =>
    section.items.length + section.children.reduce((sum, child) => sum + countInSection(child), 0);

  const renderNewFolderInput = (parentId: string | null) => (
    <div
      className={`mb-1.5 flex items-center gap-1.5 rounded-md border border-teal-500 bg-white px-2 py-1 ${
        parentId ? 'ml-3' : ''
      }`}
    >
      <FolderPlus className="h-3.5 w-3.5 shrink-0 text-teal-600" />
      <input
        autoFocus
        value={folderNameDraft}
        onChange={(e) => setFolderNameDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submitNewFolder();
          if (e.key === 'Escape') cancelAddFolder();
        }}
        onBlur={() => void submitNewFolder()}
        placeholder={parentId ? '子目录名称，回车创建' : '目录名称，回车创建'}
        className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-800 outline-none placeholder:text-zinc-300"
      />
    </div>
  );

  const renderPromptCard = (item: PromptItem, folderLabel?: string | null) => (
    <PromptCardRow
      key={item.id}
      item={item}
      active={item.id === activePrompt?.id}
      folders={folders}
      folderLabel={folderLabel}
      moveMenuOpen={moveMenuFor === item.id}
      onToggleMoveMenu={setMoveMenuFor}
      onSelect={(id) => {
        setForceList(false);
        selectPrompt(id);
      }}
      onTogglePin={togglePin}
      onRequestCopy={requestCopy}
      onRequestDelete={setDeletingPrompt}
      onMove={movePrompt}
      dragging={draggingId === item.id}
      dropHint={dropHint?.id === item.id ? dropHint.position : null}
      onDragStart={handleCardDragStart}
      onDragOver={handleCardDragOver}
      onDrop={handleCardDrop}
      onDragEnd={clearDragState}
    />
  );

  const renderPromptSection = (section: FolderSection<PromptItem>, depth: 1 | 2): ReactElement => {
    const key = section.folder.id;
    const collapsed = collapsedGroups.has(key);
    return (
      <div
        key={key}
        onDragOver={(e) => handleSectionDragOver(e, key)}
        onDrop={(e) => void handleSectionDrop(e, section.folder.id)}
        className={`rounded-md transition ${
          folderDropKey === key ? 'bg-teal-50/70 ring-1 ring-inset ring-teal-300' : ''
        } ${depth === 2 ? 'ml-3' : ''}`}
      >
        <FolderHeader
          folder={section.folder}
          depth={depth}
          count={countInSection(section)}
          collapsed={collapsed}
          editing={editingFolderId === key}
          draftName={folderNameDraft}
          onDraftName={setFolderNameDraft}
          onToggle={() => toggleGroupCollapsed(key)}
          onAddPrompt={() => void createPromptIn(key)}
          onAddSubfolder={depth === 1 ? () => startAddFolder(key) : undefined}
          onStartRename={() => startRenameFolder(section.folder)}
          onDelete={() => setDeletingFolder(section.folder)}
          onSubmitName={() => void submitRenameFolder()}
          onCancelEdit={cancelEditFolder}
          dragging={draggingFolderId === key}
          dropHint={folderOrderHint?.id === key ? folderOrderHint.position : null}
          onDragStart={handleFolderDragStart}
          onDragOver={(e, folder) => handleFolderDragOver(e, folder, depth)}
          onDrop={(e, folder) => handleFolderDrop(e, folder, depth)}
          onDragEnd={clearDragState}
        />
        {!collapsed && (
          <>
            {addingFolder && addingFolderParent === key && renderNewFolderInput(section.folder.id)}
            {section.items.length > 0 ? (
              <ul className="space-y-1">{section.items.map((item) => renderPromptCard(item))}</ul>
            ) : section.children.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-zinc-400">
                这个目录还是空的，点右上角 + 创建
              </p>
            ) : null}
            {section.children.length > 0 && (
              <div className="mt-1 space-y-1.5">
                {section.children.map((child) => renderPromptSection(child, 2))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderUngroupedPrompts = (items: PromptItem[]): ReactElement => {
    const collapsed = collapsedGroups.has(UNGROUPED_KEY);
    const showHeader = folders.length > 0;
    return (
      <div
        key={UNGROUPED_KEY}
        onDragOver={(e) => handleSectionDragOver(e, UNGROUPED_KEY)}
        onDrop={(e) => void handleSectionDrop(e, null)}
        className={`rounded-md transition ${
          folderDropKey === UNGROUPED_KEY ? 'bg-teal-50/70 ring-1 ring-inset ring-teal-300' : ''
        }`}
      >
        {showHeader && (
          <FolderHeader
            folder={null}
            depth={1}
            count={items.length}
            collapsed={collapsed}
            editing={false}
            draftName=""
            onDraftName={() => {}}
            onToggle={() => toggleGroupCollapsed(UNGROUPED_KEY)}
            onAddPrompt={() => void createPromptIn(null)}
            onSubmitName={() => {}}
            onCancelEdit={() => {}}
            dragging={false}
            dropHint={null}
            onDragStart={() => {}}
            onDragOver={() => {}}
            onDrop={() => {}}
            onDragEnd={() => {}}
          />
        )}
        {!collapsed &&
          (items.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-zinc-400">
              {showHeader ? '没有未分组的 Prompt' : '还没有保存的 Prompt'}
            </p>
          ) : (
            <ul className="space-y-1">{items.map((item) => renderPromptCard(item))}</ul>
          ))}
      </div>
    );
  };

  // 窄容器（侧边栏）：列表与编辑器互斥，由选中状态 + 返回按钮切换
  // 宽屏：由「收起列表」开关人工控制，编辑器始终可见
  const editorVisible = compact ? !forceList && (!!activePrompt || !!previewTemplate) : true;
  const listVisible = compact ? !editorVisible : !listCollapsed;

  return (
    <div className="flex h-full min-h-0">
      {/* 列表栏：宽屏固定 336px；侧边栏等窄容器下单栏切换（列表 ⇄ 编辑器） */}
      {listVisible && (
        <aside
          className={`flex shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 ${
            compact ? 'w-full border-r-0' : 'w-[336px]'
          }`}
        >
          <div className="px-3 pt-3">
            <div
              className="flex rounded-lg bg-zinc-200/70 p-0.5"
              role="tablist"
              aria-label="列表切换"
            >
              <button
                role="tab"
                aria-selected={view === 'prompts'}
                onClick={() => switchView('prompts')}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  view === 'prompts'
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                Prompt {prompts.length}
              </button>
              <button
                role="tab"
                aria-selected={view === 'templates'}
                onClick={() => switchView('templates')}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  view === 'templates'
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <LayoutTemplate className="h-3 w-3" />
                模板 {templates.length}
              </button>
              {!compact && (
                <button
                  onClick={() => setListCollapsed(true)}
                  title="收起列表"
                  aria-label="收起列表"
                  className="shrink-0 rounded-md px-1.5 text-zinc-500 transition hover:bg-white/70 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {view === 'prompts' ? (
            <>
              <div className="flex items-center gap-2 px-3 pt-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索标题或正文"
                    className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-xs text-zinc-700 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <button
                  onClick={() => startAddFolder(null)}
                  title="新建目录"
                  className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 shadow-sm transition hover:border-teal-600 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void createPromptIn(null)}
                  title="新建 Prompt（未分组）"
                  className="rounded-md bg-teal-700 p-1.5 text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3 pt-1">
                {addingFolder && addingFolderParent === null && renderNewFolderInput(null)}

                {loading ? (
                  <p className="px-2 py-4 text-xs text-zinc-400">加载中…</p>
                ) : query ? (
                  visible.length === 0 ? (
                    <p className="px-2 py-4 text-xs text-zinc-400">没有匹配的 Prompt</p>
                  ) : (
                    <ul className="space-y-1">
                      {visible.map((item) =>
                        renderPromptCard(
                          item,
                          item.folderId ? (folderNameById.get(item.folderId) ?? null) : null,
                        ),
                      )}
                    </ul>
                  )
                ) : prompts.length === 0 && folders.length === 0 ? (
                  <EmptyList hasPrompts={false} />
                ) : (
                  <div className="space-y-2">
                    {groupedPrompts.sections.map((section) => renderPromptSection(section, 1))}
                    {renderUngroupedPrompts(groupedPrompts.ungrouped)}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 pt-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索模板名称或内容"
                    className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-xs text-zinc-700 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <button
                  onClick={() => startAddFolder(null)}
                  title="新建目录"
                  className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 shadow-sm transition hover:border-teal-600 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void createTemplateIn(null)}
                  title="新建模板（未分组）"
                  className="rounded-md bg-teal-700 p-1.5 text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3 pt-1">
                {addingFolder && addingFolderParent === null && renderNewFolderInput(null)}

                {templates.length === 0 && folders.length === 0 ? (
                  <div className="px-2 py-4 text-xs leading-5 text-zinc-400">
                    还没有模板。
                    <br />
                    选中一条 Prompt 后点编辑区下方的「存为模板」，或点上方 + 直接新建空白模板。
                  </div>
                ) : query &&
                  groupedTemplates.sections.length === 0 &&
                  groupedTemplates.ungrouped.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-zinc-400">没有匹配的模板</p>
                ) : (
                  <div className="space-y-2">
                    {groupedTemplates.sections.map((section) => renderTemplateSection(section, 1))}
                    {renderUngroupedTemplates(groupedTemplates.ungrouped)}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      )}

      {/* 列表收起时的窄边条：保证任何时候都能重新展开 */}
      {!compact && listCollapsed && (
        <div className="flex w-9 shrink-0 flex-col items-center border-r border-zinc-200 bg-zinc-50 py-2">
          <button
            onClick={() => setListCollapsed(false)}
            title="展开列表"
            aria-label="展开列表"
            className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition hover:bg-white hover:text-teal-700 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 编辑区：模板视图下直接编辑模板 */}
      {editorVisible && (
        <section className="flex min-w-0 flex-1 flex-col bg-white">
          {previewTemplate ? (
            <TemplateEditor
              template={previewTemplate}
              onChange={(patch) => updateTemplate(previewTemplate.id, patch)}
              onCreate={() => handleCreateFromTemplate(previewTemplate.id)}
              onDelete={() => handleDeleteTemplate(previewTemplate.id)}
              wrapEnabled={wrapEnabled}
              setWrapEnabled={setWrapEnabled}
              onBack={compact ? () => setForceList(true) : undefined}
            />
          ) : activePrompt ? (
            <>
              <div className="flex items-center gap-3 border-b border-zinc-100 px-5 pb-3 pt-4">
                {compact && (
                  <button
                    onClick={() => setForceList(true)}
                    title="返回列表"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <input
                  value={activePrompt.title}
                  onChange={(e) => updateActive({ title: e.target.value })}
                  placeholder="Prompt 标题"
                  className="min-w-0 flex-1 border-b border-transparent bg-transparent text-base font-semibold text-zinc-900 outline-none transition placeholder:text-zinc-300 hover:border-zinc-200 focus:border-teal-500"
                />
                <button
                  onClick={() => togglePin(activePrompt.id)}
                  title={activePrompt.pinned ? '取消置顶' : '置顶'}
                  className={`rounded p-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                    activePrompt.pinned
                      ? 'text-amber-400 hover:bg-amber-50'
                      : 'text-zinc-300 hover:bg-amber-50 hover:text-amber-500'
                  }`}
                >
                  <Star className={`h-4 w-4 ${activePrompt.pinned ? 'fill-amber-400' : ''}`} />
                </button>
                <SaveStatusBadge status={status} />
              </div>

              <div className="flex items-center justify-between px-5 pt-2 text-[11px] text-zinc-400">
                <span className="font-mono">
                  {formatCount(activePrompt.content)}
                  {activePrompt.copyCount ? ` · 复制 ${activePrompt.copyCount} 次` : ''}
                </span>
                <span className="flex items-center gap-3">
                  <label
                    htmlFor="editor-wrap-prompt"
                    className="flex cursor-pointer select-none items-center gap-1.5 transition hover:text-zinc-600"
                  >
                    <Checkbox
                      id="editor-wrap-prompt"
                      checked={wrapEnabled}
                      onCheckedChange={setWrapEnabled}
                    />
                    自动换行
                  </label>
                  <span className="flex items-center gap-1">
                    <PenLine className="h-3 w-3" />
                    Tab 缩进 · 修改后自动保存
                  </span>
                </span>
              </div>

              <EditorPane
                value={activePrompt.content}
                onChange={(content) => updateActive({ content })}
                onKeyDown={handleEditorKeyDown}
                placeholder="在这里编写 Prompt，可以自由换行…"
                wrapEnabled={wrapEnabled}
              />

              <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={!activePrompt.content}
                  title="把当前内容保存为模板，之后可基于它新建"
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                    templateSaved
                      ? 'border-teal-600 bg-teal-50 text-teal-700'
                      : 'border-zinc-200 text-zinc-600 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-200 disabled:hover:bg-transparent disabled:hover:text-zinc-600'
                  }`}
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  {templateSaved ? '已存为模板' : '存为模板'}
                </button>
                <button
                  onClick={deleteActive}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
                <button
                  onClick={copyActive}
                  className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs text-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                    copied ? 'bg-teal-900' : 'bg-teal-700 hover:bg-teal-800'
                  }`}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? '已复制' : '复制全文'}
                </button>
              </div>
            </>
          ) : (
            <EmptyEditor onAdd={() => void createPromptIn(null)} />
          )}
        </section>
      )}

      {/* 复制填空面板 */}
      {pendingCopy && (
        <CopyDialog
          content={pendingCopy.content}
          values={varValues}
          onValuesChange={setVarValues}
          onCopy={(filled) => void doCopy(pendingCopy.id, filled)}
          onClose={() => setPendingCopy(null)}
        />
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={!!deletingPrompt}
        onOpenChange={(o) => !o && setDeletingPrompt(null)}
        title="删除 Prompt"
        description={`「${deletingPrompt?.title || '未命名 Prompt'}」将被永久删除，该操作不可撤销。`}
        confirmText="删除"
        onConfirm={() => {
          if (deletingPrompt) void removePrompt(deletingPrompt.id);
          setDeletingPrompt(null);
        }}
      />
      <ConfirmDialog
        open={!!deletingFolder}
        onOpenChange={(o) => !o && setDeletingFolder(null)}
        title="删除目录"
        description={`「${deletingFolder?.name ?? ''}」${
          deletingFolder && hasChildFolders(folders, deletingFolder.id) ? '及其子目录' : ''
        }将被删除，目录里的 Prompt 与模板会回到未分组，不会被删除。`}
        confirmText="删除目录"
        onConfirm={() => {
          if (deletingFolder) void removeFolder(deletingFolder.id);
          setDeletingFolder(null);
        }}
      />
      <ConfirmDialog
        open={!!deletingTemplate}
        onOpenChange={(o) => !o && setDeletingTemplate(null)}
        title="删除模板"
        description={`「${deletingTemplate?.name ?? ''}」将被删除，已创建的 Prompt 不受影响。`}
        confirmText="删除"
        onConfirm={() => {
          if (deletingTemplate) void handleDeleteTemplate(deletingTemplate.id);
          setDeletingTemplate(null);
        }}
      />
    </div>
  );
}

/** 目录行：折叠开关、名称（可重命名）、数量、悬停操作（新建/重命名/删除） */
function FolderHeader({
  folder,
  depth = 1,
  count,
  collapsed,
  editing,
  draftName,
  onDraftName,
  onToggle,
  onAddPrompt,
  onAddSubfolder,
  onStartRename,
  onDelete,
  onSubmitName,
  onCancelEdit,
  dragging,
  dropHint,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  folder: FolderItem | null;
  /** 1 = 顶层，2 = 子目录（子目录不能再放子目录） */
  depth?: 1 | 2;
  count: number;
  collapsed: boolean;
  editing: boolean;
  draftName: string;
  onDraftName: (name: string) => void;
  onToggle: () => void;
  onAddPrompt: () => void;
  /** 新建子目录（仅顶层目录提供） */
  onAddSubfolder?: () => void;
  onStartRename?: () => void;
  onDelete?: () => void;
  onSubmitName: () => void;
  onCancelEdit: () => void;
  dragging: boolean;
  dropHint: 'before' | 'after' | 'inside' | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, folder: FolderItem) => void;
  onDrop: (e: React.DragEvent, folder: FolderItem) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`group/folder relative flex items-center gap-0.5 rounded-md py-1 pl-1 pr-1 transition ${
        dropHint === 'inside'
          ? 'bg-teal-100/70 ring-1 ring-inset ring-teal-400'
          : 'hover:bg-zinc-200/50'
      } ${dragging ? 'opacity-40' : ''}`}
      onDragOver={(e) => {
        if (folder) onDragOver(e, folder);
      }}
      onDrop={(e) => {
        if (folder) void onDrop(e, folder);
      }}
    >
      {dropHint === 'before' && (
        <span className="pointer-events-none absolute -top-0.5 left-1 right-1 h-0.5 rounded bg-teal-600" />
      )}
      {dropHint === 'after' && (
        <span className="pointer-events-none absolute -bottom-0.5 left-1 right-1 h-0.5 rounded bg-teal-600" />
      )}
      {folder && (
        <span
          draggable
          onDragStart={(e) => onDragStart(e, folder.id)}
          onDragEnd={onDragEnd}
          title="拖动调整目录顺序"
          className="shrink-0 cursor-grab rounded text-zinc-300 opacity-0 transition group-hover/folder:opacity-100 focus-visible:opacity-100 hover:bg-zinc-100 hover:text-zinc-500"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      {!folder && <span className="w-3.5 shrink-0" aria-hidden />}
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? '展开' : '折叠'}
        className="grid h-4 w-4 shrink-0 place-items-center rounded text-zinc-400 transition hover:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>
      {editing ? (
        <input
          autoFocus
          value={draftName}
          onChange={(e) => onDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmitName();
            if (e.key === 'Escape') onCancelEdit();
          }}
          onBlur={onSubmitName}
          className="h-5 min-w-0 flex-1 rounded border border-teal-500 bg-white px-1 text-[12px] text-zinc-800 outline-none"
        />
      ) : (
        <button
          onClick={onToggle}
          className="min-w-0 flex-1 truncate pl-0.5 text-left text-[12px] font-medium text-zinc-600"
        >
          {folder?.name ?? '未分组'}
        </button>
      )}
      <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">
        {count}
      </span>
      <span className="flex w-[92px] shrink-0 items-center justify-end gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover/folder:opacity-100">
        {folder && depth === 1 && onAddSubfolder && (
          <button
            onClick={onAddSubfolder}
            title="新建子目录"
            className="rounded p-1 text-zinc-400 transition hover:bg-teal-50 hover:text-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onAddPrompt}
          title={folder ? `在「${folder.name}」中新建 Prompt` : '新建 Prompt（未分组）'}
          className="rounded p-1 text-zinc-400 transition hover:bg-teal-50 hover:text-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {folder && onStartRename && (
          <button
            onClick={onStartRename}
            title="重命名目录"
            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {folder && onDelete && (
          <button
            onClick={onDelete}
            title="删除目录"
            className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}

/** 模板卡片：悬停操作（基于模板新建/移动到目录/删除），支持拖拽排序与跨目录 */
function TemplateCardRow({
  item,
  active,
  folders,
  folderLabel,
  moveMenuOpen,
  onToggleMoveMenu,
  onSelect,
  onCreatePrompt,
  onRequestDelete,
  onMove,
  dragging,
  dropHint,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  item: TemplateItem;
  active: boolean;
  folders: FolderItem[];
  folderLabel?: string | null;
  moveMenuOpen: boolean;
  onToggleMoveMenu: (id: string | null) => void;
  onSelect: (id: string) => void;
  onCreatePrompt: (id: string) => void;
  onRequestDelete: (item: TemplateItem) => void;
  onMove: (id: string, folderId: string | null) => void;
  dragging: boolean;
  dropHint: 'before' | 'after' | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, item: TemplateItem) => void;
  onDrop: (e: React.DragEvent, item: TemplateItem) => void;
  onDragEnd: () => void;
}) {
  const currentFolderId = item.folderId ?? null;
  return (
    <li
      className={`group relative ${dragging ? 'opacity-40' : ''}`}
      onDragOver={(e) => onDragOver(e, item)}
      onDrop={(e) => void onDrop(e, item)}
    >
      {dropHint === 'before' && (
        <span className="pointer-events-none absolute -top-0.5 left-1 right-1 h-0.5 rounded bg-teal-600" />
      )}
      {dropHint === 'after' && (
        <span className="pointer-events-none absolute -bottom-0.5 left-1 right-1 h-0.5 rounded bg-teal-600" />
      )}
      <button
        onClick={() => onSelect(item.id)}
        title="点击编辑模板"
        className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 pr-24 text-left transition ${
          active
            ? 'bg-white shadow-sm ring-1 ring-inset ring-teal-600'
            : 'hover:bg-white hover:shadow-sm'
        }`}
      >
        <span
          className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 ${
            active
              ? 'bg-teal-600 text-white ring-teal-600'
              : 'bg-teal-50 text-teal-600 ring-teal-100'
          }`}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[13px] font-medium ${
              active ? 'text-teal-900' : 'text-zinc-800'
            }`}
          >
            {item.name || '未命名模板'}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
            {item.content ? item.content.split('\n')[0] : '（空）'}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
            {folderLabel ? `${folderLabel} · ` : ''}
            存于 {formatUpdatedAt(item.updatedAt ?? item.createdAt)}
          </span>
        </span>
      </button>

      <span
        draggable
        onDragStart={(e) => onDragStart(e, item.id)}
        onDragEnd={onDragEnd}
        title="拖动调整顺序或分组"
        className="absolute left-1 top-2 hidden cursor-grab rounded p-1 text-zinc-300 group-hover:block hover:bg-zinc-100 hover:text-zinc-500"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      <span className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
        <button
          onClick={() => onCreatePrompt(item.id)}
          title="基于此模板新建 Prompt"
          className="rounded p-1 text-zinc-400 transition hover:bg-teal-50 hover:text-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onToggleMoveMenu(moveMenuOpen ? null : item.id)}
          title="移动到目录"
          className={`rounded p-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
            moveMenuOpen
              ? 'bg-teal-50 text-teal-600'
              : 'text-zinc-400 hover:bg-teal-50 hover:text-teal-600'
          }`}
        >
          <FolderInput className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onRequestDelete(item)}
          title="删除模板"
          className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>

      {moveMenuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => onToggleMoveMenu(null)} />
          <div className="absolute right-2 top-9 z-20 w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium text-zinc-400">移动到目录</p>
            <button
              onClick={() => onMove(item.id, null)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition hover:bg-teal-50 ${
                currentFolderId === null ? 'text-teal-800' : 'text-zinc-700'
              }`}
            >
              <span className="truncate">未分组</span>
              {currentFolderId === null && <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => onMove(item.id, f.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition hover:bg-teal-50 ${
                  currentFolderId === f.id ? 'text-teal-800' : 'text-zinc-700'
                }`}
              >
                <span className="truncate">{f.parentId ? `└ ${f.name}` : f.name}</span>
                {currentFolderId === f.id && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </li>
  );
}

/** Prompt 卡片：悬停操作（置顶/复制/移动到目录/删除），可显示所在目录名 */
function PromptCardRow({
  item,
  active,
  folders,
  folderLabel,
  moveMenuOpen,
  onToggleMoveMenu,
  onSelect,
  onTogglePin,
  onRequestCopy,
  onRequestDelete,
  onMove,
  dragging,
  dropHint,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  item: PromptItem;
  active: boolean;
  folders: FolderItem[];
  folderLabel?: string | null;
  moveMenuOpen: boolean;
  onToggleMoveMenu: (id: string | null) => void;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRequestCopy: (id: string, content: string) => void;
  onRequestDelete: (item: PromptItem) => void;
  onMove: (id: string, folderId: string | null) => void;
  dragging: boolean;
  dropHint: 'before' | 'after' | 'inside' | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, item: PromptItem) => void;
  onDrop: (e: React.DragEvent, item: PromptItem) => void;
  onDragEnd: () => void;
}) {
  const currentFolderId = item.folderId ?? null;
  return (
    <li
      className={`group relative ${dragging ? 'opacity-40' : ''}`}
      onDragOver={(e) => onDragOver(e, item)}
      onDrop={(e) => void onDrop(e, item)}
    >
      {dropHint === 'before' && (
        <span className="pointer-events-none absolute -top-0.5 left-1 right-1 h-0.5 rounded bg-teal-600" />
      )}
      {dropHint === 'after' && (
        <span className="pointer-events-none absolute -bottom-0.5 left-1 right-1 h-0.5 rounded bg-teal-600" />
      )}
      <button
        onClick={() => onSelect(item.id)}
        className={`w-full rounded-md py-2 pl-7 pr-24 text-left transition ${
          active
            ? 'bg-white shadow-sm ring-1 ring-inset ring-teal-600'
            : 'hover:bg-white hover:shadow-sm'
        }`}
      >
        <span
          className={`flex items-center gap-1 text-[13px] font-medium ${
            active ? 'text-teal-900' : 'text-zinc-800'
          }`}
        >
          {item.pinned && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
          <span className="truncate">{item.title || '未命名 Prompt'}</span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
          {item.content ? item.content.split('\n')[0] : '（空）'}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
          {folderLabel ? `${folderLabel} · ` : ''}
          {item.copyCount ? `${item.copyCount} 次使用 · ` : ''}
          {formatUpdatedAt(item.updatedAt)}
        </span>
      </button>
      <span
        draggable
        onDragStart={(e) => onDragStart(e, item.id)}
        onDragEnd={onDragEnd}
        title="拖动调整顺序或分组"
        className="absolute left-1 top-1.5 hidden cursor-grab rounded p-1 text-zinc-300 group-hover:block hover:bg-zinc-100 hover:text-zinc-500"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <span className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
        <button
          onClick={() => onTogglePin(item.id)}
          title={item.pinned ? '取消置顶' : '置顶'}
          className={`rounded p-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
            item.pinned
              ? 'text-amber-400 hover:bg-amber-50'
              : 'text-zinc-400 hover:bg-amber-50 hover:text-amber-500'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${item.pinned ? 'fill-amber-400' : ''}`} />
        </button>
        <button
          onClick={() => onRequestCopy(item.id, item.content)}
          title="复制全文"
          className="rounded p-1 text-zinc-400 transition hover:bg-teal-50 hover:text-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onToggleMoveMenu(moveMenuOpen ? null : item.id)}
          title="移动到目录"
          className={`rounded p-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
            moveMenuOpen
              ? 'bg-teal-50 text-teal-600'
              : 'text-zinc-400 hover:bg-teal-50 hover:text-teal-600'
          }`}
        >
          <FolderInput className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onRequestDelete(item)}
          title="删除 Prompt"
          className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>

      {moveMenuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => onToggleMoveMenu(null)} />
          <div className="absolute right-2 top-9 z-20 w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium text-zinc-400">移动到目录</p>
            <button
              onClick={() => onMove(item.id, null)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition hover:bg-teal-50 ${
                currentFolderId === null ? 'text-teal-800' : 'text-zinc-700'
              }`}
            >
              <span className="truncate">未分组</span>
              {currentFolderId === null && <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => onMove(item.id, f.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition hover:bg-teal-50 ${
                  currentFolderId === f.id ? 'text-teal-800' : 'text-zinc-700'
                }`}
              >
                <span className="truncate">{f.name}</span>
                {currentFolderId === f.id && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                )}
              </button>
            ))}
            {folders.length === 0 && (
              <p className="px-2.5 pb-2 pt-1 text-[11px] leading-4 text-zinc-400">
                还没有目录，先在上方创建
              </p>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span
      className={`flex shrink-0 items-center gap-1 text-[11px] ${
        status === 'saved'
          ? 'text-teal-700'
          : status === 'saving'
            ? 'text-zinc-400'
            : 'text-amber-600'
      }`}
      role="status"
    >
      {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'saved' && <Check className="h-3 w-3" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function EmptyList({ hasPrompts }: { hasPrompts: boolean }) {
  return (
    <p className="px-2 py-4 text-xs text-zinc-400">
      {hasPrompts ? '没有匹配的 Prompt' : '还没有保存的 Prompt'}
    </p>
  );
}

function EmptyEditor({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <button
        onClick={onAdd}
        className="group flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 px-12 py-10 text-zinc-400 transition hover:border-teal-500 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        <FileText className="h-8 w-8" />
        <span className="text-sm">新建一个 Prompt</span>
        <span className="max-w-56 text-center text-xs leading-5">
          编写常用的 Prompt 并自动保存，随时回来修改或一键复制
        </span>
      </button>
    </div>
  );
}

/** 模板编辑面板：名称与内容可直接修改，防抖自动保存 */
function TemplateEditor({
  template,
  onChange,
  onCreate,
  onDelete,
  wrapEnabled,
  setWrapEnabled,
  onBack,
}: {
  template: TemplateItem;
  onChange: (patch: Partial<Omit<TemplateItem, 'id' | 'createdAt'>>) => void;
  onCreate: () => void;
  onDelete: () => void;
  wrapEnabled: boolean;
  setWrapEnabled: (enabled: boolean) => void;
  /** 窄容器下显示返回列表按钮 */
  onBack?: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-zinc-100 px-5 pb-3 pt-4">
        {onBack && (
          <button
            onClick={onBack}
            title="返回列表"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-600 ring-1 ring-teal-100">
          <LayoutTemplate className="h-3.5 w-3.5" />
        </span>
        <input
          value={template.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="模板名称"
          className="min-w-0 flex-1 border-b border-transparent bg-transparent text-base font-semibold text-zinc-900 outline-none transition placeholder:text-zinc-300 hover:border-zinc-200 focus:border-teal-500"
        />
        <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-100">
          模板
        </span>
      </div>

      <div className="flex items-center justify-between px-5 pt-2 text-[11px] text-zinc-400">
        <span className="font-mono">{formatCount(template.content)}</span>
        <span className="flex items-center gap-3">
          <label
            htmlFor="editor-wrap-template"
            className="flex cursor-pointer select-none items-center gap-1.5 transition hover:text-zinc-600"
          >
            <Checkbox
              id="editor-wrap-template"
              checked={wrapEnabled}
              onCheckedChange={setWrapEnabled}
            />
            自动换行
          </label>
          <span className="flex items-center gap-1">
            <PenLine className="h-3 w-3" />
            修改后自动保存
          </span>
        </span>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 bg-zinc-50/60">
        <EditorPane
          value={template.content}
          onChange={(content) => onChange({ content })}
          placeholder="模板内容，基于它新建时会带入这里的内容"
          wrapEnabled={wrapEnabled}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除模板
        </button>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-1.5 text-xs text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <Plus className="h-3.5 w-3.5" />
          基于模板新建
        </button>
      </div>
    </>
  );
}
