/**
 * #16557 — le cache mémoire des traductions du processus, joignable par ceux qui
 * RETIRENT un message.
 *
 * `MessageTranslationService` sert ce cache AVANT la base (`getTranslation`) et
 * sans TTL. Les écrivains de retrait vident `Message.translations`, mais aucun
 * ne tenait le service : seule la retraduction purgeait le cache. Une traduction
 * d'un message rappelé restait donc servie jusqu'à l'éviction LRU.
 *
 * Même patron que `notification-service-registry.ts` : `server.ts` enregistre
 * l'instance vivante, et un processus qui n'en enregistre aucune (script, test)
 * n'a aucun cache à purger. La purge ne lève jamais : quand elle s'exécute, le
 * retrait est déjà committé.
 *
 * Le cache est PAR PROCESSUS. Une seconde instance de la passerelle garderait le
 * sien : les portes de traduction jugent donc la loi de lecture avant de lire le
 * cache (`translationReadGate.ts`), et la purge n'est qu'une seconde défense.
 */
import { enhancedLogger } from '../../utils/logger-enhanced';

export type TranslationCachePurger = { invalidateCacheForMessage(messageId: string): void };

const log = enhancedLogger.child({ module: 'translationCacheRegistry' });

let sharedTranslationCache: TranslationCachePurger | undefined;

export function setSharedTranslationCache(purger: TranslationCachePurger | undefined): void {
  sharedTranslationCache = purger;
}

export function purgeTranslationCacheFor(messageIds: readonly string[]): void {
  const purger = sharedTranslationCache;
  if (!purger) return;
  messageIds.forEach((messageId) => {
    try {
      purger.invalidateCacheForMessage(messageId);
    } catch (error) {
      log.warn('translation cache purge failed', { messageId, error });
    }
  });
}
