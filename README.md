# Chrome 工作站

多功能浏览器工具合集，每个功能有独立的界面与数据，按模块隔离开发。

基于 **WXT + React + TypeScript + Tailwind CSS** 构建，图标使用 Lucide 图标库。

## 功能列表

| 功能 | 说明 |
|------|------|
| Prompt 管理 | 编写、保存和管理常用 Prompt，支持多行编辑、防抖自动保存、搜索与一键复制 |

## 项目结构

```
src/
├── entrypoints/
│   ├── popup/          # 弹窗：功能启动菜单
│   ├── workbench/      # 工作台：侧边栏 + 各功能 Tab（支持 ?feature=<id> 深链）
│   ├── options/        # 设置页
│   └── background.ts   # 后台脚本
├── features/
│   ├── types.ts        # FeatureModule 功能契约
│   ├── registry.ts     # 功能注册表：新功能在此注册一行即可接入所有入口
│   └── prompt-manager/ # 功能模块（自包含：components/hooks/storage/utils/types）
├── components/layout/  # 共享布局（工作台侧边栏）
├── lib/                # 公共工具与全局设置
└── styles/globals.css
```

### 如何新增一个功能

1. 在 `src/features/` 下新建目录（建议自包含：`components/`、`hooks/`、`storage.ts`、`utils.ts`）
2. 目录内 `index.ts` 导出一个 `FeatureModule`（id、名称、图标、主组件）
3. 在 `src/features/registry.ts` 中注册即可 —— popup 菜单、工作台侧边栏、设置页自动出现

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

## 加载到浏览器

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `dist/chrome-work-station` 目录

## 版本发布

1. `git checkout main && git pull`
2. `npm version patch/minor/major`（或手动打 tag）
3. `git push --follow-tags` → GitHub Actions 自动构建发布
