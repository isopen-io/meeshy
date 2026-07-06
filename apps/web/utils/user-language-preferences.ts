/**
 * Utilitaires réutilisables pour la gestion des langues utilisateur
 * Module extrait de bubble-stream-page pour réutilisation globale
 */
import type { User } from '@/types';
import type { LanguageChoice } from '@/types/bubble-stream';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { getDeviceLocale } from '@/lib/device-locale';

/**
 * Génère les choix de langues disponibles pour un utilisateur
 * Basé sur ses préférences système, régionale et personnalisée
 */
export function getUserLanguageChoices(user: User): LanguageChoice[] {
  const choices: LanguageChoice[] = [
    {
      code: user.systemLanguage || 'fr',
      name: 'Langue système',
      description: SUPPORTED_LANGUAGES.find(l => l.code === user.systemLanguage)?.name || 'Français',
      flag: SUPPORTED_LANGUAGES.find(l => l.code === user.systemLanguage)?.flag || '🇫🇷',
      isDefault: true
    }
  ];

  if (user.regionalLanguage && user.regionalLanguage !== user.systemLanguage) {
    choices.push({
      code: user.regionalLanguage,
      name: 'Langue régionale',
      description: SUPPORTED_LANGUAGES.find(l => l.code === user.regionalLanguage)?.name || user.regionalLanguage,
      flag: SUPPORTED_LANGUAGES.find(l => l.code === user.regionalLanguage)?.flag || '🌍',
      isDefault: false
    });
  }

  if (user.customDestinationLanguage &&
      user.customDestinationLanguage !== user.systemLanguage &&
      user.customDestinationLanguage !== user.regionalLanguage) {
    choices.push({
      code: user.customDestinationLanguage,
      name: 'Langue personnalisée',
      description: SUPPORTED_LANGUAGES.find(l => l.code === user.customDestinationLanguage)?.name || user.customDestinationLanguage,
      flag: SUPPORTED_LANGUAGES.find(l => l.code === user.customDestinationLanguage)?.flag || '🎯',
      isDefault: false
    });
  }

  return choices;
}

/**
 * Détermine la langue préférée d'un utilisateur selon sa configuration.
 *
 * Délègue à `resolveUserLanguage()` depuis `@meeshy/shared` — source de vérité
 * unique du Prisme Linguistique. Injecte automatiquement la `deviceLocale`
 * en 4e priorité (Prisme étendu 2026-05-26) :
 *
 *   1. systemLanguage
 *   2. regionalLanguage
 *   3. customDestinationLanguage
 *   4. user.deviceLocale (persistée par le gateway) ?? navigator.language
 *   5. 'fr' (fallback)
 *
 * Préfère la valeur persistée côté serveur (`user.deviceLocale`) à celle du
 * navigateur courant, pour rester cohérent avec la résolution effectuée par
 * le translator quand iOS et web partagent un compte.
 */
export function resolveUserPreferredLanguage(user: User): string {
  const persisted = (user as { deviceLocale?: string | null }).deviceLocale;
  const deviceLocale = persisted ?? getDeviceLocale() ?? undefined;
  return resolveUserLanguage(user, { deviceLocale });
}

/**
 * Obtient la liste des langues utilisées par l'utilisateur
 */
export function getUserLanguagePreferences(user: User): string[] {
  const languages = new Set<string>();

  // Toujours inclure la langue système
  if (user.systemLanguage) {
    languages.add(user.systemLanguage);
  }

  // Inclure la langue régionale si différente
  if (user.regionalLanguage && user.regionalLanguage !== user.systemLanguage) {
    languages.add(user.regionalLanguage);
  }

  // Inclure la langue personnalisée si définie et différente
  if (user.customDestinationLanguage &&
      user.customDestinationLanguage !== user.systemLanguage &&
      user.customDestinationLanguage !== user.regionalLanguage) {
    languages.add(user.customDestinationLanguage);
  }

  return Array.from(languages);
}

/**
 * Détermine les langues nécessaires pour une conversation multi-utilisateurs.
 *
 * Délègue à `resolveUserPreferredLanguage` pour appliquer l'ordre canonique
 * du Prisme Linguistique étendu (system > regional > custom > deviceLocale).
 * L'ancienne implémentation locale priorisait `customDestinationLanguage` en
 * premier, ce qui divergeait de `resolveUserLanguage()`.
 */
export function getRequiredLanguagesForConversation(users: User[]): string[] {
  const languages = new Set<string>();

  users.forEach(user => {
    languages.add(resolveUserPreferredLanguage(user));
  });

  return Array.from(languages);
}
