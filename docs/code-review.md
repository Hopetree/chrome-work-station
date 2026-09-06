# Code Review 报告

- 评审范围：`c739bad..f35fd20`（项目初始化至今的全部代码提交）
- 评审日期：2026-09-06
- 状态标记：⏳ 待处理 · ✅ 已修复 · ⏭️ 跳过

## 问题总览

| # | 优先级 | 文件 | 位置 | 问题概述 | 状态 |
|---|--------|------|------|----------|------|
| 1 | 🟡 建议改进 | src/features/prompt-manager/components/PromptManager.tsx | L338、L585 | 模板名称清空后列表卡片显示空白标题 | ⏳ 待处理 |
| 2 | 🟡 建议改进 | src/features/prompt-manager/components/PromptManager.tsx | L84-90 | 剪贴板写入失败（权限/非聚焦）时未捕获，出现未处理 rejection，用户无感知 | ⏳ 待处理 |
| 3 | 🟡 建议改进 | src/features/prompt-manager/hooks/usePromptManager.ts | L61-76 | persist 成功后未清空 latestDraft，过期草稿可能被后续 persist 重复应用 | ⏳ 待处理 |
| 4 | 🟡 建议改进 | src/features/prompt-manager/hooks/usePromptManager.ts | L66-78 | 自动保存失败后停留在 dirty 状态，无重试机会（直到下一次编辑） | ⏳ 待处理 |
| 5 | 🟢 可选优化 | src/components/ui/Select.tsx | L134 | 下拉面板固定向下展开，贴近视口底部时溢出 | ⏳ 待处理 |
| 6 | 🟢 可选优化 | src/entrypoints/options/App.tsx | L43 | revokeObjectURL 紧跟 click() 同步调用，Safari 下可能中断下载 | ⏳ 待处理 |

## 问题详情

### #1 模板名称清空后显示空白标题

**现状代码**（PromptManager.tsx L338，模板列表项；L585 为编辑输入框）：

```tsx
<span className="block truncate text-[13px] font-medium text-zinc-800">{t.name}</span>
```

**修复为**：

```tsx
<span className="block truncate text-[13px] font-medium text-zinc-800">
  {t.name || '未命名模板'}
</span>
```

**修复说明**：模板名称输入框允许清空（编辑中间态合法），但列表展示需要兜底；同时 `createPromptFromTemplate`（utils.ts）的 `title: template.name` 建议改为 `template.name.trim() || '未命名模板'`，避免空白名传播到新建 Prompt。

### #2 剪贴板写入失败未捕获

**现状代码**（PromptManager.tsx L84-90）：

```tsx
const doCopy = async (id: string, text: string) => {
  await navigator.clipboard.writeText(text);
  recordCopy(id);
  setPendingCopy(null);
  setCopied(true);
  setTimeout(() => setCopied(false), 1500);
};
```

**修复为**：

```tsx
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
```

**修复说明**：`clipboard.writeText` 在扩展页面失焦或权限被拒时会 reject，当前产生未处理的 promise rejection 且「已复制」提示不出现但面板仍关闭（`setPendingCopy(null)` 在 writeText 之后但整个函数抛出后都不会执行——实际是调用方 `void doCopy(...)` 吞掉了 rejection）。捕获后失败静默返回，后续可加失败提示。

### #3 persist 成功后过期草稿未清空

**现状代码**（usePromptManager.ts L61-76）：

```tsx
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
    setPrompts(sortPrompts(next));
    setStatus('saved');
  } catch (error) {
```

**修复为**：

```tsx
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
    setPrompts(sortPrompts(next));
    setStatus('saved');
  } catch (error) {
```

**修复说明**：`patchPrompt`（置顶/计数）会冲刷草稿触发 persist，但 persist 成功后草稿仍保留；后续任何再次调用 persist 的路径（如另一次元数据操作）会拿旧草稿再应用一次——patch 本身幂等，但会把 `updatedAt` 回拨到旧值，影响排序。用引用比对（`latestDraft.current === draft`）确保只在草稿未被更新时清空。

### #4 自动保存失败后无重试

**现状代码**（usePromptManager.ts L76-78）：

```tsx
  } catch (error) {
    console.error('[prompt-manager] 自动保存失败', error);
    setStatus('dirty');
  }
```

**修复为**：

```tsx
  } catch (error) {
    console.error('[prompt-manager] 自动保存失败', error);
    setStatus('dirty');
    // 5 秒后重试一次，避免一次瞬时失败导致数据一直停留「有未保存修改」
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 5000);
  }
```

**修复说明**：storage 瞬时失败（如扩展正在重载）后状态永远停在 dirty，用户下一次编辑才会隐式重试。失败后定时重试一次即可自愈；注意与 `updateActive` 共用 `saveTimer`，新编辑会覆盖重试，行为正确。

### #5 下拉面板在视口底部溢出

**现状代码**（Select.tsx L134）：

```tsx
className="panel-anim absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
```

**修复为**：

```tsx
// 组件内先测量空间再决定方向：
const [dropUp, setDropUp] = useState(false);
const openPanel = () => {
  /* ...原有逻辑... */
  const rect = rootRef.current?.getBoundingClientRect();
  setDropUp(!!rect && window.innerHeight - rect.bottom < 240 && rect.top > 240);
  setOpen(true);
};
// 面板：
<ul
  role="listbox"
  className={`panel-anim absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg ${
    dropUp ? 'bottom-full mb-1' : 'top-full'
  }`}
>
```

**修复说明**：当前面板固定 `top-full` 向下展开；设置页下拉位于页面上半区暂无实际问题，但工作台底部若复用会溢出。复用前按空间自适应即可。

### #6 导出下载的 revokeObjectURL 时机

**现状代码**（options/App.tsx L40-44）：

```tsx
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `chrome-work-station-backup-${new Date().toISOString().slice(0, 10)}.json`;
link.click();
URL.revokeObjectURL(url);
```

**修复为**：

```tsx
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `chrome-work-station-backup-${new Date().toISOString().slice(0, 10)}.json`;
link.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

**修复说明**：Chrome 中同步 revoke 通常可行，但规范上下载尚未开始读取时立即 revoke 在部分浏览器（Safari/旧内核）会中断下载。延迟 1 秒无副作用。
