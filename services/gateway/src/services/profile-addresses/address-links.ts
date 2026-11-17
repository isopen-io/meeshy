/**
 * Les liens de suivi des adresses de fiche (#18863) : ce qu'un jeton désigne ENCORE.
 *
 * Une adresse possède SON lien : il est marqué de son identifiant (`TrackingLink.addressId`),
 * aucun post, message ni « Mes liens » ne le réutilise, et il ne se résout qu'à l'audience de
 * l'adresse (`address-link-gate.ts`). Un jeton ne compte donc que s'il désigne un lien de CE
 * propriétaire marqué pour CETTE adresse ; il ne se SERT que si ce lien est ouvert ET mène
 * encore à l'URL validée et affichée de l'adresse : sinon l'adresse part directe, jamais vers un
 * `/l/<jeton>` mort, repris, ou redirigé ailleurs que ce que le lecteur lit.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type AddressLink = { readonly totalClicks: number; readonly isOpen: boolean; readonly target: string | null };

export type AddressTokenRef = { readonly id: string; readonly trackingToken: string | null };

/** Un lien d'adresse : `addressId` posé. Un lien ordinaire ne l'écrit jamais (`createTrackingLink` ne le pose qu'à une adresse). */
export const IS_ADDRESS_LINK = { addressId: { isSet: true } } as const;

export async function ownedAddressLinks(
  prisma: Pick<PrismaClient, 'trackingLink'>,
  ownerId: string,
  rows: ReadonlyArray<AddressTokenRef>,
): Promise<ReadonlyMap<string, AddressLink>> {
  const addressOf = new Map(rows.flatMap((row) => (row.trackingToken ? [[row.trackingToken, row.id] as const] : [])));
  if (addressOf.size === 0) return new Map();
  const links = await prisma.trackingLink.findMany({
    where: { token: { in: [...addressOf.keys()] }, createdBy: ownerId, ...IS_ADDRESS_LINK },
    select: { token: true, addressId: true, totalClicks: true, isActive: true, expiresAt: true, originalUrl: true },
  });
  const now = Date.now();
  return new Map(links
    .filter((link) => link.addressId != null && addressOf.get(link.token) === link.addressId)
    .map((link) => [link.token, {
      totalClicks: link.totalClicks,
      isOpen: link.isActive && (link.expiresAt == null || link.expiresAt.getTime() > now),
      target: link.originalUrl ?? null,
    }]));
}

/** Le lien mène-t-il encore à l'URL de l'adresse ? Sinon `/l/<jeton>` ne se sert à personne. */
export const leadsTo = (link: AddressLink | undefined, url: string): link is AddressLink => link?.target === url;

async function eraseLinks(
  prisma: Pick<PrismaClient, 'trackingLink' | 'trackingLinkClick'>,
  where: Record<string, unknown>,
): Promise<void> {
  const links = await prisma.trackingLink.findMany({ where, select: { id: true } });
  const ids = links.map((link) => link.id);
  if (ids.length === 0) return;
  await prisma.trackingLinkClick.deleteMany({ where: { trackingLinkId: { in: ids } } });
  await prisma.trackingLink.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Efface des liens d'adresses de ce propriétaire : le `TrackingLink` (URL, titre) et les clics
 * de ses lecteurs (IP, agent, ville). Seuls les liens MARQUÉS comme liens d'adresse partent :
 * un jeton repris par un autre compte, ou un lien ordinaire de l'auteur, n'est jamais touché.
 * C'est le SEUL sort d'un lien dont l'adresse part, tourne ou cesse de compter.
 */
export async function eraseAddressLinks(
  prisma: Pick<PrismaClient, 'trackingLink' | 'trackingLinkClick'>,
  ownerId: string,
  tokens: ReadonlyArray<string>,
): Promise<void> {
  if (tokens.length === 0) return;
  await eraseLinks(prisma, { token: { in: [...tokens] }, createdBy: ownerId, ...IS_ADDRESS_LINK });
}

/** Une adresse qui part emporte TOUS les liens marqués pour elle, et aucun autre. */
export async function eraseLinksOfAddress(
  prisma: Pick<PrismaClient, 'trackingLink' | 'trackingLinkClick'>,
  ownerId: string,
  addressId: string,
): Promise<void> {
  const links = await prisma.trackingLink.findMany({
    where: { createdBy: ownerId, ...IS_ADDRESS_LINK },
    select: { token: true, addressId: true },
  });
  await eraseAddressLinks(prisma, ownerId, links.filter((link) => link.addressId === addressId).map((link) => link.token));
}

/**
 * Purge d'un compte supprimé (`purgeAccountIsolatedData`) : ses adresses partent, et avec elles
 * TOUS ses liens d'adresse — ceux qu'aucune ligne ne désigne plus compris. Ses autres liens
 * (messages, posts) relèvent de leurs propres chemins.
 */
export async function eraseProfileAddressesOf(
  prisma: Pick<PrismaClient, 'profileAddress' | 'trackingLink' | 'trackingLinkClick'>,
  userId: string,
): Promise<number> {
  await eraseLinks(prisma, { createdBy: userId, ...IS_ADDRESS_LINK });
  const { count } = await prisma.profileAddress.deleteMany({ where: { userId } });
  return count;
}
