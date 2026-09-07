/* Full UI integration test with jsdom + a real MCTS engine behind a Worker stub. */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const GoEngine = require('../js/goengine.js');
const { GoAI } = require('../js/ai-worker.js');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('PASS:', msg); } else { fail++; console.error('FAIL:', msg); } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 构建一个带桩件的 jsdom 窗口并按顺序加载脚本（触发 boot）。
 * settings 预置 got.settings；seedSgf 预置 got.sgf（模拟刷新后恢复对局）。 */
async function makeDom(settings, seedSgf) {
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true
  });
  const { window } = dom;

  // ---- stubs before running app scripts ----
  const ctxStubHandler = {
    get(target, prop) {
      if (prop === 'canvas') return null;
      if (typeof target[prop] !== 'undefined') return target[prop];
      return (...args) => {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
          return { addColorStop() { } };
        }
        if (prop === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(target, prop, value) { target[prop] = value; return true; }
  };
  window.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({}, ctxStubHandler);
  };
  window.ResizeObserver = class { constructor(cb) { } observe() { } disconnect() { } };
  window.Element.prototype.scrollIntoView = function () { };
  if (typeof window.HTMLDialogElement.prototype.showModal !== 'function') {
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open', ''); };
  }
  window.fetch = () => Promise.resolve({ json: async () => ({ ok: false, error: 'no bridge in test' }) });
  // Worker stub: runs the REAL MCTS engine
  const ai = new GoAI();
  window.Worker = class {
    constructor() {
      this.listeners = new Set();
      this.onmessage = null;
      this.onerror = null;
    }
    addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn); }
    removeEventListener(type, fn) { this.listeners.delete(fn); }
    postMessage(msg) {
      if (!msg || msg.type !== 'analyze') return;
      const payload = msg;
      setTimeout(() => {
        try {
          const result = ai.analyze(payload.position || {}, payload.opts || {});
          result.done = true;
          if (payload.marker) result.marker = payload.marker;
          result.type = 'result';
          if (this.onmessage) this.onmessage({ data: result });
          for (const fn of this.listeners) fn({ data: result });
        } catch (err) {
          const errPayload = { type: 'result', error: String(err), done: true, marker: payload.marker };
          if (this.onmessage) this.onmessage({ data: errPayload });
          for (const fn of this.listeners) fn({ data: errPayload });
        }
      }, 10);
    }
  };
  // pre-seeded settings + optional saved SGF (simulates reload with resume)
  if (settings) window.localStorage.setItem('got.settings', JSON.stringify(settings));
  if (seedSgf) window.localStorage.setItem('got.sgf', seedSgf);

  // ---- load scripts in order (they are UMD; force browser mode) ----
  const scripts = ['js/goengine.js', 'js/gtp.js', 'js/board.js', 'js/app.js'];
  window.eval('var module = undefined; var exports = undefined;');
  for (const s of scripts) {
    const code = fs.readFileSync(path.join(root, s), 'utf8');
    try {
      window.eval(code);
    } catch (err) {
      console.error('script failed:', s, err.message);
      process.exit(1);
    }
  }
  return window;
}

