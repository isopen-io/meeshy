/**
 * La VIE d'une demande d'entrée en communauté (#19872), en un seul endroit.
 *
 * Une demande `pending` s'arrête de trois façons, jamais par l'oubli :
 *  - un intendant la tranche (`accepted` / `rejected`, `routes/communities/entries.ts`) ;
 *  - la personne entre par une AUTRE porte — invitation, ajout d'un
 *    administrateur, entrée implicite par un salon, adhésion directe — et
 *    `closePendingJoinRequests` la passe en `accepted` au nom de celui qui l'a
 *    fait entrer. Sans quoi, une fois repartie, elle relisait « Demande
 *    envoyée », et accepter la vieille demande la faisait revenir ;
 *  - personne ne la tranche pendant `JOIN_REQUEST_TTL_MS` : elle n'est plus
 *    VIVANTE. Elle n'est plus servie ni au demandeur ni aux intendants, ne se
 *    tranche plus, et une nouvelle demande peut partir (la vieille est alors
 *    écrite `expired`). C'est la réponse au cas « sans juge » : une demande
 *    qu'aucun intendant ne voit (blocage, compte un temps inutilisable)
 *    n'attend pas indéfiniment, et le demandeur n'apprend pas POURQUOI.
 *
 * Toute lecture ou bascule d'une demande en attente passe par
 * `liveJoinRequestWhere` : une demande périmée qui resterait écrite `pending`
 * est invisible partout, sans balayage planifié.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'CommunityJoinRequestLifecycle' });

/** Trente jours sans réponse : la demande n'attend plus. */
export const JOIN_REQUEST_TTL_MS = 30 * 24 * 3_600_000;

/** Sept jours après un refus avant qu'une nouvelle demande ne parte. */
export const JOIN_REQUEST_COOLDOWN_MS = 7 * 24 * 3_600_000;

const ttlCutoff = (now: Date): Date => new Date(now.getTime() - JOIN_REQUEST_TTL_MS);

/** Le filtre d'une demande en attente ENCORE VIVANTE. */
export function liveJoinRequestWhere(now: Date) {
  return { status: 'pending' as const, createdAt: { gte: ttlCutoff(now) } };
}

/**
 * Écrit `expired` sur les demandes en attente PÉRIMÉES de cette personne, avant
 * qu'elle n'en pose une nouvelle : la déduplication par « la plus ancienne en
 * attente » garderait sinon la vieille.
 */
export async function expireStaleJoinRequests(
  prisma: Pick<PrismaClient, 'communityJoinRequest'>,
  input: { readonly communityId: string; readonly userId: string; readonly now: Date },
): Promise<void> {
  await prisma.communityJoinRequest.updateMany({
    where: { communityId: input.communityId, userId: input.userId, status: 'pending', createdAt: { lt: ttlCutoff(input.now) } },
    data: { status: 'expired', decidedAt: input.now },
  });
}

/**
 * Clôt les demandes en attente des personnes qui viennent d'ENTRER dans la
 * communauté. Appelé APRÈS l'écriture de l'appartenance : l'entrée a eu lieu,
 * une clôture en panne ne la défait pas (rend 0, ne lève jamais) — et une
 * demande restée ouverte n'est servie qu'à un NON-membre.
 */
export async function closePendingJoinRequests(
  prisma: Pick<PrismaClient, 'communityJoinRequest'>,
  input: {
    readonly communityId: string;
    readonly userIds: readonly string[];
    readonly decidedBy: string | null;
    readonly now?: Date;
  },
): Promise<number> {
  if (input.userIds.length === 0) return 0;
  try {
    const { count } = await prisma.communityJoinRequest.updateMany({
      where: { communityId: input.communityId, userId: { in: [...input.userIds] }, status: 'pending' },
      data: { status: 'accepted', decidedAt: input.now ?? new Date(), decidedBy: input.decidedBy },
    });
    return count;
  } catch (error) {
    logger.warn('Join request closure on entry failed', { communityId: input.communityId, error: String(error) });
    return 0;
  }
}

/**
 * Le délai pendant lequel une acceptation peut être EN COURS (bascule écrite,
 * appartenance pas encore) : la réparation ne la touche pas avant.
 */
export const ORPHAN_ACCEPTANCE_GRACE_MS = 10 * 60_000;

const ORPHAN_SCAN_LIMIT = 50;

type MembershipTrace = { readonly userId: string; readonly isActive: boolean; readonly leftAt: Date | null };

/**
 * PREUVE que personne n'est entré depuis la décision : aucune ligne pour la
 * paire, ou seulement des lignes inactives dont le départ PRÉCÈDE la décision.
 * Une ligne active, un départ postérieur (entrée puis départ) ou un départ
 * sans date ne prouvent rien : la demande reste close.
 */
const nobodyEnteredSince = (decidedAt: Date, rows: readonly MembershipTrace[]): boolean =>
  rows.every((row) => !row.isActive && row.leftAt !== null && row.leftAt < decidedAt);

/** Une demande rouverte par la réparation, telle qu'elle s'annonce aux intendants. */
export type ReopenedJoinRequest = {
  readonly communityId: string;
  readonly requestId: string;
  readonly userId: string;
};

