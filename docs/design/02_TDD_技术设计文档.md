# 02 TDD — 技术设计文档

## 1. 技术栈

| 层 | 选型 | 版本/说明 |
|----|------|-----------|
| 框架 | WXT | **0.19.x（锁定）**，MV3；导入路径 `wxt/storage`、`wxt/browser`（0.20 起改为 `wxt/utils/*`，升级需全量改导入） |
| UI | React + TypeScript | React 18，strict 模式 |
| 样式 | Tailwind CSS | 青绿（teal-600/700）+ 冷灰（zinc）设计语言；动效类 `panel-anim`（下拉）/`modal-anim`（居中模态）定义在 globals.css |
| 图标 | lucide-react | 唯一图标来源，禁止混用 emoji |
| 弹窗原语 | Radix UI | `react-dialog`、`react-alert-dialog`，视觉全定制 |
| 测试 | Vitest + jsdom | 纯函数单测；组件未纳入测试 |
| 工程 | commitlint + husky + lint-staged | Conventional Commits 强制；CI 等价检查：type-check/lint/test/build |

## 2. 架构

```
entrypoints（薄壳） ──渲染──> features（功能实现，自包含）
                                │
registry.ts <──注册─────────────┘
     │
     └──> popup / workbench / options 读取注册表渲染菜单与内容
```

- **FeatureModule 契约**（`src/features/types.ts`）：`{ id, name, description, icon, component, hidden? }`
- **注册表**（`src/features/registry.ts`）：`features` 数组 + `visibleFeatures` + `getFeature(id)`；新功能加一行即接入 popup 菜单、工作台侧边栏
- **深链**：`workbench.html?feature=<id>`；WorkbenchApp 初始化解析 + `history.replaceState` 同步
- **布局**：`components/layout/WorkbenchLayout.tsx`（侧边栏 + 内容区），功能组件在 `h-full min-h-0` 容器内自行布局

## 3. 数据层

存储介质：`chrome.storage.local`（经 WXT storage，键自动加 `local:` 前缀）。

| 键（去掉前缀） | Schema |
|----------------|--------|
| `prompt-manager:prompts` | `PromptItem[]`：`{ id, title, content, createdAt, updatedAt, folderId?, order?, pinned?, copyCount?, lastUsedAt? }`（folderId 为空/指向已删目录 = 未分组；order 为拖拽产生的手动顺序） |
| `prompt-manager:folders` | `FolderItem[]`：`{ id, name, createdAt, updatedAt?, order?, parentId? }`，最多两层；Prompt 与模板共用同一套目录 |
| `prompt-manager:collapsedGroups` | `string[]`：折叠的分组 key（目录 id / `__ungrouped`）；UI 状态但同样持久化，刷新后保留；删除目录时清理对应 key |
| `prompt-manager:editorWrap` | `boolean`：编辑器显示模式（自动换行），缺省 true；Prompt 编辑区与模板编辑区共用 |
| `prompt-manager:listCollapsed` | `boolean`：列表栏手动收起（宽屏），缺省 false；收起后左侧常驻 36px 窄边条提供展开入口，避免无选中条目时无法恢复 |
| `prompt-manager:templates` | `TemplateItem[]`：`{ id, name, content, createdAt, updatedAt?, folderId?, order? }` |
| `settings:defaultFeature` | `string`（feature id） |

**兼容性规则**：新增字段一律 optional，读取用 `??` 回退（模板时间 `updatedAt ?? createdAt`）；不做迁移脚本。

每个功能模块内有独立 `storage.ts` 封装读写（load/save/模板读写），其他模块不得直接操作他模块的键。

## 4. 关键流程设计

### 4.1 编辑自动保存（usePromptManager）

1. `updateActive(patch)`：本地立即更新（置顶优先排序）→ 防抖草稿 `latestDraft`（同 id 合并 patch，切 id 重置）→ 停止输入 1500ms 后 `persist()`
2. `persist()`：从 storage 读最新 → 合并草稿 → 写回 → **仅重排本地状态**（不整体替换，避免覆盖输入中的内容导致光标跳尾）→ 状态机 `dirty → saving → saved`（失败回 dirty、5 秒后自动重试一次）
3. 元数据操作（`patchPrompt`：置顶/复制计数）：先 `clearTimeout` + 冲刷草稿，再读-改-写，避免相互覆盖
4. 卸载时取消定时器；模板卸载时立即冲刷未落盘修改

### 4.2 变量复制

`extractVariables(content)`：正则 `\{\{\s*([^{}\n]+?)\s*\}\}`，按出现顺序去重。
复制入口统一走 `requestCopy(id, content)`：有变量 → `CopyDialog`（Radix Dialog）填空（空值视为未填，保留原文）→ `doCopy` 写剪贴板 + `recordCopy`；无变量直接复制。

