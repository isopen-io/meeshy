/**
 * Service de cache multi-niveau générique
 *
 * Niveaux de cache :
 * 1. Mémoire (Map) - TTL configurable - Toujours disponible, prioritaire
 * 2. Redis - TTL configurable - Si disponible (optionnel)
 *
 * Garantit le fonctionnement en dev/prod même sans Redis
 *
 * @template T Le type de données à mettre en cache
 */

import { Redis } from 'ioredis';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'MultiLevelCache' });

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface MultiLevelCacheOptions<T = any> {
  /**
   * Nom du cache pour les logs et la génération de clés Redis
   */
  name: string;

  /**
   * TTL du cache mémoire en millisecondes (par défaut: 30 minutes)
   */
  memoryTtlMs?: number;

  /**
   * TTL du cache Redis en secondes (par défaut: 1 heure)
   */
  redisTtlSeconds?: number;

  /**
   * Préfixe pour les clés Redis (par défaut: dérivé du nom)
   */
  keyPrefix?: string;

  /**
   * Instance Redis optionnelle
   */
  redis?: Redis;

  /**
   * Intervalle de nettoyage en millisecondes (par défaut: 5 minutes)
   */
  cleanupIntervalMs?: number;

  /**
   * Fonction de sérialisation personnalisée pour Redis (par défaut: JSON.stringify)
   */
  serialize?: (data: T) => string;

  /**
   * Fonction de désérialisation personnalisée pour Redis (par défaut: JSON.parse)
   */
  deserialize?: (value: string) => T;
}

export class MultiLevelCache<T = any> {
  private memoryCache: Map<string, CacheEntry<T>> = new Map();
  private redis: Redis | null = null;

