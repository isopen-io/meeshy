/**
 * LES STICKERS MEE ET MEO D'iOS, FILMÉS DEPUIS LE DESSIN DU WEB (#9053).
 *
 * Le dessin n'a qu'UNE source : `src/lib/mee/` (des chaînes SVG animées en
 * CSS). iOS ne sait pas peindre un SVG animé ; plutôt que de recopier deux
 * cents scènes en Swift — une jumelle qui divergerait au premier trait —, ce
 * script FILME chaque sticker des onglets Mee et Meo dans Chromium, image par
 * image (`document.getAnimations()`, temps posé à la main : aucune image
 * ratée, aucune dépendance à l'horloge), et l'encode en WebP animé, que
 * `AnimatedImageDecoder` lit déjà.
 *
 * Il écrit dans `packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers/` :
 * un `mee.<id>.webp` par sticker des onglets Mee, Meo et Mee & Meo, et l'index
 * `Story/MeeStickerCatalog+Index.swift` (onglet, intention, ordre des intentions)
 * que lit la feuille de stickers (en Swift, pas en JSON : la résolution d'un
 * `templateId` se fait hors du fil principal, où `Bundle.module` n'est pas
 * accessible). Les stickers « Instants » n'y sont pas : leurs
 * emplacements (lieu, heure, météo, message) s'écrivent à l'envoi, et un film
 * ne peut pas les porter.
 *
 * Usage : `bun scripts/mee-ios-stickers.ts` (Chrome ou le Chromium de
 * Playwright doit être installé). Relancer après toute retouche du dessin.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';

import { MEE_STICKERS } from '../src/lib/mee/catalog';
import type { Motion } from '../src/lib/mee/motion';
import { MEE_INTENTS } from '../src/lib/mee/types';
import type { MeeIntent, MeeSticker } from '../src/lib/mee/types';
import { renderMeeSticker } from '../src/lib/mee/render';

const OUT = fileURLToPath(new URL('../../../packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers', import.meta.url));
const SIZE = 360;
const FPS = 15;
const MAX_LOOP = 4.8;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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

const stickers = MEE_STICKERS.filter((sticker) => sticker.tab !== 'instants');

/** `--index-only` réécrit l'index sans retourner les films (douze minutes). */
const indexOnly = process.argv.includes('--index-only');

const WORKERS = 4;
const encode = promisify(execFile);

async function film(sticker: MeeSticker, page: Page, cdp: CDPSession): Promise<void> {
  const svg = renderMeeSticker(sticker, { uid: 'ios', size: SIZE });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const frames = mkdtempSync(join(tmpdir(), 'mee-'));
  const count = sticker.motion === null ? 1 : Math.round(loopSeconds(sticker.motion) * FPS);
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
  const target = join(OUT, `mee.${sticker.id}.webp`);
  const pngs = readdirSync(frames).sort().map((name) => join(frames, name));
  if (count === 1) {
    await encode('cwebp', ['-quiet', '-q', '80', '-alpha_q', '90', pngs[0] as string, '-o', target]);
  } else {
    await encode('img2webp', ['-loop', '0', '-lossy', '-q', '68', '-m', '6', '-d', String(Math.round(1000 / FPS)), ...pngs, '-o', target]);
  }
  rmSync(frames, { recursive: true, force: true });
  process.stdout.write('.');
}

async function filmAll(): Promise<void> {
  const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {});
  const queue = [...stickers];
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      for (let sticker = queue.shift(); sticker !== undefined; sticker = queue.shift()) {
        await film(sticker, page, cdp);
      }
    }),
  );
  await browser.close();
}

if (!indexOnly) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await filmAll();
}

/** `coup-de-mou` → `coupDeMou` : le nom du `case` Swift d'une intention. */
const swiftCase = (intent: string): string => intent.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

const isIntent = (section: string): section is MeeIntent => (MEE_INTENTS as readonly string[]).includes(section);

const entry = (sticker: MeeSticker): string => {
  if (!isIntent(sticker.section)) throw new Error(`${sticker.id} : « ${sticker.section} » n'est pas une intention`);
  return `        MeeSticker(id: ${JSON.stringify(sticker.id)}, tab: .${sticker.tab}, intent: .${swiftCase(sticker.section)}, title: ${JSON.stringify(sticker.title)}, emoji: ${JSON.stringify(sticker.emoji)}, animated: ${sticker.motion !== null}),`;
};
const index = `// GÉNÉRÉ par apps/web/scripts/mee-ios-stickers.ts — ne pas modifier à la main (#9053, #9058).

extension MeeStickerCatalog {
    /// L'ordre des intentions dans la feuille — \`MEE_INTENTS\` du web.
    nonisolated public static let intentOrder: [MeeSticker.Intent] = [${MEE_INTENTS.map((intent) => `.${swiftCase(intent)}`).join(', ')}]

    nonisolated public static let all: [MeeSticker] = [
${stickers.map(entry).join('\n')}
    ]
}
`;
writeFileSync(join(OUT, '..', '..', 'Story', 'MeeStickerCatalog+Index.swift'), index);
process.stdout.write(`\n${stickers.length} stickers → ${OUT}\n`);
