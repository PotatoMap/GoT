// Static consistency checks: IDs, i18n keys, assets
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');

const refs = new Set();
for (const m of app.matchAll(/\$\('([\w-]+)'\)/g)) refs.add(m[1]);
const missing = [...refs].filter(id => !new RegExp('id="' + id + '"').test(html));
console.log('IDs referenced:', refs.size);
if (missing.length) { console.log('MISSING IDs:', missing); process.exit(1); }

const keys = new Set();
for (const m of html.matchAll(/data-i18n(?:-title)?="([\w]+)"/g)) keys.add(m[1]);
const zhBlock = app.slice(app.indexOf('zh: {'), app.indexOf('en: {'));
const enBlock = app.slice(app.indexOf('en: {'), app.indexOf('let lang'));
const missZh = [...keys].filter(k => !zhBlock.includes(k + ':'));
const missEn = [...keys].filter(k => !enBlock.includes(k + ':'));
console.log('i18n keys in HTML:', keys.size);
if (missZh.length) { console.log('MISSING zh:', missZh); process.exit(1); }
if (missEn.length) { console.log('MISSING en:', missEn); process.exit(1); }

const assets = ['styles.css', 'favicon.svg', 'manifest.webmanifest', 'js/goengine.js', 'js/gtp.js', 'js/board.js', 'js/app.js'];
const noFile = assets.filter(a => !fs.existsSync(a));
if (noFile.length) { console.log('MISSING FILES:', noFile); process.exit(1); }

// i18n keys used in app.js via t('...')
const tKeys = new Set();
for (const m of app.matchAll(/\bt\('([\w]+)'\)/g)) tKeys.add(m[1]);
const missTzh = [...tKeys].filter(k => !zhBlock.includes(k + ':'));
const missTen = [...tKeys].filter(k => !enBlock.includes(k + ':'));
console.log('t() keys in app.js:', tKeys.size);
if (missTzh.length) { console.log('MISSING t() zh:', missTzh); process.exit(1); }
if (missTen.length) { console.log('MISSING t() en:', missTen); process.exit(1); }

console.log('ALL CONSISTENCY CHECKS PASSED');
