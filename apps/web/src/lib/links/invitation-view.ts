import type { GuestTerms, InvitationLimits, SpokenLanguage } from '@/lib/api/link-join';

/**
 * **LES RÈGLES PURES DE LA PAGE D'ACCUEIL D'INVITATION** (#7796, #7797) — ce
 * que la carte des droits, la ligne de validité, la barre des langues et les
 * choix décident, sans DOM ni réseau. La page du créateur (`/links/share/:id`)
 * lit la même barre et les mêmes drapeaux.
 */

export type AnonymousRight = 'messages' | 'images' | 'files' | 'history';

export type AnonymousRightRow = { readonly right: AnonymousRight; readonly granted: boolean };

/** L'ordre de la carte « En anonyme, tu pourras » : écrire, images, fichiers,
 * puis lire ce qui précède l'arrivée — celui de la précision porteur (#7796). */
export function anonymousRightsOf(guest: GuestTerms, readsHistory: boolean): readonly AnonymousRightRow[] {
  return [
    { right: 'messages', granted: guest.mayWrite },
    { right: 'images', granted: guest.mayImages },
    { right: 'files', granted: guest.mayFiles },
    { right: 'history', granted: readsHistory },
  ];
}

export type AskedField = 'nickname' | 'email' | 'birthday';

export function askedFieldsOf(guest: GuestTerms): readonly AskedField[] {
  return [
    ...(guest.nicknameRequired ? (['nickname'] as const) : []),
    ...(guest.emailRequired ? (['email'] as const) : []),
    ...(guest.birthdayRequired ? (['birthday'] as const) : []),
  ];
}

const DAY_MS = 86_400_000;

/**
 * Les jours qui restent — un jour COMMENCÉ compte (« encore 7 jours » à six
 * jours et une heure), ce qui reste d'aujourd'hui vaut 0 (« expire
 * aujourd'hui »). `null` : aucune expiration.
 */
export function daysLeft(expiresAt: string | null, now: Date): number | null {
  if (expiresAt === null) return null;
  const remaining = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(remaining) || remaining < DAY_MS) return 0;
  return Math.ceil(remaining / DAY_MS);
}

/** `maxUses - currentUses`, jamais négatif ; `null` : illimité. */
export function remainingPlacesOf(limits: InvitationLimits): number | null {
  return limits.maxUses === null ? null : Math.max(0, limits.maxUses - limits.currentUses);
}

export type JoinChoices = {
  readonly account: boolean;
  readonly guest: boolean;
  readonly signIn: boolean;
  readonly signUp: boolean;
  readonly accountRequired: boolean;
};

/**
 * LA MATRICE DES CHOIX — session × compte requis.
 *
 * **Un compte connecté ne se voit pas offrir « Rejoindre en anonyme ».** Le web
 * ne tient qu'UNE identité à la fois (`session.ts § establishGuest` remplace la
 * session) : entrer en invité fermerait le compte sans le dire. La porte
 * anonyme reste celle du visiteur sans session.
 */
export function joinChoicesOf({ signedIn, guestAllowed }: { readonly signedIn: boolean; readonly guestAllowed: boolean }): JoinChoices {
  if (signedIn) return { account: true, guest: false, signIn: false, signUp: false, accountRequired: false };
  return { account: false, guest: guestAllowed, signIn: true, signUp: true, accountRequired: !guestAllowed };
}

export type LanguageShare = { readonly code: string; readonly weight: number; readonly percent: number | null };

/**
 * Les parts de la barre des langues. Des COMPTES donnent des pourcentages
 * entiers qui font 100 (plus forts restes) ; sans comptes, chaque langue a une
 * part égale pour être DESSINÉE, et aucun pourcentage n'est lisible — une part
 * égale inventée serait un chiffre faux.
 */
export function languageSharesOf(languages: readonly SpokenLanguage[]): readonly LanguageShare[] {
  const counted = languages.every((language) => language.count !== null);
  if (!counted || languages.length === 0) return languages.map(({ code }) => ({ code, weight: 1, percent: null }));
  const total = languages.reduce((sum, language) => sum + (language.count ?? 0), 0);
  if (total === 0) return languages.map(({ code }) => ({ code, weight: 1, percent: null }));
  const raw = languages.map((language) => ((language.count ?? 0) * 100) / total);
  const floors = raw.map(Math.floor);
  const missing = 100 - floors.reduce((sum, value) => sum + value, 0);
  const bonus = raw
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index)
    .slice(0, missing)
    .map((entry) => entry.index);
  return languages.map((language, index) => ({
    code: language.code,
    weight: language.count ?? 0,
    percent: (floors[index] ?? 0) + (bonus.includes(index) ? 1 : 0),
  }));
}

/** L'adresse telle qu'on la LIT (`meeshy.me/chat/mshy_…`) — le protocole est
 * du bruit à l'œil ; le presse-papiers, lui, reçoit l'adresse entière. */
export const displayUrlOf = (url: string): string => url.replace(/^[a-z]+:\/\//iu, '');

const REGIONAL_A = 0x1f1e6;

/** Le drapeau d'un code pays ISO 3166-1 alpha-2 ; `null` pour tout le reste. */
export function flagOf(iso2: string): string | null {
  const code = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(code)) return null;
  return String.fromCodePoint(...[...code].map((letter) => REGIONAL_A + letter.charCodeAt(0) - 65));
}
