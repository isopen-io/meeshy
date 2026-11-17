/**
 * Les adresses de fiche dans l'export RGPD (#18863) : ce que l'utilisateur a déclaré, le cercle
 * choisi pour chacune, et ce que leurs liens de suivi ont compté. Le jeton du lien ne part pas :
 * c'est une clé technique, `countsClicks` en dit l'effet.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ownedAddressLinks } from '../../services/profile-addresses/address-links';

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

export async function withExportedAddresses<T extends { profileAddresses?: ExportedAddressRow[] }>(
  prisma: Pick<PrismaClient, 'trackingLink'>,
  userId: string,
  profile: T,
): Promise<Omit<T, 'profileAddresses'> & { addresses: ExportedAddress[] }> {
  const { profileAddresses = [], ...rest } = profile;
  const links = await ownedAddressLinks(prisma, userId, profileAddresses.flatMap((row) => (row.trackingToken ? [row.trackingToken] : [])));
  const addresses = profileAddresses.map(({ trackingToken, ...row }) => {
    const link = trackingToken ? links.get(trackingToken) : undefined;
    return { ...row, countsClicks: link !== undefined, clicks: link?.totalClicks ?? 0 };
  });
  return { ...rest, addresses };
}
