// Rend chaque SVG d'un dossier en JPEG 540x960 (polices locales), puis une planche-contact sheet.png.
// Usage : node render.mjs <dossier> [--only nom1,nom2]
import { launch } from './launch.mjs';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2]);
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
const fontsCss = 'file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), '../fonts/fonts.css');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort().filter((f) => !only || only.has(f.replace('.svg', '')));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
for (const file of files) {
  const svg = fs.readFileSync(path.join(dir, file), 'utf8');
  const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="' + fontsCss + '"><style>html,body{margin:0;background:#000}svg{display:block}</style></head><body>' + svg + '</body></html>';
  const tmp = path.join(dir, '.render.html');
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(dir, file.replace('.svg', '.jpg')), type: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: 540, height: 960 } });
}
const all = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
const cols = 6;
const sheet = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#16151d;font:13px sans-serif;color:#ddd;display:grid;grid-template-columns:repeat(' + cols + ',260px);gap:10px;padding:10px;width:' + (cols * 270 + 10) + 'px}figure{margin:0}img{width:260px;height:462px;display:block;border-radius:10px}figcaption{padding:4px 2px}</style></head><body>' + all.map((f) => '<figure><img src="' + f + '"><figcaption>' + f.replace('.jpg', '') + '</figcaption></figure>').join('') + '</body></html>';
fs.writeFileSync(path.join(dir, '.sheet.html'), sheet);
const sp = await browser.newPage({ viewport: { width: cols * 270 + 10, height: 600 } });
await sp.goto('file://' + path.join(dir, '.sheet.html'));
await sp.waitForTimeout(200);
await sp.screenshot({ path: path.join(dir, 'sheet.png'), fullPage: true });
await browser.close();
console.log('rendered', files.length, 'sheet', all.length);
