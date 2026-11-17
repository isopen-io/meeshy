/**
 * L'APERÇU D'UNE FICHE POUR LES ROBOTS (#18865, chantier #18857) — `/u/<pseudo>` et
 * `/@<pseudo>` se déplient en carte de profil : « Amani Diallo (@amani) sur Meeshy »,
 * sa bannière pour image, sinon son avatar, sinon l'image de marque, sa bio pour texte.
 *
 * Le robot est un lecteur ANONYME, lisible par n'importe qui : la carte ne porte JAMAIS plus
 * que le niveau PUBLIC. Ce que la fiche réserve à un cercle (présence, pays, fuseau, adresses
 * d'un cercle, ville d'un cercle) ne part pas : le `select` ne le charge même pas, hormis la
 * ville, dont `servedCity` — la loi du dépôt, au niveau PUBLIC — décide.
 *
 * Même page et mêmes lois que l'aperçu d'un lien de conversation (`page.ts`) : ce module ne
 * compose que ce qui change. Un pseudo inconnu, un compte désactivé, supprimé ou inactif, une
 * personne qui se cache de la recherche (ou dont la préférence est illisible : fail-closed) rendent
 * l'aperçu générique, le MÊME pour tous : il ne dit pas si la fiche existe.
 *
 * Langue : celle du lecteur (`Accept-Language`), puis le français. La bio, elle, est servie dans
 * sa langue d'origine : aucune traduction de bio n'est stockée (Prisme, règle 1 — l'absence de
 * traduction sert l'original), et ce module n'en fabrique pas.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { usernamePatternSource } from '@meeshy/shared/types';
import { servedCity } from '@meeshy/shared/utils/profile-city';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';
import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';
import { UNFURL_COPY } from './catalog';
import { cleanUserText, composeLinkUnfurl, LINK_UNFURL_OPEN_QUERY, unfurlLanguage, type LinkUnfurl } from './page';

const USERNAME = new RegExp(usernamePatternSource);
const USERNAME_MAX = 64;
const NAME_MAX = 40;
const BIO_MAX = 160;
const CITY_MAX = 40;
const SEPARATOR = ' · ';

/** Un pseudo plausible. Tout le reste est inconnu, sans lecture. */
export function isPersonHandle(handle: string): boolean {
  return handle.length > 0 && handle.length <= USERNAME_MAX && USERNAME.test(handle);
}

export type PersonUnfurlSource = {
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly bio: string | null;
  readonly city: string | null;
  readonly cityCircle: string | null;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly deactivatedAt: Date | null;
  readonly hidesFromSearch: boolean;
};

/** Ce qu'une porte PUBLIQUE lit d'une fiche — rien d'autre ne quitte la base. */
const personUnfurlSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  banner: true,
  bio: true,
  city: true,
  cityCircle: true,
  isActive: true,
  deletedAt: true,
  deactivatedAt: true
} as const;

/** Se cacher de la recherche : illisible ⇒ « caché » (fail-closed). */
async function hidesFromSearch(prisma: PrismaClient, userId: string): Promise<boolean> {
  try {
    return (await loadPrivacyPreferencesCached(prisma, [userId])).get(userId)?.hideProfileFromSearch === true;
  } catch {
    return true;
  }
}

export async function loadPersonUnfurlSource(prisma: PrismaClient, handle: string): Promise<PersonUnfurlSource | null> {
  const row = await prisma.user.findFirst({
    where: { username: { equals: handle, mode: 'insensitive' } },
    select: personUnfurlSelect
  });
  if (row === null) return null;
  return {
    username: row.username,
    displayName: row.displayName ?? null,
    avatar: row.avatar ?? null,
    banner: row.banner ?? null,
    bio: row.bio ?? null,
    city: row.city ?? null,
    cityCircle: row.cityCircle ?? null,
    isActive: row.isActive !== false,
    deletedAt: row.deletedAt ?? null,
    deactivatedAt: row.deactivatedAt ?? null,
    hidesFromSearch: await hidesFromSearch(prisma, String(row.id))
  };
}

const isNameable = (source: PersonUnfurlSource): boolean =>
  source.isActive && source.deletedAt === null && source.deactivatedAt === null && !source.hidesFromSearch;

/** Une image qu'un robot peut aller chercher : absolue et en `https`. */
function publicImage(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  const url = publicMediaUrlFromEnv(trimmed);
  return /^https:\/\//i.test(url) ? url : null;
}

/** La ville que lit un lecteur ANONYME — PUBLIC, la loi `servedCity`, nettoyée. */
const publicCity = (source: PersonUnfurlSource): string | null =>
  cleanUserText(servedCity(source, { isSelf: false, viewerLevel: 'PUBLIC' }), CITY_MAX);

export function composePersonUnfurl(params: {
  readonly source: PersonUnfurlSource | null;
  readonly handle: string;
  readonly acceptLanguage: string | undefined;
  readonly origin: string;
  readonly now: Date;
}): LinkUnfurl {
  const { source, handle, acceptLanguage, origin, now } = params;
  const generic = composeLinkUnfurl({ source: null, identifier: '', acceptLanguage, origin, now });
  if (source === null || !isPersonHandle(handle) || !isNameable(source)) return generic;

  const username = cleanUserText(source.username, NAME_MAX);
  const name = cleanUserText(source.displayName, NAME_MAX) ?? username;
  if (username === null || name === null) return generic;
  const person = name === username ? `@${username}` : `${name} (@${username})`;

  const lang = unfurlLanguage(null, acceptLanguage);
  const copy = UNFURL_COPY[lang];
  const bio = cleanUserText(source.bio, BIO_MAX);
  const city = publicCity(source);
  const about = [bio, city].filter((part): part is string => part !== null).join(SEPARATOR);
  const url = `${origin}/u/${encodeURIComponent(source.username)}`;
  const named: LinkUnfurl = {
    ...generic,
    lang,
    dir: copy.dir,
    locale: copy.locale,
    title: copy.personOnMeeshy(person),
    description: about.length > 0 ? about : copy.genericPromise,
    url,
    openUrl: `${url}?${LINK_UNFURL_OPEN_QUERY}`,
    linkLabel: copy.openProfile
  };

  const banner = publicImage(source.banner);
  const avatar = banner === null ? publicImage(source.avatar) : null;
  const image = banner ?? avatar;
  if (image === null) return named;
  return { ...named, imageUrl: image, imageAlt: name, imageMeta: null, card: banner === null ? 'summary' : 'summary_large_image' };
}
