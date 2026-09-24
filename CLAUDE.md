# Chrome 工作站 — AI 开发指南

> 本文件面向 AI 开发助手（与 AGENTS.md 内容一致）。开始任何开发前请完整阅读本文件与 `docs/design/` 下的设计文档。

## 项目是什么

Chrome 浏览器插件「Chrome 工作站」：**面向开发者的多功能效率工具合集**。每个功能有独立界面与数据，按模块隔离开发。基于 **WXT 0.19 + React 18 + TypeScript + Tailwind CSS**，图标用 lucide-react。

当前功能：Prompt 管理（多行编辑/自动保存/变量填空复制/置顶/使用统计/模板/搜索）+ 数据备份（设置页导入导出）。

## 常用命令

```bash
npm run dev          # 开发模式（热重载），加载 dist/chrome-work-station
npm run build        # 生产构建
npm run test         # Vitest 单测
npm run type-check   # tsc --noEmit
npm run lint         # ESLint
npm run format       # Prettier
npm run preview      # 本地 HTTP 预览 dist/（内存模拟 chrome.*，无需加载扩展）
npm run zip          # 发布打包
```

提交前本地必须全绿：`type-check`、`lint`、`test`、`build`。提交信息遵循 Conventional Commits（commitlint 强制校验）。

## 目录结构与强约定

```
src/
├── entrypoints/          # WXT 入口：sidepanel（侧边栏，点击图标直开）/ workbench（整页工作台）/ options（设置）/ background.ts
├── features/             # 功能模块（核心）
│   ├── types.ts          # FeatureModule 契约
│   ├── registry.ts       # 功能注册表
│   └── prompt-manager/   # 自包含功能模块（components/hooks/storage/utils/types）
├── components/ui/        # 通用定制控件（Select、ConfirmDialog）
├── components/layout/    # 共享布局
├── lib/                  # 跨功能工具（settings、backup）
└── styles/globals.css
```

### 必须遵守的约定（违反=返工）

1. **新功能必须走功能注册表**：在 `src/features/<id>/` 自包含实现，`index.ts` 导出 `FeatureModule`（id、名称、图标、主组件），在 `src/features/registry.ts` 注册一行。popup 菜单、工作台侧边栏、设置页自动接入。禁止把功能逻辑写进 entrypoints。
2. **禁止浏览器原生控件默认外观**：原生 `select`、`checkbox`、`window.confirm`、`alert` 一律不用。下拉用 `components/ui/Select.tsx`，确认框用 `components/ui/ConfirmDialog.tsx`，勾选框用 `components/ui/Checkbox.tsx`（均由 Radix UI 原语 + 定制视觉实现）。新通用控件放 `components/ui/`。
3. **WXT 0.19 导入路径**：`import { storage } from 'wxt/storage'`、`import { browser } from 'wxt/browser'`（0.20+ 才是 `wxt/utils/*`，不要升级写法）。`defineBackground`/`browser` 在 entrypoints 里可用自动导入。
4. **配置陷阱**：
   - `wxt.config.ts` 里 `srcDir: 'src'`、`publicDir: '../public'` 是刻意的（模板布局），勿改
   - `options_ui` 的 `open_in_tab` 只能通过 `options/index.html` 的 `<meta name="manifest.openInTab">` 配置，WXT 会覆盖 manifest 里的手写配置
   - **没有 popup 入口时 WXT 不会生成 `action` 字段 → 工具栏没有图标**；需在 manifest 里显式写 `action: { default_title }`（本项目即如此，图标点击由 background 的 `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` 打开侧边栏）
   - sidePanel 需要 Chrome 114+
5. **数据全部走 WXT storage**（见下方键名），UI 文案用中文，新逻辑配 Vitest 单测（纯函数放 `utils.ts` 便于测试，测试文件与源码同目录 `*.test.ts`）。

## 数据存储键（chrome.storage.local）

| 键 | 内容 |
|----|------|
| `prompt-manager:prompts` | `PromptItem[]`：id/title/content/createdAt/updatedAt + folderId?/order?/pinned/copyCount/lastUsedAt |
| `prompt-manager:folders` | `FolderItem[]`：id/name/createdAt/updatedAt?/order?/parentId?（**最多两层**：子目录不能再有子目录） |
| `prompt-manager:collapsedGroups` | `string[]`：已折叠的分组 key（目录 id 或 `__ungrouped`），刷新后恢复折叠状态 |
| `prompt-manager:editorWrap` | `boolean`：编辑器是否自动换行（缺省 true；false 时不换行、横向滚动） |
| `prompt-manager:listCollapsed` | `boolean`：宽屏下列表栏是否手动收起（缺省 false）。收起时左侧保留窄边条用于展开；窄容器走单栏切换，不受此项影响 |
| `prompt-manager:lastActive` | `{ promptId?, templateId?, view? }`：上次会话状态，侧边栏重开时恢复到同一张卡片与视图 |
| `prompt-manager:templates` | `TemplateItem[]`：id/name/content/createdAt/updatedAt? + folderId?/order?（与 Prompt 共用目录，同样支持分组与拖动） |
| `settings:defaultFeature` | 工作台默认功能 id |

