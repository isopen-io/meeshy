/**
 * Wrapper Redis avec fallback automatique sur cache mémoire
 *
 * Ce wrapper permet au système de fonctionner avec ou sans Redis :
 * - Mode normal : Utilise Redis si disponible
 * - Mode dégradé : Utilise un cache mémoire si Redis est inaccessible
 *
 * Avantages :
 * - Pas de crash si Redis est down
 * - Pas d'erreurs non gérées
 * - Transition transparente entre les modes
 * - Logs clairs pour identifier le mode actif
 * - Circuit Breaker : auto-récupération après panne (3 échecs → OPEN 20s → HALF_OPEN → test)
 */

import Redis from 'ioredis';
import { enhancedLogger } from '../utils/logger-enhanced';
import { CircuitBreakerFactory, circuitBreakerManager, CircuitState } from '../utils/circuitBreaker';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

// Logger dédié pour RedisWrapper
const logger = enhancedLogger.child({ module: 'RedisWrapper' });

export class RedisWrapper {
  private redis: Redis | null = null;
  private memoryCache: Map<string, CacheEntry> = new Map();
  private isRedisAvailable: boolean = false;
  private redisUrl: string;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 3;
  private circuitBreaker = CircuitBreakerFactory.createRedisBreaker();

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.initializeRedis();
    this.startMemoryCacheCleanup();
    circuitBreakerManager.register('redis', this.circuitBreaker);
  }

  /**
   * Initialise Redis avec gestion d'erreur complète
   */
  private initializeRedis(): void {
    try {
      this.redis = new Redis(this.redisUrl, {
        retryStrategy: (times: number) => {
          // Arrêter complètement après max tentatives
          if (times > this.maxConnectionAttempts) {
            logger.warn('⚠️ Max connection attempts reached, switching to memory cache');
            return null; // Arrête de réessayer définitivement
          }
          // Réessayer après 2 secondes
          return 2000;
        },
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: true,
        // Désactiver les reconnexions automatiques après perte de connexion
        enableOfflineQueue: false,
        autoResubscribe: false,
        autoResendUnfulfilledCommands: false,
      });

      // Événements Redis
      this.redis.on('connect', () => {
        if (this.connectionAttempts === 0) {
          logger.info('✅ Redis connected successfully');
        }
        this.isRedisAvailable = true;
        this.connectionAttempts++;
      });

      this.redis.on('ready', () => {
        if (this.connectionAttempts === 1) {
          logger.info('✅ Redis ready - using Redis cache');
        }
        this.isRedisAvailable = true;
      });

      this.redis.on('error', (error) => {
        // Ignorer les erreurs communes et ne logger qu'une fois
        if (!error.message.includes('ECONNRESET') &&
            !error.message.includes('ECONNREFUSED') &&
            !error.message.includes('EPIPE')) {
          logger.warn('⚠️ Redis error', { error: error.message });
        }
        this.isRedisAvailable = false;
      });

      this.redis.on('close', () => {
        if (this.connectionAttempts > 0) {
          logger.warn('⚠️ Redis connection lost - falling back to memory cache');
        }
        this.isRedisAvailable = false;
      });

      this.redis.on('end', () => {
        this.isRedisAvailable = false;
      });

      // Tenter de se connecter (lazy connect)
      this.redis.connect().catch((_error) => {
        logger.warn('⚠️ Redis connection failed - using memory cache only');
        this.isRedisAvailable = false;
      });

    } catch (error) {
      logger.warn('⚠️ Redis initialization failed - using memory cache only');
      this.redis = null;
      this.isRedisAvailable = false;
    }
  }

  /**
   * Ferme la connexion Redis proprement (graceful shutdown uniquement)
   */
  private closeRedisConnection(): void {
    if (this.redis) {
      try {
        this.redis.disconnect();
      } catch (error) {
        // Ignorer les erreurs de déconnexion
      }
      this.redis = null;
    }
  }

  /**
   * Démarre le nettoyage automatique du cache mémoire
   */
  private startMemoryCacheCleanup(): void {
    // Nettoyer toutes les 60 secondes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let deletedCount = 0;

      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expiresAt < now) {
          this.memoryCache.delete(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info(`🧹 Cleaned ${deletedCount} expired entries from memory cache`);
      }
    }, 60000); // 60 secondes
  }

  /**
   * Récupère une valeur (Redis ou mémoire)
   */
  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        const value = await this.circuitBreaker.execute(() => this.redis!.get(key));
        return value;
      } catch {
        // Redis error — CB recorded failure, fall through to memory cache
      }
    }

    // Fallback sur cache mémoire
    const entry = this.memoryCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value;
    }

    // Supprimer si expiré
    if (entry) {
      this.memoryCache.delete(key);
    }

    return null;
  }

  /**
   * Définit une valeur (Redis ou mémoire)
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.redis) {
      try {
        await this.circuitBreaker.execute(() => {
          if (ttlSeconds) {
            return this.redis!.set(key, value, 'EX', ttlSeconds);
          }
          return this.redis!.set(key, value);
        });
        return;
      } catch {
        // Redis error — CB recorded failure, fall through to memory cache
      }
    }

    // Fallback sur cache mémoire
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds ? ttlSeconds * 1000 : 3600000),
    });
  }

  /** @deprecated Use set(key, value, ttlSeconds) instead */
  async setex(key: string, seconds: number, value: string): Promise<void> {
    return this.set(key, value, seconds);
  }

  /**
   * Set if not exists (Redis SETNX ou mémoire)
   * Returns 1 if set, 0 if key already exists
   */
  async setnx(key: string, value: string): Promise<number> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.setnx(key, value));
        return result as number;
      } catch {
        // Redis error — CB recorded failure, fall through to memory cache
      }
    }

    // Fallback sur cache mémoire
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        return 0; // Key already exists
      }
    }

    // Set if not exists
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + 3600000, // 1 heure par défaut
    });
    return 1;
  }

  /**
   * Set expiration on a key (Redis EXPIRE ou mémoire)
   * Returns 1 if expiration was set, 0 if key does not exist
   */
  async expire(key: string, seconds: number): Promise<number> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.expire(key, seconds));
        return result as number;
      } catch {
        // Redis error — CB recorded failure, fall through to memory cache
      }
    }

    // Fallback sur cache mémoire
    const entry = this.memoryCache.get(key);
    if (!entry) {
      return 0; // Key does not exist
    }

    // Update expiration
    this.memoryCache.set(key, {
      value: entry.value,
      expiresAt: Date.now() + (seconds * 1000),
    });
    return 1;
  }

  /**
   * Supprime une clé (Redis ou mémoire)
   */
  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.circuitBreaker.execute(() => this.redis!.del(key));
        return;
      } catch {
        // Redis error — CB recorded failure, fall through to memory cache
      }
    }

    // Fallback sur cache mémoire
    this.memoryCache.delete(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.publish(channel, message));
        return result as number;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  /**
   * Récupère toutes les clés correspondant à un pattern (Redis ou mémoire)
   */
  async keys(pattern: string): Promise<string[]> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.keys(pattern));
        return result as string[];
      } catch {
        // Redis error — CB recorded failure, fall through to memory cache
      }
    }

    // Fallback sur cache mémoire avec regex
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matchingKeys: string[] = [];

    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        matchingKeys.push(key);
      }
    }

    return matchingKeys;
  }

  /**
   * Récupère les informations Redis (Redis uniquement)
   */
  async info(section?: string): Promise<string> {
    if (this.redis) {
      try {
        const result = await this.circuitBreaker.execute(() => this.redis!.info(section));
        return result as string;
      } catch {
        // Redis error — CB recorded failure, fall through to simulated info
      }
    }

    // Retourner des infos simulées pour le cache mémoire
    return `# Memory\nused_memory_human:${(this.memoryCache.size * 100 / 1024).toFixed(2)}KB\n# Keyspace\ndb0:keys=${this.memoryCache.size}`;
  }

  /**
   * Ferme la connexion Redis et nettoie le cache mémoire
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.closeRedisConnection();
    this.memoryCache.clear();
    logger.info('🛑 Cache closed and cleaned up');
  }

  /**
   * Vérifie si Redis est disponible
   */
  isAvailable(): boolean {
    return this.redis !== null && this.circuitBreaker.getStats().state !== CircuitState.OPEN;
  }

  /**
   * Statistiques du cache
   */
  getCacheStats(): { mode: string; entries: number; redisAvailable: boolean } {
    const redisAvailable = this.isAvailable();
    return {
      mode: redisAvailable ? 'Redis' : 'Memory',
      entries: this.memoryCache.size,
      redisAvailable,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
// All services should use this shared instance to avoid multiple Redis connections
// This prevents "max connection reached" errors at startup
// ============================================================================

let sharedInstance: RedisWrapper | null = null;

/**
 * Get the shared RedisWrapper singleton instance
 * Use this instead of `new RedisWrapper()` to share a single Redis connection
 */
export function getRedisWrapper(url?: string): RedisWrapper {
  if (!sharedInstance) {
    sharedInstance = new RedisWrapper(url);
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (useful for testing)
 */
export function resetRedisWrapper(): void {
  if (sharedInstance) {
    sharedInstance.close();
    sharedInstance = null;
  }
}
