import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { visibleFeatures } from '@/features/registry';
import { getDefaultFeatureId, setDefaultFeatureId } from '@/lib/settings';

export default function OptionsApp() {
  const [defaultId, setDefaultId] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getDefaultFeatureId().then((id) => setDefaultId(id ?? visibleFeatures[0]?.id ?? ''));
  }, []);

  const changeDefault = async (id: string) => {
    setDefaultId(id);
    await setDefaultFeatureId(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="mx-auto max-w-xl px-6 py-10 text-zinc-800">
      <header className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-500/90 font-mono text-sm font-bold text-zinc-900">
          站
        </div>
        <div>
          <h1 className="text-base font-semibold text-zinc-900">设置</h1>
          <p className="text-xs text-zinc-500">
            Chrome 工作站 · v{browser.runtime.getManifest().version}
          </p>
        </div>
      </header>

      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <label htmlFor="default-feature" className="block text-[13px] font-medium">
          点击「打开工作台」时默认进入
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          在 popup 中点工具卡片始终直达对应功能，不受此项影响。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <select
            id="default-feature"
            value={defaultId}
            onChange={(e) => changeDefault(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[13px] outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          >
            {visibleFeatures.map((feature) => (
              <option key={feature.id} value={feature.id}>
                {feature.name}
              </option>
            ))}
          </select>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-teal-700" role="status">
              <Check className="h-3 w-3" />
              已保存
            </span>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-[13px] font-medium">关于数据存储</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          所有数据（Prompt、配置）仅保存在浏览器本地的扩展存储中，不会上传到任何服务器。清除浏览器数据会一并删除这些内容。
        </p>
      </section>
    </div>
  );
}
