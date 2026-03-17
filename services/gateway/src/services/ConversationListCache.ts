/**
 * Cache Multi-Niveaux pour les Listes de Conversations
 *
 * @deprecated This cache was never functional and is effectively dead code.
 * - `redis: undefined` on line ~44 means the Redis layer was never wired.
 * - The conversation list route (`routes/conversations/core.ts`) queries Prisma
 *   directly and never reads from this cache — only the invalidation helpers
 *   (`invalidateConversationCacheAsync`) are imported but operate on a no-op cache.
 * - Architecture Bible audit finding #3: "ConversationListCache — never functional,
 *   Redis never wired, cache read path never implemented in route."
 *
 * Kept for reference: the invalidation logic and multi-level cache design are
 * sound and can be re-enabled once Redis is properly injected and the route
 * is updated to check the cache before querying the database.
 *
 * Original design doc (preserved below):
 *
 * Architecture:
 * - Niveau 1: Mémoire (Map) - TTL 24h - Dernières conversations accédées
 * - Niveau 2: Redis - TTL 24h - Plus grande capacité
 *
 * Invalidation:
 * - Asynchrone (fire-and-forget) lors de modifications
 * - Sur création/édition/suppression de message ou attachment
 * - Tous les membres de la conversation sont invalidés
 *
 * Performance:
 * - Cache HIT: ~0ms (mémoire) ou ~5-10ms (Redis)
 * - Cache MISS: ~250-900ms (DB avec index optimisés)
 * - Invalidation: ~20-50ms (asynchrone, non-bloquant)
 */

import { MultiLevelCache } from './MultiLevelCache';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ConversationListCache' });

// =============================================================================
// TYPES
// =============================================================================

export interface ConversationListResponse {
  conversations: any[];
  hasMore: boolean;
  total: number;
  cachedAt: number;
}

// =============================================================================
// CACHE INSTANCE
// =============================================================================

export const conversationListCache = new MultiLevelCache<ConversationListResponse>({
  name: 'conversations-list',
  memoryTtlMs: 24 * 60 * 60 * 1000,      // 24 heures
  redisTtlSeconds: 24 * 60 * 60,          // 24 heures
  redis: undefined,                        // @deprecated Redis never wired — cache is non-functional (see file-level JSDoc)
  keyPrefix: 'conv-list:',
  cleanupIntervalMs: 10 * 60 * 1000       // Cleanup toutes les 10 minutes
});

// =============================================================================
// INVALIDATION ASYNCHRONE
// =============================================================================

/**
 * Invalide le cache de tous les membres d'une conversation
 *
 * Exécution synchrone pour éviter les race conditions où un client
 * rafraîchit avant que l'invalidation ne soit terminée.
 *
 * L'appelant peut choisir de ne pas await cette fonction pour un comportement
 * fire-and-forget qui ne bloque pas la réponse API.
 *
 * @param conversationId ID de la conversation modifiée
 * @param prisma Instance Prisma pour requêter les membres
 */
export async function invalidateConversationCacheAsync(
  conversationId: string,
  prisma: PrismaClient
): Promise<void> {
  const startTime = performance.now();

  try {
    // Récupérer tous les membres actifs de la conversation
    const members = await prisma.participant.findMany({
      where: {
        conversationId,
        isActive: true
      },
      select: {
        userId: true
      }
    });

    if (members.length === 0) {
      logger.warn(`[CACHE-INVALIDATE] Aucun membre trouvé pour conversation ${conversationId}`);
      return;
    }

    // Invalider le cache de chaque membre en parallèle
    await Promise.all(
      members.map(member => conversationListCache.delete(member.userId))
    );

    const duration = performance.now() - startTime;
    logger.info(
      `[CACHE-INVALIDATE] ✅ ${members.length} users invalidés pour conv ${conversationId} (${duration.toFixed(2)}ms)`
    );
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(
      `[CACHE-INVALIDATE] ❌ Erreur invalidation conv ${conversationId} après ${duration.toFixed(2)}ms:`,
      error
    );
    // Ne pas throw - l'invalidation est best-effort
    // Le TTL 24h nettoiera automatiquement les entrées stale
  }
}

/**
 * Invalide le cache d'un utilisateur spécifique
 *
 * Utile pour des cas particuliers (ex: changement de préférences)
 *
 * @param userId ID de l'utilisateur
 */
export async function invalidateUserCacheAsync(userId: string): Promise<void> {
  setImmediate(async () => {
    try {
      await conversationListCache.delete(userId);
      logger.debug(`[CACHE-INVALIDATE] User ${userId} invalidé`);
    } catch (error) {
      logger.error(`[CACHE-INVALIDATE] Erreur invalidation user ${userId}:`, error);
    }
  });
}

/**
 * Vide complètement le cache (maintenance)
 */
export async function clearAllConversationCache(): Promise<void> {
  try {
    await conversationListCache.clear();
    logger.info('[CACHE-CLEAR] 🧹 Cache conversations complètement vidé');
  } catch (error) {
    logger.error('[CACHE-CLEAR] Erreur vidage cache:', error);
    throw error;
  }
}

/**
 * Retourne les statistiques du cache
 */
export function getCacheStats() {
  return conversationListCache.getStats();
}
