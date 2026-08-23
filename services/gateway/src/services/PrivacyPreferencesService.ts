/**
 * Service de gestion des préférences de confidentialité utilisateur
 *
 * Ce service permet de récupérer efficacement les préférences privacy des utilisateurs
 * pour vérifier si on doit broadcaster certains événements (typing, online status, read receipts).
 *
 * Fonctionnalités:
 * - Lecture mémoïsée via le cache PARTAGÉ `services/preferences/privacy-cache`
 * - Support des valeurs par défaut si aucune préférence stockée
 * - Méthodes d'accès rapide pour chaque type de préférence
 *
 * La mémoire ne vit PAS dans l'instance. Ce service est construit cinq fois dans
 * le processus — gestionnaire Socket.IO, singleton de présence, et un par plugin
 * de routes — et chaque instance portait autrefois sa propre `Map` : cinq copies
 * de la même donnée qu'aucune écriture ne pouvait atteindre toutes à la fois.
 * Voir l'en-tête de `preferences/privacy-cache.ts`.
 *
 * @version 2.0.0
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  PRIVACY_PREFERENCES_DEFAULTS,
  type PrivacyPreferencesDefaults,
} from '../config/user-preferences-defaults';
import {
  clearPrivacyPreferencesCache,
  invalidatePrivacyPreferences,
  loadPrivacyPreferencesCached,
  privacyPreferencesCacheSize,
} from './preferences/privacy-cache';
import type { StoredPrivacyPreferences } from './preferences/privacy-storage';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'PrivacyPreferencesService' });

/**
 * Exactement les préférences que le serveur obéit — un ALIAS, non une copie.
 *
 * L'interface ré-énumérait les mêmes champs que `PrivacyPreferencesDefaults` :
 * deux listes à tenir en phase, dont une seule que le compilateur reliait au
 * reste. Une préférence ajoutée à l'une et oubliée dans l'autre s'écrivait en
 * base sans qu'aucune porte ne puisse la lire.
 */
export type PrivacyPreferences = PrivacyPreferencesDefaults;

export class PrivacyPreferencesService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Vide le cache partagé. Aucun appelant en production — conservé pour
   * l'isolation des tests et la symétrie de l'API.
   */
  public shutdown(): void {
    this.clearCache();
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

    try {
      const stored = await loadPrivacyPreferencesCached(this.prisma, [userId]);
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
   * Retourne les préférences par défaut
   */
  getDefaultPreferences(): PrivacyPreferences {
    return { ...PRIVACY_PREFERENCES_DEFAULTS };
  }

  /**
   * Invalide le cache pour un utilisateur (à appeler après mise à jour des préférences)
   *
   * Délègue au point d'entrée du module : les portes d'écriture l'appellent
   * directement, sans avoir à tenir la référence d'une instance.
   */
  invalidateCache(userId: string): void {
    invalidatePrivacyPreferences(userId);
  }

  /**
   * Vide tout le cache
   */
  clearCache(): void {
    clearPrivacyPreferencesCache();
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
    const registered: string[] = [];

    // Les anonymes sont servis par les défauts sans toucher la base : leur `id`
    // est un `Participant.id`, pas un `User.id` — l'envoyer au résolveur ferait
    // payer une requête pour rien et mémoïserait un vide sous une clé qui n'est
    // pas un utilisateur.
    for (const { id, isAnonymous } of userIds) {
      if (isAnonymous) result.set(id, this.getDefaultPreferences());
      else registered.push(id);
    }

    if (registered.length === 0) return result;

    let stored: Map<string, StoredPrivacyPreferences>;
    try {
      stored = await loadPrivacyPreferencesCached(this.prisma, registered);
    } catch (error) {
      logger.error('privacy preferences batch fetch failed', { count: registered.length, error });
      // Repli sur les défauts SANS mise en cache : mémoriser un échec le
      // figerait pour toute la durée du TTL.
      for (const id of registered) result.set(id, this.getDefaultPreferences());
      return result;
    }

    for (const id of registered) {
      result.set(id, this.buildPreferences(stored.get(id)));
    }

    return result;
  }

  /**
   * Retourne les métriques du service
   */
  getMetrics(): { cacheSize: number; cacheHitRate: string } {
    return {
      cacheSize: privacyPreferencesCacheSize(),
      cacheHitRate: 'N/A' // Pourrait être implémenté avec des compteurs
    };
  }
}
