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
/**
 * Recherche l'entrée du catalogue de langues de manière insensible à la casse.
 * Les codes du catalogue sont lowercase ; une préférence stockée `'EN'` (casse
 * mixte issue d'un ancien client) doit tout de même résoudre son nom/drapeau —
 * sinon `getUserLanguageChoices` retombait silencieusement sur 🇫🇷 « Français ».
 */
function findLanguageMeta(code: string | null | undefined) {
  if (!code) return undefined;
  const lc = code.toLowerCase();
  return SUPPORTED_LANGUAGES.find(l => l.code.toLowerCase() === lc);
}

export function getUserLanguageChoices(user: User): LanguageChoice[] {
  // Lookup by the raw (lowercased) preference so an absent systemLanguage keeps
  // the historical 🇫🇷 « Français » fallback; the emitted code still defaults to 'fr'.
  const systemRaw = user.systemLanguage?.toLowerCase();
  const systemCode = systemRaw || 'fr';
  const regionalCode = user.regionalLanguage?.toLowerCase();
  const customCode = user.customDestinationLanguage?.toLowerCase();

  const choices: LanguageChoice[] = [
    {
      code: systemCode,
      name: 'Langue système',
      description: findLanguageMeta(systemRaw)?.name || 'Français',
      flag: findLanguageMeta(systemRaw)?.flag || '🇫🇷',
      isDefault: true
    }
  ];

  if (regionalCode && regionalCode !== systemCode) {
    choices.push({
      code: regionalCode,
      name: 'Langue régionale',
      description: findLanguageMeta(regionalCode)?.name || regionalCode,
      flag: findLanguageMeta(regionalCode)?.flag || '🌍',
      isDefault: false
    });
  }

  if (customCode &&
      customCode !== systemCode &&
      customCode !== regionalCode) {
    choices.push({
      code: customCode,
      name: 'Langue personnalisée',
      description: findLanguageMeta(customCode)?.name || customCode,
      flag: findLanguageMeta(customCode)?.flag || '🎯',
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
  // Lowercase avant déduplication — parité avec resolveUserLanguagesOrdered
  // (@meeshy/shared) : 'EN' et 'en' sont la même langue, un seul code émis.
  const systemCode = user.systemLanguage?.toLowerCase();
  const regionalCode = user.regionalLanguage?.toLowerCase();
  const customCode = user.customDestinationLanguage?.toLowerCase();

  const languages = new Set<string>();

  // Toujours inclure la langue système
  if (systemCode) {
    languages.add(systemCode);
  }

  // Inclure la langue régionale si différente
  if (regionalCode && regionalCode !== systemCode) {
    languages.add(regionalCode);
  }

  // Inclure la langue personnalisée si définie et différente
  if (customCode &&
      customCode !== systemCode &&
      customCode !== regionalCode) {
    languages.add(customCode);
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
