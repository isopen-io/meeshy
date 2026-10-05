import { STICKER_LINE_HEIGHT, STICKER_PACK_LIMITS, layoutStickerText } from '@meeshy/shared/types/sticker-pack';
import type { StickerPackItem, StickerTextZone } from '@meeshy/shared/types/sticker-pack';

import { escapeSvg } from '@/lib/mee/art';

/**
 * LE DESSIN D'UN STICKER DE PACK (#9141).
 *
 * Fixe et cinématique : l'image elle-même — un GIF ou un WebP animé s'anime
 * seul dans un `<img>`. Instant : l'image posée dans le carré de 512, puis le
 * texte de chaque zone, mis en page par `layoutStickerText` — la MÊME
 * fonction que la validation du pack — et découpé par la zone. Deux gardes,
 * pour une promesse : la mise en page tient dans la zone, et si une police
 * exotique trahissait la métrique, la découpe empêche encore le texte d'en
 * sortir.
 */

const C = STICKER_PACK_LIMITS.canvas;
const WEIGHT: Readonly<Record<StickerTextZone['weight'], number>> = { regular: 500, bold: 700, black: 900 };
const ANCHOR: Readonly<Record<StickerTextZone['align'], 'start' | 'middle' | 'end'>> = { start: 'start', center: 'middle', end: 'end' };

export type PackSlots = Readonly<Record<string, string>>;

/** Les valeurs qu'un Instant accepte : une par zone, non vide, jamais plus longue que sa zone ne l'admet. */
export function packSlotsFor(item: Pick<StickerPackItem, 'zones'>, typed: PackSlots): PackSlots {
  return Object.fromEntries(
    item.zones.flatMap((zone) => {
      const value = [...(typed[zone.slot]?.trim() ?? '')].slice(0, zone.maxLength).join('').trim();
      return value === '' ? [] : [[zone.slot, value]];
    }),
  );
}

const anchorX = (zone: StickerTextZone): number =>
  zone.align === 'start' ? zone.box.x : zone.align === 'end' ? zone.box.x + zone.box.width : zone.box.x + zone.box.width / 2;

/** Le texte d'une zone, centré verticalement dans sa boîte, ligne par ligne. */
export function zoneText(zone: StickerTextZone, value: string, clipId: string): string {
  const layout = layoutStickerText(value, zone);
  const step = layout.fontSize * STICKER_LINE_HEIGHT;
  const top = zone.box.y + (zone.box.height - layout.lines.length * step) / 2;
  const x = anchorX(zone);
  const lines = layout.lines
    .map((line, i) => `<tspan x="${x}" y="${(top + i * step + layout.fontSize * 0.92).toFixed(1)}">${escapeSvg(line)}</tspan>`)
    .join('');
  const { x: bx, y: by, width, height } = zone.box;
  return `<clipPath id="${clipId}"><rect x="${bx}" y="${by}" width="${width}" height="${height}"/></clipPath><g clip-path="url(#${clipId})"><text data-zone="${escapeSvg(zone.slot)}" text-anchor="${ANCHOR[zone.align]}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="${layout.fontSize}" font-weight="${WEIGHT[zone.weight]}" fill="${zone.color}" stroke="#ffffff" stroke-width="${(layout.fontSize * 0.14).toFixed(1)}" stroke-linejoin="round" paint-order="stroke">${lines}</text></g>`;
}

/**
 * Le SVG d'un Instant : `imageHref` est l'adresse de l'image (une URL servie
 * pour l'affichage, une `data:` pour la rastérisation de repli). `uid` doit
 * être unique dans le document hôte : il préfixe les découpes.
 */
export function renderInstantSvg(
  item: Pick<StickerPackItem, 'zones' | 'title'>,
  o: { readonly imageHref: string; readonly slots: PackSlots; readonly uid: string; readonly size?: number },
): string {
  const uid = o.uid.replace(/[^a-zA-Z0-9-]/g, '');
  const size = o.size !== undefined ? String(o.size) : '100%';
  const texts = item.zones.map((zone, i) => zoneText(zone, o.slots[zone.slot] ?? zone.defaultText, `pk-${uid}-${i}`)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${C} ${C}" width="${size}" height="${size}" role="img" aria-label="${escapeSvg(item.title)}"><image href="${escapeSvg(o.imageHref)}" x="0" y="0" width="${C}" height="${C}" preserveAspectRatio="xMidYMid meet"/>${texts}</svg>`;
}
