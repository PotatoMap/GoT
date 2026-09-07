/* 临时单测：gtp.js 优先级插队 + analyze 自定义超时语义 */
'use strict';
const http = require('http');
const path = require('path');
const GtpClient = require(path.join(__dirname, '..', 'js', 'gtp.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS:', m); } else { fail++; console.error('FAIL:', m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- 1) 优先级插队：积压的慢请求在前时，高优先请求必须插到队头 ----
  const c = new GtpClient('http://x.test');
  const started = [];
  c._post = async (path_, body) => {
    started.push(body.kind);
    await sleep(120); // 全部慢，制造积压
    return { ok: true };
  };
  const lows = [];
  for (let i = 1; i <= 3; i++) lows.push(c.analyze({ kind: 'low' + i }).catch(() => {}));
  await sleep(20); // low1 已在途，low2/low3 积压
  const high = c.analyze({ kind: 'HIGH' }, { priority: 1 });
  await Promise.all(lows.concat(high));
  console.log('  执行顺序:', started.join(' -> '));
  ok(started[1] === 'HIGH', 'high priority request jumps the backlog queue head');

  // ---- 2) 自定义超时：对"慢引擎"应被 abort，而不是占队列 ----
  const slow = http.createServer((req, res) => setTimeout(() => { res.end('{}'); }, 3000));
  await new Promise(r => slow.listen(0, '127.0.0.1', r));
  const port = slow.address().port;
  const c2 = new GtpClient('http://127.0.0.1:' + port);
  const t0 = Date.now();
  let threw = false;
  try {
    await c2.analyze({ seconds: 0.2 }, { timeoutMs: 300 });
  } catch (e) { threw = true; }
  const dt = Date.now() - t0;
  ok(threw && dt < 2000, `analyze honors custom timeoutMs (~${dt}ms elapsed)`);
  slow.close();

  // ---- 3) 默认超时不受影响（兼容回归） ----
  const c3 = new GtpClient('http://x.test');
  c3._post = async () => ({ ok: true });
  await c3.analyze({ seconds: 2 });
  ok(true, 'analyze without opts still works');

  // ---- 4) 隐私边界：非本机桥接必须在 fetch 前被拒绝 ----
  const originalFetch = global.fetch;
  let externalFetchCalled = false;
  global.fetch = async () => { externalFetchCalled = true; return { json: async () => ({ ok: true }) }; };
  const remote = new GtpClient('https://example.com');
  const blocked = await remote.health(100);
  global.fetch = originalFetch;
  ok(blocked.ok === false && !externalFetchCalled && /only permits local bridge/.test(blocked.error || ''),
    'non-loopback bridge is blocked before network access');

  console.log('----------------------------------------');
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
