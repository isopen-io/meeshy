/**
 * Le retrait des métadonnées d'un média téléversé, photo ou vidéo (#3627,
 * #11258, #9746) — UN site pour les trois portes d'entrée : le résumable
 * (fichier déjà posé), le multipart et le chiffrement côté serveur (tampon en
 * clair). Il précède toute persistance, toute vignette et tout chiffrement :
 * le chemin `uploadEncryptedFile` reçoit le CLAIR, ce n'est pas du E2EE au
 * sens de #9224, et sans ce retrait le GPS voyagerait chiffré vers chaque
 * destinataire.
 *
 * Un échec garde l'original et le journalise avec sa cause : c'est le régime
 * de l'image depuis #3627, étendu à la vidéo, jusqu'à ce que le refus de
 * l'upload soit livré (#10686, #9746).
 */
import fs from 'fs/promises';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { isExifStrippable, stripExifFromImageBuffer } from './ExifStrip';
import { isVideoMetadataStrippable, stripVideoMetadataBuffer, stripVideoMetadataFile } from './VideoMetadataStrip';

const logger = enhancedLogger.child({ module: 'media-metadata-strip' });

export function isMediaMetadataStrippable(mimeType: string): boolean {
  return isExifStrippable(mimeType) || isVideoMetadataStrippable(mimeType);
}

/** Retire en place ; rend la taille écrite, ou `null` si rien n'a changé. */
export async function stripStoredMediaMetadata(params: { filePath: string; mimeType: string }): Promise<number | null> {
  try {
    if (isExifStrippable(params.mimeType)) {
      const original = await fs.readFile(params.filePath);
      const stripped = await stripExifFromImageBuffer(original, params.mimeType);
      if (stripped.equals(original)) return null;
      await fs.writeFile(params.filePath, stripped);
      return stripped.length;
    }
    if (!(await stripVideoMetadataFile(params))) return null;
    return (await fs.stat(params.filePath)).size;
  } catch (error) {
    logger.warn('Metadata strip failed, keeping original bytes', { mimeType: params.mimeType, error });
    return null;
  }
}

export async function stripMediaMetadataBuffer(params: { buffer: Buffer; mimeType: string; fileName: string }): Promise<Buffer> {
  try {
    if (isExifStrippable(params.mimeType)) return await stripExifFromImageBuffer(params.buffer, params.mimeType);
    return await stripVideoMetadataBuffer(params);
  } catch (error) {
    logger.warn('Metadata strip failed, keeping original bytes', { mimeType: params.mimeType, error });
    return params.buffer;
  }
}
