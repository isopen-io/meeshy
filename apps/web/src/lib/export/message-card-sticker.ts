import type { MessageCardInput } from './message-card-layout';
import type { CardMedia, CardVisualMedia } from './message-card-media';

/**
 * **UN STICKER NE SE COUPE JAMAIS SUR UNE CARTE** — LOI PURE.
 *
 * Une photo remplit son cadre (« cover ») : elle se recadre, et son cadre a un
 * coin arrondi. Un sticker est un DÉTOURAGE — le recadrer rogne le dessin, et
 * le clip arrondi mord son alpha. Il se pose donc AJUSTÉ (« contain ») dans un
 * cadre au RAPPORT du sticker, centré, sans clip ni fond.
 *
 * Est un sticker : une image dans un format à alpha (PNG / WebP / APNG) — ce
 * format est REQUIS, déclaration comprise : un JPEG n'a pas de détourage à
 * protéger (miroir de `MessageCardSticker.isSticker` iOS). Parmi elles, une
 * pièce que son porteur déclare telle (`sticker`), quelle que soit sa taille,
 * ou à défaut celle dont les deux côtés connus ne dépassent pas 512 px
 * (`STICKER_MAX_SIDE`, la borne de la bibliothèque). Un côté inconnu n'est pas
 * un sticker : sans la déclaration, on ne devine pas.
 */

export const STICKER_MAX_SIDE = 512;
/** La part de la largeur de la boîte qu'un sticker prend : un détourage ne s'étire pas sur toute la carte (miroir de `MessageCardSticker.displayShare`). */
export const STICKER_DISPLAY_SHARE = 0.6;
const STICKER_MIMES = ['image/png', 'image/webp', 'image/apng'] as const;

export type StickerProbe = Pick<CardVisualMedia, 'kind' | 'width' | 'height'> & { readonly mimeType?: string; readonly sticker?: boolean };

export function isStickerMedia(media: CardMedia | StickerProbe): boolean {
  if (media.kind !== 'image') return false;
  const mime = (media.mimeType ?? '').toLowerCase();
  if (!STICKER_MIMES.some((known) => known === mime)) return false;
  if (media.sticker === true) return true;
  return media.width > 0 && media.height > 0 && Math.max(media.width, media.height) <= STICKER_MAX_SIDE;
}

/**
 * Le cadre d'un sticker dans une boîte de `width` × `cap` : au rapport du
 * sticker, jamais plus grand que son côté d'affichage ni que la boîte, centré
 * horizontalement. Un rapport inconnu vaut le carré.
 */
export function stickerFrame(media: Pick<CardVisualMedia, 'width' | 'height'>, width: number, cap: number): { readonly x: number; readonly width: number; readonly height: number } {
  const aspect = media.width > 0 && media.height > 0 ? media.width / media.height : 1;
  const wide = Math.max(1, Math.floor(STICKER_DISPLAY_SHARE * width));
  const tall = Math.round(wide / aspect);
  const [frameWidth, frameHeight] = tall > cap ? [Math.max(1, Math.round(Math.floor(cap) * aspect)), Math.max(1, Math.floor(cap))] : [wide, Math.max(1, tall)];
  return { x: Math.floor((width - frameWidth) / 2), width: frameWidth, height: frameHeight };
}

/** Ce qu'on sait lire des pixels d'une source — image, bitmap ou vidéo. */
export type MeasuredSource = {
  readonly width?: unknown;
  readonly height?: unknown;
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
  readonly videoWidth?: number;
  readonly videoHeight?: number;
};

const pixelSide = (...candidates: readonly unknown[]): number => {
  const found = candidates.find((value): value is number => typeof value === 'number' && value > 0);
  return found ?? 0;
};

/**
 * Les dimensions MANQUANTES d'un visuel (0 : la charge ne les portait pas),
 * relues sur ses vrais pixels une fois décodés — l'aspect d'un sticker ne se
 * devine pas. Une dimension connue n'est jamais remplacée.
 */
export function withMeasuredSizes(media: readonly CardMedia[], sources: readonly (MeasuredSource | null)[]): readonly CardMedia[] {
  return media.map((item, index) => {
    const source = sources[index];
    if (item.kind === 'audio' || source === null || source === undefined || (item.width > 0 && item.height > 0)) return item;
    const width = pixelSide(source.videoWidth, source.naturalWidth, source.width);
    const height = pixelSide(source.videoHeight, source.naturalHeight, source.height);
    return width > 0 && height > 0 ? { ...item, width, height } : item;
  });
}

/** La carte dont les visuels sans dimensions ont pris celles de leurs pixels — la mise en page ne devine pas un aspect. */
export function measuredInput(input: MessageCardInput, sources: readonly (MeasuredSource | null)[]): MessageCardInput {
  return input.media === undefined || sources.length === 0 ? input : { ...input, media: withMeasuredSizes(input.media, sources) };
}
