/**
 * #3627 — retire EXIF/GPS des photos au moment de l'upload.
 *
 * `sharp(buffer).toBuffer()` (sans `.withMetadata()`) ne recopie PAS les
 * métadonnées EXIF/IPTC/XMP de la source dans la sortie — c'est déjà le
 * comportement par défaut qu'exploite incidemment `mediaWatermark.ts` pour un
 * export de post. Ce module rend ce comportement EXPLICITE et l'applique au
 * pipeline d'upload NORMAL (avatars, messages, posts, stories) : avant ce
 * lot, aucun chemin d'upload ne le faisait — `MetadataManager` ne fait que
 * LIRE les dimensions, jamais réencoder, et l'original chargé par
 * l'utilisateur (GPS de la prise de vue compris) était stocké et servi tel
 * quel.
 *
 * `.rotate()` sans argument applique la rotation/le miroir que décrit le tag
 * EXIF `Orientation`, PUIS le retire — sans cet appel, une photo prise en
 * portrait perdrait son orientation visuelle en même temps que ses
 * métadonnées.
 *
 * Scope délibérément restreint à JPEG et PNG — les deux formats que produit
 * un appareil photo/screenshot et qui portent réellement de l'EXIF/GPS.
 * GIF et WEBP animés sont exclus : `sharp()` sans `{ animated: true }` ne
 * traite que la PREMIÈRE frame, et les réencoder ici détruirait
 * silencieusement l'animation d'un GIF envoyé comme réaction ou sticker.
 */
import sharp from 'sharp';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ImageMetadataStrip' });

const STRIPPED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

export function shouldStripImageMetadata(mimeType: string | undefined | null): boolean {
  return !!mimeType && STRIPPED_IMAGE_MIME_TYPES.has(mimeType);
}

/**
 * Rend le buffer réencodé, EXIF/GPS retirés, orientation visuelle préservée.
 * Fail-open sur tout échec de décodage (fichier corrompu, format annoncé
 * faux) : cette étape ne doit jamais transformer un upload par ailleurs
 * valide en échec — elle sert la vie privée, pas l'admission du fichier, que
 * `ContentSignature`/`validateFile` gouvernent déjà séparément.
 */
export async function stripImageMetadata(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer).rotate().toBuffer();
  } catch (error) {
    logger.error('EXIF/GPS strip failed, keeping original bytes', error as Error);
    return buffer;
  }
}
