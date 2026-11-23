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
import { getBlockedUserIdsAmong, isBlockedBetween } from '../../utils/blocking';
import { niveauEffectif, niveauEffectifUniforme, niveauxParmi } from '../friendship';
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

/**
 * Les quatre lectures partent ENSEMBLE et SANS CONDITION, le niveau compris (`niveauEffectifUniforme`) :
 * le nombre de lectures ne dit rien du lien, et une paire bloquée ne se distingue pas d'un lien absent
 * par le temps de réponse (ré-audit #20361, constats 1 et 5).
 */
export async function bloodLockStateBetween(prisma: BloodLockDb, ownerId: string, otherId: string): Promise<BloodLockState> {
  if (!ownerId || !otherId || ownerId === otherId) return { level: 'PUBLIC', bloodBundleAccepted: false, blocked: false, locked: false, minorProtected: false };
  const [row, level, blocked, people] = await Promise.all([
    prisma.relationFeatureSetting.findUnique({
      where: { ownerId_otherId: { ownerId, otherId } },
      select: { bloodBundleAcceptedAt: true, bloodBundleVersion: true },
    }),
    niveauEffectifUniforme(prisma, ownerId, otherId),
    isBlockedBetween(prisma, ownerId, otherId),
    prisma.user.findMany({ where: { id: { in: [ownerId, otherId] } }, select: { id: true, birthDate: true } }),
  ]);
  const birthOf = (id: string): Date | null => people.find((person) => person.id === id)?.birthDate ?? null;
  const bloodBundleAccepted = bloodBundleAcceptedOf(row);
  return { level, bloodBundleAccepted, blocked, locked: bloodBundleAccepted && level === 'BLOOD' && !blocked, minorProtected: minorProtectedBetween({ emitterBirthDate: birthOf(ownerId), otherBirthDate: birthOf(otherId), now: new Date() }) };
}

export const bloodLockedBetween = async (prisma: BloodLockDb, ownerId: string, otherId: string): Promise<boolean> =>
  (await bloodLockStateBetween(prisma, ownerId, otherId)).locked;

export type BloodLocksAmong = {
  /** Les autres pour qui le verrou tient maintenant : accord à la version courante, Sang réel, aucun blocage. */
  readonly locked: ReadonlySet<string>;
  /** Les autres face auxquels la protection du mineur s'applique (`minorProtectedBetween`). */
  readonly minorProtected: ReadonlySet<string>;
};

/**
 * {@link bloodLockStateBetween} pour un ÉVENTAIL, en quatre lectures groupées quel que soit le nombre
 * de personnes (un voile de position se juge à chaque point, jamais quatre requêtes par paire).
 * `subjectIs: 'owner'` : le sujet est l'émetteur et `otherIds` ses lecteurs ; `'reader'` : l'inverse.
 */
export async function bloodLocksAmong(
  prisma: BloodLockDb,
  params: {
    readonly subjectId: string;
    readonly otherIds: readonly string[];
    readonly subjectIs: 'owner' | 'reader';
    /**
     * `otherIds` sont EXACTEMENT ceux dont l'appelant vient de lire l'accord à la version courante
     * (`bloodBundleAcceptedOf`) : la ligne n'est pas relue (correctif F du ré-audit #20361).
     */
    readonly acceptanceReadByCaller?: boolean;
  },
): Promise<BloodLocksAmong> {
  const others = [...new Set(params.otherIds)].filter((id) => id && id !== params.subjectId);
  if (!params.subjectId || others.length === 0) return { locked: new Set(), minorProtected: new Set() };
  const asOwner = params.subjectIs === 'owner';
  const acceptedAmong: Promise<ReadonlySet<string>> = params.acceptanceReadByCaller === true
    ? Promise.resolve(new Set(others))
    : prisma.relationFeatureSetting.findMany({
      where: asOwner ? { ownerId: params.subjectId, otherId: { in: others } } : { ownerId: { in: others }, otherId: params.subjectId },
      select: { ownerId: true, otherId: true, bloodBundleAcceptedAt: true, bloodBundleVersion: true },
    }).then((rows) => new Set(rows.filter(bloodBundleAcceptedOf).map((row) => (asOwner ? row.otherId : row.ownerId))));
  const [accepted, levels, blocked, people] = await Promise.all([
    acceptedAmong,
    niveauxParmi(prisma, params.subjectId, others),
    getBlockedUserIdsAmong(prisma, params.subjectId, others),
    prisma.user.findMany({ where: { id: { in: [params.subjectId, ...others] } }, select: { id: true, birthDate: true } }),
  ]);
  const birthOf = (id: string): Date | null => people.find((person) => person.id === id)?.birthDate ?? null;
  const now = new Date();
  const minorProtected = new Set(others.filter((other) => {
    const [ownerId, readerId] = asOwner ? [params.subjectId, other] : [other, params.subjectId];
    return minorProtectedBetween({ emitterBirthDate: birthOf(ownerId), otherBirthDate: birthOf(readerId), now });
  }));
  const locked = new Set(others.filter((other) => accepted.has(other) && levels.get(other) === 'BLOOD' && !blocked.has(other)));
  return { locked, minorProtected };
}
