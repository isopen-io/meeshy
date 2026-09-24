import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import {
  ARRIVALS_NOTICE_WINDOW_MINUTES,
  arrivalsNoticeFallbackContent,
  parseArrivalsNotice,
  startArrivalsNotice,
  withArrival,
  type ArrivalsNoticeMetadata,
} from '@meeshy/shared/utils/arrivals-notice';
import { postSystemNotice } from './conversationNotice';
import { buildMessageEditedCore } from '../../socketio/messageEditedPayload';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'GlobalArrivalsNotice' });

/** Messages système relus pour trouver la ligne ouverte — la fenêtre n'en compte que quelques-uns. */
const OPEN_LINE_LOOKUP_LIMIT = 20;

export type GlobalArrivalsDeps = {
  readonly prisma: Pick<PrismaClient, 'message' | 'conversation'>;
  /** Diffusion d'une ligne NEUVE (`message:new` + `conversation:updated`). */
  readonly broadcast?: (message: unknown, conversationId: string) => Promise<void>;
  /** Diffusion d'une ligne MISE À JOUR (`message:edited`). */
  readonly broadcastUpdate?: (message: unknown, conversationId: string) => Promise<void>;
  /** Injectable pour les tests. */
  readonly now?: () => Date;
};

export type GlobalArrivalInput = {
  readonly conversationId: string;
  /** `Participant.id` de l'arrivant — il signe la ligne quand il l'ouvre. */
  readonly participantId: string;
  readonly displayName: string;
};

type OpenLine = { readonly id: string; readonly notice: ArrivalsNoticeMetadata };

/**
 * Une file par conversation : deux inscriptions simultanées liraient la même
 * ligne (ou son absence) et en écriraient deux, ou perdraient un arrivant. La
 * file tient l'invariant sur une instance ; entre instances, le pire est une
 * seconde ligne dans la fenêtre — jamais une arrivée perdue en silence.
 */
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(conversationId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(conversationId) ?? Promise.resolve();
  const next = previous.then(task, task);
  const tail: Promise<unknown> = next
    .then(() => undefined, () => undefined)
    .finally(() => {
      if (queues.get(conversationId) === tail) queues.delete(conversationId);
    });
  queues.set(conversationId, tail);
  return next;
}

async function findOpenLine(deps: GlobalArrivalsDeps, conversationId: string, now: Date): Promise<OpenLine | null> {
  const windowStart = new Date(now.getTime() - ARRIVALS_NOTICE_WINDOW_MINUTES * 60_000);
  const rows = await deps.prisma.message.findMany({
    where: { conversationId, messageSource: 'system', createdAt: { gte: windowStart } },
    orderBy: { createdAt: 'desc' },
    take: OPEN_LINE_LOOKUP_LIMIT,
    select: { id: true, metadata: true, deletedAt: true },
  } as never);
  const open = (rows as ReadonlyArray<{ id: string; metadata: unknown; deletedAt?: Date | null }>)
    .filter((row) => row.deletedAt == null)
    .map((row) => ({ id: row.id, notice: parseArrivalsNotice(row.metadata) }))
    .find((row): row is OpenLine => row.notice !== null);
  return open ?? null;
}

async function openNewLine(deps: GlobalArrivalsDeps, input: GlobalArrivalInput, now: Date): Promise<unknown | null> {
  const notice = startArrivalsNotice(
    { participantId: input.participantId, displayName: input.displayName },
    now.toISOString(),
  );
  return postSystemNotice(
    { prisma: deps.prisma, broadcast: deps.broadcast },
    {
      conversationId: input.conversationId,
      senderParticipantId: input.participantId,
      content: arrivalsNoticeFallbackContent(notice),
      metadata: notice,
    },
  );
}

async function extendLine(deps: GlobalArrivalsDeps, input: GlobalArrivalInput, line: OpenLine): Promise<unknown | null> {
  const notice = withArrival(line.notice, { participantId: input.participantId, displayName: input.displayName });
  if (notice === line.notice) return null;

  let updated: unknown;
  try {
    updated = await deps.prisma.message.update({
      where: { id: line.id },
      data: { content: arrivalsNoticeFallbackContent(notice), metadata: notice },
      include: { sender: { select: { id: true, userId: true, displayName: true } } },
    } as never);
  } catch (error) {
    logger.warn('arrivals line not updated', {
      conversationId: input.conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (deps.broadcastUpdate) {
    try {
      await deps.broadcastUpdate(updated, input.conversationId);
    } catch (error) {
      logger.warn('arrivals line updated but not broadcast', {
        conversationId: input.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return updated;
}

/**
 * Annonce une arrivée dans le salon global : met à jour la ligne d'arrivées
 * ouverte depuis moins de dix minutes, ou en ouvre une.
 *
 * **Ne rejette jamais** — même loi que `postJoinSystemMessage` : l'avis est un
 * accessoire de l'inscription. Une lecture en panne retombe sur une ligne
 * neuve (le comportement d'avant #7740) ; une écriture en panne rend `null`.
 */
export function postGlobalArrival(deps: GlobalArrivalsDeps, input: GlobalArrivalInput): Promise<unknown | null> {
  return enqueue(input.conversationId, async () => {
    const now = deps.now?.() ?? new Date();
    let line: OpenLine | null = null;
    try {
      line = await findOpenLine(deps, input.conversationId, now);
    } catch (error) {
      logger.warn('open arrivals line lookup failed — opening a new one', {
        conversationId: input.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return line ? extendLine(deps, input, line) : openNewLine(deps, input, now);
  });
}

/**
 * `message:edited` pour une ligne d'arrivées mise à jour — à la ROOM de la
 * conversation, sans file hors ligne : le salon global compte tous les
 * inscrits, et un absent relit la ligne à jour à sa prochaine ouverture.
 * `isEdited: false` — personne n'a édité ce message, le serveur l'a complété.
 */
export function emitArrivalsLineUpdate(io: ConversationRoomEmitter, message: unknown, conversationId: string): void {
  const row = message as Message;
  const at = new Date();
  io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_EDITED, {
    ...buildMessageEditedCore(row, { conversationId, content: row.content, isEdited: false, editedAt: at }),
    messageSource: 'system',
    metadata: row.metadata,
  });
}
