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
├── entrypoints/          # WXT 入口：popup（启动菜单）/ workbench（工作台）/ options（设置）/ background.ts
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
2. **禁止浏览器原生控件默认外观**：原生 `select`、`window.confirm`、`alert` 一律不用。下拉用 `components/ui/Select.tsx`，确认框用 `components/ui/ConfirmDialog.tsx`（Radix UI 原语 + 定制视觉）。新通用控件放 `components/ui/`。
3. **WXT 0.19 导入路径**：`import { storage } from 'wxt/storage'`、`import { browser } from 'wxt/browser'`（0.20+ 才是 `wxt/utils/*`，不要升级写法）。`defineBackground`/`browser` 在 entrypoints 里可用自动导入。
4. **配置陷阱**：`wxt.config.ts` 里 `srcDir: 'src'`、`publicDir: '../public'` 是刻意的（模板布局），勿改；`options_ui` 的 `open_in_tab` 只能通过 `options/index.html` 的 `<meta name="manifest.openInTab">` 配置，WXT 会覆盖 manifest 里的手写配置。
5. **数据全部走 WXT storage**（见下方键名），UI 文案用中文，新逻辑配 Vitest 单测（纯函数放 `utils.ts` 便于测试，测试文件与源码同目录 `*.test.ts`）。

## 数据存储键（chrome.storage.local）

| 键 | 内容 |
|----|------|
| `prompt-manager:prompts` | `PromptItem[]`：id/title/content/createdAt/updatedAt + pinned/copyCount/lastUsedAt |
| `prompt-manager:templates` | `TemplateItem[]`：id/name/content/createdAt/updatedAt? |
| `settings:defaultFeature` | 工作台默认功能 id |

WXT storage 会给键自动加 `local:` 前缀。旧数据缺新字段是常态，读取时用 `??` 回退（如 `updatedAt ?? createdAt`），禁止要求迁移脚本。

## 关键机制速查

- **功能深链**：`workbench.html?feature=<id>`，workbench/App.tsx 解析并 `history.replaceState` 同步
- **自动保存**：编辑防抖 600ms 合并落盘（`usePromptManager` 的 latestDraft）；置顶/计数等元数据走 `patchPrompt`（先冲刷草稿再写，防覆盖）
- **变量复制**：内容含 `{{变量}}` 时 CopyDialog 填空（`extractVariables`/`fillVariables`），空白值视为未填写保留原文
- **数据备份**：`lib/backup.ts` 的 `mergeBackup` 按 id 合并、新 updatedAt 者胜
- **预览服务器**：`scripts/preview-server.mjs` 注入 chrome.* shim（runtime.id 必须存在，否则 WXT polyfill 抛错），storage 用 sessionStorage 兜底持久化

## 版本发布

git tag = 扩展版本 = package.json version（tag 驱动，勿手改版本号）。`npm version patch/minor/major` + `git push --follow-tags` → GitHub Actions 自动构建发布。lockfile 基于国内 npmmirror 生成（.npmrc）。
