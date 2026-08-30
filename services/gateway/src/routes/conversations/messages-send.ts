/**
 * Surface ENVOI DE MESSAGE (issue #4284 — découpage de `messages.ts`, 2945
 * lignes, en fichiers frères par responsabilité). Porte `SendMessageBodySchema`
 * et la route `POST /conversations/:id/messages` (chiffrement, pièces
 * jointes, transfert, lieu partagé — via `MessagingService`). Voir
 * `messages.ts` pour le composeur (`registerMessagesRoutes`), qui appelle
 * `registerSendMessageRoute` et ré-exporte `SendMessageBodySchema`.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MessagingService } from '../../services/messaging/MessagingService';
import { ErrorCode, ErrorMessages } from '@meeshy/shared/types';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { MESSAGE_LIMITS } from '../../config/message-limits';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { isBlockedBetween } from '../../utils/blocking';
import { messageValidationHook } from '../../middleware/rate-limiter';
import type {
  ConversationParams,
  SendMessageBody
} from './types';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { z } from 'zod';
import { CommonSchemas } from '@meeshy/shared/utils/validation';
import { CLIENT_MESSAGE_ID_REGEX } from '@meeshy/shared/utils/client-message-id';
import {
  ENCRYPTION_ENVELOPE_SHAPE,
  noSilentDowngrade,
  NO_SILENT_DOWNGRADE_ISSUE,
  toEncryptedPayload,
} from '../../validation/encryption-envelope.js';
import { MENTIONED_USER_IDS_SHAPE } from '../../validation/mention-list.js';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { logger } from './messages-shared';

// `content` est optionnel : un message média-seul (image/vidéo/fichier sans
// légende) ou un forward arrive avec un contenu vide. Le `.refine()` final
// exige qu'au moins une source de contenu soit présente. Restaure le
// comportement du commit ee9a29db, perdu lors de la migration Zod (Phase 4).
export const SendMessageBodySchema = z.object({
  content: z
    .string()
    .max(
      MESSAGE_LIMITS.MAX_MESSAGE_LENGTH,
      `Le message ne peut pas dépasser ${MESSAGE_LIMITS.MAX_MESSAGE_LENGTH} caractères`,
    )
    .optional(),
  // Phase 4 §6.2 — `cid_<uuid v4 lowercase>` idempotency key. OPTIONAL:
  // only clients needing sync/dedup (app, web) send it. Scripts and
  // integrations may omit it; the message is then simply not deduped
  // (MessageProcessor persists clientMessageId as null). When provided it
  // must still be well-formed.
  clientMessageId: z
    .string()
    .regex(CLIENT_MESSAGE_ID_REGEX, 'Invalid clientMessageId format (expected cid_<uuid v4 lowercase>)')
    .optional(),
  originalLanguage: CommonSchemas.language.optional(),
  messageType: CommonSchemas.messageType.optional(),
  replyToId: z.string().optional(),
  storyReplyToId: z.string().optional(),
  forwardedFromId: z.string().optional(),
  forwardedFromConversationId: z.string().optional(),
  // Diffusion à plusieurs destinataires (PAS un transfert) : copie SERVEUR
  // des pièces jointes du message désigné vers celui-ci, mêmes fichiers,
  // sans `forwardedFromId` ni marque de transfert sur les copies. Voir
  // `services/messaging/copyAttachments.ts`.
  copyAttachmentsFromMessageId: z.string().optional(),
  // Enveloppe de chiffrement — déclarée dans `validation/encryption-envelope.ts`.
  // Elle vivait ICI, et ici seulement : le transport SOCKET, pourtant le chemin
  // d'envoi PRIMAIRE, n'en portait aucun champ et perdait donc tout chiffré.
  // Les deux transports lisent désormais la même déclaration.
  ...ENCRYPTION_ENVELOPE_SHAPE,
  // Même plafond que le schéma socket et que `MessageValidator` — ce tableau
  // n'était borné nulle part sur le chemin REST.
  attachmentIds: z.array(z.string()).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  isBlurred: z.boolean().optional(),
  expiresAt: z.string().optional(),
  effectFlags: z.number().int().optional(),
  isViewOnce: z.boolean().optional(),
  maxViewOnceCount: z.number().int().optional(),
  // Liste explicite de mentionnés — déclarée dans `validation/mention-list.ts`,
  // la MÊME que celle des deux schémas socket. Elle vivait ici seule ; le
  // transport SOCKET, qui porte le trafic, la strippait.
  ...MENTIONED_USER_IDS_SHAPE,
  // Lieu partagé — champ dédié, JAMAIS un `metadata` brut (cf.
  // services/location/sharedPlace.ts). Validation stricte déléguée à
  // `parseSharedPlace`, appelé côté `MessageProcessor.saveMessage`.
  location: z.unknown().optional(),
}).refine(
  (data) =>
    (data.content?.trim().length ?? 0) > 0 ||
    (data.attachmentIds?.length ?? 0) > 0 ||
    Boolean(data.forwardedFromId) ||
    Boolean(data.copyAttachmentsFromMessageId) ||
    Boolean(data.encryptedContent) ||
    Boolean(data.location),
  { message: 'Le message ne peut pas être vide', path: ['content'] },
).refine(noSilentDowngrade, NO_SILENT_DOWNGRADE_ISSUE);

/**
 * Enregistre la route d'envoi de message.
 */
