import type { StickerPackItem } from '@meeshy/shared/types/sticker-pack';

import { attachmentSrc } from '@/lib/api/media-url';
import { rasterizeSvg } from '@/lib/mee/png';
import type { RasterizeSvg } from '@/lib/mee/png';

import { renderInstantSvg } from './render';
import type { PackSlots } from './render';

/**
 * **L'IMAGE QUI PART AVEC UN STICKER DE PACK** (#9141) — le repli de tout
 * lecteur qui ne redessine pas le sticker (iOS, Android, un vieux client) :
 * - fixe ou cinématique : le fichier du pack TEL QUEL — un GIF ou un WebP
 *   animé reste animé chez tout le monde ;
 * - Instant : l'image du pack AVEC le texte saisi, en PNG — c'est le seul
 *   moyen qu'un lecteur sans moteur de pack lise le prénom ou le mot écrit.
 */

type Fetcher = (url: string) => Promise<Response>;

const EXTENSION: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

async function bytesOf(item: StickerPackItem, fetcher: Fetcher): Promise<ArrayBuffer | null> {
  try {
    const response = await fetcher(attachmentSrc(item.fileUrl));
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

const dataUrl = (bytes: ArrayBuffer, mime: string): string => {
  const view = new Uint8Array(bytes);
  const binary = Array.from({ length: Math.ceil(view.length / 0x8000) }, (_, i) =>
    String.fromCharCode(...view.subarray(i * 0x8000, (i + 1) * 0x8000)),
  ).join('');
  return `data:${mime};base64,${btoa(binary)}`;
};

/** `null` quand l'image ne se relit pas — l'écran le DIT, rien ne part. */
export async function packStickerFile(
  slug: string,
  item: StickerPackItem,
  slots: PackSlots,
  o: { readonly fetcher?: Fetcher; readonly rasterize?: RasterizeSvg } = {},
): Promise<File | null> {
  const bytes = await bytesOf(item, o.fetcher ?? fetch);
  if (bytes === null) return null;
  const name = `${slug}-${item.key}`;
  if (item.kind !== 'instant') return new File([bytes], `${name}.${EXTENSION[item.mimeType] ?? 'png'}`, { type: item.mimeType });
  try {
    const svg = renderInstantSvg(item, { imageHref: dataUrl(bytes, item.mimeType), slots, uid: `png-${name}`, size: 512 });
    const blob = await (o.rasterize ?? rasterizeSvg)(svg, 512);
    return new File([blob], `${name}.png`, { type: 'image/png' });
  } catch {
    return null;
  }
}
