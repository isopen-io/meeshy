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
import { isDeclaredMinor } from '@meeshy/shared/utils/age';

export type BloodLockDb = Parameters<typeof niveauEffectif>[0] & Parameters<typeof isBlockedBetween>[0] & Pick<PrismaClient, 'relationFeatureSetting' | 'user'>;

export type BloodLockState = {
  /** Le niveau effectif RÉEL de la paire (jamais celui d'un accord d'équipe). */
  readonly level: Awaited<ReturnType<typeof niveauEffectif>>;
  /** J'ai accepté la liste du Sang, à sa version courante, pour cette personne. */
  readonly bloodBundleAccepted: boolean;
  /** Le verrou tient : accord + Sang réel + aucun blocage. */
  readonly locked: boolean;
  /**
   * Je suis mineur déclaré : ma position (continue, historique, proximité) et mon titre d'écoute
   * restent HORS du verrou — je les retire par personne sans quitter le Sang (conformité C7).
   */
  readonly ownerMinor: boolean;
};

export async function bloodLockStateBetween(prisma: BloodLockDb, ownerId: string, otherId: string): Promise<BloodLockState> {
  if (!ownerId || !otherId || ownerId === otherId) return { level: 'PUBLIC', bloodBundleAccepted: false, locked: false, ownerMinor: false };
  const [row, level, blocked, owner] = await Promise.all([
    prisma.relationFeatureSetting.findUnique({
      where: { ownerId_otherId: { ownerId, otherId } },
      select: { bloodBundleAcceptedAt: true, bloodBundleVersion: true },
    }),
    niveauEffectif(prisma, ownerId, otherId),
    isBlockedBetween(prisma, ownerId, otherId),
    prisma.user.findUnique({ where: { id: ownerId }, select: { birthDate: true } }),
  ]);
  const bloodBundleAccepted = bloodBundleAcceptedOf(row);
  return { level, bloodBundleAccepted, locked: bloodBundleAccepted && level === 'BLOOD' && !blocked, ownerMinor: isDeclaredMinor(owner?.birthDate ?? null, new Date()) };
}

export const bloodLockedBetween = async (prisma: BloodLockDb, ownerId: string, otherId: string): Promise<boolean> =>
  (await bloodLockStateBetween(prisma, ownerId, otherId)).locked;
