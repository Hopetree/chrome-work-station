import { MessageSquareText } from 'lucide-react';
import PromptManager from './components/PromptManager';
import type { FeatureModule } from '../types';

export const promptManagerFeature: FeatureModule = {
  id: 'prompt-manager',
  name: 'Prompt 管理',
  description: '编写、保存和管理常用 Prompt，支持多行与自动保存',
  icon: MessageSquareText,
  component: PromptManager,
};
