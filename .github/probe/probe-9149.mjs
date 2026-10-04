import { chromium } from 'playwright';
const target = process.env.TARGET;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const api = [];
page.on('response', async (r) => {
  if (!r.url().includes('/api/')) return;
  let body = '';
  try { body = (await r.text()).slice(0, 400); } catch {}
  api.push(`${r.status()} ${r.request().method()} ${r.url()} :: ${body.replace(/\s+/g, ' ')}`);
});
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
await page.goto(target, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => console.log('GOTO', e.message));
await page.waitForLoadState('networkidle').catch(() => {});
console.log('FINAL_URL', page.url());
console.log('TITLE', await page.title());
const dialogs = await page.locator('[role=dialog],dialog[open]').allInnerTexts().catch(() => []);
console.log('DIALOGS', JSON.stringify(dialogs));
console.log('VIDEOS', await page.locator('video').count(), 'IMGS', await page.locator('img').count());
console.log('TEXT', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1500));
for (const a of api) console.log('API', a);
await page.screenshot({ path: 'probe.png', fullPage: false });
await browser.close();
