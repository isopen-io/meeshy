/**
 * L'APERÇU D'UN LIEN SUIVI `/l/<jeton>` POUR LES ROBOTS (#10192) — ce que la
 * page fait de la cible, et rien d'autre.
 *
 * Décision : `apps/web/decisions.md` § D-198.
 *
 * Trois issues, décidées sur la ligne du lien et son seul `originalUrl` :
 *
 * - `redirect` — un lien ACTIF vers une adresse web EXTÉRIEURE : le robot y est
 *   renvoyé et lit l'aperçu que la cible publie elle-même. Meeshy ne la lit pas
 *   (aucune requête sortante) et n'en dit rien de plus que la redirection qu'un
 *   humain obtient en ouvrant le lien. Aucun clic n'est compté : un robot n'est
 *   pas une personne.
 * - `invitation` — la cible est une invitation Meeshy (`/chat/<lien>`,
 *   `/join/<lien>`), ou le jeton est celui d'un lien de partage : l'aperçu de
 *   l'invitation, sous la loi de `/chat/<lien>` (lien ouvert ET public, sinon
 *   générique — `page.ts`).
 * - `generic` — tout le reste : lien mort, inconnu, cible illisible ou qui n'est
 *   pas une adresse web, adresse web porteuse d'identifiants, et toute AUTRE
 *   adresse Meeshy (une conversation, un post, un profil), dont l'aperçu dirait
 *   ce qu'un lien ne doit pas dire.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type TrackingLinkUnfurlSource = {
  readonly originalUrl: string;
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
};

export type TrackingLinkUnfurlDecision =
  | { readonly kind: 'redirect'; readonly location: string }
  | { readonly kind: 'invitation'; readonly identifier: string }
  | { readonly kind: 'generic' };

/** La forme que `GET /l/:token` accepte (`routes/tracking-links/tracking.ts`). */
const TRACKING_TOKEN = /^[a-zA-Z0-9_-]{2,50}$/;

/** Une invitation Meeshy : `/chat/<lien>` ou son ancienne forme `/join/<lien>` (nginx la redirige). */
const INVITATION_PATH = /^\/(?:chat|join)\/([A-Za-z0-9_.-]{1,100})\/?$/;

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

const GENERIC: TrackingLinkUnfurlDecision = { kind: 'generic' };

export function isTrackingToken(token: string): boolean {
  return TRACKING_TOKEN.test(token);
}

export async function loadTrackingLinkUnfurlSource(prisma: PrismaClient, token: string): Promise<TrackingLinkUnfurlSource | null> {
  return prisma.trackingLink.findUnique({
    where: { token },
    select: { originalUrl: true, isActive: true, expiresAt: true }
  });
}

const parseWebUrl = (raw: string): URL | null => {
  try {
    const url = new URL(raw);
    return WEB_PROTOCOLS.has(url.protocol) && url.username === '' && url.password === '' ? url : null;
  } catch {
    return null;
  }
};

/** Une adresse de l'application web elle-même : son hôte, ou son `www.`. */
const isAppAddress = (url: URL, origin: string): boolean => {
  const appHost = new URL(origin).hostname;
  return url.hostname === appHost || url.hostname === `www.${appHost}`;
};

export function decideTrackingLinkUnfurl(params: {
  readonly token: string;
  readonly tracking: TrackingLinkUnfurlSource | null;
  readonly origin: string;
  readonly now: Date;
}): TrackingLinkUnfurlDecision {
  const { token, tracking, origin, now } = params;
  if (!isTrackingToken(token)) return GENERIC;
  if (tracking === null) return { kind: 'invitation', identifier: token };
  if (!tracking.isActive || (tracking.expiresAt !== null && tracking.expiresAt.getTime() <= now.getTime())) return GENERIC;
  const target = parseWebUrl(tracking.originalUrl);
  if (target === null) return GENERIC;
  if (!isAppAddress(target, origin)) return { kind: 'redirect', location: target.href };
  const invitation = INVITATION_PATH.exec(target.pathname)?.[1];
  return invitation === undefined ? GENERIC : { kind: 'invitation', identifier: invitation };
}
