import { useState } from 'react';
import WorkbenchLayout from '@/components/layout/WorkbenchLayout';
import { getFeature, visibleFeatures } from '@/features/registry';

/** 从 URL 读取初始功能，支持 popup/其它页面的深链：workbench.html?feature=<id> */
function initialFeatureId(): string {
  const id = new URLSearchParams(window.location.search).get('feature');
  return id && getFeature(id) ? id : (visibleFeatures[0]?.id ?? '');
}

export default function WorkbenchApp() {
  const [activeId, setActiveId] = useState(initialFeatureId);

  const select = (id: string) => {
    setActiveId(id);
    // 同步 URL，保持深链可用，又不产生历史记录
    window.history.replaceState(null, '', `?feature=${id}`);
  };

  const active = getFeature(activeId);
  const ActiveComponent = active?.component;

  return (
    <WorkbenchLayout features={visibleFeatures} activeId={activeId} onSelect={select}>
      {ActiveComponent ? <ActiveComponent /> : null}
    </WorkbenchLayout>
  );
}
