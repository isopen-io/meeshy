import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumber,
} from 'libphonenumber-js';

/**
 * Représentation d'un pays pour la saisie/lecture d'un numéro de téléphone.
 * `code` = ISO 3166-1 alpha-2, `dial` = indicatif international (ex: "+33").
 */
export type Country = {
  code: string;
  dial: string;
  flag: string;
  name: string;
};

// Backward-compatible alias (certains composants typent via `typeof COUNTRY_CODES[0]`).
export type CountryOption = Country;

/**
 * Pays mis en tête de liste (les plus courants pour Meeshy).
 * Tous les autres pays restent disponibles, triés alphabétiquement à la suite.
 * France reste en première position (défaut historique `COUNTRY_CODES[0]`).
 */
const PRIORITY: readonly string[] = [
  'FR', 'US', 'GB', 'DE', 'ES', 'IT', 'PT', 'BE', 'CH', 'CA', 'MA', 'DZ', 'TN',
  'SN', 'CI', 'CM', 'BJ', 'BF', 'NE', 'ML', 'GN', 'TG', 'GA', 'CG', 'CD', 'MG',
  'RU', 'CN', 'JP', 'IN', 'BR', 'MX', 'AR', 'CO', 'PE', 'CL', 'TR', 'EG', 'SA',
  'AE', 'ZA', 'NG', 'KE', 'AU', 'NZ',
];

const REGIONAL_INDICATOR_BASE = 127397; // 0x1F1E6 - 'A'.charCodeAt(0)

const flagFor = (code: string): string =>
  code
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(REGIONAL_INDICATOR_BASE + char.charCodeAt(0))
    );

const regionNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' });
  } catch {
    return null;
  }
})();

const nameFor = (code: string): string => regionNames?.of(code) ?? code;

const buildCountries = (): Country[] => {
  const all: Country[] = getCountries().map((code) => ({
    code,
    dial: `+${getCountryCallingCode(code)}`,
    flag: flagFor(code),
    name: nameFor(code),
  }));

  const rank = new Map(PRIORITY.map((code, index) => [code, index]));

  return all.sort((a, b) => {
    const ra = rank.get(a.code);
    const rb = rank.get(b.code);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.name.localeCompare(b.name, 'fr');
  });
};

/** Liste complète de tous les indicatifs pays (ISO + indicatif + drapeau + nom). */
export const COUNTRY_CODES: Country[] = buildCountries();

const byCode = new Map(COUNTRY_CODES.map((country) => [country.code, country]));

export const findCountryByCode = (code?: string | null): Country | undefined =>
  code ? byCode.get(code.toUpperCase()) : undefined;

export const getDialCode = (code?: string | null): string =>
  findCountryByCode(code)?.dial ?? '';

export const getCountryName = (code?: string | null): string =>
  findCountryByCode(code)?.name ?? code ?? '';

/** Pays par défaut (France) lorsque rien ne peut être déduit. */
export const DEFAULT_COUNTRY: Country = findCountryByCode('FR') ?? COUNTRY_CODES[0];

/**
 * Déduit le pays à présélectionner depuis la locale du navigateur.
 * Retombe sur la France si aucune région exploitable n'est trouvée.
 */
export const detectDefaultCountry = (): Country => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const region = navigator.language.split('-')[1]?.toUpperCase();
    const match = findCountryByCode(region);
    if (match) return match;
  }
  return DEFAULT_COUNTRY;
};

/**
 * Garantit qu'un numéro est toujours affiché précédé de son indicatif pays.
 * - Numéro déjà au format international (+...) -> formatage international lisible.
 * - Numéro national -> préfixé par l'indicatif du pays fourni.
 */
export const formatPhoneWithDialCode = (
  phoneNumber?: string | null,
  countryCode?: string | null
): string => {
  if (!phoneNumber) return '';
  const trimmed = phoneNumber.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('+')) {
    try {
      const parsed = parsePhoneNumber(trimmed);
      if (parsed) return parsed.formatInternational();
    } catch {
      // numéro partiel ou non parseable : on retourne tel quel (déjà préfixé).
    }
    return trimmed;
  }

  const dial = getDialCode(countryCode);
  return dial ? `${dial} ${trimmed}` : trimmed;
};
