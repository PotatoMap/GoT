#!/usr/bin/env node
/* GoT — 构建单文件版 GoT.html：
 * 内联 styles.css、全部脚本，并把内置 AI 引擎源码嵌入 Blob-Worker 标签，
 * 双击即可离线运行（无需 Node、无需 Python、无需网络）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let html = read('index.html');

// 1. inline css
const css = read('styles.css');
html = html.replace(
  /<link rel="stylesheet" href="styles\.css[^"]*">/,
  () => '<style>\n' + css + '\n</style>'
);

// 2. inline scripts（version.js 在最前，保持与 index.html 相同的加载顺序）
const scripts = ['js/version.js', 'js/goengine.js', 'js/gtp.js', 'js/board.js', 'js/app.js'];
for (const f of scripts) {
  const code = read(f);
  // 防御：任何脚本一旦含 </script>，内联后单文件版会静默损坏——构建期直接失败
  if (/<\/script/i.test(code)) {
    console.error('BUILD FAILED: ' + f + ' contains "</script" — cannot inline safely');
    process.exit(1);
  }
  html = html.replace(
    new RegExp('<script src="' + f.replace(/\//g, '\\/') + '[^"]*"></script>'),
    () => '<script>\n' + code + '\n</script>'
  );
}

// 3. inline the AI worker source (Blob-Worker → works on file://)
const workerSrc = read('js/ai-worker.js');
html = html.replace(
  '<script type="text/plain" id="got-ai-worker-src"></script>',
  () => '<script type="text/plain" id="got-ai-worker-src">\n' + workerSrc + '\n</script>'
);

// 4. drop PWA references (not meaningful for a local file)
html = html.replace(/\s*<link rel="manifest" href="manifest\.webmanifest">/, '');
html = html.replace(/\s*<meta name="theme-color" content="#17191d">/, '');

if (html.includes('src="js/') || html.includes('href="styles.css"') || !html.includes('got-ai-worker-src">\n')) {
  console.error('BUILD FAILED: some references were not inlined');
  process.exit(1);
}
const out = path.join(ROOT, 'GoT.html');
fs.writeFileSync(out, html);
console.log('[build] wrote GoT.html (' + Math.round(fs.statSync(out).size / 1024) + ' KB) — 双击即用');
