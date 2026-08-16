/**
 * Service de gestion des préférences de confidentialité utilisateur
 *
 * Ce service permet de récupérer efficacement les préférences privacy des utilisateurs
 * pour vérifier si on doit broadcaster certains événements (typing, online status, read receipts).
 *
 * Fonctionnalités:
 * - Cache en mémoire avec TTL pour éviter les requêtes répétées
 * - Support des valeurs par défaut si aucune préférence stockée
 * - Méthodes d'accès rapide pour chaque type de préférence
 * - Nettoyage automatique du cache
 *
 * @version 1.0.0
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../config/user-preferences-defaults';
import {
  loadStoredPrivacyPreferences,
  type StoredPrivacyPreferences,
} from './preferences/privacy-storage';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'PrivacyPreferencesService' });

export interface PrivacyPreferences {
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  showReadReceipts: boolean;
  showTypingIndicator: boolean;
  allowContactRequests: boolean;
  allowGroupInvites: boolean;
  saveMediaToGallery: boolean;
  allowAnalytics: boolean;
}

interface CacheEntry {
  preferences: PrivacyPreferences;
  fetchedAt: number;
}

export class PrivacyPreferencesService {
  // Cache en mémoire: userId → préférences + timestamp
  private cache = new Map<string, CacheEntry>();

  // TTL du cache: 5 minutes (les préférences changent rarement)
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  // Nettoyage du cache: toutes les 10 minutes
  private readonly CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaClient) {
    this.startCacheCleanup();
  }

  /**
   * Démarre le nettoyage périodique du cache
   */
  private startCacheCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupCache();
    }, this.CACHE_CLEANUP_INTERVAL_MS);
    this.cleanupInterval.unref?.();
  }

  /**
   * Nettoie les entrées expirées du cache
   */
  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, entry] of this.cache.entries()) {
      if (now - entry.fetchedAt > this.CACHE_TTL_MS) {
        this.cache.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('privacy preferences cache cleanup', { removed: cleaned, remaining: this.cache.size });
    }
  }

  /**
   * Arrête le service et nettoie les ressources
   */
  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  /**
   * Récupère les préférences privacy d'un utilisateur (depuis cache ou DB)
   * Les utilisateurs anonymes utilisent les valeurs par défaut (pas de préférences stockées)
   */
  async getPreferences(userId: string, isAnonymous: boolean = false): Promise<PrivacyPreferences> {
    // Les utilisateurs anonymes n'ont pas de préférences stockées
    // Ils utilisent les valeurs par défaut
    if (isAnonymous) {
      return this.getDefaultPreferences();
    }

    // Vérifier le cache
    const cached = this.cache.get(userId);
    if (cached && (Date.now() - cached.fetchedAt) < this.CACHE_TTL_MS) {
      return cached.preferences;
    }

    // Récupérer depuis la base de données
    const preferences = await this.fetchFromDatabase(userId);

    // Mettre en cache
    this.cache.set(userId, {
      preferences,
      fetchedAt: Date.now()
    });

    return preferences;
  }

  /**
   * Récupère les préférences depuis la base de données
   */
  private async fetchFromDatabase(userId: string): Promise<PrivacyPreferences> {
    try {
      const stored = await loadStoredPrivacyPreferences(this.prisma, [userId]);
      return this.buildPreferences(stored.get(userId));
    } catch (error) {
      logger.error('privacy preferences fetch from database failed', { userId, error });
      // En cas d'erreur, retourner les valeurs par défaut
      return this.getDefaultPreferences();
    }
  }

  /**
   * Complète par les défauts ce que la base porte réellement. Partagé par la
   * lecture unitaire et la lecture groupée.
   *
   * Les deux jeux de clés étant les mêmes, la fusion suffit : énumérer les huit
   * champs à la main n'ajoutait qu'un endroit de plus à tenir à jour lors d'un
   * ajout de préférence — et un endroit de plus où oublier de le faire.
   */
  private buildPreferences(stored: StoredPrivacyPreferences | undefined): PrivacyPreferences {
    return { ...this.getDefaultPreferences(), ...stored };
  }

  /**
   * Lit les préférences de plusieurs utilisateurs en UNE requête, puis répartit
   * les lignes par utilisateur. Ne rattrape pas les erreurs : l'appelant décide
   * du repli, et surtout ne met pas un échec en cache.
   */
  private async fetchManyFromDatabase(
    userIds: string[]
  ): Promise<Map<string, PrivacyPreferences>> {
    const storedByUser = await loadStoredPrivacyPreferences(this.prisma, userIds);

    const result = new Map<string, PrivacyPreferences>();
    for (const userId of userIds) {
      result.set(userId, this.buildPreferences(storedByUser.get(userId)));
    }
    return result;
  }

  /**
   * Retourne les préférences par défaut
   */
  getDefaultPreferences(): PrivacyPreferences {
    return {
      showOnlineStatus: PRIVACY_PREFERENCES_DEFAULTS.showOnlineStatus,
      showLastSeen: PRIVACY_PREFERENCES_DEFAULTS.showLastSeen,
      showReadReceipts: PRIVACY_PREFERENCES_DEFAULTS.showReadReceipts,
      showTypingIndicator: PRIVACY_PREFERENCES_DEFAULTS.showTypingIndicator,
      allowContactRequests: PRIVACY_PREFERENCES_DEFAULTS.allowContactRequests,
      allowGroupInvites: PRIVACY_PREFERENCES_DEFAULTS.allowGroupInvites,
      saveMediaToGallery: PRIVACY_PREFERENCES_DEFAULTS.saveMediaToGallery,
      allowAnalytics: PRIVACY_PREFERENCES_DEFAULTS.allowAnalytics,
    };
  }

  /**
   * Invalide le cache pour un utilisateur (à appeler après mise à jour des préférences)
   */
  invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Vide tout le cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ========== MÉTHODES D'ACCÈS RAPIDE ==========

  /**
   * Vérifie si l'utilisateur permet d'afficher son statut en ligne
   */
  async shouldShowOnlineStatus(userId: string, isAnonymous: boolean = false): Promise<boolean> {
    const prefs = await this.getPreferences(userId, isAnonymous);
    return prefs.showOnlineStatus;
  }

  /**
   * Vérifie si l'utilisateur permet d'afficher son dernier vu
   */
  async shouldShowLastSeen(userId: string, isAnonymous: boolean = false): Promise<boolean> {
    const prefs = await this.getPreferences(userId, isAnonymous);
    return prefs.showLastSeen;
  }

  /**
   * Vérifie si l'utilisateur envoie des accusés de lecture
   */
  async shouldShowReadReceipts(userId: string, isAnonymous: boolean = false): Promise<boolean> {
    const prefs = await this.getPreferences(userId, isAnonymous);
    return prefs.showReadReceipts;
  }

  /**
   * Vérifie si l'utilisateur permet d'afficher l'indicateur de frappe
   */
  async shouldShowTypingIndicator(userId: string, isAnonymous: boolean = false): Promise<boolean> {
    const prefs = await this.getPreferences(userId, isAnonymous);
    return prefs.showTypingIndicator;
  }

  /**
   * Récupère les préférences de plusieurs utilisateurs en parallèle
   * Utile pour filtrer les destinataires d'un broadcast
   */
  async getPreferencesForUsers(
    userIds: Array<{ id: string; isAnonymous: boolean }>
  ): Promise<Map<string, PrivacyPreferences>> {
    const result = new Map<string, PrivacyPreferences>();
    const misses: string[] = [];

    // Anonymes et entrées encore chaudes sont servis sans toucher la base ;
    // seuls les manquants partent en requête, et en UNE seule.
    for (const { id, isAnonymous } of userIds) {
      if (isAnonymous) {
        result.set(id, this.getDefaultPreferences());
        continue;
      }

      const cached = this.cache.get(id);
      if (cached && (Date.now() - cached.fetchedAt) < this.CACHE_TTL_MS) {
        result.set(id, cached.preferences);
        continue;
      }

      misses.push(id);
    }

    if (misses.length === 0) return result;

    let fetched: Map<string, PrivacyPreferences>;
    try {
      fetched = await this.fetchManyFromDatabase(misses);
    } catch (error) {
      logger.error('privacy preferences batch fetch failed', { count: misses.length, error });
      // Repli sur les défauts SANS mise en cache : mémoriser un échec le
      // figerait pour toute la durée du TTL.
      for (const id of misses) result.set(id, this.getDefaultPreferences());
      return result;
    }

    const fetchedAt = Date.now();
    for (const id of misses) {
      const preferences = fetched.get(id) ?? this.getDefaultPreferences();
      this.cache.set(id, { preferences, fetchedAt });
      result.set(id, preferences);
    }

    return result;
  }

  /**
   * Retourne les métriques du service
   */
  getMetrics(): { cacheSize: number; cacheHitRate: string } {
    return {
      cacheSize: this.cache.size,
      cacheHitRate: 'N/A' // Pourrait être implémenté avec des compteurs
    };
  }
}
