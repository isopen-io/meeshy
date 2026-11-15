import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EngagementService } from '../engagement/EngagementService';
import { EngagementQuotas } from '../engagement/EngagementQuotas';

/**
 * LES POINTS D'UN APPEL (#8959) — ce qu'un appel rapporte, et à qui.
 *
 * Règle du porteur : démarrer ou rejoindre un appel ne compte que si l'appel a
 * vraiment eu lieu — au moins 30 s de connexion. Le crédit ne peut donc pas
 * partir au départ (`initiateCall`) ni à la jonction (`joinCall`) : il part à
 * la FIN, quand les durées sont connues, depuis le seul point où chaque appel
 * terminé passe une fois — l'écriture de son résumé terminal
 * (`CallService.createCallSummaryMessage`).
 *
 * Le temps connecté d'une participation court de `max(joinedAt, answeredAt)` à
 * `min(leftAt ?? endedAt, endedAt)` : l'initiateur est inscrit dès la sonnerie,
 * et seul le décroché ouvre la conversation (`CallSession.duration` est ancrée
 * sur `answeredAt`). Plusieurs participations d'une même personne (rejoindre
 * après une coupure) se CUMULENT : un appel rapporte une fois par personne.
 *
 * Un appel est éligible quand au moins DEUX participants distincts y ont été
 * connectés 30 s chacun ; chaque compte connecté 30 s reçoit alors
 * `conversation.call_started` (l'initiateur) ou `conversation.call_joined` (les
 * autres), et une `conversation.call_minutes` par tranche PLEINE de cinq
 * minutes (plafonnée par appel dans le barème, `targetId = callId`). Un
 * participant anonyme compte pour l'éligibilité — il a parlé — mais n'a pas de
 * compteur.
 *
 * Unicité : les chemins terminaux d'un appel peuvent écrire son résumé en
 * concurrence. Chaque compte réclame donc d'abord le seau `call:<callId>` de
 * son opération (limite 1) — le premier crédit passe, tout rejeu s'arrête là.
 */

export const CALL_CONNECTED_FLOOR_SECONDS = 30;
export const CALL_MINUTES_SLICE_SECONDS = 300;

export type CallParticipation = {
  readonly participantId: string;
  readonly userId: string | null;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
};

export type CallCredit = {
  readonly userId: string;
  readonly operationKey: 'conversation.call_started' | 'conversation.call_joined';
  readonly minuteSlices: number;
};

const connectedSeconds = (
  participation: CallParticipation,
  answeredAt: Date,
  endedAt: Date | null,
): number => {
  const leftAt = participation.leftAt ?? endedAt;
  if (!leftAt) return 0;
  const end = endedAt && endedAt < leftAt ? endedAt : leftAt;
  const start = participation.joinedAt > answeredAt ? participation.joinedAt : answeredAt;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
};

/** Les crédits d'un appel terminé — pur, sans lecture ni écriture. */
export function callEngagementCredits(params: {
  readonly initiatorId: string;
  readonly answeredAt: Date | null;
  readonly endedAt: Date | null;
  readonly participations: readonly CallParticipation[];
}): CallCredit[] {
  const { initiatorId, answeredAt, endedAt, participations } = params;
  if (!answeredAt) return [];

  const byParticipant = participations.reduce<ReadonlyMap<string, { userId: string | null; seconds: number }>>(
    (totals, participation) => {
      const previous = totals.get(participation.participantId);
      const seconds = (previous?.seconds ?? 0) + connectedSeconds(participation, answeredAt, endedAt);
      return new Map(totals).set(participation.participantId, { userId: participation.userId, seconds });
    },
    new Map(),
  );
  const connected = [...byParticipant.values()].filter(({ seconds }) => seconds >= CALL_CONNECTED_FLOOR_SECONDS);
  if (connected.length < 2) return [];

  return connected.flatMap(({ userId, seconds }) =>
    userId
      ? [
          {
            userId,
            operationKey: userId === initiatorId ? 'conversation.call_started' : 'conversation.call_joined',
            minuteSlices: Math.floor(seconds / CALL_MINUTES_SLICE_SECONDS),
          } as const,
        ]
      : [],
  );
}

export type CallEngagement = Pick<EngagementService, 'recordActivity'>;
export type CallCreditClaim = Pick<EngagementQuotas, 'claim'>;

type CallCreditPrisma = Pick<PrismaClient, 'callSession' | 'callParticipant' | 'participant'>;

export const callCreditBucket = (callId: string): string => `call:${callId}`;

/** Lit l'appel terminé et crédite chacun de ses comptes éligibles, une fois. */
export async function creditCallEngagement(deps: {
  readonly prisma: CallCreditPrisma;
  readonly engagement: CallEngagement;
  readonly claim: CallCreditClaim;
  readonly callId: string;
}): Promise<void> {
  const { prisma, engagement, claim, callId } = deps;
  const call = await prisma.callSession.findUnique({
    where: { id: callId },
    select: { conversationId: true, initiatorId: true, answeredAt: true, endedAt: true },
  });
  if (!call?.answeredAt) return;

  const rows = await prisma.callParticipant.findMany({
    where: { callSessionId: callId },
    select: { participantId: true, joinedAt: true, leftAt: true },
  });
  const members = await prisma.participant.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.participantId))] } },
    select: { id: true, userId: true },
  });
  const userOf = new Map(members.map((member) => [member.id, member.userId ?? null]));

  const credits = callEngagementCredits({
    initiatorId: call.initiatorId,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    participations: rows.map((row) => ({ ...row, userId: userOf.get(row.participantId) ?? null })),
  });

  const options = { conversationId: call.conversationId, targetId: callId };
  for (const credit of credits) {
    if (!(await claim.claim(credit.userId, credit.operationKey, callCreditBucket(callId), 1))) continue;
    await engagement.recordActivity(credit.userId, credit.operationKey, options);
    for (let slice = 0; slice < credit.minuteSlices; slice += 1) {
      await engagement.recordActivity(credit.userId, 'conversation.call_minutes', options);
    }
  }
}

/**
 * Le crédit d'un appel terminé, hors du chemin de l'appelant : le moteur est
 * construit au premier usage et une panne ne remonte jamais à la fin d'appel.
 */
export function callEngagementCrediter(
  prisma: PrismaClient,
  onError: (callId: string, error: unknown) => void,
): (callId: string) => void {
  let engine: { engagement: CallEngagement; claim: CallCreditClaim } | null = null;
  return (callId) => {
    void Promise.resolve()
      .then(() => {
        engine ??= { engagement: new EngagementService(prisma), claim: new EngagementQuotas(prisma) };
        return creditCallEngagement({ prisma, ...engine, callId });
      })
      .catch((error: unknown) => onError(callId, error));
  };
}

/**
 * `conversation.call_participant_added` (#8959) — faire sonner un ami dans
 * l'appel en cours. Crédité à l'INVITEUR, sur une invitation NOUVELLE
 * seulement (ré-inviter la même personne ne rapporte rien).
 */
export function creditCallInvitation(deps: {
  readonly engagement: CallEngagement;
  readonly inviterUserId: string;
  readonly callId: string;
  readonly conversationId: string;
  readonly onError: (error: unknown) => void;
}): void {
  const { engagement, inviterUserId, callId, conversationId, onError } = deps;
  void Promise.resolve()
    .then(() =>
      engagement.recordActivity(inviterUserId, 'conversation.call_participant_added', { conversationId, targetId: callId })
    )
    .catch(onError);
}
