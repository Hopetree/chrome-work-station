/**
 * Background Script
 *
 * 扩展的后台脚本，运行在独立的 Service Worker 上下文中。
 */

interface SidePanelApi {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
}

export default defineBackground(() => {
  // 点击工具栏图标直接打开侧边栏（不再使用 popup），方便只做轻量编辑时不全屏
  const sidePanel = (chrome as unknown as { sidePanel?: SidePanelApi }).sidePanel;
  sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error('[chrome-work-station] 侧边栏设置失败', error));
});
