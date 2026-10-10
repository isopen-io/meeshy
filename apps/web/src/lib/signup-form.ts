import { personNamePatternSource, registerRequestSchema } from '@meeshy/shared/types/api-schemas/auth';
import { isSupportedLanguage } from '@meeshy/shared/utils/languages';
import { phoneImplausibility, type PhoneImplausibility } from '@meeshy/shared/utils/phone-plausibility';
import {
  PSEUDO_DE_SECOURS,
  displayNameDepuisEmail,
  pseudoRacine,
} from '@meeshy/shared/utils/registration-identity';
import { usernameRefusal, type UsernameRefusal } from '@meeshy/shared/utils/username-rule';

import type { RegisterBody } from './api/auth';
import { isReferralCodeShaped, normalizeReferralCode } from './view/referral-code';
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
  /**
   * Le pseudo et le nom affiché TAPÉS (#6479, refaits par #7897).
   *
   * `null` = jamais touché : le champ SUIT l'adresse en direct. Une chaîne =
   * la saisie, qui gagne ; vidée, la dérivation reparaît en filigrane et
   * repart. L'écran montre `effectiveUsername` / `effectiveDisplayName` et
   * écrit ici : sans cette séparation, taper une lettre dans l'adresse
   * écraserait un pseudo choisi à la main.
   */
  readonly username: string | null;
  readonly displayName: string | null;
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

/** Longueur maximale d'un pseudo — LUE sur `registerRequestSchema` (#8082) :
 * `direction_recette` (17 caractères) passait l'écran et se faisait refuser
 * par la passerelle, faute que le client connaisse la borne. */
export const USERNAME_MAX = registerRequestSchema.properties.username.maxLength;

/** Compilé depuis la source PARTAGÉE — la même regex que le schéma Ajv du
 * serveur et le Zod de `AuthSchemas.register` compilent tous deux. */
const PERSON_NAME_PATTERN = new RegExp(personNamePatternSource, 'u');

/**
 * Un nom affiché FOURNI doit tenir le pattern et la borne ; un champ VIDE est
 * valide, parce qu'il est LÉGITIME (#6441, suite de #6424) — la passerelle le
 * DÉRIVE alors de la partie locale de l'adresse (`displayNameDepuisEmail`,
 * `services/gateway/src/services/auth/registration-identity.ts`).
 *
 * C'est MOT POUR MOT l'arbitrage rendu pour le mot de passe trente lignes plus
 * bas, et le doc-comment de `DISPLAY_NAME_MAX` nomme déjà le défaut qu'il
 * écarte : garder l'ancienne règle rendrait le client plus STRICT que le
 * serveur — un refus local pour une charge que la passerelle ACCEPTE, et rien
 * ne rougit nulle part. La moitié « mot de passe » de #6424 a été livrée sans
 * celle-ci : l'écran annonçait « adresse seule » et exigeait toujours un nom.
 */
export function isDisplayNameValid(value: string | null): boolean {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > DISPLAY_NAME_MAX) return false;
  return PERSON_NAME_PATTERN.test(trimmed);
}

/** `true` quand un nom affiché a réellement été TAPÉ. Distinct de
 * `isDisplayNameValid`, qui répond « cette saisie est-elle acceptable » :
 * c'est celle-ci qui décide si la clé part dans la charge. */
export function hasDisplayName(value: string | null): boolean {
  return (value ?? '').trim().length > 0;
}

/** Rapprochement du `z.email`/`format: 'email'` serveur : « a@b » (pas de TLD)
 * est refusé, comme il l'est côté serveur. */
export function isEmailValid(value: string): boolean {
  const trimmed = value.trim();
  return /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(trimmed);
}

/**
 * Un mot de passe FOURNI doit atteindre la borne ; un champ VIDE est valide,
 * parce qu'il est LÉGITIME (#6424) — le compte naît alors sans mot de passe et
 * sa porte est le lien magique.
 *
 * Garder l'ancienne règle rendrait le client plus STRICT que le serveur : un
 * refus local pour une charge que la passerelle accepte, et rien ne rougit
 * nulle part (§ `DISPLAY_NAME_MAX`, même piège).
 */
