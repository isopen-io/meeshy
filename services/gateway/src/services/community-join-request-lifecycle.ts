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
