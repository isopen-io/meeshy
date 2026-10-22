/**
 * LE GATE DE FIDÉLITÉ DES CADRES DE GLOIRE (#10159, L7 ; prompt § 8.3) — le
 * VRAI peintre web compose l'échantillon de L21a (`docs/product/cadres-de-gloire/cible/`)
 * avec les MÊMES entrées que les cibles : le contrat versionné de chaque
 * collection, les couches du magasin (`services/gateway/assets/packs/`), la
 * photo fixture, les stickers PNG du générateur, les textes d'exemple. La
 * composition 1080 × 1920 descend à 540 × 960 par la MÊME moyenne 2 × 2 que les
 * cibles (`lib/cible-plan.mjs`, `halve`), puis se compare hors boîtes de texte,
 * de blason et d'oiseaux :
 *   · au moins 99,5 % des pixels à |Δ| ≤ 6 sur chaque canal (alpha prémultiplié) ;
 *   · aucun bloc 16 × 16 dont le Δ moyen dépasse 12.
 * Et sur un still, deux peintures des mêmes entrées sont identiques à l'octet
 * (l'aperçu EST l'image finale).
 *
 *   bun scripts/check-glory-frames.ts [--only savane,moments] [--out <dossier>] [--report]
 *
 * `--report` imprime les mesures sans rougir : c'est la forme qui sert tant que
 * la tolérance du § 8.3 se juge contre des couches q82 (README du générateur,
 * « Exporter ») — un gate qui ne peut pas être vert n'en est pas un.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium, watchPage } from './lib/browser.mjs';

type BunOutput = { readonly path: string };
type BunRuntime = {
  readonly build: (options: Record<string, unknown>) => Promise<{ readonly success: boolean; readonly logs: readonly unknown[]; readonly outputs: readonly BunOutput[] }>;
  readonly serve: (options: { readonly port: number; readonly fetch: (request: Request) => Response }) => { readonly port: number; readonly stop: (force: boolean) => Promise<void> };
  readonly file: (path: string) => Blob & { readonly size: number };
};
const Bun = (globalThis as unknown as { readonly Bun: BunRuntime }).Bun;

type SharpImage = { ensureAlpha(): SharpImage; raw(): SharpImage; toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>; png(): SharpImage; toFile(path: string): Promise<unknown> };
type Sharp = ((input: Buffer | string, options?: Record<string, unknown>) => SharpImage) & { concurrency(n: number): void };

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const ROOT = resolve(WEB, '..', '..');
const GLORY_DOC = join(ROOT, 'docs', 'product', 'cadres-de-gloire');
const CIBLE = join(GLORY_DOC, 'cible');
const GENERATOR = join(GLORY_DOC, 'generateur');
const MANIFESTS = join(ROOT, 'packages', 'shared', 'design', 'glory-frames');
const PACK_ASSETS = join(ROOT, 'services', 'gateway', 'assets', 'packs');

const THRESHOLDS = { channelDelta: 6, share: 0.995, block: 16, blockMeanDelta: 12 } as const;
/** Une boîte exclue s'élargit d'autant, en pixels de design : l'anticrénelage d'un bord de texte déborde de sa boîte. */
const EXCLUSION_PAD = 2;

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const only = flag('--only')?.split(',').filter(Boolean) ?? null;
const out = flag('--out');
const reportOnly = args.includes('--report');

const requireFrom = createRequire(join(ROOT, 'services', 'gateway', 'package.json'));
const sharp = requireFrom('sharp') as Sharp;
sharp.concurrency(1);

const { halve } = (await import(join(GENERATOR, 'lib', 'cible-plan.mjs'))) as { halve: (raw: Buffer, width: number, height: number) => Buffer };

type Target = { readonly file: string; readonly collection: string; readonly frame: string; readonly variant: 'plain' | 'message'; readonly layout: string | null };
type Index = { readonly size: readonly [number, number]; readonly targets: readonly Target[]; readonly photo: { readonly file: string } };
const index = JSON.parse(readFileSync(join(CIBLE, 'index.json'), 'utf8')) as Index;

const manifests = new Map<string, { readonly frames: readonly { readonly id: string }[] }>();
const manifestOf = (collection: string) => {
  const cached = manifests.get(collection);
  if (cached !== undefined) return cached;
  const path = join(MANIFESTS, `${collection}.json`);
  const loaded = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { readonly frames: readonly { readonly id: string }[] }) : { frames: [] };
  manifests.set(collection, loaded);
  return loaded;
};

