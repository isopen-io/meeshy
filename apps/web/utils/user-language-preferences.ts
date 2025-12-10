/**
 * Utilitaires réutilisables pour la gestion des langues utilisateur
 * Module extrait de bubble-stream-page pour réutilisation globale
 */
import type { User } from '@/types';
import type { LanguageChoice } from '@/types/bubble-stream';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';

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
 * Détermine la langue préférée d'un utilisateur selon sa configuration
 */
export function resolveUserPreferredLanguage(user: User): string {
  if (user.useCustomDestination && user.customDestinationLanguage) {
    return user.customDestinationLanguage;
  }
  
  if (user.translateToSystemLanguage) {
    return user.systemLanguage || 'fr';
  }
  
  if (user.translateToRegionalLanguage) {
    return user.regionalLanguage || 'fr';
  }
  
  return user.systemLanguage || 'fr'; // fallback
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
 * Détermine les langues nécessaires pour une conversation multi-utilisateurs
 */
export function getRequiredLanguagesForConversation(users: User[]): string[] {
  const languages = new Set<string>();
  
  users.forEach(user => {
    if (user.useCustomDestination && user.customDestinationLanguage) {
      languages.add(user.customDestinationLanguage);
    } else if (user.translateToSystemLanguage) {
      languages.add(user.systemLanguage || 'fr');
    } else if (user.translateToRegionalLanguage) {
      languages.add(user.regionalLanguage || 'fr');
    } else {
      languages.add(user.systemLanguage || 'fr');
    }
  });
  
  return Array.from(languages);
}
