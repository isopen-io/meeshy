/**
 * L'APERÇU D'UN LIEN D'AFFILIATION POUR LES ROBOTS (#10559) —
 * `/signup/affiliate/<jeton>` se déplie au nom de celui qui invite : « X t'invite
 * sur Meeshy », sa bannière pour image, sinon son avatar, sinon l'image de marque.
 *
 * Le titre nomme l'invitant par son nom affiché, suivi de son pseudo : « Amani
 * Diallo (@amani) t'invite sur Meeshy ». Le pseudo seul n'est le titre que d'un
 * compte sans nom affiché.
 *
 * Même page et mêmes lois que l'aperçu d'un lien de conversation (`page.ts`) :
 * ce module ne compose que ce qui change. Il ne sert de l'invitant QUE son nom
 * (sinon son pseudo), sa bannière et son avatar — ce que `GET
 * /affiliate/validate/:token` sert déjà à quiconque tient le lien, par la même
 * règle (`affiliateInviterOf`). Un jeton fermé, ou un compte désactivé, supprimé
 * ou illisible, rend l'aperçu générique.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { RECIPIENT_LANG_SELECT, type RecipientLanguagePrefs } from '../../utils/recipient-language';
import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';
import { isShareLinkOpen, shareLinkInviterOf } from '../conversationCard';
import { UNFURL_COPY } from './catalog';
import { cleanUserText, composeLinkUnfurl, LINK_UNFURL_OPEN_QUERY, unfurlLanguage, type LinkUnfurl } from './page';

const AFFILIATE_TOKEN = /^[A-Za-z0-9_-]{2,100}$/;
const HOST_MAX = 40;

/** Un jeton plausible (`aff_…`, `ref_…`). Tout le reste est inconnu, sans lecture. */
export function isAffiliateToken(token: string): boolean {
  return AFFILIATE_TOKEN.test(token);
}

export type AffiliateInviterSource = {
  readonly displayName: string | null;
  readonly username: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
};

/** Ce qu'une porte PUBLIQUE lit de l'invitant — rien d'autre ne quitte la base. */
export const AFFILIATE_INVITER_SELECT = {
  displayName: true,
  username: true,
  avatar: true,
  banner: true,
  isActive: true,
  deletedAt: true
} as const;

export type AffiliateInviter = {
  readonly displayName: string;
  readonly username: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
};

const present = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * L'invitant qu'un lien d'affiliation peut NOMMER : un compte actif, non
 * supprimé, par son nom affiché sinon son pseudo. Site unique, que la validation
 * du jeton et l'aperçu des robots partagent.
 */
export function affiliateInviterOf(creator: AffiliateInviterSource | null | undefined): AffiliateInviter | null {
  if (!creator || creator.deletedAt) return null;
  const inviter = shareLinkInviterOf(creator);
  if (inviter === null) return null;
  return {
    displayName: inviter.displayName,
    username: inviter.username,
    avatar: present(creator.avatar),
    banner: present(creator.banner)
  };
}

export type AffiliateUnfurlSource = {
  readonly token: string;
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly creator: (AffiliateInviterSource & RecipientLanguagePrefs) | null;
};

const affiliateUnfurlSelect = {
  token: true,
  isActive: true,
  expiresAt: true,
  maxUses: true,
  currentUses: true,
  creator: { select: { ...AFFILIATE_INVITER_SELECT, ...RECIPIENT_LANG_SELECT } }
} as const;

export async function loadAffiliateUnfurlSource(prisma: PrismaClient, token: string): Promise<AffiliateUnfurlSource | null> {
  return prisma.affiliateToken.findUnique({ where: { token }, select: affiliateUnfurlSelect });
}

/** Une image qu'un robot peut aller chercher : absolue et en `https`. */
function publicImage(value: string | null): string | null {
  if (value === null) return null;
  const url = publicMediaUrlFromEnv(value);
  return /^https:\/\//i.test(url) ? url : null;
}

export function composeAffiliateUnfurl(params: {
  readonly source: AffiliateUnfurlSource | null;
  readonly token: string;
  readonly acceptLanguage: string | undefined;
  readonly origin: string;
  readonly now: Date;
}): LinkUnfurl {
  const { source, token, acceptLanguage, origin, now } = params;
  const generic = composeLinkUnfurl({ source: null, identifier: '', acceptLanguage, origin, now });
  if (source === null || !isAffiliateToken(token) || !isShareLinkOpen(source, now)) return generic;

  const inviter = affiliateInviterOf(source.creator);
  const handle = cleanUserText(inviter?.username, HOST_MAX);
  const name = cleanUserText(inviter?.displayName, HOST_MAX) ?? handle;
  if (inviter === null || name === null) return generic;
  const host = handle === null || handle === name ? name : `${name} (@${handle})`;

  const lang = unfurlLanguage(source.creator, acceptLanguage);
  const copy = UNFURL_COPY[lang];
  const banner = publicImage(inviter.banner);
  const avatar = banner === null ? publicImage(inviter.avatar) : null;
  const url = `${origin}/signup/affiliate/${encodeURIComponent(token)}`;
  const named: LinkUnfurl = {
    ...generic,
    lang,
    dir: copy.dir,
    locale: copy.locale,
    title: copy.hostInvites(host),
    description: copy.genericPromise,
    url,
    openUrl: `${url}?${LINK_UNFURL_OPEN_QUERY}`,
    linkLabel: copy.openInvitation,
    imageAlt: copy.imageAlt
  };
  const image = banner ?? avatar;
  if (image === null) return named;
  return { ...named, imageUrl: image, imageAlt: name, imageMeta: null, card: banner === null ? 'summary' : 'summary_large_image' };
}
