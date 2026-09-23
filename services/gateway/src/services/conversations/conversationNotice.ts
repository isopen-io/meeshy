import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ConversationNotice, NoticeActor } from '@meeshy/shared/utils/conversation-notice';
import { LIVE_MESSAGE_MARK } from '../messaging/liveMessage';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ConversationNotice' });

export type SystemNoticeDeps = {
  /** `conversation` pour avancer l'horloge du fil : l'avis DEVIENT son dernier message (#5914). */
  readonly prisma: Pick<PrismaClient, 'message' | 'conversation'>;
  /** `MeeshySocketIOManager.broadcastMessage` (`message:new` + `conversation:updated`). Absent = l'avis reste persisté. */
  readonly broadcast?: (message: unknown, conversationId: string) => Promise<void>;
};

export type SystemNoticeInput = {
  readonly conversationId: string;
  /** `Participant.id` de celui qui a fait le geste — l'auteur de l'avis. */
  readonly senderParticipantId: string;
  /** Repli FRANÇAIS pour les surfaces sans rendu dédié ; la vérité est dans `metadata`. */
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type SocketNoticeGateway = {
  getManager(): { broadcastMessage?: (message: never, conversationId: string) => Promise<void> } | null | undefined;
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
        originalLanguage: 'fr',
        messageType: 'system',
        messageSource: 'system',
        metadata: input.metadata,
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

  if (deps.broadcast) {
    try {
      await deps.broadcast(message, input.conversationId);
    } catch (error) {
      logger.warn('system notice written but not broadcast', {
        conversationId: input.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