export function isPasswordValid(value: string): boolean {
  return value.length === 0 || value.length >= PASSWORD_MIN;
}

/** `true` quand un mot de passe a réellement été TAPÉ. Distinct de
 * `isPasswordValid`, qui répond « cette saisie est-elle acceptable » : c'est
 * celle-ci qui décide si la clé part dans la charge. */
export function hasPassword(value: string): boolean {
  return value.length > 0;
}

/** Le bouton s'active quand l'ADRESSE est valide ET le NUMÉRO plausible — et
 * que le nom affiché et le mot de passe, s'ils ont été tapés, tiennent leurs
 * bornes (#6441, #6479, #9343).
 *
 * Le numéro est requis par l'ÉCRAN, pas par la passerelle (directive porteur
 * 2026-10-04) : `registerRequestSchema` garde `required: ['email']`, et une
 * inscription par adresse seule — API, anciennes versions des apps — crée
 * toujours le compte. Le client est donc VOLONTAIREMENT plus strict que le
 * serveur sur ce seul champ (§ SignupForm.swift, le miroir qui porte la même
 * loi). */
export function canSubmit(form: SignupFormState): boolean {
  return (
    isDisplayNameValid(form.displayName) &&
    isEmailValid(form.email) &&
    isPasswordValid(form.password) &&
    isPhoneValid(form.phoneDigits) &&
    usernameFieldRefusal(form) === null
  );
}

/**
 * Pourquoi le numéro ne permet pas d'avancer : ABSENT (#9343), ou l'un des
 * trois motifs d'implausibilité de la loi partagée (#6479).
 *
 * `missing` vit ICI et pas dans `@meeshy/shared/utils/phone-plausibility` : la
 * loi partagée tient le vide pour plausible parce que la PASSERELLE accepte
 * une inscription sans numéro, et doit continuer de l'accepter. L'exigence est
 * celle de l'écran seul.
 */
export type SignupPhoneRefusal = 'missing' | PhoneImplausibility;

/** Le MOTIF du refus, pour que l'écran dise quoi corriger — « numéro
 * invalide » n'apprend rien à qui a tapé le sien de travers. */
export function phoneRefusal(phoneDigits: string): SignupPhoneRefusal | null {
  if (normalizedPhoneDigits(phoneDigits).length === 0) return 'missing';
  return phoneImplausibility(phoneDigits);
}

/** Un numéro est DONNÉ quand il est présent ET plausible — la condition pour
 * passer la phase du téléphone et pour s'inscrire (#9343). */
export function isPhoneValid(phoneDigits: string): boolean {
  return phoneRefusal(phoneDigits) === null;
}

/**
 * LE PSEUDO QUI PARTIRA — tapé s'il l'a été, tiré de l'ADRESSE sinon (#6479,
 * #7897 : « le pseudo rempli à partir de l'email »).
 *
 * Directive porteur : « à partir du moment où un champ username est rempli, la
 * passerelle n'a plus rien à créer ». `resoudreUsername`
 * (`registration.service.ts`) emploie tel quel un pseudo fourni.
 *
 * Rend `''` quand la dérivation retombe sur le RECOURS (`user`) : envoyer
 * `user` garantirait une collision — la passerelle cherche alors elle-même.
 */
export function effectiveUsername(form: SignupFormState): string {
  const tape = (form.username ?? '').trim();
  if (tape !== '') return tape;
  const derive = pseudoRacine({ email: form.email });
  return derive === PSEUDO_DE_SECOURS ? '' : derive;
}

/**
 * LE REFUS DU PSEUDO, PENDANT LA SAISIE (#8082) — le verdict que la passerelle
 * rendrait (`usernameRefusal`, `@meeshy/shared/utils/username-rule`), posé sur
 * le pseudo QUI PARTIRA. `null` quand il est recevable, ou absent : la
 * passerelle le dérive alors elle-même.
 */
export function usernameFieldRefusal(form: SignupFormState): UsernameRefusal | null {
  const pseudo = effectiveUsername(form);
  return pseudo === '' ? null : usernameRefusal(pseudo);
}

