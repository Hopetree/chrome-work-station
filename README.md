# Chrome 工作站

多功能浏览器工具合集，每个功能有独立的界面与数据，按模块隔离开发。

基于 **WXT + React + TypeScript + Tailwind CSS** 构建，图标使用 Lucide 图标库。

> AI 开发请先读 [CLAUDE.md](./CLAUDE.md)（与 AGENTS.md 同源），设计文档见下表。

## 文档索引

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | AI 开发指南：约定、命令、数据键、关键机制（**必读**） |
| [01 PRD 产品需求规格](./docs/design/01_PRD_产品需求规格说明书.md) | 产品定位、功能需求、明确不做、验收标准 |
| [02 TDD 技术设计文档](./docs/design/02_TDD_技术设计文档.md) | 技术栈、架构、数据层、关键流程设计 |

## 功能列表

| 功能 | 说明 |
|------|------|
| Prompt 管理 | 多行编辑、防抖自动保存、行号与 4 空格缩进、搜索、一键复制 |
| 变量填空 | Prompt 中写 `{{变量}}`，复制时弹窗填空，生成即用内容；也支持复制原文 |
| 置顶收藏 | 常用 Prompt 置顶排序，卡片悬停星标或编辑区切换 |
| 使用统计 | 记录复制次数，卡片与编辑区展示，常用程度一目了然 |
| 模板 | 把 Prompt 沉淀为模板（独立列表+图标），支持编辑、基于模板新建（列表卡片 + 按钮直达） |
| 数据备份 | 设置页导出/导入 JSON，按条目合并、新者胜，数据不锁死在浏览器里 |
| 云端同步 | 备份到你自己的 GitHub 私有仓库，可手动上传/恢复，也可开启「编辑后自动上传」；每次上传都是一次 commit，云端保留历史版本 |

## 项目结构

```
src/
├── entrypoints/
│   ├── sidepanel/      # 侧边栏：点击工具栏图标直开（窄容器自动切单栏）
│   ├── workbench/      # 工作台：功能侧边栏 + 各功能面板（支持 ?feature=<id> 深链）
│   ├── options/        # 设置页：默认功能、数据备份、云端同步
│   └── background.ts   # 后台脚本（设置点击图标打开侧边栏）
├── features/
│   ├── types.ts        # FeatureModule 功能契约
│   ├── registry.ts     # 功能注册表：新功能在此注册一行即可接入所有入口
│   └── prompt-manager/ # 功能模块（自包含：components/hooks/storage/utils/types）
├── components/         # ui/ 定制控件（Select、Checkbox、ConfirmDialog）+ layout/ 共享布局
├── lib/                # 公共工具（settings、backup、github-sync、cloud-sync）
└── styles/globals.css
```

### 如何新增一个功能

1. 在 `src/features/` 下新建目录（建议自包含：`components/`、`hooks/`、`storage.ts`、`utils.ts`）
2. 目录内 `index.ts` 导出一个 `FeatureModule`（id、名称、图标、主组件）
3. 在 `src/features/registry.ts` 中注册即可 —— popup 菜单、工作台侧边栏、设置页自动出现

### UI 约定

禁止使用浏览器原生控件的默认外观（原生 `select`、`confirm`、`alert` 等）。
下拉选择统一使用 `src/components/ui/Select.tsx`；新的通用控件一律放入 `src/components/ui/`，
与整体青绿/冷灰设计语言保持一致。

## 云端同步（GitHub）

数据默认只留本地。想有一份云端副本时，用自己的 GitHub 私有仓库当作存储，不需要任何第三方服务：

1. 新建一个**私有仓库**专门放数据（例如 `你的用户名/cws-data`），不要用代码仓库，避免项目历史里混入数据提交。
2. 到 [Fine-grained token 页面](https://github.com/settings/personal-access-tokens/new)建一个令牌：Repository access 选「Only select repositories」只勾这个仓库，Permissions 只给 **Contents: Read and write**，有效期按需设置。
3. 打开扩展设置页 → 「云端同步（GitHub）」，填仓库（`owner/repo` 或直接粘仓库地址）、文件路径（默认 `data/chrome-work-station.json`）和令牌，先点「测试连接」，再点「立即上传」。

之后可以按需点「立即上传 / 从云端恢复」，或勾选「自动上传」——编辑停止设定的间隔（默认 5 分钟，可改为 1–120 分钟）后自动同步（仅在侧边栏/工作台打开时运行）。换机器时在新机器上填同样的仓库和令牌，点「从云端恢复」即可。

语义与取舍：

- **上传**用本地数据覆盖云端文件。因为每次上传都是一次 commit，云端历史版本不会丢，误覆盖可以去仓库提交记录里找回。
- **恢复**是按条目合并、修改时间新者胜。本地已删除而云端还存在的条目会被恢复回来 —— 需要连删除一起同步时，用「导出数据」手动处理。
- 云端只存 Prompt、模板、目录这三类业务数据，界面偏好（折叠、换行等）不进同步。

## 开发

```bash
npm run dev            # 开发模式（热重载）
npm run build          # 生产构建
npm run zip            # 打包为 .zip

npm run type-check     # TypeScript 类型检查
npm run lint           # ESLint
npm run format         # Prettier 格式化
npm run test           # Vitest 单测

npm run generate-icons # 修改 public/icons/icon.svg 后重新生成 PNG
```

### 不加载扩展快速预览 UI

```bash
npm run build && npm run preview
# 打开 http://localhost:4173/workbench.html（storage 为内存模拟，刷新保留、关标签页即清空）
```

## 加载到浏览器

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `dist/chrome-work-station` 目录

## 版本发布

版本号由 tag 驱动（tag = package.json = 扩展 manifest），按以下顺序执行：

1. `npm version patch/minor/major -m "chore(release): v%s"` —— 升版本、提交并打标签
2. `npm run build` —— **重新构建，刷新 dist/ 里的 manifest 版本**（此步不可省，否则本地/发布产物版本滞后）
3. `npm run test && npm run type-check && npm run lint`
4. `git push origin main && git push origin v<版本>` —— 标签触发 GitHub Actions 自动构建发布
5. 在 `chrome://extensions` 点「重新加载」查看新版本
