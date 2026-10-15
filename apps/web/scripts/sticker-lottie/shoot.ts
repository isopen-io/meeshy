/**
 * LE TOURNAGE LOTTIE D'UN STICKER SVG (#10639) — le pendant de `filmShot`
 * (`../mee-ios-film.ts`) : la même page, la même préparation, mais au lieu de
 * capturer des images, on exporte le dessin et son mouvement en Lottie.
 *
 * Le texte est converti en tracés AVANT l'export (`text-path.ts`) ; un texte
 * caché par la préparation (les emplacements d'un Instant, que iOS redessine en
 * natif) reste caché et ne voyage pas.
 */
import type { Page } from '@playwright/test';

import { MEE_VIEWBOX } from '../../src/lib/mee/render';
import { INK, PAPER } from '../../src/lib/mee/art';
import { packDotLottie } from './dotlottie';
import type { ExportOptions } from './page-export';
import { textToPathData, type StickerText } from './text-path';

export const LOTTIE_FPS = 30;

const hexColor = (hex: string): readonly [number, number, number] => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => Math.round((parseInt(value.slice(i, i + 2), 16) / 255) * 1000) / 1000) as unknown as readonly [number, number, number];
};

const [boxX = -8, boxY = -8, boxSize = 216] = MEE_VIEWBOX.split(' ').map(Number);

/** Le préréglage des stickers Mee, Meo et des Instants : la découpe de `renderMeeSticker` (`dieCut`, `src/lib/mee/render.ts`). */
export const MEE_EXPORT: Omit<ExportOptions, 'frames'> = {
  fps: LOTTIE_FPS,
  scene: 'svg > g[filter]',
  box: { x: boxX, y: boxY, size: boxSize },
  dieCut: { paper: hexColor(PAPER), ink: hexColor(INK), outline: 4.4, minCutOpacity: 0.2, shadow: { opacity: 0.26, distance: 2.2, softness: 9.6 } },
};

/*
 * Le runtime Bun, décrit par ce qu'on en appelle (même raison que
 * `render-frame-board.ts`) : le `tsconfig` du web ne charge pas ses types.
 */
type BunRuntime = {
  readonly build: (options: Record<string, unknown>) => Promise<{ readonly success: boolean; readonly logs: readonly unknown[]; readonly outputs: readonly Blob[] }>;
};
const Bun = (globalThis as unknown as { readonly Bun: BunRuntime }).Bun;

let bundled: Promise<string> | null = null;
const pageScript = (): Promise<string> =>
  (bundled ??= Bun.build({ entrypoints: [new URL('./page-entry.ts', import.meta.url).pathname], target: 'browser', format: 'iife', minify: true }).then((result) => {
    const [output] = result.outputs;
    if (!result.success || output === undefined) throw new Error(`bundle de l'export Lottie : ${result.logs.join('\n')}`);
    return output.text();
  }));

export type LottieShot = {
  readonly svg: string;
  readonly id: string;
  readonly frames: number;
  readonly preset: Omit<ExportOptions, 'frames'>;
  readonly prepare?: (page: Page) => Promise<void>;
};

export async function exportLottie(shot: LottieShot, page: Page): Promise<{ readonly bytes: Uint8Array; readonly animation: unknown }> {
  await page.setContent(`<html><body style="margin:0;background:transparent">${shot.svg}</body></html>`);
  await shot.prepare?.(page);
  const texts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('svg text'))
      .filter((t) => getComputedStyle(t).visibility !== 'hidden' && getComputedStyle(t).display !== 'none')
      .map((t, index) => {
        t.setAttribute('data-mee-text', String(index));
        const anchor = t.getAttribute('text-anchor');
        return {
          text: t.textContent ?? '',
          x: parseFloat(t.getAttribute('x') ?? '0'),
          y: parseFloat(t.getAttribute('y') ?? '0'),
          size: parseFloat(t.getAttribute('font-size') ?? '16'),
          weight: parseFloat(t.getAttribute('font-weight') ?? '400'),
          anchor: anchor === 'middle' || anchor === 'end' ? anchor : 'start',
        } as const;
      }),
  );
  const paths = texts.map((t: StickerText) => textToPathData(t));
  await page.evaluate((all) => {
    document.querySelectorAll('svg text[data-mee-text]').forEach((text) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      Array.from(text.attributes)
        .filter((a) => !['x', 'y', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'data-mee-text'].includes(a.name))
        .forEach((a) => path.setAttribute(a.name, a.value));
      path.setAttribute('d', all[Number(text.getAttribute('data-mee-text'))] || 'M0 0');
      text.replaceWith(path);
    });
  }, paths);
  await page.addScriptTag({ content: await pageScript() });
  const options: ExportOptions = { ...shot.preset, frames: shot.frames };
  const { animation, unsupported } = await page.evaluate(
    (o) => (globalThis as unknown as { __meeExportSticker: (o: ExportOptions) => { animation: unknown; unsupported: string[] } }).__meeExportSticker(o),
    options,
  );
  if (unsupported.length > 0) throw new Error(`${shot.id} : éléments non exportés — ${[...new Set(unsupported)].join(', ')}`);
  return { bytes: packDotLottie({ id: shot.id, animation }), animation };
}