WXT storage 会给键自动加 `local:` 前缀。旧数据缺新字段是常态，读取时用 `??` 回退（如 `updatedAt ?? createdAt`），禁止要求迁移脚本。

## 关键机制速查

- **功能深链**：`workbench.html?feature=<id>`，workbench/App.tsx 解析并 `history.replaceState` 同步
- **自动保存**：编辑停止后 1500ms 防抖合并落盘（`usePromptManager` 的 latestDraft）；**persist/patchPrompt 只重排本地状态、绝不用存储值整体替换**（否则会覆盖输入中的内容并把光标顶到末尾）；置顶/计数/移动目录等元数据走 `patchPrompt`（先冲刷草稿再写，防覆盖）
- **入口形态**：点工具栏图标 → 侧边栏（`sidepanel`，容器宽度 < 460px 时切「列表 ⇄ 编辑器」单栏，并自动回到上次查看的卡片）；整页工作台仍由侧边栏 header 的「在完整工作台中打开」进入
- **目录**：`groupByFolder` 统一给 Prompt/模板分组（两层：顶层 → 子目录），未分组殿后（可折叠）；`folderSubtreeIds` 级联删除（含子目录），其中的条目回到未分组；层级约束由 `computeFolderDropOrder` 保证
- **手动排序**：拖动产生 `order` —— 卡片（`computeDropOrder`）与目录（`computeFolderDropOrder`）各自独立；卡片排序 = 置顶 → order → 最近修改，新建/菜单移动插入分组顶部（`topOrderIn`）；目录排序 = order → createdAt，新建目录追加末尾（`bottomFolderOrderIn`）；未分组恒在最后且不可拖动
- **拖拽隔离**：`draggingId`（卡片）与 `draggingFolderId`（目录）互斥，各自的 dragover/drop 处理先判断对方状态，避免交叉触发
- **变量复制**：内容含 `{{变量}}` 时 CopyDialog 填空（`extractVariables`/`fillVariables`），空白值视为未填写保留原文
- **编辑器（EditorPane）**：Prompt 编辑区与模板编辑区共用；行号规则为「一个逻辑行一个行号」——自动换行时用隐藏镜像元素测量真实折行位置（绝对定位行号），折行续行不显示行号；不换行时为普通逐行渲染。改编辑器务必保持两种模式下行号与内容对齐
- **数据备份**：`lib/backup.ts` 的 `mergeBackup` 按 id 合并、时间戳新者胜；**校验必须容忍缺省字段**（只强制 id/content/createdAt，updatedAt 等后加字段可选），否则早期数据会被静默丢弃；UI 偏好不进备份
- **预览服务器**：`scripts/preview-server.mjs` 注入 chrome.* shim（runtime.id 必须存在，否则 WXT polyfill 抛错），storage 用 sessionStorage 兜底持久化

## 版本发布

git tag = 扩展版本 = package.json version = 构建产物 manifest.version（tag 驱动，勿手改版本号）。

**发布顺序（必须按此执行，否则本地插件版本与 tag 不一致）**：

```bash
npm version patch|minor|major -m "chore(release): v%s"   # 1. 升版本（package.json + 提交 + 打标签）
npm run build                                            # 2. 重新构建，刷新 dist 里的 manifest.version
npm run test && npm run type-check && npm run lint       # 3. 三项检查（tag 会触发 CI 构建）
git push origin main && git push origin v<版本>           # 4. 推送分支与标签（--follow-tags 不推轻量标签，显式推更稳）
```

**关键点**：`npm version` 只改 package.json，扩展的 manifest 版本来自构建 —— **必须先 build 再推送**，否则推出去时 `dist/`（以及浏览器里加载的扩展）仍是旧版本号。推送后需在 `chrome://extensions` 点「重新加载」才能看到新版本。

GitHub Actions 由 `v*` 标签触发自动构建发布；lockfile 基于国内 npmmirror 生成（.npmrc），CI 拉取失败时重生成 lockfile。
