import { getRedisWrapper, RedisWrapper } from './RedisWrapper';
import crypto from 'crypto';

export interface TranslationCacheEntry {
  translatedText: string;
  confidenceScore: number;
  modelUsed: string;
  timestamp: number;
  sourceLanguage: string;
  targetLanguage: string;
}

export class TranslationCache {
  private redis: RedisWrapper;
  private readonly TTL = 3600; // 1 heure par défaut

  constructor(redisUrl?: string) {
    // Use shared singleton instance to avoid multiple Redis connections
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = getRedisWrapper(url);

    const stats = this.redis.getCacheStats();
    console.log(`[TranslationCache] Cache initialized in ${stats.mode} mode (Redis available: ${stats.redisAvailable})`);
  }

  /**
   * Génère une clé de cache sécurisée et normalisée
   * Gère les textes similaires en normalisant le contenu
   */
  private generateCacheKey(
    text: string, 
    sourceLang: string, 
    targetLang: string, 
    modelType: string
  ): string {
    // Normalisation du texte pour gérer les textes similaires
    const normalizedText = this.normalizeText(text);
    
    // Création d'un hash sécurisé
    const contentHash = crypto
      .createHash('sha256')
      .update(`${normalizedText}|${sourceLang}|${targetLang}|${modelType}`)
      .digest('hex');
    
    return `translation:${contentHash}`;
  }

  /**
   * Normalise le texte pour gérer les textes similaires
   * - Supprime les espaces multiples
   * - Convertit en minuscules
   * - Supprime la ponctuation excessive
   * - Normalise les caractères spéciaux
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      // Supprime les espaces multiples
      .replace(/\s+/g, ' ')
      // Supprime la ponctuation excessive
      .replace(/[^\w\s]/g, '')
      // Normalise les caractères spéciaux
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Récupère une traduction du cache
   */
  async getCachedTranslation(
    text: string,
    sourceLang: string,
    targetLang: string,
    modelType: string
  ): Promise<TranslationCacheEntry | null> {
    try {
      const cacheKey = this.generateCacheKey(text, sourceLang, targetLang, modelType);
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        const entry: TranslationCacheEntry = JSON.parse(cached);
        
        // Vérifier si l'entrée n'est pas expirée
        const now = Date.now();
        if (now - entry.timestamp < this.TTL * 1000) {
          return entry;
        } else {
          // Supprimer l'entrée expirée
          await this.redis.del(cacheKey);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`❌ [Cache] Erreur récupération cache: ${error}`);
      return null;
    }
  }

  /**
   * Met en cache une traduction
   */
  async cacheTranslation(
    text: string,
    sourceLang: string,
    targetLang: string,
    modelType: string,
    result: TranslationCacheEntry
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(text, sourceLang, targetLang, modelType);
      const entry: TranslationCacheEntry = {
        ...result,
        timestamp: Date.now()
      };
      
      await this.redis.setex(cacheKey, this.TTL, JSON.stringify(entry));
    } catch (error) {
      console.error(`❌ [Cache] Erreur mise en cache: ${error}`);
    }
  }

  /**
   * Recherche des traductions similaires
   */
  async findSimilarTranslations(
    text: string,
    sourceLang: string,
    targetLang: string,
    modelType: string,
    similarityThreshold: number = 0.8
  ): Promise<TranslationCacheEntry[]> {
    try {
      const normalizedText = this.normalizeText(text);
      const pattern = `translation:*`;
      
      const keys = await this.redis.keys(pattern);
      const similarEntries: TranslationCacheEntry[] = [];
      
      for (const key of keys) {
        const cached = await this.redis.get(key);
        if (cached) {
          const entry: TranslationCacheEntry = JSON.parse(cached);
          
          // Vérifier si c'est la même langue et modèle
          if (entry.sourceLanguage === sourceLang && 
              entry.targetLanguage === targetLang) {
            
            // Calculer la similarité
            const similarity = this.calculateSimilarity(normalizedText, this.normalizeText(entry.translatedText));
            
            if (similarity >= similarityThreshold) {
              similarEntries.push(entry);
            }
          }
        }
      }
      
      return similarEntries;
    } catch (error) {
      console.error(`❌ [Cache] Erreur recherche similaire: ${error}`);
      return [];
    }
  }

  /**
   * Calcule la similarité entre deux textes (algorithme simple)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(' '));
    const words2 = new Set(text2.split(' '));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Statistiques du cache
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    memoryUsage: string;
    hitRate: number;
  }> {
    try {
      const keys = await this.redis.keys('translation:*');
      const info = await this.redis.info('memory');
      
      // Calculer l'utilisation mémoire (approximatif)
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'N/A';
      
      return {
        totalEntries: keys.length,
        memoryUsage,
        hitRate: 0 // À implémenter avec des métriques
      };
    } catch (error) {
      console.error(`❌ [Cache] Erreur stats cache: ${error}`);
      return {
        totalEntries: 0,
        memoryUsage: 'N/A',
        hitRate: 0
      };
    }
  }

  /**
   * Nettoie le cache (supprime les entrées expirées)
   */
  async cleanupCache(): Promise<number> {
    try {
      const keys = await this.redis.keys('translation:*');
      let deletedCount = 0;
      
      for (const key of keys) {
        const cached = await this.redis.get(key);
        if (cached) {
          const entry: TranslationCacheEntry = JSON.parse(cached);
          const now = Date.now();
          
          if (now - entry.timestamp > this.TTL * 1000) {
            await this.redis.del(key);
            deletedCount++;
          }
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error(`❌ [Cache] Erreur nettoyage cache: ${error}`);
      return 0;
    }
  }

  /**
   * Ferme la connexion Redis
   */
  async close(): Promise<void> {
    await this.redis.close();
  }
}
