/**
 * Un lien de suivi d'ADRESSE de fiche (#18863) ne se résout qu'à l'audience de l'adresse.
 *
 * `/l/<jeton>` d'une adresse sert la même URL que la fiche, et la fiche ne la sert qu'au cercle
 * choisi : un jeton recopié ne doit pas l'ouvrir plus largement. Le lien est fermé — et ses
 * portes (`/resolve`, `/l`, `/click`) rendent la réponse d'un jeton INCONNU, sans rien compter —
 * quand l'adresse n'existe plus, est masquée, porte un autre jeton (le sien a tourné), mène
 * ailleurs que le lien, quand son propriétaire n'a plus de compte actif, l'a bloqué, ou que le
 * lecteur est hors du cercle. Sans compte, seul un lien d'adresse PUBLIQUE se résout.
 *
 * La loi du cercle est celle de la fiche (`addressOpensTo`, `readProfileCircleView`) : aucune
 * comparaison de niveaux n'est réécrite ici. Une lecture qui échoue lève : l'appelant ferme.
 * Un lien qui n'est pas celui d'une adresse (`addressId` absent) n'est pas concerné.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { addressOpensTo } from '@meeshy/shared/utils/profile-addresses';
import { readProfileCircleView } from '../relations/profileCircleView';
import { hasBlocked } from '../../utils/blocking';

export type GatedLink = {
  readonly token: string;
  readonly createdBy?: string | null;
  readonly addressId?: string | null;
  readonly originalUrl?: string | null;
};

/** Le propriétaire a encore un compte actif — la même loi pour la fiche (`withServedAddresses`) et le lien. */
export async function ownerIsActive(prisma: PrismaClient, ownerId: string): Promise<boolean> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { isActive: true, deletedAt: true, deactivatedAt: true },
  });
  return owner !== null && owner.isActive !== false && owner.deletedAt == null && owner.deactivatedAt == null;
}

async function readerLevel(prisma: PrismaClient, ownerId: string, viewerId: string, circle: string) {
  if (circle === 'PUBLIC') return 'PUBLIC' as const;
  return (await readProfileCircleView(prisma as never, { viewerId, targetId: ownerId })).level;
}

export async function addressLinkOpensTo(prisma: PrismaClient, link: GatedLink, viewerId?: string): Promise<boolean> {
  if (!link.addressId) return true;
  const ownerId = link.createdBy;
  if (!ownerId) return false;
  const address = await prisma.profileAddress.findFirst({
    where: { id: link.addressId, userId: ownerId },
    select: { url: true, circle: true, isShown: true, trackingToken: true },
  });
  if (!address || !address.isShown || address.trackingToken !== link.token || address.url !== link.originalUrl) return false;
  if (!(await ownerIsActive(prisma, ownerId))) return false;
  if (viewerId === ownerId) return true;
  if (!viewerId) return addressOpensTo(address.circle, { isSelf: false, viewerLevel: 'PUBLIC' });
  if (await hasBlocked(prisma, ownerId, viewerId)) return false;
  const viewerLevel = await readerLevel(prisma, ownerId, viewerId, address.circle);
  return addressOpensTo(address.circle, { isSelf: false, viewerLevel });
}
