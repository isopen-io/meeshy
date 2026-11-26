import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ConversationNotice, NoticeActor } from '@meeshy/shared/utils/conversation-notice';
import { PARTICIPATION_VIVANTE } from '@meeshy/shared/utils/participation-vivante';
import { participantUserRoomTargets } from '../../socketio/emitToConversationParticipants';
import { buildMessageNewPayload } from '../../socketio/messageNewPayload';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { stripClientMessageId } from '../../socketio/utils/message-ack-shaping';
import { LIVE_MESSAGE_MARK } from '../messaging/liveMessage';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sealMessageIfConversationObsoleted } from './obsoleteMessageSeal';

const logger = enhancedLogger.child({ module: 'ConversationNotice' });

/** Un destinataire nommé d'un avis : sa room personnelle est `userId ?? id`. */
export type NoticeRecipient = { readonly id: string; readonly userId: string | null };

export type SystemNoticeDeps = {
  /**
   * `conversation` pour avancer l'horloge du fil : l'avis DEVIENT son dernier message (#5914).
   * `participant` pour nommer le créateur d'un groupe encore silencieux (#14659).
   */
  readonly prisma: Pick<PrismaClient, 'message' | 'conversation' | 'participant'>;
  /** `MeeshySocketIOManager.broadcastMessage` (`message:new` + `conversation:updated`). Absent = l'avis reste persisté. */
  readonly broadcast?: (message: unknown, conversationId: string) => Promise<void>;
  /**
   * #14659 — la remise d'un avis d'une conversation encore SILENCIEUSE : à ses
   * seuls destinataires nommés, sur leur room personnelle, jamais à la room.
   * Absent = rien en direct dans une conversation silencieuse (fail-closed).
   */
  readonly deliverTo?: (message: unknown, conversationId: string, recipients: readonly NoticeRecipient[]) => Promise<void>;
};

export type SystemNoticeInput = {
  readonly conversationId: string;
  /** `Participant.id` de celui qui a fait le geste — l'auteur de l'avis. */
  readonly senderParticipantId: string;
  /** Repli FRANÇAIS pour les surfaces sans rendu dédié ; la vérité est dans `metadata`. */
  readonly content: string;
  /** La langue de `content` quand le repli n'est pas français (l'avis de chiffrement garde son texte historique, #11416). */
  readonly originalLanguage?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Un avis qui meurt : détruit par le balayage des éphémères (avis de capture, #9629). Absent : l'avis vit. */
  readonly expiresAt?: Date;
  /**
   * `false` : l'avis est une ligne SILENCIEUSE — il ne devient pas le dernier
   * message du fil, donc ne fait remonter la conversation chez personne (#9630).
   */
  readonly advanceConversationClock?: boolean;
};

export type SocketNoticeGateway = {
  getManager(): {
    broadcastMessage?: (message: never, conversationId: string) => Promise<void>;
    getIO?: () => ServerEmitIO;
  } | null | undefined;
} | null | undefined;

/**
 * L'acteur d'un avis, lu sur sa ligne `Participant` : le nom AFFICHÉ dans la
 * conversation, celui que l'avis d'arrivée pose déjà pour l'arrivant.
 */
export function noticeActor(participant: { readonly id: string; readonly displayName: string }): NoticeActor {
  return { participantId: participant.id, displayName: participant.displayName };
}

/** La diffusion d'un avis par la passerelle Socket.IO de l'instance, quand elle existe. */
export function noticeBroadcast(gateway: SocketNoticeGateway): SystemNoticeDeps['broadcast'] {
  return async (message, conversationId) => {
    await gateway?.getManager()?.broadcastMessage?.(message as never, conversationId);
  };
}

/**
 * #14659 — la diffusion d'un avis ET sa remise ciblée, par la passerelle de
 * l'instance. La remise ciblée ne porte que `message:new` : ni
 * `conversation:updated`, ni non-lu, ni file hors ligne — une conversation que
 * la liste tait n'a pas de ligne à faire remonter, et son créateur relit le fil
 * à l'ouverture.
 */
export function noticeDelivery(gateway: SocketNoticeGateway): Pick<SystemNoticeDeps, 'broadcast' | 'deliverTo'> {
  return {
    broadcast: noticeBroadcast(gateway),
    deliverTo: async (message, conversationId, recipients) => {
      const io = gateway?.getManager()?.getIO?.();
      if (!io) return;
      const notice = message as Message;
      const payload = stripClientMessageId({
        ...buildMessageNewPayload(notice, { conversationId, translations: [], attachments: [], replyTo: undefined }),
        originalContent: notice.content,
        metadata: notice.metadata || undefined,
      });
      for (const { room } of participantUserRoomTargets(recipients)) {
        io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, payload);
      }
    },
  };
}

