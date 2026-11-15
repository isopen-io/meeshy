/**
 * #14643 — rendre une conversation OBSOLÈTE (directive porteur 2026-11-02).
 *
 * La suppression historique (`DELETE /conversations/:id`) ne fait que FERMER :
 * `isActive: false`, `closedAt`, et les messages restent lisibles. Rendre
 * obsolète va plus loin, en deux temps :
 *
 * 1. TOUT DE SUITE (ici) — la clôture que lisent les anciens clients (mêmes
 *    trois champs, liens de partage éteints), `deletedAt` posé sur chaque
 *    message vivant (le contenu devient illisible par toutes les lectures, qui
 *    filtrent déjà `deletedAt`), `Conversation.deletedAt` + `purgeAfter`, les
 *    notifications de la conversation retirées, puis l'annonce :
 *    `conversation:closed` (compris par tous les clients) et
 *    `conversation:obsoleted` (les nouveaux purgent aussi leur cache).
 * 2. À `purgeAfter` (48 h) — l'effacement physique, par
 *    `jobs/obsolete-conversation-purge.ts`, désarmé sans interrupteur.
 *
 * Une conversation déjà obsolète ne se réécrit pas : sa purge ne recule pas.
 *
 * LA COURSE AVEC UN ENVOI. Un message admis avant la transaction mais écrit
 * pendant elle échappe à son `updateMany` (l'instantané ne le voit pas). Deux
 * verrous la ferment ensemble : l'effacement est REJOUÉ après la validation, et
 * chaque site d'écriture relit `Conversation.deletedAt` après avoir écrit
 * (`sealMessageIfConversationObsoleted`). Un message écrit avant le rejeu est
 * effacé par lui ; un message écrit après voit `deletedAt` validé.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { isProtectedFromObsolescence } from './obsoleteCapability';
import { unsetOrNull } from '../../utils/prisma-unset';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { deactivateShareLinksOnClose } from './shareLinkClosure';
import { eraseExternalPeerOnClose, type ExternalPeerEraser } from '../external-conversation/erase-external-peers';
import {
  announceConversationClosed,
  type ClosedConversationEphemeralState,
} from '../../socketio/announceConversationClosed';
import {
  emitToConversationParticipants,
  type ConversationRoomEmitter,
} from '../../socketio/emitToConversationParticipants';
import {
  retractedNotificationOf,
  type RetractedNotification,
  type RetractedNotificationAnnouncer,
} from '../notifications/retractedNotifications';
import { cutTogetherWhere } from '../together/togetherDeps';

export { isProtectedFromObsolescence };

const logger = enhancedLogger.child({ module: 'ObsoleteConversation' });

export const OBSOLETE_PURGE_DELAY_MS = 48 * 60 * 60 * 1000;

/** Lignes de contexte relues pour l'annonce ; la suppression, elle, n'a pas de plafond. */
const CONTEXT_NOTIFICATION_READ_CAP = 5000;

export type ObsoleteConversationPrisma = Pick<
  PrismaClient,
  'conversation' | 'conversationShareLink' | 'message' | 'notification' | '$transaction' | '$runCommandRaw'
> & ExternalPeerEraser;

export type ObsoleteConversationDeps = {
  readonly prisma: ObsoleteConversationPrisma;
  readonly io: ConversationRoomEmitter | null | undefined;
  readonly manager: ClosedConversationEphemeralState | null | undefined;
  readonly announcer: RetractedNotificationAnnouncer | null | undefined;
};

export type ObsoleteConversationOutcome =
  | {
      readonly kind: 'obsoleted' | 'already-obsolete';
      readonly conversationId: string;
      readonly obsoletedAt: Date;
      readonly purgeAfter: Date;
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'protected' };


type RawId = string | { readonly $oid: string };
type RawNotificationRow = {
  readonly _id: RawId;
  readonly userId?: RawId;
  readonly type?: unknown;
  readonly context?: unknown;
  readonly delivery?: unknown;
};

const rawId = (value: RawId | undefined): string =>
  value === undefined ? '' : typeof value === 'string' ? value : value.$oid;

/**
 * Les notifications de la conversation : celles qui pointent un de ses messages
 * (clé étrangère indexée) et celles qui ne la nomment que par leur contexte
 * (invitation, ajout, rôle). Best-effort : un échec est journalisé, la
 * conversation reste obsolète.
 */
