/* GoT — service worker：离线兜底，但绝不"粘住"旧代码。
 *
 * 策略（2026-09 起）：**全部同源 GET 走网络优先（network-first / stale-while-revalidate）**
 *  - 在线：永远从本地服务取最新代码，成功即写入缓存；改了文件下次打开就是新的。
 *  - 离线：回退缓存副本，保证断网/服务未启动时仍能打开并用内置 AI 下棋
 *    （前端会检测到 /health 不通并提示"桥接服务未运行，已切内置 AI"）。
 *  - 旧版是"缓存优先 + ignoreSearch"，版本号不变时 ?v= 也击穿不了，改动永远不生效。
 *
 * 引擎接口（/health /gtp /analyze）永不进 SW：动态且要求实时。
 * 跨源请求一律 403（隐私边界）。
 */
const VERSION_RE = /GOT_VERSION\s*=\s*['"]([^'"]+)['"]/;
let CACHE = 'got-default';
const ASSETS = [
  './', './index.html', './styles.css',
  './js/version.js', './js/goengine.js', './js/ai-worker.js', './js/gtp.js', './js/board.js', './js/app.js',
  './favicon.svg', './manifest.webmanifest'
];
/* 引擎与自身脚本：永不缓存，永不代理 */
const NEVER_CACHE = ['/health', '/gtp', '/analyze', '/sw.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const res = await fetch('./js/version.js', { cache: 'no-store' });
      const m = VERSION_RE.exec(await res.text());
      if (m) CACHE = 'got-' + m[1];
    } catch (err) { /* 取不到版本号时用兜底名，仍可离线 */ }
    const c = await caches.open(CACHE);
    // reload：预缓存也强制走网络，避免把旧文件固化进新缓存
    await Promise.all(ASSETS.map(async (url) => {
      try { await c.add(new Request(url, { cache: 'reload' })); } catch (err) { /* 单个失败不影响离线兜底 */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 页面侧的逃生舱：
 *  - {type:'SKIP_WAITING'}                 让等待中的新 SW 立刻接管
 *  - {type:'CLEAR_CACHE'}                  清掉全部缓存（可选 unregister 由页面执行） */
self.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (data.type === 'CLEAR_CACHE') {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

/* 缓存名只在 install 时解析；SW 被浏览器回收后重新唤醒不会重跑 install，
 * 所以要能"按需找回"已存在的缓存（离线时取不到 version.js 就挑现成的）。 */
async function resolveCache() {
  if (CACHE !== 'got-default') return CACHE;
  try {
    const res = await fetch('./js/version.js', { cache: 'no-store' });
    const m = VERSION_RE.exec(await res.text());
    if (m) { CACHE = 'got-' + m[1]; return CACHE; }
  } catch (err) { /* 离线：走下面的兜底 */ }
  try {
    const keys = await caches.keys();
    const found = keys.filter((k) => k.indexOf('got-') === 0).sort().pop();
    if (found) CACHE = found;
  } catch (err) { /* ignore */ }
  return CACHE;
}

async function putCopy(req, res) {
  try {
    const c = await caches.open(await resolveCache());
    await c.put(req, res.clone());
  } catch (err) { /* 配额/私密模式：忽略 */ }
}

/* 缓存查找：CacheStorage.match 在某些导航请求上会漏（不同 Chrome 版本的 ignoreSearch
 * 实现差异），这里逐级退让——精确匹配 → 打开同名缓存匹配 → 扫全部缓存找 HTML。
 * 宁可多查几次，也不要让离线导航直接掉进 Chrome 的错误页。 */
async function findCached(req) {
  const isDoc = req.mode === 'navigate' || req.destination === 'document';
  try {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
  } catch (err) { /* ignore */ }
  const name = await resolveCache();
  try {
    const c = await caches.open(name);
    const direct = await c.match(req, { ignoreSearch: true });
    if (direct) return direct;
    if (isDoc) {
      for (const key of ['./index.html', '/index.html', './', '/']) {
        const h = await c.match(key);
        if (h) return h;
      }
    }
  } catch (err) { /* ignore */ }
  if (!isDoc) return null;
  try {
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const r of await c.keys()) {
        if (/\.html$/.test(new URL(r.url).pathname) || new URL(r.url).pathname === '/') {
          const h = await c.match(r);
          if (h) return h;
        }
      }
    }
  } catch (err) { /* ignore */ }
  return null;
}

/* 网络优先；失败回退缓存。ignoreSearch 让 ?v=x.y 也能命中裸路径条目。 */
async function networkFirst(req) {
  try {
    // 服务端已发 no-cache/must-revalidate，这里无需再覆盖缓存模式
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) { putCopy(req, res); return res; }
    if (res && res.status >= 400) {
      // 错误响应（含离线前的 5xx）：能用缓存就用，别把错误页直接丢给用户
      const hit = await findCached(req);
      if (hit) return hit;
    }
    return res;
  } catch (err) {
    const hit = await findCached(req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;
  // 隐私边界：SW 不代理、缓存或回退任何外站请求。
  if (!sameOrigin) {
    e.respondWith(Promise.resolve(new Response('', { status: 403, statusText: 'Offline only' })));
    return;
  }
  if (e.request.method !== 'GET') return;                       // 动态 POST（/gtp、/analyze）不碰
  if (NEVER_CACHE.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'))) return;
  e.respondWith(networkFirst(e.request));
});
