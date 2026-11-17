/**
 * Les liens de suivi des adresses de fiche (#18863) : ce qu'un jeton désigne ENCORE.
 *
 * Une adresse garde le jeton de son lien, mais le lien vit aussi dans « Mes liens », où son
 * propriétaire peut le supprimer, le désactiver, le RENOMMER ou en changer la DESTINATION — et
 * un jeton libéré peut être repris par un autre compte. Un jeton ne compte donc que s'il désigne
 * un lien de CE propriétaire ; il ne se SERT que si ce lien est ouvert ET mène encore à l'URL
 * validée et affichée de l'adresse : sinon l'adresse part directe, jamais vers un `/l/<jeton>`
 * mort, repris, ou redirigé ailleurs que ce que le lecteur lit.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type AddressLink = { readonly totalClicks: number; readonly isOpen: boolean; readonly target: string | null };

export async function ownedAddressLinks(
  prisma: Pick<PrismaClient, 'trackingLink'>,
  ownerId: string,
  tokens: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, AddressLink>> {
  if (tokens.length === 0) return new Map();
  const links = await prisma.trackingLink.findMany({
    where: { token: { in: [...tokens] }, createdBy: ownerId },
    select: { token: true, totalClicks: true, isActive: true, expiresAt: true, originalUrl: true },
  });
  const now = Date.now();
  return new Map(links.map((link) => [link.token, {
    totalClicks: link.totalClicks,
    isOpen: link.isActive && (link.expiresAt == null || link.expiresAt.getTime() > now),
    target: link.originalUrl ?? null,
  }]));
}

/** Le lien mène-t-il encore à l'URL de l'adresse ? Sinon `/l/<jeton>` ne se sert à personne. */
export const leadsTo = (link: AddressLink | undefined, url: string): link is AddressLink => link?.target === url;

/**
 * Purge d'un compte supprimé (`purgeAccountIsolatedData`) : ses adresses partent, et avec elles
 * TOUTE copie de leur URL — le `TrackingLink` (URL, titre, propriétaire) et les clics de ses
 * lecteurs (IP, agent, ville). Seuls les liens de SES adresses sont visés : ses autres liens
 * (messages, posts) relèvent de leurs propres chemins.
 */
export async function eraseProfileAddressesOf(
  prisma: Pick<PrismaClient, 'profileAddress' | 'trackingLink' | 'trackingLinkClick'>,
  userId: string,
): Promise<number> {
  const rows = await prisma.profileAddress.findMany({ where: { userId }, select: { trackingToken: true } });
  const tokens = rows.flatMap((row) => (row.trackingToken ? [row.trackingToken] : []));
  if (tokens.length > 0) {
    const links = await prisma.trackingLink.findMany({
      where: { token: { in: tokens }, createdBy: userId },
      select: { id: true },
      take: tokens.length,
    });
    const ids = links.map((link) => link.id);
    if (ids.length > 0) {
      await prisma.trackingLinkClick.deleteMany({ where: { trackingLinkId: { in: ids } } });
      await prisma.trackingLink.deleteMany({ where: { id: { in: ids } } });
    }
  }
  const { count } = await prisma.profileAddress.deleteMany({ where: { userId } });
  return count;
}
