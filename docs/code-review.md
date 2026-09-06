# Code Review 报告

- 评审范围：`c739bad..f35fd20`（项目初始化至今的全部代码提交）
- 评审日期：2026-09-06
- 状态标记：⏳ 待处理 · ✅ 已修复 · ⏭️ 跳过

## 问题总览

| # | 优先级 | 文件 | 位置 | 问题概述 | 状态 |
|---|--------|------|------|----------|------|
| 1 | 🟡 建议改进 | src/features/prompt-manager/components/PromptManager.tsx | L338、L585 | 模板名称清空后列表卡片显示空白标题 | ✅ 已修复 |
| 2 | 🟡 建议改进 | src/features/prompt-manager/components/PromptManager.tsx | L84-90 | 剪贴板写入失败（权限/非聚焦）时未捕获，出现未处理 rejection，用户无感知 | ✅ 已修复 |
| 3 | 🟡 建议改进 | src/features/prompt-manager/hooks/usePromptManager.ts | L61-76 | persist 成功后未清空 latestDraft，过期草稿可能被后续 persist 重复应用 | ✅ 已修复 |
| 4 | 🟡 建议改进 | src/features/prompt-manager/hooks/usePromptManager.ts | L66-78 | 自动保存失败后停留在 dirty 状态，无重试机会（直到下一次编辑） | ✅ 已修复 |
| 5 | 🟢 可选优化 | src/components/ui/Select.tsx | L134 | 下拉面板固定向下展开，贴近视口底部时溢出 | ✅ 已修复 |
| 6 | 🟢 可选优化 | src/entrypoints/options/App.tsx | L43 | revokeObjectURL 紧跟 click() 同步调用，Safari 下可能中断下载 | ✅ 已修复 |

## 修复验证记录（2026-09-06）

- #1：空名模板在列表显示「未命名模板」（浏览器实测）
- #2：模拟剪贴板拒绝后 0 个未处理 rejection、无「已复制」误提示（浏览器实测）
- #3：`latestDraft` 用引用比对清空，详见提交内代码
- #4：模拟 storage 写入失败 → 状态 dirty → 5 秒重试成功落盘（浏览器实测）
- #5：视口下方空间不足且上方足够时向上展开（代码实现；选项页布局无法自然构造该场景，向下路径已视觉回归）
- #6：`revokeObjectURL` 延迟 1 秒
