/**
 * 本地预览服务器：直接以普通网页方式预览 dist/ 里的插件页面。
 * 通过注入 shim 模拟 chrome.* API（storage 为内存实现），
 * 无需在 chrome://extensions 里加载扩展即可开发调试 UI。
 *
 * 用法: node scripts/preview-server.mjs [端口，默认 4173]
 * 访问: http://localhost:4173/workbench.html
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const PORT = Number(process.argv[2]) || 4173;
const ROOT = 'dist/chrome-work-station';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const SHIM = `<script>
  window.__errors = [];
  const origError = console.error;
  console.error = (...args) => {
    window.__errors.push(args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' '));
    origError(...args);
  };
  window.addEventListener('error', (e) => window.__errors.push(String(e.error ?? e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));
  window.chrome = {
    runtime: {
      id: 'chrome-work-station-preview',
      getManifest: () => ({ version: '0.0.1-preview' }),
      getURL: (path) => '/' + path.replace(/^\\//, ''),
      openOptionsPage: () => { location.href = '/options.html'; },
    },
    tabs: { create: () => {} },
    storage: null,
  };
</script>
<script type="module">
  import { installShim } from '/__preview_shim__.js';
  installShim(window.chrome);
</script>`;

const shimModule = `export function installShim(chrome) {
  // 用 sessionStorage 兜底持久化，页面刷新后数据保留，模拟真实扩展的落盘存储
  const load = () => {
    try {
      return new Map(Object.entries(JSON.parse(sessionStorage.getItem('__preview_storage') ?? '{}')));
    } catch {
      return new Map();
    }
  };
  const data = load();
  const persist = () => sessionStorage.setItem('__preview_storage', JSON.stringify(Object.fromEntries(data)));
  window.__shimData = data;
  window.__shimInstallCount = (window.__shimInstallCount ?? 0) + 1;
  const listeners = new Set();
  chrome.storage = {
    local: {
      async get(keys) {
        const result = {};
        const list = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
        for (const k of list) if (data.has(k)) result[k] = data.get(k);
        return result;
      },
      async set(items) {
        const changes = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: data.get(k), newValue: v };
          data.set(k, v);
        }
        persist();
        for (const fn of listeners) fn(changes, 'local');
      },
      async remove(keys) {
        for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
        persist();
      },
    },
    onChanged: {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    },
  };
}`;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/__preview_shim__.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(shimModule);
    return;
  }
  const file = join(ROOT, url.pathname === '/' ? 'workbench.html' : url.pathname);
  try {
    let body = await readFile(file);
    if (extname(file) === '.html') {
      body = Buffer.from(String(body).replace('<head>', `<head>${SHIM}`));
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}).listen(PORT, () => {
  console.log(`Preview: http://localhost:${PORT}/workbench.html`);
});
