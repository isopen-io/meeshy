import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { extractCaptureTracks } from './captureTracks';
import { mediaCaptureTracks } from './mediaCaptureTracks';
import type { CaptureTrack } from './SoundCaptureService';

const log = enhancedLogger.child({ module: 'collectCaptureTracks' });

/**
 * Pistes de capture COMPLÈTES d'un post : celles du blob `storyEffects`
 * (composer riche, v1 ou canvas v3) + celles synthétisées depuis ses médias
 * attachés (posts vocaux sans blob, vidéos de fond et de scène dont la
 * bande-son est versée). Les médias déjà référencés par une piste du blob
 * restent à cette piste-là (`mediaCaptureTracks` les exclut).
 *
 * Extraite de `PostService` (hors budget de taille) ; RÉSILIENTE : publier ou
 * éditer ne dépend jamais de la bibliothèque.
 */
export async function collectCaptureTracks(
  prisma: Pick<PrismaClient, 'postMedia'>,
  postId: string,
  storyEffects: Record<string, unknown> | undefined,
  allowVideoExtraction: boolean,
  /** Épargne la lecture Prisma quand l'appelant SAIT qu'aucun média n'est attaché. */
  hasAttachedMedia: boolean,
): Promise<CaptureTrack[]> {
  const effectTracks = extractCaptureTracks(storyEffects);
  if (!hasAttachedMedia) return effectTracks;
  try {
    const media = await prisma.postMedia.findMany({
      where: { postId },
      select: { id: true, mimeType: true, duration: true },
    });
    return [
      ...effectTracks,
      ...mediaCaptureTracks({ media, storyEffectsTracks: effectTracks, allowVideoExtraction }),
    ];
  } catch (error) {
    log.error('collectCaptureTracks: lecture des médias impossible',
      error instanceof Error ? error : new Error(String(error)), { postId });
    return effectTracks;
  }
}
