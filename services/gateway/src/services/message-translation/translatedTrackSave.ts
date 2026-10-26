/**
 * #13100 — une piste TTS reçue du translator s'écrit sous `translated/`, et
 * son adresse ne s'ANNONCE que si elle a bien été écrite : une écriture qui
 * échoue (disque, verrou de scellement) ne publie jamais, en base ni en temps
 * réel, une adresse vers un fichier absent. La traduction garde son texte.
 * Sans binaire, l'adresse attendue reste annoncée comme avant (le binaire suit
 * par un autre chemin).
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { writeTranslatedTrack } from '../attachments/atRest/translatedTrackWrite';

const logger = enhancedLogger.child({ module: 'translatedTrackSave' });

export type TrackLocation = { readonly path?: string; readonly url?: string };

export async function saveTranslatedTrack(
  prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>,
  track: {
    readonly translatedDir: string;
    readonly filename: string;
    readonly attachmentId: string;
    readonly language: string;
    readonly binary?: Buffer | null;
    readonly base64?: string | null;
  }
): Promise<TrackLocation> {
  const localPath = path.resolve(track.translatedDir, track.filename);
  const location = { path: localPath, url: `/api/v1/attachments/file/translated/${track.filename}` };
  if (!track.binary && !track.base64) {
    logger.warn(`   ⚠️ Aucun binaire disponible pour ${track.language}, url=${location.url}`);
    return location;
  }
  try {
    await fs.mkdir(track.translatedDir, { recursive: true });
    const bytes = track.binary || Buffer.from(track.base64 as string, 'base64');
    await writeTranslatedTrack(prisma, { absolutePath: localPath, bytes, attachmentId: track.attachmentId, language: track.language });
    logger.info(`   📁 Audio sauvegardé (${track.binary ? 'multipart' : 'base64'}): ${track.filename} (${(bytes.length / 1024).toFixed(1)}KB)`);
    return location;
  } catch (error) {
    logger.error(`   ❌ Erreur sauvegarde audio: ${error instanceof Error ? error.name : 'unknown'} — piste non annoncée`);
    return {};
  }
}
