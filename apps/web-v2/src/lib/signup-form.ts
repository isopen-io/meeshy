import { personNamePatternSource, registerRequestSchema } from '@meeshy/shared/types/api-schemas/auth';
import { isSupportedLanguage } from '@meeshy/shared/utils/languages';

import type { RegisterBody } from './api/auth';
import { countryOf, type Country } from './countries';

/**
 * LE MODÈLE D'INSCRIPTION (#5555, E4) — miroir pur de `SignupForm.swift`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/SignupForm.swift`), avec les
 * SOURCES PARTAGÉES à la place des constantes recopiées : `PASSWORD_MIN` est
 * LU sur `registerRequestSchema`, jamais un littéral local — la borne serveur
 * a déjà divergé une fois (#3629, 6 → 12) sans que le miroir Swift le
 * remarque (doc-comment `SignupForm.swift:59-67`, toujours à 6).
 *
 * Aucun réseau, aucun singleton, aucune horloge : entièrement pur, comme son
 * modèle iOS. La décision produit (quand envoyer, où poser un refus) vit dans
 * `view/auth-feedback.ts` et l'écran, jamais ici.
 */

export type SignupFormState = {
  readonly displayName: string;
  readonly email: string;
  /** Les chiffres SEULS, sans indicatif — l'indicatif vient de `country`. */
  readonly phoneDigits: string;
  readonly password: string;
  readonly country: Country;
  /** Rang 1 du Prisme — la langue dans laquelle l'utilisateur LIRA Meeshy. */
  readonly systemLanguage: string;
  /** Rang 2, déduit de la RÉGION et jamais montré. */
  readonly regionalLanguage: string;
};

/** Longueur maximale d'un nom affiché — miroir de `displayNameProperty`
 * (`registerRequestSchema`, `types/api-schemas/auth.ts`). */
export const DISPLAY_NAME_MAX = registerRequestSchema.properties.displayName.maxLength;

/** Longueur minimale du mot de passe — LA source, jamais un littéral local
 * (#3629 : la borne serveur est passée de 6 à 12 sans que le miroir iOS le
 * suive ; ce module ne peut pas rejouer ce défaut, il LIT le schéma). */
export const PASSWORD_MIN = registerRequestSchema.properties.password.minLength;

/** Compilé depuis la source PARTAGÉE — la même regex que le schéma Ajv du
 * serveur et le Zod de `AuthSchemas.register` compilent tous deux. */
const PERSON_NAME_PATTERN = new RegExp(personNamePatternSource, 'u');

export function isDisplayNameValid(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > DISPLAY_NAME_MAX) return false;
  return PERSON_NAME_PATTERN.test(trimmed);
}

/** Rapprochement du `z.email`/`format: 'email'` serveur : « a@b » (pas de TLD)
 * est refusé, comme il l'est côté serveur. */
export function isEmailValid(value: string): boolean {
  const trimmed = value.trim();
  return /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(trimmed);
}

export function isPasswordValid(value: string): boolean {
  return value.length >= PASSWORD_MIN;
}

/** Le bouton s'active dès que les TROIS champs requis sont valides — le
 * téléphone n'y figure jamais : il n'est pas requis (§ SignupForm.swift:99-106). */
export function canSubmit(form: SignupFormState): boolean {
  return isDisplayNameValid(form.displayName) && isEmailValid(form.email) && isPasswordValid(form.password);
}

/** Les chiffres saisis, débarrassés de tout ce qui n'en est pas. */
export function normalizedPhoneDigits(phoneDigits: string): string {
  return phoneDigits.replace(/\D/g, '');
}

/**
 * La charge EXACTE de `POST /auth/register` (`register.ts:133`) — sept clés
 * au plus, jamais `username` / `firstName` / `lastName` (la passerelle les
 * dérive de `displayName`, #5218). Le couple téléphone est TOUT ou RIEN : un
 * numéro sans pays ne qualifierait rien.
 */
export function composeRegisterBody(form: SignupFormState): RegisterBody {
  const digits = normalizedPhoneDigits(form.phoneDigits);
  const hasPhone = digits.length > 0;
  return {
    displayName: form.displayName.trim(),
    email: form.email.trim().toLowerCase(),
    password: form.password,
    ...(hasPhone ? { phoneNumber: digits, phoneCountryCode: form.country.id } : {}),
    systemLanguage: form.systemLanguage,
    regionalLanguage: form.regionalLanguage,
  };
}

// --- Défauts déduits d'une locale (miroir SignupForm.swift:148-206) --------

/** Miroir de `SignupForm.regionLanguageMap` — reprise telle quelle, la seule
 * chose que le wizard remplacé avait de juste sur ce point. */
const REGION_LANGUAGE: Readonly<Record<string, string>> = {
  CM: 'fr', FR: 'fr', BE: 'fr', CH: 'fr', CA: 'fr', SN: 'fr', CI: 'fr', CD: 'fr', MG: 'fr',
  US: 'en', GB: 'en', AU: 'en', NZ: 'en', IE: 'en', ZA: 'en', NG: 'en', GH: 'en', KE: 'en',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es',
  DE: 'de', AT: 'de',
  IT: 'it',
  PT: 'pt', BR: 'pt',
  SA: 'ar', AE: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar',
  CN: 'zh', TW: 'zh', HK: 'zh',
  JP: 'ja',
  KR: 'ko',
  RU: 'ru',
  TR: 'tr',
  NL: 'nl',
  PL: 'pl',
  SE: 'sv',
  IN: 'hi',
  TH: 'th',
  VN: 'vi',
  UA: 'uk',
  RO: 'ro',
};

const FALLBACK_LANGUAGE = 'fr';

export type DefaultLanguages = { readonly systemLanguage: string; readonly regionalLanguage: string };

/**
 * Défauts déduits d'une `Intl.Locale` (ou de sa forme texte, ex. `"fr-FR"`) —
 * miroir de `SignupForm.defaultSystemLanguage` / `defaultRegionalLanguage`.
 * Le rang 2 ne se montre jamais : c'est le témoin de RANG de ce module (le
 * témoin s'écrit sur `en-US` — rang 2, jamais sur le rang 1).
 */
export function defaultLanguages(locale: string): DefaultLanguages {
  const [languageTag, regionTag] = locale.split('-');
  const language = (languageTag ?? '').toLowerCase();
  const systemLanguage = isSupportedLanguage(language) ? language : FALLBACK_LANGUAGE;

  const region = (regionTag ?? '').toUpperCase();
  const regional = REGION_LANGUAGE[region];
  const regionalLanguage =
    regional && isSupportedLanguage(regional) && regional !== systemLanguage
      ? regional
      : systemLanguage !== 'en'
        ? 'en'
        : FALLBACK_LANGUAGE;

  return { systemLanguage, regionalLanguage };
}

/** Le pays de l'appareil, à défaut le premier de la liste (la France, tête de
 * `COUNTRIES` par ordre de priorité — miroir `SignupForm.defaultCountry`). */
export function defaultCountry(locale: string): Country {
  const [, regionTag] = locale.split('-');
  const region = (regionTag ?? '').toUpperCase();
  return countryOf(region) ?? countryOf('FR')!;
}

/** Une forme vierge dont les défauts SONT déjà justes — miroir
 * `SignupForm.init(locale:)`. */
export function emptySignupForm(locale: string): SignupFormState {
  const { systemLanguage, regionalLanguage } = defaultLanguages(locale);
  return {
    displayName: '',
    email: '',
    phoneDigits: '',
    password: '',
    country: defaultCountry(locale),
    systemLanguage,
    regionalLanguage,
  };
}
