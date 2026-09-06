import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import type { FeatureModule } from '@/features/types';

interface WorkbenchLayoutProps {
  features: FeatureModule[];
  activeId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}

/**
 * 工作台整体布局：左侧「工具架」列出全部功能，
 * 右侧渲染当前功能内容。新功能注册后自动出现在侧边栏。
 */
export default function WorkbenchLayout({
  features,
  activeId,
  onSelect,
  children,
}: WorkbenchLayoutProps) {
  return (
    <div className="flex h-screen min-h-0 bg-zinc-100 text-zinc-800">
      <aside className="flex w-52 shrink-0 flex-col bg-zinc-900">
        <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
          <LogoMark />
          <div>
            <h1 className="text-[13px] font-semibold text-zinc-50">Chrome 工作站</h1>
            <p className="text-[10px] text-zinc-500">浏览器工具合集</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4" aria-label="功能菜单">
          {features.map((feature) => {
            const Icon = feature.icon;
            const active = feature.id === activeId;
            return (
              <button
                key={feature.id}
                onClick={() => onSelect(feature.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition ${
                  active
                    ? 'bg-zinc-800 text-zinc-50'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
              >
                {/* 活动项的青绿刻度，像工具架上的定位标 */}
                {active && (
                  <span className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-teal-400" />
                )}
                <Icon className={`h-4 w-4 ${active ? 'text-teal-400' : ''}`} />
                {feature.name}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => browser.runtime.openOptionsPage()}
          className="flex items-center gap-2.5 rounded-md px-5 py-3 text-[13px] text-zinc-500 transition hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
        >
          <Settings className="h-4 w-4" />
          设置
        </button>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-white">{children}</main>
    </div>
  );
}

function LogoMark() {
  return (
    <div className="grid h-7 w-7 place-items-center rounded-lg bg-teal-500/90 font-mono text-sm font-bold text-zinc-900">
      站
    </div>
  );
}
