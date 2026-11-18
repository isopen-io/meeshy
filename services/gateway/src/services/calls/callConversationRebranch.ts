import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import type { CallConversationChangedEvent } from '@meeshy/shared/types/call-controls';
import type { ConversationNewEventData } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { logger } from '../../utils/logger';
import { createCallGroup, exactMembers, findExactCallGroups, type CallGroupCandidate } from './callGroupConversation';

/**
 * LA BASCULE D'UN APPEL VERS SON GROUPE (#19650, décision porteur 2026-11-18).
 *
 * À la première invitation d'un appel lancé en tête-à-tête, l'appel rejoint le
 * groupe dont les membres actifs sont EXACTEMENT ses participants présents et
 * l'invité — trouvé, sinon créé. Le média ne coupe pas : toute la signalisation
 * WebRTC est adressée par `callId`, pas par conversation.
 *
 * Sans transaction multi-documents, l'ordre est celui des compare-and-swap :
 *
 * 1. réserver le groupe (`activeCallId`) : un groupe trouvé par compare-and-swap,
 *    un groupe neuf en naissant (aucun signal de liste avant la bascule gagnée) ;
 * 2. déplacer la session par CAS sur `{ id, conversationId: tête-à-tête, vivante }` ;
 *    une invitation concurrente qui a basculé la première fait perdre celle-ci,
 *    qui DÉFAIT ce qu'elle a écrit (réservation rendue, groupe neuf supprimé —
 *    il n'a jamais été annoncé ni écrit) et rend `lost` : l'appelant admet son
 *    invité dans le groupe gagnant ;
 * 3. la réservation du tête-à-tête est GARDÉE : sa ligne dit toujours « Appel en
 *    cours », et `GET /conversations/:id/active-call` y sert l'appel
 *    (`originConversationCall.ts`) ; elle est rendue à la fin avec l'autre
 *    (`ActiveCallClaim.release`) ;
 * 4. les participations d'appel sont repointées vers les membres du groupe ;
 * 5. la bulle « Appel … en cours » naît dans le groupe ; celle du tête-à-tête reste ;
 * 6. rooms rejointes, `conversation:new` si le groupe est neuf, puis
 *    `call:conversation-changed` à la room de l'appel — AVANT que l'appelant
 *    n'émette `call:participant-invited`.
 *
 * Audit #19650 — une fois le compare-and-swap gagné, l'appel VIT dans le groupe :
 * chaque étape suivante est rattrapée une à une, et la bascule est dite quoi
 * qu'il arrive. Une étape qui lève ne laisse plus un appel déplacé dans un
 * groupe silencieux, sans annonce, avec une erreur côté client.
 */

const TERMINAL = [...CALL_TERMINAL_STATUSES];

export type RebranchOutcome =
  | {
      readonly kind: 'rebranched';
      readonly conversationId: string;
      readonly title: string | null;
      readonly created: boolean;
      readonly memberUserIds: readonly string[];
    }
  | { readonly kind: 'lost'; readonly conversationId: string }
  | { readonly kind: 'failed' };

export type CallRebranchDeps = {
  readonly prisma: Pick<PrismaClient, 'callSession' | 'conversation' | 'participant' | 'callParticipant'>;
  readonly io: ServerEmitIO;
  /** `ActiveCallClaim.claim` — la réservation, par compare-and-swap. */
  readonly claim: (conversationId: string, callId: string) => Promise<boolean>;
  /** `ActiveCallClaim.notifyChanged` — la ligne de liste d'une réservation rendue. */
  readonly notify: (conversationId: string, callId: string) => void;
  /** `createLiveCallMessage` puis sa diffusion `message:new` (best-effort). */
  readonly postLiveMessage: (callId: string) => Promise<void>;
  readonly joinRoom: (userId: string, conversationId: string) => Promise<void>;
  readonly announceNew: (payload: ConversationNewEventData, recipientIds: readonly string[]) => Promise<void>;
  readonly findGroups?: (input: { readonly callId: string; readonly memberUserIds: readonly string[] }) => Promise<readonly CallGroupCandidate[]>;
  /** Le groupe neuf naît en tenant la réservation de `callId` (`createCallGroup`). */
  readonly createGroup?: (input: {
    readonly inviterUserId: string;
    readonly memberUserIds: readonly string[];
    readonly callId: string;
  }) => Promise<{ readonly id: string; readonly title: string | null }>;
  readonly now?: () => Date;
};

export type RebranchInput = {
  readonly callId: string;
  readonly fromConversationId: string;
  readonly presentUserIds: readonly string[];
  readonly inviterUserId: string;
  readonly inviteeUserId: string;
};

type Target = { readonly id: string; readonly title: string | null; readonly created: boolean };

export async function rebranchCall(deps: CallRebranchDeps, input: RebranchInput): Promise<RebranchOutcome> {
  const memberUserIds = exactMembers(input.presentUserIds, input.inviteeUserId);
  const target = await reserveTarget(deps, input, memberUserIds);

  const swapped = await deps.prisma.callSession.updateMany({
    where: { id: input.callId, conversationId: input.fromConversationId, status: { notIn: TERMINAL } },
    data: { conversationId: target.id, originConversationId: input.fromConversationId, version: { increment: 1 } },
  });
  if (swapped.count === 0) return undoLostRace(deps, input, target);

  await settleInGroup(deps, input, target, memberUserIds);
  return { kind: 'rebranched', conversationId: target.id, title: target.title, created: target.created, memberUserIds };
}

