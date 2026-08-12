/**
 * Utilitaires réutilisables pour la gestion des langues utilisateur
 * Module extrait de bubble-stream-page pour réutilisation globale
 */
import type { User } from '@/types';
import type { LanguageChoice } from '@/types/bubble-stream';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';
import { resolveUserLanguage, resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { getDeviceLocale } from '@/lib/device-locale';

/**
 * Résout la `deviceLocale` d'un utilisateur pour l'injection en 4e priorité du
 * Prisme Linguistique : préfère la valeur persistée côté serveur
 * (`user.deviceLocale`) à celle du navigateur courant, pour rester cohérent
 * avec la résolution effectuée par le gateway/translator quand iOS et web
 * partagent un compte.
 */
function resolveDeviceLocale(user: User): string | undefined {
  const persisted = (user as { deviceLocale?: string | null }).deviceLocale;
  return persisted ?? getDeviceLocale() ?? undefined;
}

/**
 * Génère les choix de langues disponibles pour un utilisateur
 * Basé sur ses préférences système, régionale et personnalisée
 */
/**
 * Recherche l'entrée du catalogue de langues de manière insensible à la casse.
 * Les codes du catalogue sont lowercase ; les appelants passent désormais un code
 * déjà normalisé par {@link normalizeLanguageCode} (`'pt-BR'` → `'pt'`), donc une
 * variante régionale résout bien son nom/drapeau au lieu de retomber sur
 * 🇫🇷 « Français ».
 */
function findLanguageMeta(code: string | null | undefined) {
  if (!code) return undefined;
  const lc = code.toLowerCase();
  return SUPPORTED_LANGUAGES.find(l => l.code.toLowerCase() === lc);
}

export function getUserLanguageChoices(user: User): LanguageChoice[] {
  // Normalize each preference to its canonical Meeshy code (BCP-47 region/script
  // subtags stripped, case-folded) BEFORE emitting `code`: this value is consumed
  // as a translation target and as `selectedInputLanguage`, so it MUST match the
  // codes produced by resolveUserPreferredLanguage / getUserLanguagePreferences /
  // MessageTranslation.targetLanguage. A raw 'pt-BR' emitted as 'pt-br' would
  // diverge from the 'pt' used everywhere else and silently miss translations.
  // Meta (name/flag) is looked up from the *normalized* preference, but the
  // 🇫🇷 « Français » fallback stays tied to an absent/unknown systemLanguage —
  // never to the 'fr' emission fallback — so an absent language still reads « Français ».
  const systemNormalized = normalizeLanguageCode(user.systemLanguage);
  const systemCode = systemNormalized || 'fr';
  const regionalCode = normalizeLanguageCode(user.regionalLanguage);
  const customCode = normalizeLanguageCode(user.customDestinationLanguage);

  const choices: LanguageChoice[] = [
    {
      code: systemCode,
      name: 'Langue système',
      description: findLanguageMeta(systemNormalized)?.name || 'Français',
      flag: findLanguageMeta(systemNormalized)?.flag || '🇫🇷',
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
  return resolveUserLanguage(user, { deviceLocale: resolveDeviceLocale(user) });
}

/**
 * Obtient la liste ordonnée et dédupliquée des langues préférées de
 * l'utilisateur — les cibles pour lesquelles une traduction doit être requise.
 *
 * Délègue à `resolveUserLanguagesOrdered()` depuis `@meeshy/shared` — source de
 * vérité unique du Prisme Linguistique — et injecte la `deviceLocale` en 4e
 * priorité (Prisme étendu 2026-05-26), à parité avec
 * `resolveUserPreferredLanguage`. Sans cette injection, un utilisateur dont le
 * seul signal de langue est la locale appareil (préférences in-app vides)
 * voyait son contenu résolu vers cette locale mais aucune traduction n'était
 * jamais demandée pour elle.
 *
 *   1. systemLanguage → 2. regionalLanguage → 3. customDestinationLanguage
 *   → 4. deviceLocale (persistée ?? navigator.language)
 *
 * Pas de fallback `'fr'` : si tous les signaux sont vides, la liste est vide.
 */
export function getUserLanguagePreferences(user: User): string[] {
  return resolveUserLanguagesOrdered(user, { deviceLocale: resolveDeviceLocale(user) });
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
