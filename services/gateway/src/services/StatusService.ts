/**
 * Service de gestion des statuts utilisateurs en ligne/hors ligne
 *
 * Ce service met à jour le champ `lastActiveAt` avec deux stratégies de throttling:
 *
 * 1. Activity Update (5s throttle):
 *    → Activités légères: heartbeat, requête API, typing, lecture message
 *    → Utilisé pour indicateurs de présence (online/away/offline)
 *
 * 2. Connection Update (60s throttle):
 *    → Actions significatives: login, Socket.IO connect
 *    → Utilisé pour analytics et tracking d'engagement réel
 *
 * Fonctionnalités:
 * - Throttling différencié: activité légère (5s) et connexion (60s)
 * - Gestion séparée des utilisateurs enregistrés et anonymes
 * - Cache en mémoire avec nettoyage automatique
 * - Updates asynchrones pour ne pas bloquer les requêtes
 *
 * @version 2.2.0
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';

export interface StatusUpdateMetrics {
  totalRequests: number;
  throttledRequests: number;
  successfulUpdates: number;
  failedUpdates: number;
  cacheSize: number;
  activityUpdates: number;
  connectionUpdates: number;
}

export class StatusService {
  // Caches séparés pour activité légère et connexion
  private activityCache = new Map<string, number>();
  private connectionCache = new Map<string, number>();

  // Throttling différencié
  private readonly ACTIVITY_THROTTLE_MS = 5000; // 5 secondes (activité légère)
  private readonly CONNECTION_THROTTLE_MS = 60000; // 1 minute (actions significatives)

  private readonly CACHE_CLEANUP_INTERVAL_MS = 300000; // 5 minutes
  private readonly CACHE_MAX_AGE_MS = 600000; // 10 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Métriques de performance
  private metrics: StatusUpdateMetrics = {
    totalRequests: 0,
    throttledRequests: 0,
    successfulUpdates: 0,
    failedUpdates: 0,
    cacheSize: 0,
    activityUpdates: 0,
    connectionUpdates: 0
  };

  constructor(private prisma: PrismaClient) {
    this.startCacheCleanup();
    logger.info('✅ StatusService initialisé (activity: 5s, connection: 60s)');
  }

  /**
   * Mettre à jour lastActiveAt d'un utilisateur (activité détectable)
   * Throttling: 5 secondes
   * Cas d'usage: connexion Socket.IO, heartbeat, requête API, typing, lecture message
   */
  async updateUserLastSeen(userId: string): Promise<void> {
    this.metrics.totalRequests++;

    const now = Date.now();
    const lastUpdate = this.activityCache.get(userId) || 0;

    // Throttling: 1 update max toutes les 5 secondes
    if (now - lastUpdate < this.ACTIVITY_THROTTLE_MS) {
      this.metrics.throttledRequests++;
      return;
    }

    this.activityCache.set(userId, now);
    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size;

    // Update asynchrone (ne bloque pas la requête)
    this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() }
    })
    .then(() => {
      this.metrics.successfulUpdates++;
      this.metrics.activityUpdates++;
      logger.debug(`✓ User ${userId} lastActiveAt updated (activity)`);
    })
    .catch(err => {
      this.metrics.failedUpdates++;
      logger.error(`❌ Failed to update user lastActiveAt (${userId}):`, err);
    });
  }

  /**
   * Mettre à jour lastActiveAt d'un utilisateur (connexion uniquement)
   * Throttling: 1 minute
   * Cas d'usage: connexion (login, Socket.IO connect)
   */
  async updateUserLastActive(userId: string): Promise<void> {
    this.metrics.totalRequests++;

    const now = Date.now();
    const lastUpdate = this.connectionCache.get(userId) || 0;

    // Throttling: 1 update max par minute
    if (now - lastUpdate < this.CONNECTION_THROTTLE_MS) {
      this.metrics.throttledRequests++;
      return;
    }

    this.connectionCache.set(userId, now);
    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size;

    // Update asynchrone (ne bloque pas la requête)
    this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() }
    })
    .then(() => {
      this.metrics.successfulUpdates++;
      this.metrics.connectionUpdates++;
      logger.debug(`✓ User ${userId} lastActiveAt updated (connection)`);
    })
    .catch(err => {
      this.metrics.failedUpdates++;
      logger.error(`❌ Failed to update user lastActiveAt (${userId}):`, err);
    });
  }

  /**
   * Mettre à jour lastActiveAt d'un participant anonyme (activité détectable)
   * Throttling: 5 secondes
   */
  async updateAnonymousLastSeen(participantId: string): Promise<void> {
    this.metrics.totalRequests++;

    const now = Date.now();
    const cacheKey = `anon_activity_${participantId}`;
    const lastUpdate = this.activityCache.get(cacheKey) || 0;

    // Throttling: 1 update max toutes les 5 secondes
    if (now - lastUpdate < this.ACTIVITY_THROTTLE_MS) {
      this.metrics.throttledRequests++;
      return;
    }

    this.activityCache.set(cacheKey, now);
    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size;

    // Update asynchrone (ne bloque pas la requête)
    this.prisma.anonymousParticipant.update({
      where: { id: participantId },
      data: { lastActiveAt: new Date() }
    })
    .then(() => {
      this.metrics.successfulUpdates++;
      this.metrics.activityUpdates++;
      logger.debug(`✓ Anonymous ${participantId} lastActiveAt updated (activity)`);
    })
    .catch(err => {
      this.metrics.failedUpdates++;
      logger.error(`❌ Failed to update anonymous lastActiveAt (${participantId}):`, err);
    });
  }

  /**
   * Mettre à jour lastActiveAt d'un participant anonyme (connexion uniquement)
   * Throttling: 1 minute
   * Cas d'usage: connexion (Socket.IO connect)
   */
  async updateAnonymousLastActive(participantId: string): Promise<void> {
    this.metrics.totalRequests++;

    const now = Date.now();
    const cacheKey = `anon_connection_${participantId}`;
    const lastUpdate = this.connectionCache.get(cacheKey) || 0;

    // Throttling: 1 update max par minute
    if (now - lastUpdate < this.CONNECTION_THROTTLE_MS) {
      this.metrics.throttledRequests++;
      return;
    }

    this.connectionCache.set(cacheKey, now);
    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size;

    // Update asynchrone (ne bloque pas la requête)
    this.prisma.anonymousParticipant.update({
      where: { id: participantId },
      data: { lastActiveAt: new Date() }
    })
    .then(() => {
      this.metrics.successfulUpdates++;
      this.metrics.connectionUpdates++;
      logger.debug(`✓ Anonymous ${participantId} lastActiveAt updated (connection)`);
    })
    .catch(err => {
      this.metrics.failedUpdates++;
      logger.error(`❌ Failed to update anonymous lastActiveAt (${participantId}):`, err);
    });
  }

  /**
   * Mettre à jour lastActiveAt de manière générique (activité détectable)
   * Cas d'usage: heartbeat, typing, lecture message, requête API
   */
  async updateLastSeen(userId: string, isAnonymous: boolean = false): Promise<void> {
    if (isAnonymous) {
      await this.updateAnonymousLastSeen(userId);
    } else {
      await this.updateUserLastSeen(userId);
    }
  }

  /**
   * Mettre à jour lastActiveAt de manière générique (connexion uniquement)
   * Cas d'usage: connexion (login, Socket.IO connect)
   */
  async updateLastActive(userId: string, isAnonymous: boolean = false): Promise<void> {
    if (isAnonymous) {
      await this.updateAnonymousLastActive(userId);
    } else {
      await this.updateUserLastActive(userId);
    }
  }

  /**
   * Démarrer le nettoyage périodique du cache
   */
  private startCacheCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.clearOldCacheEntries();
    }, this.CACHE_CLEANUP_INTERVAL_MS);

    logger.info(`🧹 Cache cleanup démarré (intervalle: ${this.CACHE_CLEANUP_INTERVAL_MS}ms)`);
  }

  /**
   * Nettoyer les entrées obsolètes du cache (éviter fuite mémoire)
   */
  clearOldCacheEntries(): void {
    const now = Date.now();
    let deletedCount = 0;

    // Nettoyer le cache d'activité
    for (const [key, timestamp] of this.activityCache.entries()) {
      if (now - timestamp > this.CACHE_MAX_AGE_MS) {
        this.activityCache.delete(key);
        deletedCount++;
      }
    }

    // Nettoyer le cache de connexion
    for (const [key, timestamp] of this.connectionCache.entries()) {
      if (now - timestamp > this.CACHE_MAX_AGE_MS) {
        this.connectionCache.delete(key);
        deletedCount++;
      }
    }

    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size;

    if (deletedCount > 0) {
      logger.debug(`🧹 Cache cleanup: ${deletedCount} entrées supprimées (taille: ${this.metrics.cacheSize})`);
    }
  }

  /**
   * Forcer un update immédiat de lastActiveAt (bypass throttling)
   * Utile pour Socket.IO connect/disconnect
   */
  async forceUpdateLastSeen(userId: string, isAnonymous: boolean = false): Promise<void> {
    const cacheKey = isAnonymous ? `anon_activity_${userId}` : userId;
    this.activityCache.set(cacheKey, Date.now());

    if (isAnonymous) {
      await this.prisma.anonymousParticipant.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() }
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() }
      });
    }
  }

  /**
   * Forcer un update immédiat de lastActiveAt pour connexion (bypass throttling)
   * Utile pour connexion Socket.IO ou login
   */
  async forceUpdateLastActive(userId: string, isAnonymous: boolean = false): Promise<void> {
    const cacheKey = isAnonymous ? `anon_connection_${userId}` : userId;
    this.connectionCache.set(cacheKey, Date.now());

    if (isAnonymous) {
      await this.prisma.anonymousParticipant.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() }
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() }
      });
    }
  }

  /**
   * Forcer un update immédiat des deux champs (bypass throttling)
   * Utile pour connexion initiale ou déconnexion
   */
  async forceUpdateBoth(userId: string, isAnonymous: boolean = false): Promise<void> {
    await Promise.all([
      this.forceUpdateLastSeen(userId, isAnonymous),
      this.forceUpdateLastActive(userId, isAnonymous)
    ]);
  }

  /**
   * Obtenir les métriques de performance
   */
  getMetrics(): StatusUpdateMetrics {
    return { ...this.metrics };
  }

  /**
   * Réinitialiser les métriques
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      throttledRequests: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      cacheSize: this.activityCache.size + this.connectionCache.size,
      activityUpdates: 0,
      connectionUpdates: 0
    };
    logger.info('📊 Métriques StatusService réinitialisées');
  }

  /**
   * Arrêter le service proprement
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.activityCache.clear();
    this.connectionCache.clear();
    logger.info('🛑 StatusService arrêté');
  }
}
