/**
 * Cache TTL pour les langues de conversation
 * Évite les requêtes répétées pour extraire les langues des participants
 */

interface LanguageCacheEntry {
  languages: string[];
  timestamp: number;
}

export class LanguageCache {
  private cache: Map<string, LanguageCacheEntry> = new Map();
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(ttlMs: number = 5 * 60 * 1000, maxSize: number = 100) {
    this.ttl = ttlMs;
    this.maxSize = maxSize;
  }

  /**
   * Ajoute les langues d'une conversation au cache
   */
  set(conversationId: string, languages: string[]): void {
    const now = Date.now();

    // Nettoyer le cache si trop grand
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(conversationId, {
      languages,
      timestamp: now
    });
  }

  /**
   * Récupère les langues d'une conversation si le cache est valide
   */
  get(conversationId: string): string[] | null {
    const entry = this.cache.get(conversationId);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const isExpired = (now - entry.timestamp) >= this.ttl;

    if (isExpired) {
      this.cache.delete(conversationId);
      return null;
    }

    return entry.languages;
  }

  /**
   * Supprime une entrée du cache
   */
  delete(conversationId: string): boolean {
    return this.cache.delete(conversationId);
  }

  /**
   * Vide complètement le cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Retourne la taille actuelle du cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Vérifie si une conversation est en cache
   */
  has(conversationId: string): boolean {
    const entry = this.cache.get(conversationId);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    const isExpired = (now - entry.timestamp) >= this.ttl;

    if (isExpired) {
      this.cache.delete(conversationId);
      return false;
    }

    return true;
  }

  /**
   * Nettoie les entrées expirées
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [conversationId, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) >= this.ttl) {
        this.cache.delete(conversationId);
        cleaned++;
      }
    }

    return cleaned;
  }
}
