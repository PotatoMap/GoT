/* E2E 真实浏览器冒烟（可选）：用系统 Edge/Chrome 验证"新对局 → 人类落子 → KataGo 应手"。
 * 前置：node server.js 已在 4173 运行并连上 KataGo。
 * 用法：node tests/test_e2e_edge.js   （本机有 Edge/Chrome 才可跑；不纳入 npm test）
 * 价值：jsdom 的 window.eval 宽松模式会吞掉严格模式 ReferenceError（如"engineThinking 未声明"），
 * 只有真实浏览器能复现这类"AI 回合崩溃"问题。改动引擎走子/分析链路后建议跑一次。 */
'use strict';
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS:', m); } else { fail++; console.error('FAIL:', m); } };

(async () => {
  const exe = fs.existsSync(EDGE) ? EDGE : (fs.existsSync(CHROME) ? CHROME : null);
  if (!exe) { console.log('SKIP: no Edge/Chrome found'); process.exit(0); }
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('requestfailed', (r) => errs.push('reqfail ' + (r.failure() || {}).errorText));

  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load', timeout: 30000 });
    await sleep(2000);
    const pill = await page.evaluate(() => document.getElementById('enginePillText').textContent);
    ok(pill.includes('KataGo'), 'engine connected: ' + pill);
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('#ngOpponent button')) if (b.dataset.opp === 'gtp') b.click();
      document.getElementById('ngStart').click();
    });
    await sleep(400);
    const moves = async () => Number(await page.evaluate(() => document.getElementById('infoMoves').textContent));
    const clickBoard = async (gx, gy) => {
      const pt = await page.evaluate(([x, y]) => {
        const r = document.getElementById('boardCanvas').getBoundingClientRect();
        const margin = r.width * 0.08;
        const cell = (r.width - 2 * margin) / 18;
        return { x: r.left + margin + x * cell, y: r.top + margin + y * cell };
      }, [gx, gy]);
      await page.mouse.click(pt.x, pt.y);
    };
    const playAndWait = async (label, gx, gy, wantMoves) => {
      await clickBoard(gx, gy);
      const t0 = Date.now();
      for (let i = 0; i < 50; i++) {
        await sleep(500);
        if ((await moves()) >= wantMoves) break;
      }
      ok((await moves()) >= wantMoves, `${label}: AI replied in ${Date.now() - t0}ms`);
    };
    // 人类执黑：连下 D4 与 (1,1)，每次等 KataGo 应手
    await playAndWait('move1 (D4)', 3, 15, 2);
    await playAndWait('move2 (corner)', 1, 1, 4);
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  } finally {
    await browser.close();
  }
  console.log('----------------------------------------');
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
