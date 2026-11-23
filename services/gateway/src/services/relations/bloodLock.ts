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
import { minorProtectedBetween } from '@meeshy/shared/utils/age';

export type BloodLockDb = Parameters<typeof niveauEffectif>[0] & Parameters<typeof isBlockedBetween>[0] & Pick<PrismaClient, 'relationFeatureSetting' | 'user'>;

export type BloodLockState = {
  /** Le niveau effectif RÉEL de la paire (jamais celui d'un accord d'équipe). */
  readonly level: Awaited<ReturnType<typeof niveauEffectif>>;
  /** J'ai accepté la liste du Sang, à sa version courante, pour cette personne. */
  readonly bloodBundleAccepted: boolean;
  /** Un blocage existe entre les deux, dans un sens ou l'autre. */
  readonly blocked: boolean;
  /** Le verrou tient : accord + Sang réel + aucun blocage. */
  readonly locked: boolean;
  /**
   * Je suis mineur déclaré ET l'écart d'âge avec cette personne dépasse 5 ans (ou son âge est
   * inconnu) : ma position (continue, historique, proximité) et mon titre d'écoute restent HORS du
   * verrou — je les retire par personne sans quitter le Sang (conformité C7, directive 2026-11-23).
   * Entre pairs (deux mineurs, 5 ans d'écart au plus), la loi du Sang s'applique entière.
   */
  readonly minorProtected: boolean;
};

export async function bloodLockStateBetween(prisma: BloodLockDb, ownerId: string, otherId: string): Promise<BloodLockState> {
  if (!ownerId || !otherId || ownerId === otherId) return { level: 'PUBLIC', bloodBundleAccepted: false, blocked: false, locked: false, minorProtected: false };
  const [row, level, blocked, people] = await Promise.all([
    prisma.relationFeatureSetting.findUnique({
      where: { ownerId_otherId: { ownerId, otherId } },
      select: { bloodBundleAcceptedAt: true, bloodBundleVersion: true },
    }),
    niveauEffectif(prisma, ownerId, otherId),
    isBlockedBetween(prisma, ownerId, otherId),
    prisma.user.findMany({ where: { id: { in: [ownerId, otherId] } }, select: { id: true, birthDate: true } }),
  ]);
  const birthOf = (id: string): Date | null => people.find((person) => person.id === id)?.birthDate ?? null;
  const bloodBundleAccepted = bloodBundleAcceptedOf(row);
  return { level, bloodBundleAccepted, blocked, locked: bloodBundleAccepted && level === 'BLOOD' && !blocked, minorProtected: minorProtectedBetween({ emitterBirthDate: birthOf(ownerId), otherBirthDate: birthOf(otherId), now: new Date() }) };
}

export const bloodLockedBetween = async (prisma: BloodLockDb, ownerId: string, otherId: string): Promise<boolean> =>
  (await bloodLockStateBetween(prisma, ownerId, otherId)).locked;
