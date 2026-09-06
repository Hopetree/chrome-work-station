import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * 功能模块契约：每个功能自包含在 features/<id>/ 目录下，
 * 通过导出一个 FeatureModule 注册到 registry.ts，即可出现在
 * popup 菜单和工作台侧边栏中，无需改动任何布局代码。
 */
export interface FeatureModule {
  /** 唯一 id，同时用作 URL 深链参数 ?feature=<id> */
  id: string;
  /** 菜单中显示的名称 */
  name: string;
  /** 一句话描述，popup 列表中展示 */
  description: string;
  icon: LucideIcon;
  /** 功能主界面组件，渲染在工作台内容区 */
  component: ComponentType;
  /** 置为 true 可在菜单中隐藏（如功能尚在开发） */
  hidden?: boolean;
}
