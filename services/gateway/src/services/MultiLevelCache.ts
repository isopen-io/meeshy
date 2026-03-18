/**
 * Service de cache multi-niveau générique
 *
 * Niveaux de cache :
 * 1. Mémoire (Map) - TTL configurable - Toujours disponible, prioritaire
 * 2. CacheStore distant (Redis ou autre) - TTL configurable - Si disponible (optionnel)
 *
 * Garantit le fonctionnement en dev/prod même sans backend de cache distant
 *
 * @template T Le type de données à mettre en cache
 */

import type { CacheStore } from './CacheStore';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'MultiLevelCache' });

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface MultiLevelCacheOptions<T = any> {
  name: string;
  memoryTtlMs?: number;
  remoteTtlSeconds?: number;
  keyPrefix?: string;
  store?: CacheStore;
  cleanupIntervalMs?: number;
  serialize?: (data: T) => string;
  deserialize?: (value: string) => T;
}

export class MultiLevelCache<T = any> {
  private memoryCache: Map<string, CacheEntry<T>> = new Map();
  private store: CacheStore | null = null;

  private readonly name: string;
  private readonly memoryTtlMs: number;
  private readonly remoteTtlSeconds: number;
  private readonly keyPrefix: string;
  private readonly serialize: (data: T) => string;
  private readonly deserialize: (value: string) => T;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: MultiLevelCacheOptions) {
    this.name = options.name;
    this.store = options.store || null;
    this.memoryTtlMs = options.memoryTtlMs || 30 * 60 * 1000;
    this.remoteTtlSeconds = options.remoteTtlSeconds || 3600;
    this.keyPrefix = options.keyPrefix || `${this.name}:`;
    this.serialize = options.serialize || JSON.stringify;
    this.deserialize = options.deserialize || JSON.parse;

    const cleanupIntervalMs = options.cleanupIntervalMs || 5 * 60 * 1000;
    this.cleanupInterval = setInterval(() => this.cleanupExpiredMemoryEntries(), cleanupIntervalMs);

    logger.info(`🚀 [${this.name}] Cache multi-niveau initialisé`);
    logger.info(`   💾 Cache mémoire: ${this.memoryTtlMs / 1000}s TTL`);
    logger.info(`   🔴 Store distant: ${this.store ? 'Activé (' + this.remoteTtlSeconds + 's TTL)' : 'Désactivé'}`);
  }

  async set(key: string, data: T): Promise<void> {
    try {
      this.memoryCache.set(key, {
        data,
        expiresAt: Date.now() + this.memoryTtlMs
      });

      if (this.store) {
        const remoteKey = this.getRemoteKey(key);
        const value = this.serialize(data);
        await this.store.set(remoteKey, value, this.remoteTtlSeconds);
      }
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur sauvegarde ${key}:`, error);
      throw error;
    }
  }

  async get(key: string): Promise<T | null> {
    try {
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
        return memoryEntry.data;
      }

      if (memoryEntry) {
        this.memoryCache.delete(key);
      }

      if (this.store) {
        const remoteKey = this.getRemoteKey(key);
        const value = await this.store.get(remoteKey);

        if (value) {
          const data = this.deserialize(value);
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

  async getAndDelete(key: string): Promise<T | null> {
    try {
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
        this.memoryCache.delete(key);
        if (this.store) {
          await this.store.del(this.getRemoteKey(key));
        }
        return memoryEntry.data;
      }

      if (memoryEntry) {
        this.memoryCache.delete(key);
      }

      if (this.store) {
        const remoteKey = this.getRemoteKey(key);
        const value = await this.store.get(remoteKey);
        if (value) {
          await this.store.del(remoteKey);
          return this.deserialize(value);
        }
      }

      return null;
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur getAndDelete ${key}:`, error);
      return null;
    }
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async delete(key: string): Promise<boolean> {
    try {
      let deleted = false;

      if (this.memoryCache.delete(key)) {
        deleted = true;
      }

      if (this.store) {
        try {
          await this.store.del(this.getRemoteKey(key));
          deleted = true;
        } catch {
          // Store may not track whether key existed
        }
      }

      return deleted;
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur suppression ${key}:`, error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      this.memoryCache.clear();

      if (this.store) {
        const pattern = `${this.keyPrefix}*`;
        const keys = await this.store.keys(pattern);
        for (const key of keys) {
          await this.store.del(key);
        }
      }

      logger.info(`🧹 [${this.name}] Cache vidé`);
    } catch (error) {
      logger.error(`❌ [${this.name}] Erreur vidage cache:`, error);
    }
  }

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

  getStats(): { memorySize: number; memoryCapacity: number; name: string } {
    return {
      name: this.name,
      memorySize: this.memoryCache.size,
      memoryCapacity: Infinity
    };
  }

  private getRemoteKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.memoryCache.clear();
    logger.info(`🔌 [${this.name}] Cache arrêté`);
  }
}
