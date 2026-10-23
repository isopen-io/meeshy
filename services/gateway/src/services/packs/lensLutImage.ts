/**
 * La porte des octets d'une LUT de lens (#11271, audit de #12293).
 *
 * Une LUT est une TABLE : chaque pixel est une valeur, sa position un index.
 * La porte des stickers (`normalizeStickerImage`) la casserait deux fois — en
 * ramenant son plus long côté à 512 px et en la ré-encodant en WebP avec perte.
 * Ici, l'image est relue (le type se lit dans les octets) puis ré-écrite en PNG
 * sans perte, à sa définition : les métadonnées partent, aucun pixel ne change.
 * Une image animée n'est pas une LUT.
 */
import sharp from 'sharp';
import { STICKER_LIMITS, stickerMimeFromSignature } from '@meeshy/shared/types/sticker-definition';
import type { StickerImageOutcome } from '../stickers/stickerImage';

/** 16 Mpx : une Hald CLUT de niveau 16 (4096 × 4096), la plus grande table en usage. */
const MAX_LUT_PIXELS = 4096 * 4096;

export async function normalizeLensLut(source: Buffer): Promise<StickerImageOutcome> {
  if (source.length > STICKER_LIMITS.maxSourceBytes) return { ok: false, reason: 'too-large' };
  if (stickerMimeFromSignature(source) === null) return { ok: false, reason: 'not-an-image' };
  try {
    const input = sharp(source, { limitInputPixels: MAX_LUT_PIXELS });
    const meta = await input.metadata();
    if ((meta.pages ?? 1) > 1 || meta.width === undefined || meta.height === undefined) return { ok: false, reason: 'not-an-image' };
    const { data, info } = await input.png({ compressionLevel: 9, palette: false }).toBuffer({ resolveWithObject: true });
    if (data.length > STICKER_LIMITS.maxBytes) return { ok: false, reason: 'too-large' };
    return { ok: true, image: { bytes: data, mimeType: 'image/png', width: info.width, height: info.height, animated: false } };
  } catch {
    return { ok: false, reason: 'not-an-image' };
  }
}
