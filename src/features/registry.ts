import { promptManagerFeature } from './prompt-manager';
import type { FeatureModule } from './types';

/**
 * 功能注册表：新功能开发完成后，在这里加一行即可接入
 * popup 菜单、工作台侧边栏和设置页。
 */
export const features: FeatureModule[] = [promptManagerFeature];

export const visibleFeatures = features.filter((f) => !f.hidden);

export function getFeature(id: string): FeatureModule | undefined {
  return visibleFeatures.find((f) => f.id === id);
}
