/**
 * La porte des octets d'une LUT de lens (#11271, audit de #12293).
 *
 * Une LUT est une TABLE : chaque pixel est une valeur, sa position un index.
 * La porte des stickers (`normalizeStickerImage`) la casserait deux fois — en
 * ramenant son plus long côté à 512 px et en la ré-encodant en WebP avec perte.
 * Ici, l'image est relue (le type se lit dans les octets) puis ré-écrite en PNG
 * sans perte, à sa définition : les métadonnées partent, aucune valeur ne change.
 *
 * Aucune valeur ne change, c'est-à-dire (contre-audit de #12293) :
 * - le profil ICC est IGNORÉ, jamais appliqué : `sharp` convertirait sinon une
 *   table marquée Display P3 (le défaut des exports Mac et iPhone) vers sRGB ;
 * - une table 16 bits sort en 16 bits (`rgb16`) ; une table 16 bits qui n'est
 *   pas en couleur ne se garde pas à l'identique, elle est refusée.
 * - une source hors RVB et gris (CMYK, Lab) est refusée (#12329 R4) : la
 *   convertir changerait chaque valeur.
 * Une image animée n'est pas une LUT.
 */
import sharp from 'sharp';
import { STICKER_LIMITS, stickerMimeFromSignature } from '@meeshy/shared/types/sticker-definition';
import type { StickerImageOutcome } from '../stickers/stickerImage';

/**
 * Borne de DÉCODAGE (≈ 48 Mo bruts) : la mémoire d'une source hostile s'arrête là.
 * Les plafonds de poids (12 Mo en entrée, 2 Mo gardés) admettent en pratique
 * une Hald de niveau 8 (512 × 512) ; une Hald de niveau 16 est refusée par le poids.
 */
const MAX_LUT_PIXELS = 4096 * 4096;

/**
 * Les espaces où une table se lit sans conversion (#12329 R4) : RVB et gris,
 * 8 ou 16 bits. Un CMYK, un Lab ou un espace inconnu seraient CONVERTIS en
 * RVB par l'écriture PNG, et chaque valeur de la table changerait : refusés.
 */
const TABLE_SPACES: ReadonlySet<string> = new Set(['srgb', 'rgb', 'rgb16', 'b-w', 'grey16']);

export async function normalizeLensLut(source: Buffer): Promise<StickerImageOutcome> {
  if (source.length > STICKER_LIMITS.maxSourceBytes) return { ok: false, reason: 'too-large' };
  if (stickerMimeFromSignature(source) === null) return { ok: false, reason: 'not-an-image' };
  try {
    const input = sharp(source, { limitInputPixels: MAX_LUT_PIXELS, ignoreIcc: true });
    const meta = await input.metadata();
    if ((meta.pages ?? 1) > 1 || meta.width === undefined || meta.height === undefined) return { ok: false, reason: 'not-an-image' };
    if (meta.space === undefined || !TABLE_SPACES.has(meta.space)) return { ok: false, reason: 'not-an-image' };
    const sixteenBits = meta.depth === 'ushort';
    if (sixteenBits && (meta.channels ?? 0) < 3) return { ok: false, reason: 'not-an-image' };
    const kept = sixteenBits ? input.toColourspace('rgb16') : input;
    const { data, info } = await kept.png({ compressionLevel: 9, palette: false }).toBuffer({ resolveWithObject: true });
    if (data.length > STICKER_LIMITS.maxBytes) return { ok: false, reason: 'too-large' };
    return { ok: true, image: { bytes: data, mimeType: 'image/png', width: info.width, height: info.height, animated: false } };
  } catch {
    return { ok: false, reason: 'not-an-image' };
  }
}
