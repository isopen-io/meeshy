/**
 * Utilitaires de normalisation des données utilisateur
 */

import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from 'libphonenumber-js';
import { usernamePatternSource } from '@meeshy/shared/types';
import { enhancedLogger } from './logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'Normalize' });

const USERNAME_PATTERN = new RegExp(usernamePatternSource);

/**
 * Normalise un email en minuscules
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Vérifie si une chaîne ressemble à un numéro de téléphone
 * Retourne false pour les emails et usernames évidents
 */
export function looksLikePhoneNumber(value: string): boolean {
  if (!value || value.trim() === '') {
    return false;
  }

  const trimmed = value.trim();

  // Si contient un @, c'est un email
  if (trimmed.includes('@')) {
    return false;
  }

  // Un numéro de téléphone commence par +, un chiffre, ou une parenthèse
  // ouvrante (format local NANP `(555) 123-4567`, où l'indicatif régional est
  // entre parenthèses) et contient principalement des chiffres, espaces, tirets,
  // parenthèses. Sans le `(` en tête, un numéro local nord-américain saisi tel
  // quel était rejeté à tort — un faux négatif pour un format très courant.
  const phonePattern = /^[+\d(][\d\s\-().]*$/;
  return phonePattern.test(trimmed) && trimmed.replace(/\D/g, '').length >= 6;
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
  if (typeof phoneNumber !== 'string' || phoneNumber.trim() === '') {
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
    // Une `ParseError` est une DONNÉE illisible (`*123#`, `SOS`, indicatif
    // inconnu), pas un incident : la fonction la traduit déjà en `null`. La
    // remonter en WARN noyait les logs — une ligne par entrée atypique, des
    // centaines par synchronisation d'un carnet d'adresses réel. Seule une
    // défaillance INATTENDUE reste un WARN.
    if (error instanceof Error && error.name === 'ParseError') {
      logger.debug('normalizePhoneWithCountry parse error', { reason: error.message });
      return null;
    }
    logger.warn('normalizePhoneWithCountry unexpected error', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error)
    });
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

  // Éviter de parser des emails ou usernames
  if (!looksLikePhoneNumber(phoneNumber)) {
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

  // Validation des caractères — compilée depuis `usernamePatternSource`
  // (packages/shared/types/api-schemas.ts) pour que ce chemin serveur rende le
  // même verdict que les couches Ajv et Zod.
  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
  }

  return trimmed;
}

/**
 * Capitalise un nom : première lettre de CHAQUE segment en majuscule, reste en
 * minuscules. Un segment démarre au début de la chaîne ou après un séparateur
 * de nom — espace, tiret ou apostrophe/point (`[\s'.-]`, l'ensemble des
 * caractères non-lettres autorisés par `AuthSchemas.register`).
 *
 * Corrige le mauvais casse-mixte des noms composés fréquents dans un produit
 * francophone : `"Jean-Pierre"` reste `"Jean-Pierre"` (et non `"Jean-pierre"`),
 * `"O'Brien"` reste `"O'Brien"`. Les segments multi-espaces et les préfixes
 * non-alphabétiques (`"3john"`) sont préservés à l'identique.
 */
export function capitalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'.-])(\p{L})/gu, (_match, separator, letter) => separator + letter.toUpperCase());
}

/**
 * Jeu des caracteres qui BRISENT une ligne a l'affichage — SOURCE UNIQUE.
 *
 * La garantie « une seule ligne » d'un displayName ne se mesure pas contre
 * `\r`/`\n` seuls : un moteur de rendu (CSS `white-space`, `UILabel`,
 * `TextView`) casse aussi la ligne sur les separateurs Unicode LINE SEPARATOR
 * (U+2028), PARAGRAPH SEPARATOR (U+2029), NEL (U+0085), et les blancs verticaux
 * C0 VERTICAL TAB (U+000B) et FORM FEED (U+000C). La tabulation (`\t`) est
 * incluse pour un affichage sur une seule cellule.
 *
 * Ce jeu vivait recopie dans DEUX normaliseurs de nom du gateway :
 * `normalizeDisplayName` (ci-dessous, qui les SUPPRIME) et
 * `contact-identifiers.normalizeDisplayName` (qui les REMPLACE par un espace).
 * La copie du carnet d'adresses avait derive — elle ne couvrait que `\r\n\t`,
 * laissant un nom multi-lignes s'etaler sur deux lignes. On l'extrait ici pour
 * que les deux derivent leur regex du MEME site et ne rediverge plus.
 */
export const LINE_BREAKING_CHARS_SOURCE = '\\r\\n\\t\\v\\f\\u0085\\u2028\\u2029';

const LINE_BREAKING_CHARS_REGEX = new RegExp(`[${LINE_BREAKING_CHARS_SOURCE}]`, 'g');

/**
 * Normalise un displayName.
 * Preserve la capitalisation, emojis et caracteres speciaux. Enleve uniquement
 * les espaces avant/apres et TOUT separateur de ligne
 * ({@link LINE_BREAKING_CHARS_SOURCE}) — garantit un affichage sur une seule
 * ligne. Les espaces ordinaires (y compris multiples) et l'espace insecable
 * sont preserves.
 */
export function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(LINE_BREAKING_CHARS_REGEX, '');
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