  private readonly name: string;
  private readonly memoryTtlMs: number;
  private readonly redisTtlSeconds: number;
  private readonly keyPrefix: string;
  private readonly serialize: (data: T) => string;
  private readonly deserialize: (value: string) => T;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: MultiLevelCacheOptions) {
    this.name = options.name;
    this.redis = options.redis || null;
    this.memoryTtlMs = options.memoryTtlMs || 30 * 60 * 1000; // 30 minutes par défaut
    this.redisTtlSeconds = options.redisTtlSeconds || 3600; // 1 heure par défaut
    this.keyPrefix = options.keyPrefix || `${this.name}:`;
    this.serialize = options.serialize || JSON.stringify;
    this.deserialize = options.deserialize || JSON.parse;

    const cleanupIntervalMs = options.cleanupIntervalMs || 5 * 60 * 1000; // 5 minutes

    // Démarrer le nettoyage périodique du cache mémoire
    this.cleanupInterval = setInterval(() => this.cleanupExpiredMemoryEntries(), cleanupIntervalMs);

    logger.info(`🚀 [${this.name}] Cache multi-niveau initialisé`);
    logger.info(`   💾 Cache mémoire: ${this.memoryTtlMs / 1000}s TTL`);
    logger.info(`   🔴 Redis: ${this.redis ? 'Activé (' + this.redisTtlSeconds + 's TTL)' : 'Désactivé'}`);
  }

  /**
   * Sauvegarde une valeur dans les deux niveaux de cache
   */
  async set(key: string, data: T): Promise<void> {
    try {
      // Niveau 1: Cache mémoire (TOUJOURS)
      this.memoryCache.set(key, {
        data,
        expiresAt: Date.now() + this.memoryTtlMs
      });

      logger.debug(`💾 [${this.name}] Valeur sauvegardée en mémoire: ${key}`);

      // Niveau 2: Redis (SI DISPONIBLE)
      if (this.redis) {
        const redisKey = this.getRedisKey(key);
        const value = this.serialize(data);
        await this.redis.setex(redisKey, this.redisTtlSeconds, value);
        logger.debug(`   🔴 Redis: sauvegardé avec TTL ${this.redisTtlSeconds}s`);
      }
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur sauvegarde ${key}:`, error);
      throw error;
    }
  }

  /**
   * Récupère une valeur (priorité: mémoire puis Redis)
   */
  async get(key: string): Promise<T | null> {
    try {
      // Niveau 1: Vérifier le cache mémoire d'abord
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
        logger.debug(`📖 [${this.name}] Valeur lue en mémoire: ${key}`);
        return memoryEntry.data;
      }

      // Entrée expirée, la supprimer
      if (memoryEntry) {
        this.memoryCache.delete(key);
      }

      // Niveau 2: Essayer Redis si disponible
      if (this.redis) {
        const redisKey = this.getRedisKey(key);
        const value = await this.redis.get(redisKey);

        if (value) {
          const data = this.deserialize(value);
          logger.debug(`📖 [${this.name}] Valeur lue dans Redis: ${key}`);

          // Repeupler le cache mémoire pour les prochains accès
          this.memoryCache.set(key, {
            data,
            expiresAt: Date.now() + this.memoryTtlMs
          });

          return data;
        }
      }

      return null;
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur lecture ${key}:`, error);
      return null;
    }
  }

  /**
   * Récupère et supprime une valeur (priorité: mémoire puis Redis)
   */
  async getAndDelete(key: string): Promise<T | null> {
    try {
      // Niveau 1: Vérifier le cache mémoire d'abord
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
        this.memoryCache.delete(key);

        // Supprimer aussi de Redis si disponible
        if (this.redis) {
          await this.redis.del(this.getRedisKey(key));
        }

        logger.info(`✅ [${this.name}] Valeur trouvée et supprimée en mémoire: ${key}`);
        return memoryEntry.data;
      }

      // Entrée expirée, la supprimer
      if (memoryEntry) {
        this.memoryCache.delete(key);
      }

      // Niveau 2: Essayer Redis si disponible
      if (this.redis) {
        const redisKey = this.getRedisKey(key);
        const value = await this.redis.get(redisKey);

        if (value) {
          await this.redis.del(redisKey);
          const data = this.deserialize(value);

          logger.info(`✅ [${this.name}] Valeur trouvée et supprimée dans Redis: ${key}`);
          return data;
        }
      }

      logger.debug(`⚠️ [${this.name}] Aucune valeur trouvée pour: ${key}`);
      return null;
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur getAndDelete ${key}:`, error);
      return null;
    }
  }

  /**
   * Vérifie si une clé existe
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Supprime manuellement une valeur
   */
  async delete(key: string): Promise<boolean> {
    try {
      let deleted = false;

      // Supprimer du cache mémoire
      if (this.memoryCache.delete(key)) {
        deleted = true;
      }

      // Supprimer de Redis si disponible
      if (this.redis) {
        const redisDeleted = await this.redis.del(this.getRedisKey(key));
        if (redisDeleted > 0) {
          deleted = true;
        }
      }

      if (deleted) {
        logger.debug(`🗑️ [${this.name}] Valeur supprimée: ${key}`);
      }

      return deleted;
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur suppression ${key}:`, error);
      return false;
    }
  }

  /**
   * Vide complètement le cache
   */
  async clear(): Promise<void> {
    try {
      // Vider le cache mémoire
      const memorySize = this.memoryCache.size;
      this.memoryCache.clear();

      // Vider Redis si disponible (supprimer toutes les clés avec le préfixe)
      if (this.redis) {
        const pattern = `${this.keyPrefix}*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }

      logger.info(`🧹 [${this.name}] Cache vidé (${memorySize} entrées mémoire)`);
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur vidage cache:`, error);
    }
  }

  /**
   * Nettoie les entrées expirées du cache mémoire
   */
  private cleanupExpiredMemoryEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt <= now) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`🧹 [${this.name}] Nettoyage: ${cleanedCount} entrée(s) expirée(s) supprimée(s)`);
    }
  }

  /**
   * Retourne les statistiques du cache
   */
  getStats(): { memorySize: number; memoryCapacity: number; name: string } {
    return {
      name: this.name,
      memorySize: this.memoryCache.size,
      memoryCapacity: Infinity // Pas de limite fixe
    };
  }

  /**
   * Génère la clé Redis complète
   */
  private getRedisKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Ferme le cache et nettoie les ressources
   */
  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.memoryCache.clear();
    logger.info(`🔌 [${this.name}] Cache arrêté`);
  }
}
