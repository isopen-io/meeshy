/**
 * LA PLANCHE DE DESIGN DES CADRES DE CAPTURE (#8741) — un outil pour le
 * porteur, JAMAIS livré dans l'application.
 *
 *   bun run scripts/render-frame-board.ts <dossier-de-sortie> [--size 540x960] [--only <préfixe>]
 *
 * Construit `render-frame-board.entry.ts` (Bun.build, polices comprises), le
 * sert en local, l'ouvre dans le Chromium de Playwright, puis rend chaque
 * cadre du catalogue avec des visages synthétiques : au nombre MINIMUM de sa
 * tranche, et aussi au MAXIMUM pour `comite` et `groupe`. Un PNG par rendu
 * (`<id>.png`, `<id>@<n>.png` pour le maximum), un `manifest.json` et un
 * `index.html` qui les montre tous, rangés par ambiance.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';

/*
 * Le runtime Bun, décrit par ce qu'on en appelle : le `tsconfig` du web ne
 * charge pas les types de Bun (il type l'application, pas l'outillage), et ce
 * script ne tourne que sous `bun run`.
 */
type BunOutput = { readonly path: string };
type BunRuntime = {
  readonly build: (options: Record<string, unknown>) => Promise<{ readonly success: boolean; readonly logs: readonly unknown[]; readonly outputs: readonly BunOutput[] }>;
  readonly serve: (options: { readonly port: number; readonly fetch: (request: Request) => Response }) => { readonly port: number; readonly stop: (force: boolean) => Promise<void> };
  readonly file: (path: string) => Blob;
};
const Bun = (globalThis as unknown as { readonly Bun: BunRuntime }).Bun;

type BoardFrame = { readonly id: string; readonly mood: string; readonly motif: string; readonly name: string; readonly bucket: string; readonly people: readonly [number, number] };
type Board = { readonly list: () => readonly BoardFrame[]; readonly render: (id: string, count: number, width: number, height: number, cameraOff: readonly number[]) => Promise<string> };

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const output = resolve(args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--')) ?? 'frame-board');
const [width, height] = (flag('--size') ?? '540x960').split('x').map(Number) as [number, number];
const only = flag('--only');

const build = mkdtempSync(join(tmpdir(), 'frame-board-'));
const entry = fileURLToPath(new URL('./render-frame-board.entry.ts', import.meta.url));
const result = await Bun.build({ entrypoints: [entry], outdir: build, target: 'browser', naming: { entry: 'board.[ext]', asset: '[name].[ext]' }, define: { __SHELL__: 'false', __BENCH__: '0', __FIXTURES__: 'true' } });
if (!result.success) {
  result.logs.forEach((log) => console.error(log));
  process.exit(1);
}
const css = result.outputs.some((file) => file.path.endsWith('.css')) ? '<link rel="stylesheet" href="board.css">' : '';
writeFileSync(join(build, 'index.html'), `<!doctype html><html><head><meta charset="utf-8">${css}</head><body><script type="module" src="board.js"></script></body></html>`);

const server = Bun.serve({
  port: 0,
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    const file = Bun.file(join(build, path === '/' ? 'index.html' : path.slice(1)));
    return file.size > 0 ? new Response(file) : new Response(null, { status: 404 });
  },
});

mkdirSync(output, { recursive: true });
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (error) => console.error(`page : ${error.message}`));
await page.goto(`http://localhost:${server.port}/`);
await page.waitForSelector('body[data-ready="true"]', { state: 'attached' });

const frames = (await page.evaluate(() => (window as unknown as { frameBoard: Board }).frameBoard.list())).filter((frame) => only === undefined || frame.id.startsWith(only));
const renders = frames.flatMap((frame) => {
  const counts = frame.bucket === 'comite' || frame.bucket === 'groupe' ? [frame.people[0], frame.people[1]] : [frame.people[0]];
  return counts.map((count, index) => ({ frame, count, file: index === 0 ? `${frame.id}.png` : `${frame.id}@${count}.png` }));
});

const manifest: (BoardFrame & { readonly rendered: number; readonly file: string })[] = [];
for (const item of renders) {
  const cameraOff = item.count >= 4 ? [item.count - 1] : [];
  const url = await page.evaluate(({ id, count, w, h, off }) => (window as unknown as { frameBoard: Board }).frameBoard.render(id, count, w, h, off), { id: item.frame.id, count: item.count, w: width, h: height, off: cameraOff });
  writeFileSync(join(output, item.file), Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
  manifest.push({ ...item.frame, rendered: item.count, file: item.file });
}
writeFileSync(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const moods = [...new Set(manifest.map((entry) => entry.mood))];
const sections = moods
  .map((mood) => {
    const cards = manifest
      .filter((entry) => entry.mood === mood)
      .map((entry) => `<figure><img src="${entry.file}" loading="lazy" width="${width / 2}" height="${height / 2}"><figcaption><b>${entry.name}</b> · ${entry.bucket} · ${entry.rendered} pers.<br><code>${entry.id}</code></figcaption></figure>`)
      .join('');
    return `<h2>${mood}</h2><div class="grid">${cards}</div>`;
  })
  .join('');
writeFileSync(
  join(output, 'index.html'),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cadres de capture</title><style>:root{color-scheme:light dark;--bg:#f6f5f2;--ink:#1c1b1f}@media (prefers-color-scheme:dark){:root{--bg:#141318;--ink:#ecebf0}}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:14px/1.4 -apple-system,system-ui,sans-serif}h2{text-transform:capitalize;margin:32px 0 12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${width / 2}px,1fr));gap:20px}figure{margin:0}img{width:100%;height:auto;border-radius:12px;box-shadow:0 6px 24px #0003}figcaption{margin-top:6px;font-size:12px;opacity:.8}code{font-size:11px}</style></head><body><h1>Cadres de capture — ${manifest.length} rendus</h1>${sections}</body></html>\n`,
);

await browser.close();
await server.stop(true);
console.log(`${manifest.length} rendus → ${output}`);
