/**
 * LE TOURNAGE D'UN STICKER MEE POUR iOS (#9053, #9069) — commun aux deux
 * générateurs : `mee-ios-stickers.ts` (les personnages) et
 * `mee-ios-instants.ts` (les Instants, dont le texte est redessiné en natif).
 *
 * Chaque image est posée à la main (`document.getAnimations()`, temps fixé) :
 * aucune image ratée, aucune dépendance à l'horloge. Le WebP animé est celui
 * que lit `AnimatedImageDecoder`.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';

import type { Motion } from '../src/lib/mee/motion';

export const OUT = fileURLToPath(new URL('../../../packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers', import.meta.url));
export const STORY = join(OUT, '..', '..', 'Story');
export const SIZE = 360;
const FPS = 15;
const MAX_LOOP = 4.8;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WORKERS = 4;
const encode = promisify(execFile);

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

export async function filmShot(shot: Shot, page: Page, cdp: CDPSession): Promise<void> {
  await page.setContent(`<html><body style="margin:0;background:transparent">${shot.svg}</body></html>`);
  await shot.prepare?.(page);
  const frames = mkdtempSync(join(tmpdir(), 'mee-'));
  const count = shot.motion === null ? 1 : Math.round(loopSeconds(shot.motion) * FPS);
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((ms) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = ms;
      }
    }, (index * 1000) / FPS);
    // `captureBeyondViewport` : la fenêtre de Chrome headless est plus courte
    // que la page demandée, et sans lui la capture s'arrête à son bord — le
    // bas de chaque sticker (pattes, ombre) partait coupé net.
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: SIZE, height: SIZE, scale: 1 },
      captureBeyondViewport: true,
    });
    writeFileSync(join(frames, `${String(index).padStart(3, '0')}.png`), Buffer.from(data, 'base64'));
  }
  const target = join(OUT, `mee.${shot.id}.webp`);
  const pngs = readdirSync(frames).sort().map((name) => join(frames, name));
  if (count === 1) {
    await encode('cwebp', ['-quiet', '-q', '80', '-alpha_q', '90', pngs[0] as string, '-o', target]);
  } else {
    await encode('img2webp', ['-loop', '0', '-lossy', '-q', '68', '-m', '6', '-d', String(Math.round(1000 / FPS)), ...pngs, '-o', target]);
  }
  rmSync(frames, { recursive: true, force: true });
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
export const hasFilm = (id: string): boolean => existsSync(join(OUT, `mee.${id}.webp`));

/** Retire les films d'une famille — jamais ceux de l'autre générateur. */
export function removeFilms(ids: readonly string[]): void {
  ids.forEach((id) => rmSync(join(OUT, `mee.${id}.webp`), { force: true }));
}