function announceReopened(
  onReopened: ((reopened: ReopenedJoinRequest) => void) | undefined,
  reopened: ReopenedJoinRequest,
): void {
  try {
    onReopened?.(reopened);
  } catch (error) {
    logger.warn('Reopened join request announcement failed', { communityId: reopened.communityId, error: String(error) });
  }
}

/**
 * Rouvre les demandes ACCEPTÉES dont l'entrée n'a pas eu lieu (#19924) : une
 * acceptation dont l'écriture de l'appartenance ET la relecture ont échoué
 * reste `accepted` sans membre (une ignorance ne rouvre rien, #19914). Appelée
 * au prochain accès des intendants (liste des demandes) et du demandeur
 * (détail), elle ne rouvre que sur preuve (`nobodyEnteredSince`), hors du
 * délai de grâce, une demande encore vivante par son âge, et jamais quand une
 * demande plus récente de la personne a pris la suite (en attente, refusée…) :
 * rouvrir la vieille annulerait un refus. Rend le nombre rouvert, ne
 * lève jamais.
 *
 * Une demande rouverte qui reste en attente s'ANNONCE par `onReopened`
 * (#20002) — les intendants la reçoivent comme une nouvelle demande, compteur
 * compris ; la décision effacée (`decidedBy`) est journalisée, jamais servie.
 */
export async function reopenOrphanedAcceptances(
  prisma: Pick<PrismaClient, 'communityJoinRequest' | 'communityMember'>,
  input: {
    readonly communityId: string;
    readonly userId?: string;
    readonly now?: Date;
    readonly onReopened?: (reopened: ReopenedJoinRequest) => void;
  },
): Promise<number> {
  const now = input.now ?? new Date();
  const { communityId } = input;
  try {
    const acceptances = await prisma.communityJoinRequest.findMany({
      where: {
        communityId,
        ...(input.userId ? { userId: input.userId } : {}),
        status: 'accepted',
        decidedAt: { lte: new Date(now.getTime() - ORPHAN_ACCEPTANCE_GRACE_MS) },
        createdAt: { gte: ttlCutoff(now) },
      },
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
      take: ORPHAN_SCAN_LIMIT,
      select: { id: true, userId: true, decidedAt: true, decidedBy: true, createdAt: true },
    });
    if (acceptances.length === 0) return 0;

    const userIds = [...new Set(acceptances.map((a) => a.userId))];
    const [rows, requests] = await Promise.all([
      prisma.communityMember.findMany({
        where: { communityId, userId: { in: userIds } },
        select: { userId: true, isActive: true, leftAt: true },
      }),
      prisma.communityJoinRequest.findMany({
        where: { communityId, userId: { in: userIds } },
        select: { id: true, userId: true, status: true, createdAt: true },
      }),
    ]);
    // Une demande plus RÉCENTE de la personne (quel qu'en soit le sort : refusée,
    // en attente, expirée) a pris la suite : rouvrir la vieille annulerait ce sort.
    const supersededBy = (a: { id: string; userId: string; createdAt: Date }) =>
      requests.some(
        (other) =>
          other.id !== a.id &&
          other.userId === a.userId &&
          (other.createdAt > a.createdAt || other.status === 'pending'),
      );
    const orphans = acceptances.filter(
      (a): a is typeof a & { decidedAt: Date } =>
        a.decidedAt instanceof Date &&
        !supersededBy(a) &&
        nobodyEnteredSince(a.decidedAt, rows.filter((row) => row.userId === a.userId)),
    );
    // Une seule par personne : la plus récente décision rouvre, les autres restent closes.
    const perPerson = orphans.filter((a, index) => orphans.findIndex((o) => o.userId === a.userId) === index);

    const counts = await Promise.all(
      perPerson.map((a) =>
        prisma.communityJoinRequest.updateMany({
          where: { id: a.id, communityId, status: 'accepted', decidedAt: a.decidedAt },
          data: { status: 'pending', decidedAt: null, decidedBy: null },
        }),
      ),
    );
    const written = perPerson.filter((_, index) => counts[index].count > 0);
    const reopened = written.length;
    if (reopened === 0) return 0;
    logger.warn('Orphaned join request acceptances reopened', {
      communityId,
      reopened,
      erased: written.map((a) => ({ requestId: a.id, decidedBy: a.decidedBy ?? null })),
    });
    // Entrée par une autre porte PENDANT la réparation : la demande rouverte se reclôt.
    const enteredMeanwhile = await prisma.communityMember.findMany({
      where: { communityId, userId: { in: perPerson.map((a) => a.userId) }, isActive: true },
      select: { userId: true },
    });
    const entered = new Set(enteredMeanwhile.map((m) => m.userId));
    await closePendingJoinRequests(prisma, { communityId, userIds: [...entered], decidedBy: null, now });
    written
      .filter((a) => !entered.has(a.userId))
      .forEach((a) => announceReopened(input.onReopened, { communityId, requestId: a.id, userId: a.userId }));
    return reopened;
  } catch (error) {
    logger.warn('Orphaned acceptance repair failed', { communityId, error: String(error) });
    return 0;
  }
}