/** Le premier groupe exact dont la réservation se prend, sinon un groupe neuf réservé. */
async function reserveTarget(deps: CallRebranchDeps, input: RebranchInput, memberUserIds: readonly string[]): Promise<Target> {
  const findGroups = deps.findGroups ?? ((request) => findExactCallGroups(deps.prisma as PrismaClient, request));
  const candidates = await findGroups({ callId: input.callId, memberUserIds });
  for (const candidate of candidates) {
    if (await deps.claim(candidate.id, input.callId)) return { id: candidate.id, title: candidate.title, created: false };
  }
  const createGroup = deps.createGroup ?? ((request) => createCallGroup({ prisma: deps.prisma as PrismaClient }, request));
  const group = await createGroup({ inviterUserId: input.inviterUserId, memberUserIds, callId: input.callId });
  return { id: group.id, title: group.title, created: true };
}

async function undoLostRace(deps: CallRebranchDeps, input: RebranchInput, target: Target): Promise<RebranchOutcome> {
  const released = await deps.prisma.conversation.updateMany({
    where: { id: target.id, activeCallId: input.callId },
    data: { activeCallId: null },
  });
  if (target.created) await deleteUnannouncedGroup(deps, target.id);
  else if (released.count > 0) deps.notify(target.id, input.callId);
  const session = await deps.prisma.callSession.findUnique({ where: { id: input.callId }, select: { conversationId: true } });
  if (!session || session.conversationId === input.fromConversationId) return { kind: 'failed' };
  return { kind: 'lost', conversationId: session.conversationId };
}

/** Un groupe neuf jamais annoncé ni écrit : il disparaît sans trace. */
async function deleteUnannouncedGroup(deps: CallRebranchDeps, conversationId: string): Promise<void> {
  try {
    await deps.prisma.participant.deleteMany({ where: { conversationId } });
    await deps.prisma.conversation.deleteMany({ where: { id: conversationId } });
  } catch (error) {
    logger.warn('call-rebranch: unannounced group not removed', { conversationId, error });
  }
}

async function settleInGroup(
  deps: CallRebranchDeps,
  input: RebranchInput,
  target: Target,
  memberUserIds: readonly string[]
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const attempt = async (step: string, run: () => Promise<unknown>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      logger.warn(`call-rebranch: ${step} failed after the swap`, { callId: input.callId, conversationId: target.id, error });
    }
  };
  if (target.created) {
    await attempt('firstMessageSentAt', () =>
      deps.prisma.conversation.updateMany({ where: { id: target.id }, data: { firstMessageSentAt: now } })
    );
  }
  await attempt('call participants repoint', () => repointCallParticipants(deps, input.callId, target.id));
  await attempt('live call message', () => deps.postLiveMessage(input.callId));
  for (const userId of memberUserIds) {
    await deps.joinRoom(userId, target.id).catch((error: unknown) =>
      logger.warn('call-rebranch: member not joined to group room', { userId, conversationId: target.id, error })
    );
  }
  if (target.created) {
    await deps
      .announceNew(
        {
          conversationId: target.id,
          conversationType: 'group',
          title: null,
          creatorId: input.inviterUserId,
          participantIds: memberUserIds,
          createdAt: now.toISOString(),
        },
        memberUserIds
      )
      .catch((error: unknown) => logger.warn('call-rebranch: conversation:new not announced', { conversationId: target.id, error }));
    deps.notify(target.id, input.callId);
  }
  const changed: CallConversationChangedEvent = {
    callId: input.callId,
    conversationId: target.id,
    previousConversationId: input.fromConversationId,
    conversationType: 'group',
    conversationTitle: target.title,
    memberUserIds,
    created: target.created,
    reason: 'invitation',
  };
  try {
    deps.io.to(ROOMS.call(input.callId)).emit(SERVER_EVENTS.CALL_CONVERSATION_CHANGED, changed);
  } catch (error) {
    logger.warn('call-rebranch: call:conversation-changed not emitted', { callId: input.callId, error });
  }
}

/** Chaque participation d'appel pointe désormais la ligne `Participant` du groupe de la même personne. */
async function repointCallParticipants(deps: CallRebranchDeps, callId: string, conversationId: string): Promise<void> {
  const members = await deps.prisma.participant.findMany({
    where: { conversationId, isActive: true },
    select: { id: true, userId: true },
  });
  const memberOf = new Map(members.flatMap((m) => (m.userId ? [[m.userId, m.id] as const] : [])));
  const rows = await deps.prisma.callParticipant.findMany({
    where: { callSessionId: callId },
    select: { id: true, participant: { select: { userId: true } } },
  });
  for (const row of rows) {
    const participantId = row.participant?.userId ? memberOf.get(row.participant.userId) : undefined;
    if (!participantId) continue;
    await deps.prisma.callParticipant
      .update({ where: { id: row.id }, data: { participantId } })
      .catch((error: unknown) => logger.warn('call-rebranch: call participant not repointed', { callId, callParticipantId: row.id, error }));
  }
}
