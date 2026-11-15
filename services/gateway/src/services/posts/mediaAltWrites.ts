import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { applyMediaText } from './mediaText';
import { MediaAltTranslationService } from './MediaAltTranslationService';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'mediaAltWrites' });

export type WrittenMediaAlt = { id: string; text: string | null };

/**
 * Écrit `PostMedia.alt` SANS déclencher la traduction (#6737) — jumelle
 * exacte de `writeMediaCaption` (`mediaCaptionWrites.ts`).
 *
 * Séparée du déclenchement pour qu'un appelant repousse
 * `triggerMediaAltTranslations` APRÈS le commit de SA transaction
 * (`PostService.updatePost`). Déclencher pendant qu'un `$transaction` tient
 * encore le même document `PostMedia` concurrence son verrou Mongo.
 */
export function writeMediaAlt(
  postId: string,
  requestedMediaIds: string[] | undefined,
  mediaAlt: Record<string, string> | undefined,
  client: Pick<PrismaClient, 'postMedia'>,
): Promise<WrittenMediaAlt[]> {
  return applyMediaText('alt', postId, requestedMediaIds, mediaAlt, client);
}

/**
 * Déclenche la traduction de chaque texte alternatif ÉCRIT — jamais de la
 * carte brute de la requête. Fire-and-forget, comme
 * `triggerMediaCaptionTranslations`. Le `try/catch` couvre un service pas
 * encore initialisé (harnais de test sans `MeeshySocketIOManager`).
 */
export function triggerMediaAltTranslations(written: WrittenMediaAlt[]): void {
  for (const { id, text } of written) {
    try {
      MediaAltTranslationService.shared.triggerMediaAltTranslation(id, text).catch((err: unknown) => {
        log.warn('MediaAltTranslation: trigger failed', { mediaId: id, err });
      });
    } catch {
      // MediaAltTranslationService pas encore initialisé — rien à déclencher
    }
  }
}
