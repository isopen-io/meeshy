/**
 * Les liens de suivi des adresses de fiche (#18863) : ce qu'un jeton désigne ENCORE.
 *
 * Une adresse garde le jeton de son lien, mais le lien vit aussi dans « Mes liens », où son
 * propriétaire peut le supprimer, le désactiver ou le RENOMMER — et un jeton libéré peut être
 * repris par un autre compte. Un jeton ne compte donc que s'il désigne un lien de CE
 * propriétaire ; un lien fermé ou expiré ne se sert pas aux lecteurs (l'adresse part directe).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type AddressLink = { readonly totalClicks: number; readonly isOpen: boolean };

export async function ownedAddressLinks(
  prisma: Pick<PrismaClient, 'trackingLink'>,
  ownerId: string,
  tokens: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, AddressLink>> {
  if (tokens.length === 0) return new Map();
  const links = await prisma.trackingLink.findMany({
    where: { token: { in: [...tokens] }, createdBy: ownerId },
    select: { token: true, totalClicks: true, isActive: true, expiresAt: true },
  });
  const now = Date.now();
  return new Map(links.map((link) => [link.token, {
    totalClicks: link.totalClicks,
    isOpen: link.isActive && (link.expiresAt == null || link.expiresAt.getTime() > now),
  }]));
}

/**
 * Purge d'un compte supprimé (`purgeAccountIsolatedData`) : ses adresses partent, et leurs liens
 * de suivi se ferment — un `/l/<jeton>` déjà partagé ne mène plus vers ses sites.
 */
export async function eraseProfileAddressesOf(
  prisma: Pick<PrismaClient, 'profileAddress' | 'trackingLink'>,
  userId: string,
): Promise<number> {
  const rows = await prisma.profileAddress.findMany({ where: { userId }, select: { trackingToken: true } });
  const tokens = rows.flatMap((row) => (row.trackingToken ? [row.trackingToken] : []));
  if (tokens.length > 0) {
    await prisma.trackingLink.updateMany({ where: { token: { in: tokens }, createdBy: userId }, data: { isActive: false } });
  }
  const { count } = await prisma.profileAddress.deleteMany({ where: { userId } });
  return count;
}
