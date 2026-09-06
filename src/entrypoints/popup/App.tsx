import { useEffect, useState } from 'react';
import { ArrowRight, Settings } from 'lucide-react';
import { visibleFeatures } from '@/features/registry';
import { getDefaultFeatureId } from '@/lib/settings';

/** 打开工作台并定位到指定功能 */
function openWorkbench(featureId?: string) {
  const query = featureId ? `?feature=${featureId}` : '';
  browser.tabs.create({ url: browser.runtime.getURL(`/workbench.html${query}`) });
}

export default function App() {
  const [defaultId, setDefaultId] = useState<string | null>(null);

  useEffect(() => {
    getDefaultFeatureId().then(setDefaultId);
  }, []);

  return (
    <div className="w-80 bg-zinc-100 pb-1">
      <header className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-teal-500/90 font-mono text-sm font-bold text-zinc-900">
          站
        </div>
        <div>
          <h1 className="text-sm font-semibold text-zinc-900">Chrome 工作站</h1>
          <p className="text-[11px] text-zinc-500">选择一个工具开始</p>
        </div>
      </header>

      <ul className="space-y-1 px-3">
        {visibleFeatures.map((feature) => {
          const Icon = feature.icon;
          return (
            <li key={feature.id}>
              <button
                onClick={() => openWorkbench(feature.id)}
                className="group flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-teal-600 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-600 transition group-hover:bg-teal-50 group-hover:text-teal-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-zinc-900">
                    {feature.name}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {feature.description}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-teal-600" />
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="mt-3 flex items-center justify-between border-t border-zinc-200 px-4 pt-2.5">
        <button
          onClick={() => openWorkbench(defaultId ?? undefined)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-teal-800 transition hover:text-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          打开工作台
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={() => browser.runtime.openOptionsPage()}
          className="flex items-center gap-1 text-[12px] text-zinc-500 transition hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <Settings className="h-3 w-3" />
          设置
        </button>
      </footer>
    </div>
  );
}
