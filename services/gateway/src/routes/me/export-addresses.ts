/**
 * Les adresses de fiche dans l'export RGPD (#18863) : ce que l'utilisateur a déclaré, le cercle
 * choisi pour chacune, et ce que leurs liens de suivi ont compté — TOUTES ses adresses, sans
 * plafond, et TOUS ses liens d'adresse (`addressLinks`), y compris un lien qu'aucune adresse ne
 * désigne plus. Le jeton du lien ne part pas : c'est une clé technique, `countsClicks` en dit l'effet.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { IS_ADDRESS_LINK } from '../../services/profile-addresses/address-links';

/** Borne de lecture : un lien d'adresse retiré ou tourné est effacé, il n'en reste que quelques-uns par compte. */
const EXPORTED_ADDRESS_LINKS_MAX = 1000;

export const PROFILE_ADDRESS_EXPORT_SELECT = {
  id: true,
  title: true,
  url: true,
  glyph: true,
  circle: true,
  position: true,
  isShown: true,
  trackingToken: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ExportedAddressRow = {
  id: string;
  title: string;
  url: string;
  glyph: string;
  circle: string;
  position: number;
  isShown: boolean;
  trackingToken: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExportedAddress = Omit<ExportedAddressRow, 'trackingToken'> & { countsClicks: boolean; clicks: number };

export type ExportedAddressLink = { title: string | null; url: string; isActive: boolean; clicks: number; createdAt: Date };

export async function withExportedAddresses<T extends { profileAddresses?: ExportedAddressRow[] }>(
  prisma: Pick<PrismaClient, 'trackingLink'>,
  userId: string,
  profile: T,
): Promise<Omit<T, 'profileAddresses'> & { addresses: ExportedAddress[]; addressLinks: ExportedAddressLink[] }> {
  const { profileAddresses = [], ...rest } = profile;
  const links = (await prisma.trackingLink.findMany({
    where: { createdBy: userId, ...IS_ADDRESS_LINK },
    select: { token: true, addressId: true, name: true, originalUrl: true, isActive: true, totalClicks: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: EXPORTED_ADDRESS_LINKS_MAX,
  })).filter((link) => link.addressId != null);
  const linkOf = (row: ExportedAddressRow) =>
    links.find((link) => row.trackingToken !== null && link.token === row.trackingToken && link.addressId === row.id);
  const addresses = profileAddresses.map((row) => {
    const { trackingToken: _token, ...declared } = row;
    const link = linkOf(row);
    return { ...declared, countsClicks: link !== undefined, clicks: link?.totalClicks ?? 0 };
  });
  const addressLinks = links.map((link) => ({
    title: link.name ?? null,
    url: link.originalUrl,
    isActive: link.isActive,
    clicks: link.totalClicks,
    createdAt: link.createdAt,
  }));
  return { ...rest, addresses, addressLinks };
}
