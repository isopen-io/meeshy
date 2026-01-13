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
import {
  PRIVACY_PREFERENCES_DEFAULTS,
  PRIVACY_KEY_MAPPING,
  PrivacyPreferencesDefaults
} from '../config/user-preferences-defaults';

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
      console.log(`[PrivacyPreferences] Cache cleanup: ${cleaned} entries removed, ${this.cache.size} remaining`);
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
      // Récupérer toutes les clés privacy en une seule requête
      const dbKeys = Object.values(PRIVACY_KEY_MAPPING);
      const storedPreferences = await this.prisma.userPreference.findMany({
        where: {
          userId,
          key: { in: dbKeys }
        }
      });

      // Construire le map des valeurs stockées
      const storedMap = new Map(storedPreferences.map(p => [p.key, p.value]));

      // Construire les préférences avec les valeurs stockées ou les défauts
      const preferences: PrivacyPreferences = {
        showOnlineStatus: this.getBooleanValue(storedMap, 'show-online-status', 'showOnlineStatus'),
        showLastSeen: this.getBooleanValue(storedMap, 'show-last-seen', 'showLastSeen'),
        showReadReceipts: this.getBooleanValue(storedMap, 'show-read-receipts', 'showReadReceipts'),
        showTypingIndicator: this.getBooleanValue(storedMap, 'show-typing-indicator', 'showTypingIndicator'),
        allowContactRequests: this.getBooleanValue(storedMap, 'allow-contact-requests', 'allowContactRequests'),
        allowGroupInvites: this.getBooleanValue(storedMap, 'allow-group-invites', 'allowGroupInvites'),
        saveMediaToGallery: this.getBooleanValue(storedMap, 'save-media-to-gallery', 'saveMediaToGallery'),
        allowAnalytics: this.getBooleanValue(storedMap, 'allow-analytics', 'allowAnalytics'),
      };

      return preferences;
    } catch (error) {
      console.error('[PrivacyPreferences] Error fetching from database:', error);
      // En cas d'erreur, retourner les valeurs par défaut
      return this.getDefaultPreferences();
    }
  }

  /**
   * Récupère une valeur booléenne depuis le map stocké ou le défaut
   */
  private getBooleanValue(
    storedMap: Map<string, string>,
    dbKey: string,
    defaultKey: keyof PrivacyPreferencesDefaults
  ): boolean {
    const stored = storedMap.get(dbKey);
    if (stored !== undefined) {
      return stored === 'true';
    }
    return PRIVACY_PREFERENCES_DEFAULTS[defaultKey];
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

    // Récupérer en parallèle avec Promise.all
    const promises = userIds.map(async ({ id, isAnonymous }) => {
      const prefs = await this.getPreferences(id, isAnonymous);
      return { id, prefs };
    });

    const results = await Promise.all(promises);

    for (const { id, prefs } of results) {
      result.set(id, prefs);
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
