import { useState } from 'react';
import { Maximize2, Settings } from 'lucide-react';
import { getFeature, visibleFeatures } from '@/features/registry';

/** 打开整页工作台（需要完整空间时的入口） */
function openWorkbench(featureId?: string) {
  const query = featureId ? `?feature=${featureId}` : '';
  browser.tabs.create({ url: browser.runtime.getURL(`/workbench.html${query}`) });
}

/**
 * 侧边栏：点击工具栏图标直接进入，默认展示当前功能（Prompt 管理）。
 * 顶部为紧凑的功能切换条 + 打开完整工作台/设置的入口。
 */
export default function SidePanelApp() {
  const [activeId, setActiveId] = useState(visibleFeatures[0]?.id ?? '');
  const active = getFeature(activeId);
  const ActiveComponent = active?.component;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-zinc-100">
      <header className="flex shrink-0 items-center gap-1.5 bg-zinc-900 px-2.5 py-2">
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-teal-500/90 font-mono text-[11px] font-bold text-zinc-900">
          站
        </div>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5" aria-label="功能切换">
          {visibleFeatures.map((feature) => {
            const Icon = feature.icon;
            const isActive = feature.id === activeId;
            return (
              <button
                key={feature.id}
                onClick={() => setActiveId(feature.id)}
                aria-current={isActive ? 'page' : undefined}
                title={feature.name}
                className={`flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-50'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-teal-400' : ''}`} />
                <span className="truncate">{feature.name}</span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => openWorkbench(activeId)}
          title="在完整工作台中打开"
          className="shrink-0 rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => browser.runtime.openOptionsPage()}
          title="设置"
          className="shrink-0 rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-white">
        {ActiveComponent ? <ActiveComponent /> : null}
      </main>
    </div>
  );
}