export function registerSendMessageRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  getMessagingService: () => MessagingService,
  socketIOHandler: any
) {
  fastify.post<{
    Params: ConversationParams;
    Body: SendMessageBody;
  }>('/conversations/:id/messages', {
    schema: {
      description: 'Send a new message to a conversation with optional encryption and attachments. Unified handler using MessagingService.',
      tags: ['conversations', 'messages'],
      summary: 'Send message',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Message content' },
          clientMessageId: {
            type: 'string',
            description: 'Optional Phase 4 idempotency key, format cid_<uuid v4 lowercase>. Only clients needing dedup/sync send it.',
            pattern: '^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          },
          originalLanguage: { type: 'string', description: 'Language code (e.g., fr, en)', default: 'fr' },
          messageType: { type: 'string', enum: ['text', 'image', 'file', 'audio', 'video'], default: 'text' },
          replyToId: { type: 'string', description: 'ID of message being replied to' },
          storyReplyToId: { type: 'string', description: 'ID of story being replied to' },
          forwardedFromId: { type: 'string', description: 'ID of original forwarded message' },
          forwardedFromConversationId: { type: 'string', description: 'ID of source conversation for cross-conversation forwarding' },
          encryptedContent: {
            type: 'string',
            description: 'Ciphertext. Its presence is what makes the message encrypted — a body carrying only this field is a valid message.'
          },
          encryptionMode: {
            type: 'string',
            enum: ['e2ee', 'server', 'hybrid'],
            description: 'Encryption mode. Case-insensitive on input, normalised lowercase. Defaults to e2ee when encryptedContent is present.'
          },
          encryptionMetadata: { type: 'object', description: 'Encryption metadata' },
          isEncrypted: {
            type: 'boolean',
            description: 'Optional echo of the encryption fact. When true, encryptedContent is REQUIRED — the server never downgrades a message declared encrypted to plaintext.'
          },
          attachmentIds: { type: 'array', items: { type: 'string' }, maxItems: MAX_ATTACHMENTS_PER_MESSAGE, description: 'IDs des attachments pré-uploadés' },
          isBlurred: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time' },
          effectFlags: { type: 'integer', description: 'Bitfield for message effects' },
          mentionedUserIds: { type: 'array', items: { type: 'string' } },
          location: {
            type: 'object',
            additionalProperties: true,
            description: 'Lieu partagé (latitude, longitude, name?, address?, category?) — validé serveur',
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
            metadata: { type: 'object', additionalProperties: true }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return sendUnauthorized(reply, 'Authentification requise pour envoyer des messages');
      }

      const bodyResult = SendMessageBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return sendBadRequest(reply, 'Validation error', { message: bodyResult.error.message });
      }

      const { id } = request.params;
      const {
        content,
        clientMessageId,
        originalLanguage,
        messageType = 'text',
        replyToId,
        storyReplyToId,
        forwardedFromId,
        forwardedFromConversationId,
        copyAttachmentsFromMessageId,
        encryptedContent,
        encryptionMode,
        encryptionMetadata,
        attachmentIds,
        isBlurred,
        expiresAt,
        isViewOnce,
        maxViewOnceCount,
        mentionedUserIds,
        location
      } = bodyResult.data as SendMessageBody;

      // Resolve identifier (e.g. "meeshy") → ObjectId, same as GET route
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Compute effectFlags from legacy fields if not provided
      const { MESSAGE_EFFECT_FLAGS } = await import('@meeshy/shared/types/message-effect-flags');
      let effectFlags = (bodyResult.data as any).effectFlags ?? 0;
      if (isBlurred && !(effectFlags & MESSAGE_EFFECT_FLAGS.BLURRED)) effectFlags |= MESSAGE_EFFECT_FLAGS.BLURRED;
      if (expiresAt && !(effectFlags & MESSAGE_EFFECT_FLAGS.EPHEMERAL)) effectFlags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL;
      if (isViewOnce && !(effectFlags & MESSAGE_EFFECT_FLAGS.VIEW_ONCE)) effectFlags |= MESSAGE_EFFECT_FLAGS.VIEW_ONCE;

      const userId = authRequest.authContext.userId;
      let participantId: string;
      if (authRequest.authContext.isAnonymous) {
        participantId = authRequest.authContext.participantId!;
      } else {
        const participant = await prisma.participant.findFirst({
          where: { userId, conversationId, isActive: true },
          select: { id: true }
        });
        if (!participant) {
          return sendForbidden(reply, 'You are not a participant of this conversation');
        }
        participantId = participant.id;
      }

      if (!participantId) {
        return sendForbidden(reply, 'Participant identification failed');
      }

      // Block enforcement applies to DIRECT conversations only. Bidirectional:
      // reject if the sender blocked the other party OR the other party blocked
      // the sender. Anonymous senders (no userId) are not block-enforced.
      if (!authRequest.authContext.isAnonymous && userId) {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            type: true,
            participants: {
              where: { isActive: true },
              select: { userId: true }
            }
          }
        });
        if (conversation && (conversation.type === 'direct' || conversation.type === 'dm')) {
          const otherMemberIds = conversation.participants
            .map(p => p.userId)
            .filter((memberId): memberId is string => memberId !== null && memberId !== userId);
          for (const otherId of otherMemberIds) {
            if (await isBlockedBetween(prisma, userId, otherId)) {
              return sendForbidden(reply, ErrorMessages[ErrorCode.USER_BLOCKED].en, {
                code: ErrorCode.USER_BLOCKED
              });
            }
          }
        }
      }

      const corr: Record<string, any> = {
        clientMessageId,
        conversationId,
        participantId,
        route: 'POST /conversations/:id/messages'
      };
      const routeStart = Date.now();
      logger.info('perf:http.message.post', {
        ...corr, step: 'http.message.post', phase: 'start'
      });

      // MessagingService unifié — instance partagée construite une seule fois
      const messagingService = getMessagingService();

      const messageRequest = {
        conversationId,
        content: content || '',
        clientMessageId,
        originalLanguage,
        messageType,
        replyToId,
        forwardedFromId,
        forwardedFromConversationId,
        copyAttachmentsFromMessageId,
        mentionedUserIds,
        attachmentIds,
        isBlurred,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        effectFlags,
        isViewOnce,
        maxViewOnceCount,
        // Lieu partagé — champ dédié transmis tel quel ; validé et écrit
        // dans `metadata.location` par `MessageProcessor.saveMessage`.
        location,
        // Le FAIT du chiffrement, c'est la présence du chiffré — pas un booléen
        // posé à côté. Gater sur `isEncrypted` perdait dans les DEUX sens : un
        // chiffré sans le drapeau était jeté (alors que le `.refine()` ci-dessus
        // le compte comme porteur de contenu), et le drapeau sans le chiffré
        // faisait mentir le `!` puis écrivait le message EN CLAIR. Le schéma
        // refuse désormais le second cas ; ici on sert le premier.
        encryptedPayload: toEncryptedPayload({ encryptedContent, encryptionMode, encryptionMetadata }),
        metadata: {
          source: 'rest' as const,
          requestId: request.id
        }
      };

      const result = await messagingService.handleMessage(messageRequest, participantId);

      if (!result.success) {
        logger.info('perf:http.message.post', {
          ...corr, step: 'http.message.post', phase: 'end',
          durationMs: Date.now() - routeStart, success: false,
          error: result.error
        });
        return sendBadRequest(reply, result.error || 'Invalid message request');
      }

      // Broadcaster via socket (async) — SAUF sur un dedup idempotent.
      // Quand le même clientMessageId est renvoyé (ex: à la reconnexion, où
      // l'outbox SQLite ET le retry en mémoire drainent le même message), le
      // message existe déjà et a déjà été broadcasté au premier envoi. Re-broadcaster
      // `message:new` est ce qui dupliquait la bulle chez l'expéditeur (course
      // echo/reconcile) ET le récepteur. Le flag est posé in-process par
      // MessageProcessor.saveMessage (cf. §6.2 idempotence).
      if (socketIOHandler && result.data && !(result.data as { isDuplicate?: boolean }).isDuplicate) {
        const broadcastConvId = result.data.conversationId || conversationId;
        setImmediate(() => {
          socketIOHandler.broadcastMessage(result.data as any, broadcastConvId).catch((err: any) => {
            logger.error('⚠️ [REST] Socket broadcast failed', err);
          });
        });
      }

      logger.info('perf:http.message.post', {
        ...corr, step: 'http.message.post', phase: 'end',
        durationMs: Date.now() - routeStart, success: true,
        messageId: result.data?.id
      });

      return sendSuccess(reply, result.data);

    } catch (error) {
      logger.error('Error in REST send message:', error);
      return sendInternalError(reply, 'Erreur interne lors de l\'envoi du message');
    }
  });
}
