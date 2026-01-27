/**
 * Validation ROBUSTE des numéros de téléphone avec libphonenumber-js
 *
 * Ce module fournit une validation stricte et précise des numéros de téléphone
 * en utilisant libphonenumber-js pour respecter les formats internationaux.
 */

import { parsePhoneNumber, isValidPhoneNumber, CountryCode, AsYouType } from 'libphonenumber-js';

export interface PhoneValidationResult {
  isValid: boolean;
  formatted?: string;        // Format E.164 (+33612345678)
  national?: string;          // Format national (06 12 34 56 78)
  international?: string;     // Format international (+33 6 12 34 56 78)
  countryCode?: string;       // Code pays (FR)
  error?: string;             // Code d'erreur pour traduction
}

/**
 * Valide un numéro de téléphone selon le pays sélectionné
 *
 * @param phoneNumber - Le numéro entré par l'utilisateur (peut contenir espaces, tirets, etc.)
 * @param countryCode - Le code pays ISO (FR, US, BE, etc.)
 * @returns Résultat de validation avec formats et erreurs
 */
export function validatePhoneNumber(
  phoneNumber: string,
  countryCode: CountryCode
): PhoneValidationResult {
  // Vérifier si vide
  if (!phoneNumber || phoneNumber.trim() === '') {
    return {
      isValid: false,
      error: 'phoneRequired'
    };
  }

  const trimmed = phoneNumber.trim();

  try {
    // Parser le numéro avec le pays sélectionné
    const parsed = parsePhoneNumber(trimmed, countryCode);

    if (!parsed) {
      return {
        isValid: false,
        error: 'phoneInvalidFormat'
      };
    }

    // Vérifier si le numéro est valide selon les règles du pays
    if (!parsed.isValid()) {
      return {
        isValid: false,
        error: 'phoneInvalidForCountry'
      };
    }

    // Retourner tous les formats
    return {
      isValid: true,
      formatted: parsed.format('E.164'),           // +33612345678
      national: parsed.formatNational(),           // 06 12 34 56 78
      international: parsed.formatInternational(), // +33 6 12 34 56 78
      countryCode: parsed.country || countryCode
    };
  } catch (error) {
    console.warn('[phone-validation] Parse error:', error);
    return {
      isValid: false,
      error: 'phoneInvalidFormat'
    };
  }
}

/**
 * Valide un numéro de téléphone complet (avec préfixe international)
 * Sans besoin de spécifier le pays
 *
 * @param phoneNumber - Le numéro avec préfixe (+33612345678, 0033612345678, etc.)
 * @returns Résultat de validation
 */
export function validateInternationalPhone(phoneNumber: string): PhoneValidationResult {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return {
      isValid: false,
      error: 'phoneRequired'
    };
  }

  const trimmed = phoneNumber.trim();

  // Vérifier que le numéro commence par + ou 00
  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) {
    return {
      isValid: false,
      error: 'phoneNeedsInternationalPrefix'
    };
  }

  try {
    // Parser sans pays spécifique
    const parsed = parsePhoneNumber(trimmed);

    if (!parsed) {
      return {
        isValid: false,
        error: 'phoneInvalidFormat'
      };
    }

    if (!parsed.isValid()) {
      return {
        isValid: false,
        error: 'phoneInvalidForCountry'
      };
    }

    return {
      isValid: true,
      formatted: parsed.format('E.164'),
      national: parsed.formatNational(),
      international: parsed.formatInternational(),
      countryCode: parsed.country
    };
  } catch (error) {
    console.warn('[phone-validation] Parse error:', error);
    return {
      isValid: false,
      error: 'phoneInvalidFormat'
    };
  }
}

/**
 * Formate un numéro de téléphone pendant la saisie (as-you-type)
 *
 * @param value - La valeur en cours de saisie
 * @param countryCode - Le code pays sélectionné
 * @returns Le numéro formaté selon le pays
 */
export function formatPhoneAsYouType(value: string, countryCode: CountryCode): string {
  if (!value) return '';

  const formatter = new AsYouType(countryCode);
  return formatter.input(value);
}

/**
 * Construit un numéro de téléphone complet au format E.164
 *
 * @param phoneNumber - Le numéro national entré (sans préfixe pays)
 * @param countryCode - Le code pays sélectionné
 * @returns Le numéro au format E.164 ou null si invalide
 */
export function buildInternationalPhone(
  phoneNumber: string,
  countryCode: CountryCode
): string | null {
  const result = validatePhoneNumber(phoneNumber, countryCode);
  return result.isValid ? result.formatted! : null;
}

/**
 * Vérifie rapidement si un numéro est valide (version simple)
 *
 * @param phoneNumber - Le numéro à vérifier
 * @param countryCode - Le code pays
 * @returns true si valide, false sinon
 */
export function isPhoneValid(phoneNumber: string, countryCode: CountryCode): boolean {
  if (!phoneNumber || phoneNumber.trim() === '') return false;

  try {
    return isValidPhoneNumber(phoneNumber, countryCode);
  } catch {
    return false;
  }
}

/**
 * Nettoie un numéro de téléphone en gardant uniquement les caractères valides
 *
 * @param value - La valeur entrée
 * @returns Le numéro nettoyé
 */
export function cleanPhoneInput(value: string): string {
  if (!value) return '';

  // Garder +, chiffres, espaces, tirets, parenthèses
  return value.replace(/[^\d+\s()-]/g, '');
}

/**
 * Messages d'erreur traduits
 */
export const PHONE_ERROR_MESSAGES = {
  phoneRequired: 'Le numéro de téléphone est requis',
  phoneInvalidFormat: 'Format de numéro invalide',
  phoneInvalidForCountry: 'Numéro invalide pour le pays sélectionné',
  phoneNeedsInternationalPrefix: 'Le numéro doit commencer par + ou 00',
  phoneTooShort: 'Numéro trop court',
  phoneTooLong: 'Numéro trop long'
} as const;

/**
 * Exemples d'utilisation:
 *
 * // Validation avec pays sélectionné
 * const result = validatePhoneNumber('0612345678', 'FR');
 * if (result.isValid) {
 *   console.log(result.formatted); // +33612345678
 * }
 *
 * // Validation internationale
 * const result2 = validateInternationalPhone('+33612345678');
 *
 * // Formatage pendant la frappe
 * const formatted = formatPhoneAsYouType('0612', 'FR'); // "06 12"
 *
 * // Construction du numéro complet
 * const full = buildInternationalPhone('612345678', 'FR'); // "+33612345678"
 */