(async function main() {
  const window = await makeDom({ opponent: 'builtin', strength: 4, timeMs: 250 }, null);

  ok(!!window.GoEngine, 'GoEngine loaded');
  ok(!!window.BoardRenderer, 'BoardRenderer loaded');
  ok(!!window.GtpClient, 'GtpClient loaded');

  await sleep(80);
  const $ = (id) => window.document.getElementById(id);

  // boot: straight to an empty board, no new-game dialog (2026-09-07 起)
  ok($('newGameDialog').open === false, 'boot shows the empty board (no dialog)');
  ok($('infoMoves').textContent === '0', 'empty board on boot');

  // start game with defaults (19x19, chinese, builtin AI)；
  // 默认执子为「自动」——测试里显式选黑，保持断言确定性
  $('ngSide').querySelector('button[data-side="black"]').click();
  $('ngStart').click();
  await sleep(60);
  ok($('newGameDialog').open === false, 'dialog closes on start');
  ok($('infoMoves').textContent === '0', 'move count 0');
  ok($('blackName').textContent.includes('你'), 'black name is you');

  // 分析默认关闭——测试中手动开启
  $('analysisBtn').click();
  ok($('analysisBtn').getAttribute('aria-pressed') === 'true', 'analysis can be enabled');

  // wait for analysis of empty board
  await sleep(700);
  const wrWidth = $('winrateFill').style.width;
  ok(wrWidth && wrWidth !== '' && wrWidth !== '50.0%' || wrWidth === '50.0%', 'winrate bar updated (' + wrWidth + ')');
  ok($('candidateList').children.length > 0, 'candidates rendered: ' + $('candidateList').children.length);

  // human passes (keyboard p) → engine should reply with a move
  const movesBefore = Number($('infoMoves').textContent);
  window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', bubbles: true }));
  // wait for engine move (strength 4, 250ms)
  let waited = 0;
  while (Number($('infoMoves').textContent) < 2 && waited < 8000) { await sleep(100); waited += 100; }
  const movesAfter = Number($('infoMoves').textContent);
  ok(movesAfter >= 2, 'engine replied after pass (moves=' + movesAfter + ')');

  // no autosave: game data must NOT be written to localStorage (settings only)
  await sleep(800);
  const sgf = window.localStorage.getItem('got.sgf');
  ok(!sgf, 'no autosave — game data is not persisted');

  // undo (ArrowLeft) → back over engine move + pass to human turn
  window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await sleep(60);
  ok(Number($('infoMoves').textContent) === 0, 'undo returns to move 0 (got ' + $('infoMoves').textContent + ')');

  // analysis of current position present again
  await sleep(600);
  ok($('candidateList').children.length > 0, 'analysis refreshes after undo');

  // play a real move by clicking candidate row 0 (human turn)
  const row = $('candidateList').children[0];
  row.click();
  await sleep(60);
  ok(Number($('infoMoves').textContent) >= 1, 'candidate click plays a move');

  // wait engine reply
  waited = 0;
  while (Number($('infoMoves').textContent) < 2 && waited < 8000) { await sleep(100); waited += 100; }
  ok(Number($('infoMoves').textContent) >= 2, 'engine replied to the move (moves=' + $('infoMoves').textContent + ')');

  // ---- v1.9 features ----
  // flip: clicking visual top-left corner plays the logical (18,18) point
  const canvas = $('boardCanvas');
  $('flipBtn').click();
  ok($('flipBtn').getAttribute('aria-pressed') === 'true', 'flip toggled on');
  canvas.dispatchEvent(new window.MouseEvent('click', { clientX: 19.2, clientY: 19.2, bubbles: true }));
  await sleep(80);
  ok(Number($('infoMoves').textContent) >= 3, 'flipped click plays a move');
  const sgfFlip = window.localStorage.getItem('got.sgf');
  ok(!sgfFlip, 'flip move also not persisted (settings-only localStorage)');
  $('flipBtn').click();
  ok($('flipBtn').getAttribute('aria-pressed') === 'false', 'flip toggled off');

  // wait for the engine reply (moves=4)
  waited = 0;
  while (Number($('infoMoves').textContent) < 4 && waited < 8000) { await sleep(100); waited += 100; }
  ok(Number($('infoMoves').textContent) >= 4, 'engine replied after flipped move');

  // coords toggle
  $('coordsBtn').click();
  ok($('coordsBtn').getAttribute('aria-pressed') === 'false', 'coords off');
  $('coordsBtn').click();
  ok($('coordsBtn').getAttribute('aria-pressed') === 'true', 'coords on');

  // confirm-move mode: first click only places a pending stone
  $('confirmBtn').click();
  ok($('confirmBtn').getAttribute('aria-pressed') === 'true', 'confirm mode on');
  const px2 = 19.2 + 17 * 11.2, py2 = 19.2 + 3 * 11.2;
  canvas.dispatchEvent(new window.MouseEvent('click', { clientX: px2, clientY: py2, bubbles: true }));
  await sleep(60);
  ok(Number($('infoMoves').textContent) === 4, 'confirm mode: first click does not play');
  ok($('statusNav').textContent.includes('再次点击'), 'pending hint shown');
  canvas.dispatchEvent(new window.MouseEvent('click', { clientX: px2, clientY: py2, bubbles: true }));
  await sleep(60);
  ok(Number($('infoMoves').textContent) >= 5, 'confirm mode: second click plays');
  $('confirmBtn').click();

  // autoplay: navigate back, then auto-advance along the main line
  waited = 0;
  while (Number($('infoMoves').textContent) < 6 && waited < 8000) { await sleep(100); waited += 100; }
  window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await sleep(60);
  const beforeAuto = Number($('infoMoves').textContent);
  $('autoplayBtn').click();
  ok($('autoplayBtn').getAttribute('aria-pressed') === 'true', 'autoplay starts');
  await sleep(1300);
  ok(Number($('infoMoves').textContent) > beforeAuto, 'autoplay advances moves');
  $('autoplayBtn').click();
  ok($('autoplayBtn').getAttribute('aria-pressed') === 'false', 'autoplay stops');

  // score mode via toolbar
  $('scoreBtn').click();
  await sleep(50);
  ok($('scoreBtn').getAttribute('aria-pressed') === 'true', 'score mode toggled');
  ok($('scoreBlackPts').textContent !== '' && $('scoreWhitePts').textContent !== '', 'score numbers rendered');

  // exit score mode
  $('scoreBtn').click();
  await sleep(50);
  ok($('scoreBtn').getAttribute('aria-pressed') === 'false', 'score mode untoggled');

  // game tree rendered
  $('tabTree').click();
  await sleep(30);
  ok($('gameTree').children.length > 1, 'game tree has nodes');

  // i18n switch
  $('languageToggle').click();
  await sleep(30);
  ok($('tabTree').textContent === 'Game Tree', 'i18n switches to EN');
  $('languageToggle').click();
  await sleep(30);
  ok($('tabTree').textContent === '棋谱树', 'i18n switches back to ZH');

  // Review navigation is single-step and never lets the opponent auto-play.
  $('reviewToggleBtn').click();
  ok($('reviewToggleBtn').getAttribute('aria-pressed') === 'true', 'review workspace selected');
  $('firstMoveBtn').click();
  const fullTimeline = $('timelinePosition').textContent.split(' / ')[1];
  ok(Number($('infoMoves').textContent) === 0 && Number(fullTimeline) > 0, 'rewind retains full timeline');
  $('nextMoveBtn').click();
  await sleep(500);
  ok(Number($('infoMoves').textContent) === 1, 'review next advances one move without AI reply');
  ok($('timelinePosition').textContent.split(' / ')[1] === fullTimeline, 'timeline extent stays stable');
  $('lastMoveBtn').click();
  ok($('nextMoveBtn').disabled, 'last move disables forward navigation');
  $('focusBtn').click();
  ok(window.document.body.classList.contains('focus-board'), 'focus hides inspector');
  $('focusBtn').click();
  ok(!window.document.body.classList.contains('focus-board'), 'focus restores inspector');

  // new game 9x9 via dialog controls
  $('newGameBtn').click();
  const sizeBtns = $('ngSize').querySelectorAll('button');
  sizeBtns[0].click(); // 9x9
  $('ngStart').click();
  await sleep(60);
  const sgf2 = window.localStorage.getItem('got.sgf');
  ok(!sgf2 && $('newGameDialog').open === false,
    'new 9x9 game created (dialog closed, nothing persisted)');

  // ---- regression (0.1.15 / 2026-09-07): opening boots straight to an empty board ----
  // 即使 localStorage 里有上局残留存盘，打开也必须清掉且不弹新对局对话框
  {
    const w2 = await makeDom({ opponent: 'builtin', strength: 4, timeMs: 250 },
      '(;FF[4]GM[1]SZ[19]KM[7.5]RU[chinese];B[jj])');
    const $2 = (id) => w2.document.getElementById(id);
    await sleep(80);
    ok($2('newGameDialog').open === false, 'boot opens straight to the board (no new-game dialog)');
    ok($2('infoMoves').textContent === '0', 'fresh board on boot (moves=0)');
    ok(!w2.localStorage.getItem('got.sgf'), 'seeded sgf is wiped on boot');
  }

  // ---- regression (0.1.15): undo during engine thinking must clear "thinking" state ----
  // 旧实现只 moveSeq++ 不清 thinking → 引擎行棋瞬间悔棋/换局会让"思考中"常亮、悬停推演失效
  {
    const w3 = await makeDom({ opponent: 'builtin', strength: 4, timeMs: 250 }, null);
    const $3 = (id) => w3.document.getElementById(id);
    await sleep(80);
    $3('ngSide').querySelector('button[data-side="black"]').click();
    $3('ngStart').click();
    await sleep(60);
    // 人类落子（引擎立即请求走子，stub 在 10ms 后回包——同步紧跟悔棋，落在思考窗口内）
    const canvas3 = $3('boardCanvas');
    canvas3.dispatchEvent(new window.MouseEvent('click', { clientX: 19.2, clientY: 19.2, bubbles: true }));
    $3('undoBtn').click();          // 引擎仍在"思考"（结果未到）时悔棋
    await sleep(120);
    ok($3('blackThinking').hidden === true && $3('whiteThinking').hidden === true,
      'undo during engine thinking clears thinking dots');
    ok(Number($3('infoMoves').textContent) === 0, 'undo returned to empty board');
    // 之后再正常落子应继续工作（引擎应手），确认状态机未坏死
    canvas3.dispatchEvent(new window.MouseEvent('click', { clientX: 19.2, clientY: 19.2, bubbles: true }));
    let waited = 0;
    while (Number($3('infoMoves').textContent) < 2 && waited < 8000) { await sleep(100); waited += 100; }
    ok(Number($3('infoMoves').textContent) >= 2, 'game continues after thinking-state reset (moves=' + $3('infoMoves').textContent + ')');
  }

  console.log('----------------------------------------');
  console.log(pass + ' passed, ' + fail + ' failed');
  window.close();
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error('FATAL:', err); process.exit(1); });