const frameOf = (target: Target): unknown => {
  const id = `${target.collection}.${target.frame.slice(target.collection.length + 1)}`;
  return manifestOf(target.collection).frames.find((frame) => frame.id === id) ?? null;
};

const build = mkdtempSync(join(tmpdir(), 'glory-gate-'));
const entry = join(HERE, 'check-glory-frames.entry.ts');
const built = await Bun.build({ entrypoints: [entry], outdir: build, target: 'browser', naming: { entry: 'gate.[ext]', asset: '[name].[ext]' }, define: { __SHELL__: 'false', __BENCH__: '0', __FIXTURES__: 'false' } });
if (!built.success) {
  built.logs.forEach((log) => console.error(log));
  process.exit(1);
}
const css = built.outputs.some((file) => file.path.endsWith('.css')) ? '<link rel="stylesheet" href="gate.css">' : '';
writeFileSync(join(build, 'index.html'), `<!doctype html><html><head><meta charset="utf-8">${css}</head><body><script type="module" src="gate.js"></script></body></html>`);

const serveFile = (path: string, type?: string): Response => {
  const file = Bun.file(path);
  return file.size > 0 ? new Response(file, type === undefined ? undefined : { headers: { 'Content-Type': type } }) : new Response(null, { status: 404 });
};
const server = Bun.serve({
  port: 0,
  fetch: (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path.startsWith('/layers/')) return serveFile(join(PACK_ASSETS, path.slice('/layers/'.length).replace(/[^a-z0-9.]/g, '')), 'image/webp');
    if (path.startsWith('/mee/')) return serveFile(join(GENERATOR, 'mee', path.slice('/mee/'.length).replace(/[^a-z0-9.-]/g, '')), 'image/png');
    if (path === '/photo.jpg') return serveFile(join(GLORY_DOC, index.photo.file), 'image/jpeg');
    return serveFile(join(build, path === '/' ? 'index.html' : path.slice(1)));
  },
});
const base = `http://localhost:${server.port}`;

type Box = readonly [number, number, number, number];
type Composed = { readonly png: string; readonly stable: boolean; readonly excluded: readonly Box[]; readonly size: readonly [number, number] };

const decode = async (input: Buffer) => sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/** Le masque des pixels comparés, en pixels de design : hors des boîtes exclues (élargies). */
function maskOf(excluded: readonly Box[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height).fill(1);
  for (const [x, y, w, h] of excluded) {
    const x0 = Math.max(0, Math.floor(x / 2) - EXCLUSION_PAD);
    const y0 = Math.max(0, Math.floor(y / 2) - EXCLUSION_PAD);
    const x1 = Math.min(width, Math.ceil((x + w) / 2) + EXCLUSION_PAD);
    const y1 = Math.min(height, Math.ceil((y + h) / 2) + EXCLUSION_PAD);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) mask[yy * width + xx] = 0;
  }
  return mask;
}

const byte = (raw: Buffer, at: number): number => raw[at] ?? 0;
const premultiplied = (raw: Buffer, at: number, channel: number): number => (byte(raw, at + channel) * byte(raw, at + 3)) / 255;

type Verdict = { readonly share: number; readonly worstBlock: number; readonly worstBlocks: readonly string[]; readonly compared: number; readonly diff: Buffer };

function compare(ours: Buffer, target: Buffer, mask: Uint8Array, width: number, height: number): Verdict {
  let within = 0;
  let compared = 0;
  const diff = Buffer.alloc(width * height * 4);
  const perPixel = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (mask[i] === 0) continue;
    const at = i * 4;
    const deltas = [0, 1, 2].map((channel) => Math.abs(premultiplied(ours, at, channel) - premultiplied(target, at, channel)));
    deltas.push(Math.abs(byte(ours, at + 3) - byte(target, at + 3)));
    const worst = Math.max(...deltas);
    perPixel[i] = worst;
    compared++;
    if (worst <= THRESHOLDS.channelDelta) within++;
    const shade = Math.min(255, Math.round(worst * 4));
    diff[at] = shade;
    diff[at + 1] = worst <= THRESHOLDS.channelDelta ? shade : 0;
    diff[at + 2] = 0;
    diff[at + 3] = 255;
  }
  let worstBlock = 0;
  const blocks: { readonly at: string; readonly mean: number }[] = [];
  for (let by = 0; by < height; by += THRESHOLDS.block) {
    for (let bx = 0; bx < width; bx += THRESHOLDS.block) {
      let sum = 0;
      let count = 0;
      for (let y = by; y < Math.min(height, by + THRESHOLDS.block); y++) {
        for (let x = bx; x < Math.min(width, bx + THRESHOLDS.block); x++) {
          const i = y * width + x;
          if (mask[i] === 0) continue;
          sum += perPixel[i] ?? 0;
          count++;
        }
      }
      if (count > 0) {
        worstBlock = Math.max(worstBlock, sum / count);
        blocks.push({ at: `${bx},${by}`, mean: sum / count });
      }
    }
  }
  const worstBlocks = blocks.sort((a, b) => b.mean - a.mean).slice(0, 4).map((block) => `${block.at}:${block.mean.toFixed(0)}`);
  return { share: compared === 0 ? 1 : within / compared, worstBlock, worstBlocks, compared, diff };
}

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
watchPage(page);
await page.goto(`${base}/`);
await page.waitForSelector('body[data-ready="true"]', { state: 'attached' });

