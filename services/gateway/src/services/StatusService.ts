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
import { getCacheStore, type CacheStore } from './CacheStore';

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
  private onlineEnsureCache = new Map<string, number>(); // throttle pour ensureUserOnline

  // Guard contre les race conditions: empêche les updates fire-and-forget après un disconnect
  private disconnectedUsers = new Map<string, number>(); // key -> timestamp disconnect
  private readonly DISCONNECT_GUARD_MAX_AGE_MS = 60000; // 60s avant purge auto

  // Redis presence keys (TTL-based, survit aux crashs)
  private cache: CacheStore;
  private readonly PRESENCE_TTL_SECONDS = 120; // 2 minutes

  // Throttling différencié
  private readonly ACTIVITY_THROTTLE_MS = 5000; // 5 secondes (activité légère)
  private readonly CONNECTION_THROTTLE_MS = 60000; // 1 minute (actions significatives)
  private readonly ONLINE_ENSURE_THROTTLE_MS = 60000; // 1 minute (mise en ligne via REST)

  // Callback pour broadcaster les changements de présence (set par MeeshySocketIOManager)
  private presenceCallback: ((userId: string, isOnline: boolean, isAnonymous: boolean) => void) | null = null;

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
    this.cache = getCacheStore();
    this.startCacheCleanup();
    logger.info('✅ StatusService initialisé (activity: 5s, connection: 60s, Redis presence TTL: 120s)');
  }

  /**
   * Définir le callback de broadcast pour les changements de présence
   * Appelé par MeeshySocketIOManager après initialisation
   */
  setPresenceCallback(callback: (userId: string, isOnline: boolean, isAnonymous: boolean) => void): void {
    this.presenceCallback = callback;
    logger.info('✅ StatusService: presenceCallback configuré');
  }

  /**
   * S'assurer qu'un utilisateur est marqué en ligne via REST
   * Throttling: 60 secondes — si l'utilisateur fait des requêtes REST mais n'est pas
   * connecté via Socket.IO, on le marque en ligne et on broadcaste.
   */
  ensureUserOnline(userId: string, isAnonymous: boolean = false): void {
    const cacheKey = isAnonymous ? `anon_online_${userId}` : userId;

    if (this.disconnectedUsers.has(cacheKey)) return;

    const now = Date.now();
    const lastEnsure = this.onlineEnsureCache.get(cacheKey) || 0;

    if (now - lastEnsure < this.ONLINE_ENSURE_THROTTLE_MS) return;

    this.onlineEnsureCache.set(cacheKey, now);

    const updatePromise = isAnonymous
      ? this.prisma.participant.update({
          where: { id: userId },
          data: { isOnline: true, lastActiveAt: new Date() }
        })
      : this.prisma.user.update({
          where: { id: userId },
          data: { isOnline: true, lastActiveAt: new Date() }
        });

    updatePromise
      .then(() => {
        logger.info(`🟢 ${isAnonymous ? 'Anonymous' : 'User'} ${userId} marked online via REST`);
        if (this.presenceCallback) {
          this.presenceCallback(userId, true, isAnonymous);
        }
      })
      .catch(err => {
        logger.error(`❌ Failed to ensure online for ${userId}:`, err);
      });
  }

  /**
   * Marquer un utilisateur comme déconnecté (empêche les updates fire-and-forget post-disconnect)
   */
  markDisconnected(userId: string, isAnonymous: boolean): void {
    const key = isAnonymous ? `anon_activity_${userId}` : userId;
    const onlineKey = isAnonymous ? `anon_online_${userId}` : userId;
    this.disconnectedUsers.set(key, Date.now());
    // Aussi le key connection pour anonymes
    if (isAnonymous) {
      this.disconnectedUsers.set(`anon_connection_${userId}`, Date.now());
    }
    this.activityCache.delete(key);
    this.connectionCache.delete(isAnonymous ? `anon_connection_${userId}` : userId);
    this.onlineEnsureCache.delete(onlineKey);

    // Supprimer la clé Redis de présence
    const redisKey = `presence:${isAnonymous ? 'anon' : 'user'}:${userId}`;
    this.cache.del(redisKey).catch(err => {
      logger.debug(`Failed to delete Redis presence key ${redisKey}:`, err);
    });
  }

  /**
   * Marquer un utilisateur comme connecté (retire le guard de disconnect)
   */
  markConnected(userId: string, isAnonymous: boolean): void {
    const key = isAnonymous ? `anon_activity_${userId}` : userId;
    this.disconnectedUsers.delete(key);
    if (isAnonymous) {
      this.disconnectedUsers.delete(`anon_connection_${userId}`);
    }

    // Créer la clé Redis de présence avec TTL
    const redisKey = `presence:${isAnonymous ? 'anon' : 'user'}:${userId}`;
    this.cache.set(redisKey, String(Date.now()), this.PRESENCE_TTL_SECONDS).catch(err => {
      logger.debug(`Failed to set Redis presence key ${redisKey}:`, err);
    });
  }

  /**
   * Mettre à jour lastActiveAt d'un utilisateur (activité détectable)
   * Throttling: 5 secondes
   * Cas d'usage: connexion Socket.IO, heartbeat, requête API, typing, lecture message
   */
  async updateUserLastSeen(userId: string): Promise<void> {
    this.metrics.totalRequests++;

    // Guard: skip si l'utilisateur est déjà déconnecté (évite race condition)
    if (this.disconnectedUsers.has(userId)) return;

    const now = Date.now();
    const lastUpdate = this.activityCache.get(userId) || 0;

    // Throttling: 1 update max toutes les 5 secondes
    if (now - lastUpdate < this.ACTIVITY_THROTTLE_MS) {
      this.metrics.throttledRequests++;
      return;
    }

    this.activityCache.set(userId, now);
    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size + this.onlineEnsureCache.size;

    // Renouveler le TTL Redis de présence
    this.cache.set(`presence:user:${userId}`, String(now), this.PRESENCE_TTL_SECONDS).catch(() => {});

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

    // Guard: skip si l'utilisateur est déjà déconnecté (évite race condition)
    if (this.disconnectedUsers.has(userId)) return;

    const now = Date.now();
    const lastUpdate = this.connectionCache.get(userId) || 0;

    // Throttling: 1 update max par minute
    if (now - lastUpdate < this.CONNECTION_THROTTLE_MS) {
      this.metrics.throttledRequests++;
      return;
    }

    this.connectionCache.set(userId, now);
    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size + this.onlineEnsureCache.size;

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

    const cacheKey = `anon_activity_${participantId}`;

    // Guard: skip si l'utilisateur est déjà déconnecté (évite race condition)
    if (this.disconnectedUsers.has(cacheKey)) return;

    const now = Date.now();
    const lastUpdate = this.activityCache.get(cacheKey) || 0;

    // Throttling: 1 update max toutes les 5 secondes
    if (now - lastUpdate < this.ACTIVITY_THROTTLE_MS) {
      this.metrics.throttledRequests++;
      return;
    }

    this.activityCache.set(cacheKey, now);
    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size + this.onlineEnsureCache.size;

    // Renouveler le TTL Redis de présence
    this.cache.set(`presence:anon:${participantId}`, String(now), this.PRESENCE_TTL_SECONDS).catch(() => {});

    // Update asynchrone (ne bloque pas la requête)
    this.prisma.participant.update({
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

    const cacheKey = `anon_connection_${participantId}`;

    // Guard: skip si l'utilisateur est déjà déconnecté (évite race condition)
    if (this.disconnectedUsers.has(cacheKey)) return;

    const now = Date.now();
    const lastUpdate = this.connectionCache.get(cacheKey) || 0;

    // Throttling: 1 update max par minute
    if (now - lastUpdate < this.CONNECTION_THROTTLE_MS) {
      this.metrics.throttledRequests++;
      return;
    }

    this.connectionCache.set(cacheKey, now);
    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size + this.onlineEnsureCache.size;

    // Update asynchrone (ne bloque pas la requête)
    this.prisma.participant.update({
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

    // Nettoyer le cache onlineEnsure
    for (const [key, timestamp] of this.onlineEnsureCache.entries()) {
      if (now - timestamp > this.CACHE_MAX_AGE_MS) {
        this.onlineEnsureCache.delete(key);
        deletedCount++;
      }
    }

    // Purger les entries disconnectedUsers de plus de 60s (évite fuite mémoire)
    for (const [key, timestamp] of this.disconnectedUsers.entries()) {
      if (now - timestamp > this.DISCONNECT_GUARD_MAX_AGE_MS) {
        this.disconnectedUsers.delete(key);
        deletedCount++;
      }
    }

    this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size + this.onlineEnsureCache.size;

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
      await this.prisma.participant.update({
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
      await this.prisma.participant.update({
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
    this.onlineEnsureCache.clear();
    this.disconnectedUsers.clear();
    logger.info('🛑 StatusService arrêté');
  }
}
