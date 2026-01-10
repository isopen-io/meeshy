/**
 * Utilitaires de normalisation des données utilisateur
 */

import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from 'libphonenumber-js';

/**
 * Normalise un email en minuscules
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Résultat de la normalisation du téléphone
 */
export interface PhoneNormalizationResult {
  /** Numéro au format E.164 (ex: "+33612345678") */
  phoneNumber: string;
  /** Code pays ISO 3166-1 alpha-2 (ex: "FR", "US") */
  countryCode: string;
  /** Numéro national sans code pays (ex: "612345678") */
  nationalNumber: string;
  /** Valide selon libphonenumber */
  isValid: boolean;
}

/**
 * Normalise et valide un numéro de téléphone avec libphonenumber-js
 *
 * @param phoneNumber - Le numéro de téléphone brut
 * @param defaultCountry - Code pays par défaut si non spécifié dans le numéro (ex: "FR")
 * @returns PhoneNormalizationResult ou null si invalide
 *
 * @example
 * normalizePhoneWithCountry("0612345678", "FR")
 * // => { phoneNumber: "+33612345678", countryCode: "FR", nationalNumber: "612345678", isValid: true }
 *
 * normalizePhoneWithCountry("+1 (555) 123-4567")
 * // => { phoneNumber: "+15551234567", countryCode: "US", nationalNumber: "5551234567", isValid: true }
 */
export function normalizePhoneWithCountry(
  phoneNumber: string,
  defaultCountry?: string
): PhoneNormalizationResult | null {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return null;
  }

  try {
    const parsed = parsePhoneNumber(
      phoneNumber.trim(),
      defaultCountry as CountryCode | undefined
    );

    if (!parsed) {
      return null;
    }

    return {
      phoneNumber: parsed.format('E.164'),
      countryCode: parsed.country || defaultCountry || '',
      nationalNumber: parsed.nationalNumber,
      isValid: parsed.isValid()
    };
  } catch (error) {
    console.warn('[normalizePhoneWithCountry] Parse error:', error);
    return null;
  }
}

/**
 * Valide un numéro de téléphone
 *
 * @param phoneNumber - Le numéro à valider
 * @param countryCode - Code pays optionnel (ex: "FR")
 */
export function validatePhoneNumber(phoneNumber: string, countryCode?: string): boolean {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return false;
  }

  try {
    return isValidPhoneNumber(phoneNumber, countryCode as CountryCode | undefined);
  } catch {
    return false;
  }
}

/**
 * Normalise un numéro de téléphone au format E.164 (legacy - pour rétrocompatibilité)
 * DEPRECATED: Utiliser normalizePhoneWithCountry à la place
 *
 * @param phoneNumber - Le numéro brut
 * @param defaultCountry - Code pays par défaut
 */
export function normalizePhoneNumber(phoneNumber: string, defaultCountry: string = 'FR'): string {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return '';
  }

  const result = normalizePhoneWithCountry(phoneNumber, defaultCountry);
  return result?.phoneNumber || '';
}

/**
 * Normalise un username
 * Préserve la capitalisation telle qu'entrée par l'utilisateur
 * Valide la longueur (2-16 caractères)
 */
export function normalizeUsername(username: string): string {
  const trimmed = username.trim();

  // Validation de la longueur
  if (trimmed.length < 2) {
    throw new Error('Le nom d\'utilisateur doit contenir au moins 2 caractères');
  }
  if (trimmed.length > 16) {
    throw new Error('Le nom d\'utilisateur ne peut pas dépasser 16 caractères');
  }

  // Validation des caractères (uniquement lettres, chiffres, tirets et underscores)
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(trimmed)) {
    throw new Error('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
  }

  return trimmed;
}

/**
 * Capitalise un nom (première lettre en majuscule, reste en minuscules)
 * Gère les noms composés avec espaces
 */
export function capitalizeName(name: string): string {
  return name
    .trim()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Normalise un displayName
 * Préserve la capitalisation, émojis et caractères spéciaux
 * Enlève uniquement les espaces avant/après et les retours à la ligne/tabulations
 */
export function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/[\n\t]/g, '');
}

/**
 * Normalise toutes les données d'un utilisateur pour l'inscription
 */
export interface UserDataToNormalize {
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

export function normalizeUserData(data: UserDataToNormalize): UserDataToNormalize {
  const normalized: UserDataToNormalize = {};

  if (data.email) {
    normalized.email = normalizeEmail(data.email);
  }

  if (data.username) {
    normalized.username = normalizeUsername(data.username);
  }

  if (data.firstName) {
    normalized.firstName = capitalizeName(data.firstName);
  }

  if (data.lastName) {
    normalized.lastName = capitalizeName(data.lastName);
  }

  if (data.displayName) {
    normalized.displayName = normalizeDisplayName(data.displayName);
  }

  return normalized;
}

