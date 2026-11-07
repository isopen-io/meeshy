import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'vues');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await page.emulateMedia({ colorScheme: 'light' });
await page.goto(pathToFileURL(join(here, 'planche.html')).href);
const boards = await page.$$('figure.board');
for (const board of boards) {
  const id = await board.getAttribute('id');
  const device = await board.$('.dev');
  await device.screenshot({ path: join(out, `${id}.png`), animations: 'disabled' });
}
await browser.close();
console.log(`${boards.length} vues capturées dans ${out}`);
