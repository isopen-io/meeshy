/**
 * LE VERROU DU SANG, CÔTÉ ÉCRITURE (#20361, directive porteur du 2026-11-22) : entre deux Sangs,
 * une fois que J'AI donné l'accord au palier pour l'autre (à la version courante de la liste),
 * aucune de mes écritures ne COUPE plus un partage ou une réception envers lui — la route répond
 * `409 RELATION_BLOOD_LOCKED`, et restreindre, c'est redescendre à Proche.
 *
 * Le verrou ne vaut que pour un Sang RÉEL : entre collègues de l'équipe sans lien, il n'y a ni
 * accord ni baisse possible, donc ni verrou (analyse de conformité #20364, C2). Tant que je n'ai pas
 * accepté la liste, je garde le retrait partage par partage (C3, décision B #20367). Un blocage
 * ouvre toujours la coupure.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isBlockedBetween } from '../../utils/blocking';
import { niveauEffectif } from '../friendship';
import { bloodBundleAcceptedOf } from './relationConsent';

export type BloodLockDb = Parameters<typeof niveauEffectif>[0] & Parameters<typeof isBlockedBetween>[0] & Pick<PrismaClient, 'relationFeatureSetting'>;

export async function bloodLockedBetween(prisma: BloodLockDb, ownerId: string, otherId: string): Promise<boolean> {
  if (!ownerId || !otherId || ownerId === otherId) return false;
  const [row, level, blocked] = await Promise.all([
    prisma.relationFeatureSetting.findUnique({
      where: { ownerId_otherId: { ownerId, otherId } },
      select: { bloodBundleAcceptedAt: true, bloodBundleVersion: true },
    }),
    niveauEffectif(prisma, ownerId, otherId),
    isBlockedBetween(prisma, ownerId, otherId),
  ]);
  return bloodBundleAcceptedOf(row) && level === 'BLOOD' && !blocked;
}
