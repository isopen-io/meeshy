import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AFTER_READ_CONSUME_MAX_IDS } from '@meeshy/shared/types/api-schemas';
import { consumeAfterReadAndAnnounce } from '../services/messaging/afterReadConsumption';
import { readAfterReadIdsAtDeparture } from '../services/messaging/afterReadDeparture';
import { AfterReadDepartureTracker, type AfterReadReader } from './AfterReadDepartureTracker';
import type { MessageMutationManager } from './broadcastMessageMutation';
import { resolveParticipant } from './utils/participant-resolver';
import { normalizeConversationId, type SocketUser } from './utils/socket-helpers';
import type { CallStatus } from '@meeshy/shared/types/video-call';
import { accountParticipantIds, LIVE_CALL_PARTICIPATION } from '../services/calls/liveCallParticipations';

/** Un appel ÉTABLI : la communication passe (ou se rétablit). Ni `initiated`, ni `ringing`, ni `connecting`. */
const ESTABLISHED_CALL_STATUSES: readonly CallStatus[] = ['active', 'reconnecting'];

/**
 * Le lecteur prend-il part à un appel ÉTABLI, dans N'IMPORTE QUELLE conversation, qu'il a lui-même
 * DÉCROCHÉ (`CallParticipant.answeredAt`) ? Un appel qui sonne seulement ne retient rien : sinon,
 * lancer un appel jamais décroché garderait les flammes lues. L'écran d'appel
 * retire la conversation lue (`viewing:stop`, iOS `CallWindowPresenter`, web `conversation-viewing`)
 * sans qu'il l'ait quittée : ses flammes attendent la fin de l'appel (#18556). Un inscrit est cherché
 * par TOUTES ses participations (index `participantId`, jamais le filtre de relation, #10831) ; un
 * invité n'en a qu'une, la sienne.
 */
export async function isInLiveCall(
  prisma: Pick<PrismaClient, 'callParticipant' | 'participant'>,
  reader: Pick<AfterReadReader, 'participantId' | 'readerKey'>,
): Promise<boolean> {
  const participantIds =
    reader.readerKey === reader.participantId
      ? [reader.participantId]
      : await accountParticipantIds(prisma, reader.readerKey);
  if (participantIds.length === 0) return false;
  const rows = (await prisma.callParticipant.findMany({
    where: { ...LIVE_CALL_PARTICIPATION, participantId: { in: participantIds } },
    select: { answeredAt: true, callSession: { select: { status: true } } },
  })) as Array<{ answeredAt?: Date | null; callSession: { status: string } | null }>;
  return rows.some(
    (row) =>
      row.answeredAt instanceof Date &&
      row.callSession !== null &&
      (ESTABLISHED_CALL_STATUSES as readonly string[]).includes(row.callSession.status),
  );
}

/** Ce que le marquage du regard demande au serveur Socket.IO — satisfait par le `Server` de production. */
export interface AfterReadViewIO {
  readonly sockets: {
    readonly sockets: {
      get(socketId: string): { join(room: string): unknown; leave(room: string): unknown } | undefined;
    };
  };
  in(room: string): { fetchSockets(): Promise<ReadonlyArray<unknown>> };
}

export interface AfterReadDepartureWiring {
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  manager: () => MessageMutationManager | null | undefined;
  io: () => AfterReadViewIO | null | undefined;
  onError: (error: unknown) => void;
  now?: () => Date;
}

/**
 * La room qui PUBLIE le regard d'un lecteur sur une conversation aux autres
 * nœuds (#18556). Rien n'y est jamais émis : elle n'existe que pour être
 * comptée (`fetchSockets`, que l'adaptateur Redis étend à toute la grappe).
 */
export const afterReadViewRoom = (reader: Pick<AfterReadReader, 'conversationId' | 'readerKey'>): string =>
  `after-read-view:${reader.conversationId}:${reader.readerKey}`;

export function markAfterReadViewing(
  io: AfterReadViewIO | null | undefined,
  socketId: string,
  reader: AfterReadReader,
  viewing: boolean,
  onError: (error: unknown) => void,
): void {
  const socket = io?.sockets.sockets.get(socketId);
  if (!socket) return;
  const room = afterReadViewRoom(reader);
  void Promise.resolve(viewing ? socket.join(room) : socket.leave(room)).catch(onError);
}

/** Sans serveur joignable, on ne SAIT pas : l'appelant traite la levée comme « regardé ailleurs ». */
export async function isAfterReadViewedAnywhere(
  io: AfterReadViewIO | null | undefined,
  reader: AfterReadReader,
): Promise<boolean> {
  if (!io) throw new Error('after-read view room unreachable: no Socket.IO server');
  const sockets = await io.in(afterReadViewRoom(reader)).fetchSockets();
  return sockets.length > 0;
}

const chunksOf = (ids: readonly string[], size: number): string[][] =>
  Array.from({ length: Math.ceil(ids.length / size) }, (_, index) => ids.slice(index * size, (index + 1) * size));

/**
 * Le registre des départs (#18556) branché sur la gateway : le lecteur se
 * résout comme partout ailleurs (`resolveParticipant`, participation vivante),
 * et un départ consomme ce qu'il a lu par le MÊME site que la route du client.
 */
export function createAfterReadDepartureTracker(wiring: AfterReadDepartureWiring): AfterReadDepartureTracker {
  const { prisma, connectedUsers, socketToUser, onError } = wiring;
  const now = wiring.now ?? (() => new Date());
  const normalize = (rawConversationId: string) =>
    normalizeConversationId(rawConversationId, (where) =>
      prisma.conversation.findUnique({ where, select: { id: true, identifier: true } }),
    );

  return new AfterReadDepartureTracker({
    normalizeConversationId: normalize,
    isAuthenticated: (socketId) => socketToUser.has(socketId),
    userOf: (socketId) => socketToUser.get(socketId),
    resolveReader: async (socketId, rawConversationId) => {
      const userIdOrToken = socketToUser.get(socketId);
      if (!userIdOrToken) return null;
      const conversationId = await normalize(rawConversationId);
      const participant = await resolveParticipant({ prisma, userIdOrToken, conversationId, connectedUsers });
      if (!participant) return null;
      return {
        conversationId,
        participantId: participant.participantId,
        readerKey: participant.isAnonymous ? participant.participantId : participant.userId,
      };
    },
    markViewing: (socketId, reader, viewing) => markAfterReadViewing(wiring.io(), socketId, reader, viewing, onError),
    viewedElsewhere: (reader) => isAfterReadViewedAnywhere(wiring.io(), reader),
    holdsDeparture: (reader) => isInLiveCall(prisma, reader),
    onDeparture: async ({ periods, ...reader }) => {
      const at = now();
      const messageIds = await readAfterReadIdsAtDeparture(prisma, {
        conversationId: reader.conversationId,
        participantId: reader.participantId,
        regards: periods,
        now: at,
      });
      for (const batch of chunksOf(messageIds, AFTER_READ_CONSUME_MAX_IDS)) {
        await consumeAfterReadAndAnnounce({ prisma, manager: wiring.manager(), ...reader, messageIds: batch, now: at, onError });
      }
    },
    now,
    onError,
  });
}
