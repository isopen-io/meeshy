/**
 * Normalisation SERVEUR d'une image qui devient un sticker (#7938).
 *
 * Le client normalise déjà (le web réduit au carré de 512 px avant
 * d'envoyer), mais la passerelle ne s'y fie pas : c'est elle qui garde le
 * fichier, et un client peut envoyer n'importe quoi. Ce module est la seule
 * porte d'entrée des octets d'un sticker :
 *
 * - le type se lit dans les OCTETS (`stickerMimeFromSignature`), jamais dans
 *   ce que déclare la requête ;
 * - l'image est RÉ-ENCODÉE, toujours : c'est ce qui retire EXIF/GPS d'une
 *   photo collée et ce qui garantit qu'un fichier gardé est une image lisible ;
 * - un GIF ou un WebP animé garde ses images (`animated: true` de sharp) ;
 * - le côté le plus long est ramené à `STICKER_LIMITS.maxEdge`, ratio gardé ;
 * - le poids est jugé APRÈS normalisation : une capture d'écran de 4 Mo
 *   devient un sticker de quelques dizaines de Ko et passe.
 */
import sharp, { type Sharp } from 'sharp';
import {
  STICKER_LIMITS,
  stickerFitWithin,
  stickerMimeFromSignature,
  stickerStoredMime,
  type StickerMimeType,
} from '@meeshy/shared/types/sticker-definition';

export type NormalizedStickerImage = {
  readonly bytes: Buffer;
  readonly mimeType: StickerMimeType;
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
};

export type StickerImageRefusal = 'not-an-image' | 'too-large';

export type StickerImageOutcome =
  | { readonly ok: true; readonly image: NormalizedStickerImage }
  | { readonly ok: false; readonly reason: StickerImageRefusal };

/** 40 Mpx : au-delà, décoder coûterait plus de mémoire qu'un sticker n'en vaut. */
const MAX_INPUT_PIXELS = 40_000_000;

function encode(pipeline: Sharp, mimeType: StickerMimeType): Sharp {
  if (mimeType === 'image/gif') return pipeline.gif();
  if (mimeType === 'image/webp') return pipeline.webp({ quality: 90 });
  return pipeline.png({ compressionLevel: 9 });
}

export async function normalizeStickerImage(source: Buffer): Promise<StickerImageOutcome> {
  if (source.length > STICKER_LIMITS.maxSourceBytes) return { ok: false, reason: 'too-large' };
  const sourceMime = stickerMimeFromSignature(source);
  if (sourceMime === null) return { ok: false, reason: 'not-an-image' };

  const mimeType = stickerStoredMime(sourceMime);
  const canAnimate = sourceMime === 'image/gif' || sourceMime === 'image/webp';

  try {
    const input = sharp(source, { animated: canAnimate, limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await input.metadata();
    const pages = meta.pages ?? 1;
    const frameHeight = meta.pageHeight ?? meta.height;
    if (meta.width === undefined || frameHeight === undefined) return { ok: false, reason: 'not-an-image' };

    const fit = stickerFitWithin({ width: meta.width, height: frameHeight });
    const oriented = pages > 1 ? input : input.rotate();
    const resized = fit.width === meta.width && fit.height === frameHeight
      ? oriented
      : oriented.resize(fit.width, fit.height, { fit: 'inside' });
    const { data, info } = await encode(resized, mimeType).toBuffer({ resolveWithObject: true });

    if (data.length > STICKER_LIMITS.maxBytes) return { ok: false, reason: 'too-large' };
    return {
      ok: true,
      image: {
        bytes: data,
        mimeType,
        width: info.width,
        height: info.pageHeight ?? info.height,
        animated: pages > 1,
      },
    };
  } catch {
    return { ok: false, reason: 'not-an-image' };
  }
}
