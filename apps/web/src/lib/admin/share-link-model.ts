import type { AdminShareLink, AdminShareLinkRow } from '@/lib/api/admin-share-links';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { shareLinkStateOf } from './interpret/enums';
import { countryName, languageName, sentenceCase } from './interpret/language';
import { booleanPhrase } from './interpret/labels';
import { formatCount } from './interpret/numbers';
import type { Interpreted } from './interpret/types';

/**
 * **CE QU'UN LIEN DE PARTAGE PERMET, EXIGE ET RESTREINT, DIT EN MOTS** (#8876,
 * #6729) — des fonctions pures, sans écran.
 *
 * Une permission ne se dit jamais `true` / `false` : elle se dit par une PHRASE
 * propre au champ (« Les invités peuvent écrire des messages » / « … ne peuvent
 * pas écrire de messages »), et une permission que la charge ne porte pas se dit
 * « Non communiqué » — jamais un « non » inventé.
 */
export const shareLinkState = (link: AdminShareLinkRow, now: Date, language: InterfaceLanguage): Interpreted =>
  shareLinkStateOf({ isActive: link.isActive, expiresAt: link.expiresAt, maxUses: link.maxUses, currentUses: link.currentUses }, now, language);

/** « 12 sur 50 » quand il y a un plafond, « 12, sans limite » sinon. Le plafond nul ou absent est « sans limite » (la passerelle ne plafonne pas à zéro). */
export function shareLinkUsage(used: number, max: number | null, language: InterfaceLanguage): string {
  const params = { used: formatCount(used, language) };
  return max === null || max <= 0
    ? translateAdmin(language, 'admin.shareLink.usage.unlimited', params)
    : translateAdmin(language, 'admin.shareLink.usage.limited', { ...params, max: formatCount(max, language) });
}

export type ShareLinkFlag = { readonly id: string; readonly allowed: boolean | null; readonly phrase: string };

type PermissionId = 'messages' | 'files' | 'images' | 'history';
type RequirementId = 'account' | 'nickname' | 'email' | 'birthday';

const PERMISSIONS: readonly { readonly id: PermissionId; readonly pick: (link: AdminShareLink) => boolean | null }[] = [
  { id: 'messages', pick: (link) => link.allowAnonymousMessages },
  { id: 'files', pick: (link) => link.allowAnonymousFiles },
  { id: 'images', pick: (link) => link.allowAnonymousImages },
  { id: 'history', pick: (link) => link.allowViewHistory },
];

const REQUIREMENTS: readonly { readonly id: RequirementId; readonly pick: (link: AdminShareLink) => boolean | null }[] = [
  { id: 'account', pick: (link) => link.requireAccount },
  { id: 'nickname', pick: (link) => link.requireNickname },
  { id: 'email', pick: (link) => link.requireEmail },
  { id: 'birthday', pick: (link) => link.requireBirthday },
];

/** Ce que les invités peuvent faire — écrire, envoyer des fichiers, des images, lire l'historique — chacun en une phrase. */
export function shareLinkGuestPermissions(link: AdminShareLink, language: InterfaceLanguage): readonly ShareLinkFlag[] {
  return PERMISSIONS.map(({ id, pick }) => {
    const allowed = pick(link);
    return {
      id,
      allowed,
      phrase: booleanPhrase(
        allowed,
        {
          yes: translateAdmin(language, `admin.shareLink.perm.${id}.yes`),
          no: translateAdmin(language, `admin.shareLink.perm.${id}.no`),
          unknown: translateAdmin(language, 'admin.shareLink.perm.unknown'),
        },
        language,
      ),
    };
  });
}

/** Ce que le lien exige de celui qui entre — un compte, un pseudonyme, une adresse e-mail, une date de naissance. */
export function shareLinkRequirements(link: AdminShareLink, language: InterfaceLanguage): readonly ShareLinkFlag[] {
  return REQUIREMENTS.map(({ id, pick }) => {
    const required = pick(link);
    return {
      id,
      allowed: required,
      phrase: booleanPhrase(
        required,
        {
          yes: translateAdmin(language, `admin.shareLink.req.${id}.yes`),
          no: translateAdmin(language, `admin.shareLink.req.${id}.no`),
          unknown: translateAdmin(language, 'admin.shareLink.perm.unknown'),
        },
        language,
      ),
    };
  });
}

export type ShareLinkRestrictions = {
  /** Les NOMS des pays autorisés, dans la langue d'interface, triés. Vide = aucune restriction. */
  readonly countries: readonly string[];
  readonly languages: readonly string[];
};

const uniqueSorted = (names: readonly string[], language: InterfaceLanguage): readonly string[] =>
  [...new Set(names)].sort((left, right) => left.localeCompare(right, language));

/** Pays et langues NOMMÉS — jamais « FR » ni « wo » ; un code que personne ne sait nommer se dit « Pays inconnu » / « Langue inconnue ». */
export function shareLinkRestrictions(link: AdminShareLink, language: InterfaceLanguage): ShareLinkRestrictions {
  return {
    countries: uniqueSorted(link.allowedCountries.map((code) => countryName(code, language)), language),
    languages: uniqueSorted(link.allowedLanguages.map((code) => sentenceCase(languageName(code, language), language)), language),
  };
}

export type ShareLinkGesture = 'close' | 'reopen' | 'reveal';

/**
 * Les gestes offerts — et seulement ceux qui ont un effet : un lien ouvert se ferme,
 * un lien fermé se rouvre ; le secret ne se révèle qu'au rang SOUVERAIN (la route
 * exige `requireSovereign`, un 403 pour tout autre rang).
 */
export function shareLinkGestures(link: { readonly isActive: boolean }, reach: { readonly isSovereign: boolean }): readonly ShareLinkGesture[] {
  return [link.isActive ? 'close' : 'reopen', ...(reach.isSovereign ? (['reveal'] as const) : [])];
}