### 4.3 排序与拖拽

- 排序：`sortPrompts` = 置顶优先 → `order` 升序 → `updatedAt` 降序（未拖过的排在已手动排序的之后）
- 落点计算：`computeDropOrder(prompts, draggedId, targetFolderId, beforeId)` 纯函数，返回重排后的完整列表（目标分组内全部成员重排 order；beforeId=null 追加末尾）
- 交互：卡片左侧拖拽把手（HTML5 draggable），卡片上/下半区决定插入位置并渲染指示线；分组容器可接收拖放（高亮提示），落空组即追加
- 目录排序：`computeFolderDropOrder(folders, draggedId, targetParentId, beforeId)` 同构实现；顶层目录行的上/中/下三区分别对应「插前 / 嵌套为子目录 / 插后」，子目录行只支持前后插入；`bottomFolderOrderIn` 让新建目录落到同层末尾；未分组是虚拟分组，不参与排序且恒在最后
- 层级约束：`canNestUnder`（目标须为顶层）+ `hasChildFolders`（被拖目录不能已有子目录），违反时退化为放到顶层；`folderSubtreeIds` 支撑级联删除
- 侧边栏：`sidepanel` 入口（`side_panel.default_path`，由 WXT 从入口目录生成），background 设置 `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`；容器宽度 < 560px 时 PromptManager 切换单栏（`useCompactLayout` + 列表/编辑器互斥渲染 + 返回按钮）
- 两类拖拽用独立状态（draggingId / draggingFolderId）并在对方的处理函数中先行返回，互不干扰
- 新建 Prompt 与菜单「移动到目录」用 `topOrderIn` 插入目标分组顶部

### 4.4 编辑器与行号（components/EditorPane.tsx）

Prompt 编辑区与模板编辑区共用同一组件，两种显示模式（`editorWrap`）：

- **不换行**：`wrap="off"` + `whitespace-pre`，每逻辑行渲染一个行号
- **自动换行**：`wrap="soft"` + `whitespace-pre-wrap break-words`；行号必须仍是「一逻辑行一个」——折行出的续行不显示行号。实现：隐藏镜像元素（同字体/同内边距/同宽度）承载同样文本，由浏览器真实排版后读取每个逻辑行的 `offsetTop`，行号据此绝对定位；镜像宽度在测量时同步为 textarea 的 `clientWidth`，容器高度取 `textarea.scrollHeight`，保证滚动同步精确。测量在 rAF 中合并、并由 ResizeObserver 覆盖宽度变化

### 4.5 数据备份（lib/backup.ts）

`mergeBackup(localPrompts, localTemplates, localFolders, parsed)`：按 id 对齐，时间戳新者胜（`updatedAt ?? createdAt`，早期数据缺 `updatedAt` 时回退到 `createdAt`）；畸形条目跳过；payload 缺 prompts/templates 抛错。

**历史数据兼容规则**（新增字段时的义务）：
- 条目校验只强制 `id`/`content`/`createdAt`，`updatedAt` 与所有后加字段一律可选 —— 早期模板没有 `updatedAt`，过严的校验会让它们被静默丢弃
- 旧备份没有 `folders` 字段时按空目录处理
- 旧字段原样导出（不注入新字段），未改动的条目在读写后保持字节一致
- 纯 UI 偏好（`collapsedGroups`、`editorWrap`）不进入备份，导入后回到默认值

设置页导出为 Blob 下载，导入用隐藏 file input。

### 4.4 通用控件

- `ui/Select.tsx`：定制下拉（键盘 ↑↓/Enter/Esc、外点关闭、焦点还原、`panel-anim`）
- `ui/ConfirmDialog.tsx`：Radix AlertDialog 定制确认框（danger/primary 两种确认色）
- `ui/Checkbox.tsx`：Radix Checkbox 定制勾选框（青绿选中态，配 label 使用）
- 规则：原生 `select`/`confirm`/`alert` 在 UI 中零容忍

## 5. 构建与开发环境

- WXT 配置：`srcDir: 'src'`、`publicDir: '../public'`（模板布局决定，勿改）、`outDirTemplate: 'chrome-work-station'`
- 图标：`public/icons/icon.svg` → `npm run generate-icons` 生成 16/48/128 PNG（sharp）
- 预览服务器 `scripts/preview-server.mjs`：静态服务 dist/ 并注入 chrome.* shim（**必须提供 `runtime.id`**，否则 WXT polyfill 抛 "only loaded in a browser extension"；storage shim 用 sessionStorage 兜底刷新保留）
- CI（.github/workflows/ci.yml）跑与本地相同的四项检查；release 由 git tag 触发
- `.npmrc` 锁定 npmmirror，lockfile 的 resolved URL 跟随该镜像
