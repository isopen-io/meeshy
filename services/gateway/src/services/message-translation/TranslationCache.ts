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
    // Si le cache est plein, supprimer la plus ancienne entrée
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, result);
  }

  /**
   * Récupère un résultat depuis le cache
   */
  get(key: string): TranslationResult | null {
    return this.cache.get(key) || null;
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
}
