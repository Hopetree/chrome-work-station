import { storage } from 'wxt/storage';

const DEFAULT_FEATURE_KEY = 'local:settings:defaultFeature';

export async function getDefaultFeatureId(): Promise<string | null> {
  return (await storage.getItem<string>(DEFAULT_FEATURE_KEY)) ?? null;
}

export async function setDefaultFeatureId(id: string): Promise<void> {
  await storage.setItem(DEFAULT_FEATURE_KEY, id);
}