function messageCreatedAt(message: unknown): Date {
  if (typeof message === 'object' && message !== null && 'createdAt' in message) {
    const brut = (message as { createdAt: unknown }).createdAt;
    if (brut instanceof Date) return brut;
    if (typeof brut === 'string' || typeof brut === 'number') {
      const d = new Date(brut);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

/**
 * Écrit un message système, avance l'horloge du fil sur SON `createdAt`, puis
 * le diffuse — le chemin d'un message ordinaire, que `message.create()` en
 * direct court-circuite (`messagePostSaveEffects`).
 *
 * **Ne rejette jamais.** L'avis est un accessoire du geste, pas sa condition :
 * chaque étape est gardée séparément, et une panne se solde par un `null` ou
 * une ligne de log, jamais par un geste refusé.
 */
export async function postSystemNotice(deps: SystemNoticeDeps, input: SystemNoticeInput): Promise<unknown | null> {
  let message: unknown;
  try {
    message = await deps.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.senderParticipantId,
        content: input.content,
        originalLanguage: input.originalLanguage ?? 'fr',
        messageType: 'system',
        messageSource: 'system',
        metadata: input.metadata,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        ...LIVE_MESSAGE_MARK,
      },
    } as never);
  } catch (error) {
    logger.warn('system notice not written', {
      conversationId: input.conversationId,
      kind: input.metadata.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (await sealedByObsolescence(deps, message, input.conversationId)) return null;

  if (input.advanceConversationClock === false) return deliver(deps, message, input.conversationId);

  try {
    await deps.prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: messageCreatedAt(message) },
    } as never);
  } catch (error) {
    logger.warn('system notice written but conversation clock not advanced', {
      conversationId: input.conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return deliver(deps, message, input.conversationId);
}

function messageId(message: unknown): string | null {
  if (typeof message !== 'object' || message === null || !('id' in message)) return null;
  const id = (message as { id: unknown }).id;
  return typeof id === 'string' ? id : null;
}

/** #14643 — un avis écrit pendant l'obsolescence de sa conversation naît effacé et ne part pas. */
async function sealedByObsolescence(deps: SystemNoticeDeps, message: unknown, conversationId: string): Promise<boolean> {
  const id = messageId(message);
  return id !== null && sealMessageIfConversationObsoleted(deps.prisma, { conversationId, messageId: id });
}

type NoticeAudience = { readonly kind: 'room' } | { readonly kind: 'named'; readonly recipients: readonly NoticeRecipient[] };

/**
 * #14659 — ce que la liste montre (`emptyDirectVisibility`) : une conversation
 * `direct`/`group` dont `firstMessageSentAt` est posé-et-nul n'est visible que
 * de son créateur ; sans créateur, de tous. `count` ne matche jamais un
 * document où le champ est ABSENT (groupe d'avant #14644) : il reste diffusé.
 */
async function noticeAudience(prisma: SystemNoticeDeps['prisma'], conversationId: string): Promise<NoticeAudience> {
  const silent = await prisma.conversation.count({
    where: { id: conversationId, type: { in: ['direct', 'group'] }, firstMessageSentAt: null },
  });
  if (!(silent > 0)) return { kind: 'room' };
  const creators = await prisma.participant.findMany({
    where: { conversationId, role: 'creator', ...PARTICIPATION_VIVANTE },
    select: { id: true, userId: true },
  });
  return creators.length === 0 ? { kind: 'room' } : { kind: 'named', recipients: creators };
}

async function deliver(deps: SystemNoticeDeps, message: unknown, conversationId: string): Promise<unknown> {
  if (!deps.broadcast && !deps.deliverTo) return message;
  let audience: NoticeAudience;
  try {
    audience = await noticeAudience(deps.prisma, conversationId);
  } catch (error) {
    logger.warn('system notice written but audience unknown — not broadcast', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return message;
  }
  try {
    if (audience.kind === 'named') await deps.deliverTo?.(message, conversationId, audience.recipients);
    else await deps.broadcast?.(message, conversationId);
  } catch (error) {
    logger.warn('system notice written but not broadcast', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return message;
}

function fallbackContent(notice: ConversationNotice): string {
  switch (notice.kind) {
    case 'member-removed':
      return `${notice.actor.displayName} a retiré ${notice.target.displayName}`;
    case 'member-left':
      return `${notice.actor.displayName} a quitté la conversation`;
    case 'conversation-renamed':
      return `${notice.actor.displayName} a modifié le nom du groupe`;
    case 'conversation-image':
      return `${notice.actor.displayName} a modifié la photo du groupe`;
  }
}

/**
 * Annonce un geste de vie du groupe (#7593) — retrait par un tiers, départ
 * volontaire, renommage, changement d'image. La ligne de liste en lit la clé
 * localisable et l'acteur (`systemEventFromMessage`).
 */
export async function postConversationNotice(
  deps: SystemNoticeDeps,
  input: { readonly conversationId: string; readonly notice: ConversationNotice },
): Promise<unknown | null> {
  return postSystemNotice(deps, {
    conversationId: input.conversationId,
    senderParticipantId: input.notice.actor.participantId,
    content: fallbackContent(input.notice),
    metadata: input.notice,
  });
}
