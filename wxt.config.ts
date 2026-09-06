import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // 模板把入口放在 src/entrypoints/，必须显式声明 srcDir，否则 WXT 默认在项目根目录找 entrypoints/
  srcDir: 'src',
  // WXT 的 publicDir 是相对 srcDir 解析的（默认 src/public）；模板把 public/ 放在项目根目录，
  // 因此用 '../public' 指回根目录，否则图标等静态资源不会拷贝进构建产物。
  publicDir: '../public',
  outDir: 'dist',
  outDirTemplate: 'chrome-work-station',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Chrome 工作站',
    description: '多功能浏览器工具合集，集成 Prompt 管理等日常开发效率工具',
    permissions: ['storage'],
    host_permissions: [],
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    // 根据实际需求添加权限，按最小权限原则
    // 常用权限示例：
    //   storage — 本地存储
    //   activeTab — 访问当前标签页
    //   tabs — 访问标签页信息
    //   scripting — 注入脚本
    //   contextMenus — 右键菜单
    //   sidePanel — 侧边栏
    // 文档: https://developer.chrome.com/docs/extensions/reference/manifest/permissions
  },
});
