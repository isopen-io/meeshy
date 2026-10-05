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
 * accessible). Les stickers « Instants » ont leur propre générateur,
 * `mee-ios-instants.ts` : leur texte s'écrit à l'envoi, et iOS le redessine en
 * natif sur un film qui le laisse de côté (#9069).
 *
 * Usage : `bun scripts/mee-ios-stickers.ts` (Chrome ou le Chromium de
 * Playwright doit être installé). Relancer après toute retouche du dessin.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { MEE_STICKERS } from '../src/lib/mee/catalog';
import { MEE_INTENTS } from '../src/lib/mee/types';
import type { MeeIntent, MeeSticker } from '../src/lib/mee/types';
import { renderMeeSticker } from '../src/lib/mee/render';
import { OUT, SIZE, STORY, filmShot, openPages, removeFilms } from './mee-ios-film';

const stickers = MEE_STICKERS.filter((sticker) => sticker.tab !== 'instants');

/** `--index-only` réécrit l'index sans retourner les films (douze minutes). */
const indexOnly = process.argv.includes('--index-only');

if (!indexOnly) {
  mkdirSync(OUT, { recursive: true });
  removeFilms(stickers.map((sticker) => sticker.id));
  const queue = [...stickers];
  await openPages(async (page, cdp) => {
    for (let sticker = queue.shift(); sticker !== undefined; sticker = queue.shift()) {
      await filmShot({ id: sticker.id, svg: renderMeeSticker(sticker, { uid: 'ios', size: SIZE }), motion: sticker.motion }, page, cdp);
    }
  });
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
writeFileSync(join(STORY, 'MeeStickerCatalog+Index.swift'), index);
process.stdout.write(`\n${stickers.length} stickers → ${OUT}\n`);
