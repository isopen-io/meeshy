/**
 * Cache mémoire LRU pour les résultats de traduction
 * Évite les requêtes répétées à la base de données
 */

import { TranslationResult } from '../zmq-translation';

export class TranslationCache {
  private cache: Map<string, TranslationResult> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Génère une clé de cache unique pour une traduction
   */
  static generateKey(messageId: string, targetLanguage: string, sourceLanguage?: string): string {
    return sourceLanguage
      ? `${messageId}_${sourceLanguage}_${targetLanguage}`
      : `${messageId}_${targetLanguage}`;
  }

  /**
   * Ajoute un résultat au cache avec éviction LRU
   */
  set(key: string, result: TranslationResult): void {
    // Ré-insérer une clé existante la déplace en position "plus récente"
    // (Map conserve l'ordre d'insertion → delete+set = move-to-end).
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Cache plein : évincer le moins récemment utilisé (tête de Map).
      const lruKey = this.cache.keys().next().value;
      if (lruKey !== undefined) {
        this.cache.delete(lruKey);
      }
    }

    this.cache.set(key, result);
  }

  /**
   * Récupère un résultat depuis le cache. Un hit rafraîchit la récence de
   * l'entrée (vrai LRU) — sinon une entrée chaude insérée tôt serait évincée.
   */
  get(key: string): TranslationResult | null {
    const result = this.cache.get(key);
    if (result === undefined) {
      return null;
    }
    // Move-to-end : marque l'entrée comme la plus récemment utilisée.
    this.cache.delete(key);
    this.cache.set(key, result);
    return result;
  }

  /**
   * Supprime une entrée du cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
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
   * Vérifie si une clé existe dans le cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Supprime toutes les entrées de cache liées à un message donné.
   * Les clés ont la forme `${messageId}_${sourceLang}_${targetLang}` ou
   * `${messageId}_${targetLang}` — un préfixe `${messageId}_` identifie
   * toutes les traductions de ce message.
   * À appeler avant toute retraduction (message édité) pour éviter que
   * l'ancien résultat caché ne soit servi à la place du nouveau.
   */
  deleteByMessageId(messageId: string): number {
    const prefix = `${messageId}_`;
    const toDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(k => this.cache.delete(k));
    return toDelete.length;
  }
}
