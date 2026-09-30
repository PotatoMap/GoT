/* This is a self-contained illustration, not a second Go engine. */
(function () {
  'use strict';
  const menu = document.getElementById('contentsMenu');
  const narrow = matchMedia('(max-width: 780px)');
  function sizeMenu() { menu.open = false; }
  sizeMenu();
  narrow.addEventListener('change', sizeMenu);
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    if (narrow.matches) menu.open = false;
  }));
  const links = [...menu.querySelectorAll('a')];
  const sections = links.map(link => document.querySelector(link.getAttribute('href')));
  let scheduled = false;
  function updatePosition() {
    const offset = narrow.matches ? 155 : 115;
    let current = sections[0];
    for (const section of sections) if (section.getBoundingClientRect().top <= offset) current = section;
    links.forEach(link => {
      if (link.getAttribute('href') === '#' + current.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    scheduled = false;
  }
  addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updatePosition); }
  }, { passive: true });
  updatePosition();

  const previewButtons = [...document.querySelectorAll('[data-preview]')];
  previewButtons.forEach(button => button.addEventListener('click', () => {
    previewButtons.forEach(item => {
      const selected = item === button;
      item.setAttribute('aria-pressed', String(selected));
      document.getElementById('preview-' + item.dataset.preview).hidden = !selected;
    });
  }));

  const ns = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, text) {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  const grid = document.getElementById('lessonGrid');
  const stones = document.getElementById('lessonStones');
  const marks = document.getElementById('lessonMarks');
  const board = document.getElementById('lessonBoard');
  const px = v => 36 + v * 36;
  for (let i = 0; i < 9; i++) {
    grid.append(svg('path', { d: `M36 ${px(i)}H324M${px(i)} 36V324`, stroke: '#655339', 'stroke-width': 1, fill: 'none' }));
    grid.append(svg('text', { x: px(i), y: 21, fill: '#382f22', 'font-size': 11, 'text-anchor': 'middle' }, 'ABCDEFGHJ'[i]));
    grid.append(svg('text', { x: 18, y: px(i) + 4, fill: '#382f22', 'font-size': 11, 'text-anchor': 'middle' }, String(9 - i)));
  }
  const steps = [
    { stage: '观察局面', title: '白棋只剩一口气。', text: '气是上下左右相邻的空交叉点，斜角不算。白棋 E5 的三个方向已被黑棋围住，标记 A 所在的 E6，就是最后一口气。', action: '看黑棋怎么提子', aria: '白棋 E5 被 D5、F5、E4 三颗黑棋包围，只剩标记 A 所在的 E6 一口气。' },
    { stage: '黑棋落子', title: '填掉最后一口气，白棋被提走。', text: '黑棋下到 E6，白棋 E5 没有气了，于是从棋盘上拿走。提子看的是整块棋的气，不是只看某一颗棋旁边有几颗对手棋。', action: '再认一下坐标', aria: '黑棋已下 E6，E5 的白棋被提走。标记 A 对应黑棋刚才的落点 E6。' },
    { stage: '对应到棋盘', title: 'E6，就是 E 列、第 6 行。', text: '列用字母表示，跳过 I；行数从底边向上数。刚才的落点是 E6，提掉的白棋原来在 E5。老师说“看标记 A”时，你就可以直接看棋盘上对应的要点。', action: '再看一遍', aria: 'E 列和第 6 行用引导线强调，交点 E6 为标记 A。' }
  ];
  let step = 0;
  function draw() {
    stones.replaceChildren(); marks.replaceChildren();
    const pieces = [[3,4,1],[5,4,1],[4,5,1]];
    if (step === 0) pieces.push([4,4,2]); else pieces.push([4,3,1]);
    for (const [x,y,color] of pieces) {
      stones.append(svg('circle', { cx: px(x), cy: px(y), r: 15, fill: color === 1 ? '#252a28' : '#eeeade', stroke: color === 1 ? '#111715' : '#827765', 'stroke-width': 1.5 }));
    }
    if (step === 2) marks.append(svg('path', { d: 'M180 24V324M24 144H324', stroke: '#2e6353', 'stroke-width': 2, 'stroke-dasharray': '4 5', fill: 'none' }));
    marks.append(svg('path', { d: 'M165 137V129H173M187 129H195V137M195 151V159H187M173 159H165V151', stroke: '#f7e0ad', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round' }));
    marks.append(svg('circle', { cx: 199, cy: 125, r: 10, fill: '#f0d39a', stroke: '#343b33' }));
    marks.append(svg('text', { x: 199, y: 129, fill: '#252b25', 'font-size': 12, 'font-weight': 700, 'text-anchor': 'middle' }, 'A'));
    const item = steps[step];
    document.getElementById('lessonStage').textContent = item.stage;
    document.getElementById('lessonTitle').textContent = item.title;
    document.getElementById('lessonText').textContent = item.text;
    document.getElementById('demoNext').textContent = item.action;
    document.getElementById('demoReset').disabled = step === 0;
    board.setAttribute('aria-label', item.aria);
  }
  document.getElementById('demoNext').disabled = false;
  document.getElementById('demoNext').addEventListener('click', () => { step = (step + 1) % steps.length; draw(); });
  document.getElementById('demoReset').addEventListener('click', () => { step = 0; draw(); });
  draw();
})();
