import type { Message } from '@meeshy/shared';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { transformTranslationsToArray } from '../utils/translation-transformer';
import type { MessageTranslationJSON } from '../utils/translation-transformer';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { isServerAtRestMode } from '../services/messaging/serverAtRest';
import { serializeMessageAttachmentsForSocket } from './serializeAttachmentForSocket';
import { buildMessageEditedCore } from './messageEditedPayload';
import { emitEditedToReaders, messageReadership, blockedReaderKeys } from './editedAudience';
import { safeBroadcast } from './serverEmit';
import { offlineSignedEdit, queueSigningFields } from './editedOfflineSigning';
import { readerSignedPlanForMessageIdBestEffort } from './readerSignedDelivery';
import type { ServerEmitIO } from './serverEmit';
import type { MessageMutationQueueParams } from './broadcastMessageMutation';

const logger = enhancedLogger.child({ module: 'CallSummaryEditedDelivery' });

export type CallSummaryEditPrisma = Pick<PrismaClient, 'participant' | 'conversationShareLink' | 'message'>;

const NO_SEALED: ReadonlyMap<string, Date> = new Map();

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

  // **Le PLANCHER d'historique, troisième porte du contrat** — elle manquait à
  // la première rédaction de ce lot, et ses deux transports frères l'ont tous
  // les deux (`MessageHandler.handleMessageEdit`, `broadcastMessageMutation`).
  // Un invité de lien entré APRÈS l'appel reçoit de `GET …/messages`, de
  // `/sync` et de `conversation:updated` un refus de cette bulle ; sans cette
  // loi, `message:edited` la lui servait quand même — et depuis #19977 il la
  // lui servirait avec l'adresse SIGNÉE POUR LUI, donc effectivement
  // téléchargeable, l'admission de fichier ne regardant ni `joinedAt` ni
  // `historyVisibleFrom`.
  //
  // `'unknown'` ferme les DEUX canaux : on ne sait NI qui est bloqué, NI qui
  // est autorisé, et une édition perdue coûte moins qu'un contenu servi à qui
  // n'y a pas droit.
  const readers = await messageReadership(
    prisma,
    conversationId,
    message.id,
    (error) => logger.warn('call summary edit: readership unresolvable — nothing live, nothing queued', { conversationId, messageId: message.id, error }),
  );
  if (readers.kind === 'unknown') return;
  const blocked = blockedReaderKeys(readers);

  const plan = await readerSignedPlanForMessageIdBestEffort(
    prisma,
    { conversationId, messageId: message.id, attachments: payload['attachments'] },
    (error) => logger.warn('call summary edit: reader-signed plan unavailable — nothing live, nothing queued', { conversationId, messageId: message.id, error }),
  );

  // **DEUX enrobages, et ce n'est pas une redondance.**
  //
  // `emitEditedToReaders` garde chacune de ses sorties depuis #19977, parce
  // qu'une cible qui lève ne doit pas priver les suivantes. Celui-ci garde
  // l'APPEL — ce que le `try/catch` du site ne fait pas, puisqu'il n'y en a
  // pas, et ce dont dépend l'enfilage durable ci-dessous : c'est la seule voie
  // par laquelle un absent apprend jamais que l'appel est terminé. C'est la
  // forme exacte du transport socket (`MessageHandler.handleMessageEdit`).
  //
  // Il est aussi ce que le cliquet de #17026 LIT : son balayage apparie une
  // émission et un enfilage dans la MÊME unité et cherche l'enrobage sur
  // place. Une garde qui ne vit que chez le callee est juste et invisible —
  // et un site invisible au cliquet retombe en silence au prochain lot.
  safeBroadcast('message:edited (call summary)', () => emitEditedToReaders({
    io,
    conversationId,
    payload: payload as never,
    plan,
    sealed: NO_SEALED,
    blocked,
    sealedVariant: (p) => p,
    sealedForAll: (p) => p,
    onError: (error, label) => logger.error('message:edited (call summary) live emission failed — offline replay unaffected', { conversationId, messageId: message.id, label, error }),
  }), (error, label) => logger.error('message:edited (call summary) live emission failed — offline replay unaffected', { conversationId, messageId: message.id, label, error }));

  const signed = offlineSignedEdit({ plan, payload });
  if (signed.kind === 'withhold') return;

  await enqueue({
    conversationId,
    actorUserId: null,
    eventType: 'edited',
    messageId: message.id,
    payload: payload as never,
    atRest: isServerAtRestMode(message.encryptionMode),
    ...(blocked.size > 0 ? { excludedQueueKeys: blocked } : {}),
    ...queueSigningFields(signed),
  });
}
