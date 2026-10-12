// Rend chaque écran de la planche (une section par écran) en PNG, avec le Chromium du cache Playwright (lib/launch.mjs).
// Usage : node docs/product/cadres-de-gloire/ecrans/capture.mjs   → captures/<id>.png + captures/planche.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../generateur/lib/launch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'captures');
fs.mkdirSync(out, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'light' });
await page.goto(pathToFileURL(path.join(here, 'index.html')).href, { waitUntil: 'load' });
await page.evaluate(() => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))));
const ids = await page.$$eval('.screen-section', (sections) => sections.map((s) => s.id));
for (const id of ids) {
  await page.locator(`#${id}`).evaluate((el) => {
    el.closest('.board').style.maxWidth = 'none';
    el.style.width = 'max-content';
    el.querySelector('.screen-head').style.width = '1440px';
    const stage = el.querySelector('.stage');
    stage.style.overflow = 'visible';
    stage.style.width = 'max-content';
  });
  await page.locator(`#${id}`).screenshot({ path: path.join(out, `${id}.png`) });
  console.log(`${id}.png`);
}
await browser.close();