if (out !== undefined) mkdirSync(out, { recursive: true });
const failures: string[] = [];
const skipped: string[] = [];
const rows: string[] = [];
const [designWidth, designHeight] = index.size;
for (const target of index.targets) {
  if (only !== null && !only.includes(target.collection)) continue;
  const frame = frameOf(target);
  if (frame === null) {
    skipped.push(`${target.file} : aucun manifeste versionné pour « ${target.collection} » (collection de démonstration, non livrée)`);
    continue;
  }
  const composed = await page.evaluate(
    (input) => (window as unknown as { gloryGate: { compose: (i: unknown) => Promise<Composed> } }).gloryGate.compose(input),
    { frame, variant: target.variant, layers: `${base}/layers`, mee: `${base}/mee`, photo: `${base}/photo.jpg` },
  );
  const png = Buffer.from(composed.png.replace(/^data:image\/png;base64,/, ''), 'base64');
  const full = await decode(png);
  if (full.info.width !== composed.size[0] || full.info.height !== composed.size[1]) throw new Error(`${target.file} : composition ${full.info.width}×${full.info.height}`);
  const ours = halve(full.data, full.info.width, full.info.height);
  const expected = await decode(readFileSync(join(CIBLE, target.file)));
  if (expected.info.width !== designWidth || expected.info.height !== designHeight) throw new Error(`${target.file} : cible ${expected.info.width}×${expected.info.height}`);
  const mask = maskOf(composed.excluded, designWidth, designHeight);
  const verdict = compare(ours, expected.data, mask, designWidth, designHeight);
  const ok = composed.stable && verdict.share >= THRESHOLDS.share && verdict.worstBlock <= THRESHOLDS.blockMeanDelta;
  rows.push(`  ${ok ? 'OK ' : 'KO '} ${target.file.padEnd(40)} |Δ|≤6 : ${(verdict.share * 100).toFixed(2).padStart(6)} %   pire bloc : ${verdict.worstBlock.toFixed(1).padStart(5)}   stable : ${composed.stable ? 'oui' : 'NON'}   (${verdict.compared} px comparés ; pires blocs x,y:Δ ${verdict.worstBlocks.join(' ')})`);
  if (!ok) failures.push(target.file);
  if (out !== undefined) {
    await sharp(ours, { raw: { width: designWidth, height: designHeight, channels: 4 } }).png().toFile(join(out, target.file.replace(/\.webp$/, '.web.png')));
    await sharp(verdict.diff, { raw: { width: designWidth, height: designHeight, channels: 4 } }).png().toFile(join(out, target.file.replace(/\.webp$/, '.diff.png')));
    writeFileSync(join(out, target.file.replace(/\.webp$/, '.full.png')), png);
  }
}

await browser.close();
await server.stop(true);

console.log(`Fidélité des cadres de gloire (§ 8.3) — ${rows.length} cibles, seuils : ${THRESHOLDS.share * 100} % des pixels à |Δ| ≤ ${THRESHOLDS.channelDelta}, bloc ${THRESHOLDS.block}×${THRESHOLDS.block} ≤ ${THRESHOLDS.blockMeanDelta}`);
rows.forEach((row) => console.log(row));
skipped.forEach((line) => console.log(`  --  ${line}`));
if (failures.length > 0) {
  console.log(`${reportOnly ? 'MESURE' : 'ROUGE'} : ${failures.length} cible(s) hors tolérance : ${failures.join(', ')}`);
  if (!reportOnly) process.exit(1);
}
console.log(reportOnly ? 'mesure terminée' : 'vert');