async function retractConversationNotifications(
  prisma: ObsoleteConversationPrisma,
  conversationId: string,
  announcer: RetractedNotificationAnnouncer | null | undefined,
): Promise<void> {
  const retracted: RetractedNotification[] = [];
  try {
    const byMessage = await prisma.notification.findMany({
      where: { message: { is: { conversationId } } },
      select: { id: true, userId: true, type: true, context: true, delivery: true },
    });
    if (byMessage.length > 0) {
      await prisma.notification.deleteMany({ where: { id: { in: byMessage.map((row) => row.id) } } });
      retracted.push(...byMessage.map(retractedNotificationOf));
    }

    const raw = (await prisma.$runCommandRaw({
      find: 'Notification',
      filter: { 'context.conversationId': conversationId },
      projection: { _id: 1, userId: 1, type: 1, 'context.conversationId': 1, 'delivery.pushSent': 1 },
      singleBatch: true,
      batchSize: CONTEXT_NOTIFICATION_READ_CAP,
    })) as { readonly cursor?: { readonly firstBatch?: readonly RawNotificationRow[] } };
    const byContext = raw.cursor?.firstBatch ?? [];
    await prisma.$runCommandRaw({
      delete: 'Notification',
      deletes: [{ q: { 'context.conversationId': conversationId }, limit: 0 }],
    });
    retracted.push(
      ...byContext.map((row) =>
        retractedNotificationOf({ id: rawId(row._id), userId: rawId(row.userId), type: row.type, context: row.context, delivery: row.delivery }),
      ),
    );
  } catch (error) {
    logger.error('obsolete conversation: notifications not retracted', { conversationId, error });
  }

  if (retracted.length === 0) return;
  try {
    await announcer?.announceNotificationsRetracted(retracted);
  } catch (error) {
    logger.warn('obsolete conversation: notifications retracted, announcement failed', { conversationId, error });
  }
}

export async function obsoleteConversation(
  deps: ObsoleteConversationDeps,
  params: { readonly conversationId: string; readonly actorId: string; readonly now?: Date },
): Promise<ObsoleteConversationOutcome> {
  const { prisma, io, manager, announcer } = deps;
  const { conversationId, actorId } = params;
  const now = params.now ?? new Date();

  const existing = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, identifier: true, deletedAt: true, purgeAfter: true },
  });
  if (!existing) return { kind: 'not-found' };
  if (isProtectedFromObsolescence(existing)) return { kind: 'protected' };
  if (existing.deletedAt && existing.purgeAfter) {
    return { kind: 'already-obsolete', conversationId, obsoletedAt: existing.deletedAt, purgeAfter: existing.purgeAfter };
  }

  const purgeAfter = new Date(now.getTime() + OBSOLETE_PURGE_DELAY_MS);
  const eraseLiveMessages = () =>
    prisma.message.updateMany({
      where: { conversationId, ...unsetOrNull('deletedAt') },
      data: { deletedAt: now },
    });
  const [obsoleted] = await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: { isActive: false, closedAt: now, closedBy: actorId, deletedAt: now, purgeAfter },
      include: { participants: { select: { id: true, userId: true, isActive: true } } },
    }),
    deactivateShareLinksOnClose(prisma, conversationId),
    eraseLiveMessages(),
  ]);
  await eraseLiveMessages();
  // #17117 — le numéro de l'ami d'une conversation externe ne survit pas au fil.
  await eraseExternalPeerOnClose(prisma, { id: conversationId, type: existing.type });
  // #17022 — ses messages sont effacés : une séance « ensemble » qui y lisait une pièce s'arrête.
  await cutTogetherWhere({ conversationId });

  await retractConversationNotifications(prisma, conversationId, announcer);

  const audience = obsoleted.participants.filter((participant) => participant.isActive);
  announceConversationClosed({ io, manager, conversationId, participants: audience, closedBy: actorId, closedAt: now });
  if (audience.length > 0) {
    emitToConversationParticipants({
      io,
      conversationId,
      participants: audience,
      event: SERVER_EVENTS.CONVERSATION_OBSOLETED,
      payload: { conversationId, obsoletedBy: actorId, obsoletedAt: now.toISOString(), purgeAfter: purgeAfter.toISOString() },
    });
  }

  return { kind: 'obsoleted', conversationId, obsoletedAt: now, purgeAfter };
}
