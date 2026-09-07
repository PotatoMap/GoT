/* Integration test: server.js (static + GTP bridge) with the mock engine. */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('PASS:', msg); } else { fail++; console.error('FAIL:', msg); } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/* 原生请求：fetch 会规范化/拒绝畸形路径，测路径穿越与坏 URL 必须用 raw http */
function rawGet(port, reqPath, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get({ port, path: reqPath, headers: headers || {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('timeout')); });
  });
}

(async () => {
  const srv = spawn(process.execPath, ['server.js', '--port', '4181', '--engine-cmd', 'python engines/mock_gtp.py'], {
    cwd: ROOT, shell: false
  });
  let out = '';
  srv.stdout.on('data', (d) => { out += d; });
  srv.stderr.on('data', (d) => { out += d; });

  // wait for listen
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { await sleep(300); up = out.includes('serving at'); }
  ok(up, 'server started');

  try {
    // static
    const idx = await fetch('http://127.0.0.1:4181/');
    ok(idx.status === 200 && (await idx.text()).includes('GoT'), 'static index served');

    const js = await fetch('http://127.0.0.1:4181/js/app.js');
    ok(js.status === 200 && (await js.text()).includes('GoEngine'), 'static js served');

    // health
    const h = await (await fetch('http://127.0.0.1:4181/health')).json();
    ok(h.ok === true && h.engine.name === 'GoT-Mock', 'health: ' + (h.engine && h.engine.name));
    ok(h.engine.kataAnalyze === true, 'kata-analyze detected');

    // gtp passthrough
    const g = await (await fetch('http://127.0.0.1:4181/gtp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'version' })
    })).json();
    ok(g.ok && g.response.includes('1.0'), 'gtp passthrough: ' + g.response);

    // analyze
    const a = await (await fetch('http://127.0.0.1:4181/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 9, komi: 7.5, toMove: 1, seconds: 0.8, topN: 5, moves: [] })
    })).json();
    ok(a.ok === true, 'analyze ok');
    ok(a.bestMove && a.bestMove.x >= 0, 'bestMove: ' + JSON.stringify(a.bestMove));
    ok(a.candidates.length >= 3, 'candidates: ' + a.candidates.length);
    ok(a.candidates[0].pv.length >= 1, 'pv present');

    // analyze with moves + ownership
    const b = await (await fetch('http://127.0.0.1:4181/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 9, komi: 7.5, toMove: 2, seconds: 0.8, topN: 5, ownership: true, moves: ['cc', 'ge', { x: 2, y: 6, color: 1 }] })
    })).json();
    ok(b.ok === true, 'analyze with moves ok');
    ok(b.ownership && b.ownership.length === 81, 'ownership 81');
    ok(b.candidates[0].visits > 0, 'visits: ' + b.candidates[0].visits);

    // incremental replay: extend the previous line by one move (prefix cache path)
    const c = await (await fetch('http://127.0.0.1:4181/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 9, komi: 7.5, toMove: 1, seconds: 0.8, topN: 5, moves: ['cc', 'ge', { x: 2, y: 6, color: 1 }, { x: 6, y: 2, color: 2 }] })
    })).json();
    ok(c.ok === true && c.candidates.length >= 3, 'incremental replay analyze ok');

    // setup stones (handicap AB, integer indexes idx=y*size+x; SGF strings also accepted)
    const d = await (await fetch('http://127.0.0.1:4181/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 9, komi: 0.5, toMove: 2, seconds: 0.8, topN: 3, ownership: true, setup: { AB: [30, 'gg'] }, moves: [] })
    })).json();
    ok(d.ok === true, 'analyze with setup AB ok');
    ok(d.ownership && d.ownership.length === 81, 'setup ownership 81');

    // streaming guard
    const s = await (await fetch('http://127.0.0.1:4181/gtp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'kata-analyze B interval 20' })
    })).json();
    ok(s.ok === false, 'streaming commands blocked');

    // —— 安全与健壮性 ——
    // 畸形 percent-encoding 不得打崩进程（曾经 URIError → unhandled rejection → 退出）
    let srvSurvived = true;
    try { await rawGet(4181, '/%ZZ'); } catch (e) { srvSurvived = false; }
    const h2 = await (await fetch('http://127.0.0.1:4181/health')).json();
    ok(srvSurvived && h2.ok === true, 'malformed URL %ZZ does not kill server');

    // 路径穿越：点段与编码点段都必须被拒
    let traversalBlocked = false;
    try {
      const r1 = await rawGet(4181, '/../package.json');
      if (r1.status === 403 || r1.status === 404) traversalBlocked = true;
    } catch (e) { traversalBlocked = false; }
    ok(traversalBlocked, 'dot-segment traversal blocked');
    const enc = await rawGet(4181, '/%2e%2e/package.json');
    ok(enc.status === 403 || enc.status === 404, 'encoded traversal blocked');

    // 兄弟目录前缀穿越（normalize 后前缀仍匹配 ROOT 的形状）不得读 ROOT 外文件
    const sib = await rawGet(4181, '/../GoT_GUI-sibling/secret.txt');
    ok(sib.status === 403 || sib.status === 404, 'sibling-prefix traversal blocked');

    // 恶意 Origin 不获 CORS 头（浏览器会拦截其读取响应）
    const evil = await rawGet(4181, '/health', { Origin: 'http://evil.example' });
    ok(!evil.headers['access-control-allow-origin'], 'evil origin gets no ACAO header');
    const good = await rawGet(4181, '/health', { Origin: 'http://127.0.0.1:9999' });
    ok(good.headers['access-control-allow-origin'] === 'http://127.0.0.1:9999', 'loopback origin allowed');

    // 坏 JSON body 不崩、返回明确错误
    const bad = await (await fetch('http://127.0.0.1:4181/gtp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops'
    })).json();
    ok(bad.ok === false, 'bad JSON handled gracefully');
  } catch (e) {
    ok(false, 'exception: ' + e.message);
  } finally {
    srv.kill();
    await sleep(300);
  }
  console.log('----------------------------------------');
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
