/**
 * LE TÉMOIN DE PARITÉ DES STICKERS EN LOTTIE (#10639) — chaque sticker est
 * rendu deux fois dans Chromium, à quatre instants de sa boucle : par son SVG
 * (la référence, celle du web) et par l'export Lottie joué par lottie-web.
 * Les deux images sont posées sur le même fond opaque, puis on compte les
 * pixels dont l'écart moyen des trois canaux dépasse 40 (sur 255) : l'antialiasing et la police du texte (Manrope à la place de
 * `system-ui`) en laissent quelques pour cent, une pièce perdue, un mouvement
 * décalé ou un liseré manquant en laissent bien plus.
 *
 * Usage : `bun scripts/sticker-lottie-parity.ts [id…]` (Chrome ou le Chromium de
 * Playwright). Sans identifiant : tous les stickers hors Instants. Échoue si
 * un instant dépasse `WORST` ou si la moyenne dépasse `MEAN` ; `--out <dir>`
 * y écrit les trois images (SVG, Lottie, écart) de chaque instant mesuré.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

import { MEE_STICKERS } from '../src/lib/mee/catalog';
import { renderMeeSticker } from '../src/lib/mee/render';
import { loopSeconds } from './mee-ios-film';
import { LOTTIE_FPS, MEE_EXPORT, exportLottie } from './sticker-lottie/shoot';

const SIZE = 360;
const WORST = 0.09;
const MEAN = 0.035;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : undefined;
const ids = args.filter((arg, index) => !arg.startsWith('--') && (outAt < 0 || index !== outAt + 1));
const stickers = MEE_STICKERS.filter((sticker) => (ids.length === 0 ? sticker.tab !== 'instants' : ids.includes(sticker.id)));
const lottieWeb = readFileSync(createRequire(import.meta.url).resolve('lottie-web/build/player/lottie.min.js'), 'utf8');

const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
const judge = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
const capture = async (): Promise<string> => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: SIZE, height: SIZE, scale: 1 }, captureBeyondViewport: true });
  return data;
};

const compare = (a: string, b: string): Promise<{ readonly ratio: number; readonly diff: string }> =>
  judge.evaluate(
    async ([a, b, size]) => {
      const load = (data: string) =>
        new Promise<HTMLImageElement>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = `data:image/png;base64,${data}`;
        });
      const pixels = async (data: string) => {
        const canvas = new OffscreenCanvas(size, size);
        const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        context.fillStyle = '#c8dcf0';
        context.fillRect(0, 0, size, size);
        context.drawImage(await load(data), 0, 0);
        return context.getImageData(0, 0, size, size).data;
      };
      const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D;
      const diff = context.createImageData(size, size);
      let off = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const gap = [0, 1, 2].reduce((sum, k) => sum + Math.abs((pa[i + k] as number) - (pb[i + k] as number)), 0) / 3;
        if (gap > 40) off += 1;
        diff.data.set([gap * 4, gap * 4, gap * 4, 255], i);
      }
      context.putImageData(diff, 0, 0);
      return { ratio: off / (size * size), diff: canvas.toDataURL('image/png').split(',')[1] as string };
    },
    [a, b, SIZE] as const,
  );

const results: { readonly id: string; readonly frame: number; readonly ratio: number }[] = [];
for (const sticker of stickers) {
  const frames = sticker.motion === null ? 1 : Math.round(loopSeconds(sticker.motion) * LOTTIE_FPS);
  const picks = [...new Set([0, Math.floor(frames / 4), Math.floor(frames / 2), Math.floor((3 * frames) / 4)])];
  const svg = renderMeeSticker(sticker, { uid: 'ios', size: SIZE });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const references: string[] = [];
  for (const frame of picks) {
    await page.evaluate((ms) => document.getAnimations().forEach((a) => ((a.currentTime = ms), a.pause())), (frame * 1000) / LOTTIE_FPS);
    references.push(await capture());
  }
  const { animation } = await exportLottie({ id: sticker.id, svg, frames, preset: MEE_EXPORT }, page);
  await page.setContent(`<html><body style="margin:0;background:transparent"><div id="l" style="width:${SIZE}px;height:${SIZE}px"></div></body></html>`);
  await page.addScriptTag({ content: lottieWeb });
  await page.evaluate((data) => {
    const player = (globalThis as unknown as { lottie: { loadAnimation(o: Record<string, unknown>): unknown } }).lottie.loadAnimation({
      container: document.getElementById('l'),
      renderer: 'svg',
      loop: false,
      autoplay: false,
      animationData: data,
    });
    Object.assign(globalThis, { player });
  }, animation);
  for (const [index, frame] of picks.entries()) {
    await page.evaluate(async (f) => {
      const player = (globalThis as unknown as { player: { isLoaded: boolean; addEventListener(name: string, done: () => void): void; goToAndStop(f: number, isFrame: boolean): void } }).player;
      if (!player.isLoaded) await new Promise<void>((resolve) => player.addEventListener('DOMLoaded', resolve));
      player.goToAndStop(f, true);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, frame);
    const lottie = await capture();
    const { ratio, diff } = await compare(references[index] as string, lottie);
    results.push({ id: sticker.id, frame, ratio });
    if (out !== undefined) {
      mkdirSync(join(out, sticker.id), { recursive: true });
      writeFileSync(join(out, sticker.id, `${frame}-svg.png`), Buffer.from(references[index] as string, 'base64'));
      writeFileSync(join(out, sticker.id, `${frame}-lottie.png`), Buffer.from(lottie, 'base64'));
      writeFileSync(join(out, sticker.id, `${frame}-diff.png`), Buffer.from(diff, 'base64'));
    }
  }
  process.stdout.write('.');
}
await browser.close();

const mean = results.reduce((sum, r) => sum + r.ratio, 0) / Math.max(1, results.length);
const worst = [...results].sort((a, b) => b.ratio - a.ratio).slice(0, 5);
const pct = (value: number) => `${(value * 100).toFixed(2)} %`;
process.stdout.write(`\n${stickers.length} stickers, ${results.length} instants mesurés — moyenne ${pct(mean)} (plafond ${pct(MEAN)})\n`);
worst.forEach((r) => process.stdout.write(`  ${r.id} image ${r.frame} : ${pct(r.ratio)}\n`));
const failed = results.filter((r) => r.ratio > WORST);
if (failed.length > 0 || mean > MEAN) {
  process.stdout.write(`ÉCHEC : ${failed.length} instant(s) au-delà de ${pct(WORST)}${mean > MEAN ? ', moyenne trop haute' : ''}\n`);
  process.exit(1);
}
