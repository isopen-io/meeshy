/**
 * LE TOURNAGE D'UN STICKER MEE POUR iOS (#9053, #9069) — commun aux deux
 * générateurs : `mee-ios-stickers.ts` (les personnages) et
 * `mee-ios-instants.ts` (les Instants, dont le texte est redessiné en natif).
 *
 * Le « film » est un fichier `.lottie` (#10639) : le dessin vectoriel et son
 * mouvement, MESURÉ image par image dans Chromium (`sticker-lottie/shoot.ts`),
 * quelques Ko là où le WebP animé de 360 px en pesait des centaines. Le témoin
 * `sticker-lottie-parity.ts` juge le résultat contre le SVG du web.
 */
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';

import type { Motion } from '../src/lib/mee/motion';
import { LOTTIE_FPS, MEE_EXPORT, exportLottie } from './sticker-lottie/shoot';

export const OUT = fileURLToPath(new URL('../../../packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers', import.meta.url));
export const STORY = join(OUT, '..', '..', 'Story');
export const SIZE = 360;
const MAX_LOOP = 4.8;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WORKERS = 4;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * La durée d'une boucle SANS couture : le plus petit multiple commun des
 * durées de ses gestes, au dixième de seconde. Au-delà de `MAX_LOOP`, la
 * boucle du geste le plus long — une couture discrète vaut mieux qu'un fichier
 * de dix secondes.
 */
export function loopSeconds(motion: Motion): number {
  const tenths = Object.values(motion.roles).flatMap((beat) => (beat === undefined ? [] : [Math.round(beat[1] * 10)]));
  const lcm = tenths.reduce((acc, value) => (acc * value) / gcd(acc, value), 1);
  return lcm / 10 <= MAX_LOOP ? lcm / 10 : Math.max(...tenths) / 10;
}

export type Shot = {
  readonly id: string;
  readonly svg: string;
  readonly motion: Motion | null;
  /** Ce qu'on retouche dans la page avant de tourner — cacher un calque, figer un support. */
  readonly prepare?: (page: Page) => Promise<void>;
};

export async function filmShot(shot: Shot, page: Page, _cdp: CDPSession): Promise<void> {
  const frames = shot.motion === null ? 1 : Math.round(loopSeconds(shot.motion) * LOTTIE_FPS);
  const { bytes } = await exportLottie({ id: shot.id, svg: shot.svg, frames, preset: MEE_EXPORT, ...(shot.prepare === undefined ? {} : { prepare: shot.prepare }) }, page);
  writeFileSync(join(OUT, `mee.${shot.id}.lottie`), bytes);
  rmSync(join(OUT, `mee.${shot.id}.webp`), { force: true });
  process.stdout.write('.');
}

export async function openPages<T>(work: (page: Page, cdp: CDPSession) => Promise<T>): Promise<readonly T[]> {
  const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});
  const results = await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(180_000);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      return work(page, cdp);
    }),
  );
  await browser.close();
  return results;
}

/** Le film d'un identifiant est-il déjà tourné ? (`--resume`) */
export const hasFilm = (id: string): boolean => existsSync(join(OUT, `mee.${id}.lottie`));

/** Retire les films d'une famille — jamais ceux de l'autre générateur. */
export function removeFilms(ids: readonly string[]): void {
  ids.forEach((id) => ['lottie', 'webp'].forEach((ext) => rmSync(join(OUT, `mee.${id}.${ext}`), { force: true })));
}