/** Le nom affiché qui partira — tapé s'il l'a été, tiré de l'adresse sinon. */
export function effectiveDisplayName(form: SignupFormState): string {
  const tape = (form.displayName ?? '').trim();
  return tape !== '' ? tape : displayNameDepuisEmail(form.email);
}

/**
 * L'IDENTITÉ EST DÉFINIE (#7897) — nom affiché ET pseudo existent et tiennent
 * leurs bornes. Directive porteur : « c'est quand tout est défini qu'on active
 * le champ mot de passe ».
 */
export function isIdentityDefined(form: SignupFormState): boolean {
  return (
    isEmailValid(form.email) &&
    effectiveDisplayName(form) !== '' &&
    isDisplayNameValid(effectiveDisplayName(form)) &&
    effectiveUsername(form) !== '' &&
    usernameFieldRefusal(form) === null
  );
}

/** Les chiffres saisis, débarrassés de tout ce qui n'en est pas. */
export function normalizedPhoneDigits(phoneDigits: string): string {
  return phoneDigits.replace(/\D/g, '');
}

/**
 * Le parrainage qui accompagne l'inscription (#8058). Le code voyage DANS la
 * création du compte, et la passerelle noue la relation au parrain, activé ou
 * non — c'est ce qui permet à une revendication d'adresse (#8214), créée sans
 * session, d'être parrainée aussi. Un code mal formé n'est pas envoyé ; un
 * code refusé par la passerelle ne bloque jamais l'inscription.
 */
export type RegisterReferral = {
  readonly referralCode?: string;
  readonly referralSessionKey?: string;
};

function referralFields(referral: RegisterReferral): Pick<RegisterBody, 'affiliateToken' | 'affiliateSessionKey'> {
  const code = normalizeReferralCode(referral.referralCode ?? '');
  if (!isReferralCodeShaped(code)) return {};
  const sessionKey = (referral.referralSessionKey ?? '').trim();
  return { affiliateToken: code, ...(sessionKey !== '' ? { affiliateSessionKey: sessionKey } : {}) };
}

/**
 * La charge EXACTE de `POST /auth/register` (`register.ts`) — jamais
 * `firstName` / `lastName` (la passerelle les dérive de `displayName`, #5218).
 * Le couple téléphone part TOUJOURS, numéro et pays ensemble : l'écran ne
 * compose plus d'inscription sans numéro (#9343) — `canSubmit` l'en empêche.
 */
export function composeRegisterBody(form: SignupFormState, referral: RegisterReferral = {}): RegisterBody {
  const digits = normalizedPhoneDigits(form.phoneDigits);
  return {
    // OMISE quand le champ est vide, jamais `''` : `displayNameProperty` porte
    // `minLength: 1` — une chaîne vide serait une VALEUR, refusée par la borne,
    // et l'inscription échouerait dans le cas même qu'elle ouvre (#6441).
    // Ce que l'écran MONTRE est ce qu'il ENVOIE (#6479) — dérivé ou tapé, peu
    // importe : dès qu'une valeur existe, la passerelle n'a plus à en inventer
    // une. Les deux clés restent OMISES quand il n'y a réellement rien.
    ...(effectiveUsername(form) !== '' ? { username: effectiveUsername(form) } : {}),
    ...(effectiveDisplayName(form) !== '' ? { displayName: effectiveDisplayName(form) } : {}),
    email: form.email.trim().toLowerCase(),
    // `undefined` par OMISSION, jamais `''` (#6424) : une clé présente à
    // valeur vide décrit quelque chose qui n'a pas été demandé.
    ...(hasPassword(form.password) ? { password: form.password } : {}),
    phoneNumber: digits,
    phoneCountryCode: form.country.id,
    systemLanguage: form.systemLanguage,
    regionalLanguage: form.regionalLanguage,
    ...referralFields(referral),
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
    username: null,
    displayName: null,
    email: '',
    phoneDigits: '',
    password: '',
    country: defaultCountry(locale),
    systemLanguage,
    regionalLanguage,
  };
}
