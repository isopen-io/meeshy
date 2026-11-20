import type { Message } from '@meeshy/shared';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { transformTranslationsToArray } from '../utils/translation-transformer';
import type { MessageTranslationJSON } from '../utils/translation-transformer';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { isServerAtRestMode } from '../services/messaging/serverAtRest';
import { serializeMessageAttachmentsForSocket } from './serializeAttachmentForSocket';
import { buildMessageEditedCore } from './messageEditedPayload';
import { emitEditedToReaders } from './editedAudience';
import { offlineSignedEdit, queueSigningFields } from './editedOfflineSigning';
import { readerSignedPlanForMessageIdBestEffort } from './readerSignedDelivery';
import type { ServerEmitIO } from './serverEmit';
import type { MessageMutationQueueParams } from './broadcastMessageMutation';

const logger = enhancedLogger.child({ module: 'CallSummaryEditedDelivery' });

export type CallSummaryEditPrisma = Pick<PrismaClient, 'participant' | 'conversationShareLink' | 'message'>;

const NO_SEALED: ReadonlyMap<string, Date> = new Map();
const NO_BLOCKED: ReadonlySet<string> = new Set();

export function callSummaryEditedPayload(message: Message, conversationId: string): Record<string, unknown> {
  let messageTranslations: unknown[] = [];
  if (message.id) {
    try {
      messageTranslations = transformTranslationsToArray(
        message.id,
        message.translations as unknown as Record<string, MessageTranslationJSON>
      );
    } catch (error) {
      logger.warn(`Translation transform failed for edited message ${message.id}`, { error });
    }
  }
  const senderParticipant = message.sender;
  const updatedAt = message.updatedAt || new Date();
  return {
    ...buildMessageEditedCore(message, {
      conversationId,
      content: message.content,
      isEdited: Boolean(message.isEdited),
      editedAt: updatedAt,
    }),
    messageSource: message.messageSource || undefined,
    metadata: message.metadata ?? {},
    translations: messageTranslations,
    sender: senderParticipant ? {
      id: senderParticipant.id,
      displayName: senderParticipant.nickname || senderParticipant.displayName,
      avatar: senderParticipant.avatar || senderParticipant.user?.avatar,
      type: senderParticipant.type,
      userId: senderParticipant.userId,
      username: senderParticipant.user?.username,
      firstName: senderParticipant.user?.firstName || '',
      lastName: senderParticipant.user?.lastName || '',
    } : undefined,
    attachments: serializeMessageAttachmentsForSocket(message.attachments),
  };
}

export async function deliverCallSummaryEdit(params: {
  readonly io: ServerEmitIO | null | undefined;
  readonly prisma: CallSummaryEditPrisma;
  readonly conversationId: string;
  readonly message: Message;
  readonly payload: Record<string, unknown>;
  readonly enqueue: (queued: MessageMutationQueueParams) => Promise<void>;
}): Promise<void> {
  const { io, prisma, conversationId, message, payload, enqueue } = params;
  const plan = await readerSignedPlanForMessageIdBestEffort(
    prisma,
    { conversationId, messageId: message.id, attachments: payload['attachments'] },
    (error) => logger.warn('call summary edit: reader-signed plan unavailable — nothing live, nothing queued', { conversationId, messageId: message.id, error }),
  );

  emitEditedToReaders({
    io,
    conversationId,
    payload: payload as never,
    plan,
    sealed: NO_SEALED,
    blocked: NO_BLOCKED,
    sealedVariant: (p) => p,
    sealedForAll: (p) => p,
  });

  const signed = offlineSignedEdit({ plan, payload });
  if (signed.kind === 'withhold') return;

  await enqueue({
    conversationId,
    actorUserId: null,
    eventType: 'edited',
    messageId: message.id,
    payload: payload as never,
    atRest: isServerAtRestMode(message.encryptionMode),
    ...queueSigningFields(signed),
  });
}
