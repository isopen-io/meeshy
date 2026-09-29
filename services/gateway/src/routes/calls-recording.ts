import type { FastifyInstance } from 'fastify';
import type { UnifiedAuthRequest } from '../middleware/auth.js';
import { createValidationMiddleware } from '../middleware/validation.js';
import { ROUTE_RATE_LIMITS } from '../middleware/rate-limit.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import type { CallRecordingLinkBody } from '@meeshy/shared/types/call-recording';
import { callRecordingLinkSchema } from '../validation/call-recording-schemas.js';
import { linkCallRecording, type CallSummaryMessage } from '../services/calls/callRecordingLink.js';
import { notifyCallRecordingReady } from '../services/notifications/call-recording-ready.js';
import type { NotificationService } from '../services/notifications/NotificationService.js';
import { logger } from '../utils/logger.js';
import { sendError, sendSuccess } from '../utils/response.js';
import type { CallRouteDeps } from './calls-shared';

type RecordingParams = { callId: string; recordingId: string };

export type CallRecordingRouteDeps = CallRouteDeps & {
  readonly broadcastEdited?: (message: CallSummaryMessage, conversationId: string) => Promise<void>;
  readonly notifications?: Pick<NotificationService, 'createNotification'>;
  readonly now?: () => Date;
};

const objectIdParam = { type: 'string', pattern: OBJECT_ID_PATTERN } as const;

export function registerCallsRecordingRoutes(fastify: FastifyInstance, deps: CallRecordingRouteDeps): void {
  const { prisma, requiredAuth } = deps;

  fastify.post<{ Params: RecordingParams; Body: CallRecordingLinkBody }>(
    '/calls/:callId/recordings/:recordingId/attachment',
    {
      preValidation: [requiredAuth, createValidationMiddleware(callRecordingLinkSchema)],
      ...ROUTE_RATE_LIMITS.callOperations,
      schema: {
        description:
          'Attach the uploaded audio (or video, for a video recording) file of a consented call recording to the call bubble. Only the participant who recorded it may link it, once, with an audio attachment they uploaded themselves.',
        tags: ['calls'],
        summary: 'Link a call recording to its call bubble',
        params: {
          type: 'object',
          required: ['callId', 'recordingId'],
          properties: { callId: objectIdParam, recordingId: objectIdParam },
        },
        body: {
          type: 'object',
          required: ['attachmentId'],
          properties: { attachmentId: objectIdParam },
        },
        response: {
          200: {
            description: 'Recording linked to the call bubble',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  recordingId: { type: 'string' },
                  messageId: { type: 'string' },
                  attachmentId: { type: 'string' },
                  kind: { type: 'string', enum: ['audio', 'video'] },
                },
              },
            },
          },
          400: { description: 'Invalid identifiers', ...errorResponseSchema },
          401: { description: 'Authentication required', ...errorResponseSchema },
          403: { description: 'Only the recorder may link the file', ...errorResponseSchema },
          404: { description: 'Recording or attachment not found', ...errorResponseSchema },
          409: { description: 'Already linked, never started, or no call bubble', ...errorResponseSchema },
          415: { description: 'The attachment is not the consented media (audio, or video for a video recording)', ...errorResponseSchema },
          500: { description: 'Internal server error', ...errorResponseSchema },
        },
      },
    },
    async (request, reply) => {
      try {
        const auth = (request as UnifiedAuthRequest).authContext;
        const userId = auth?.type === 'anonymous' ? undefined : auth?.userId;
        if (!userId) return sendError(reply, 401, 'UNAUTHORIZED', { code: 'UNAUTHORIZED' });
        const { callId, recordingId } = request.params;
        const { attachmentId } = request.body;

        const result = await linkCallRecording(
          prisma,
          { userId, callId, recordingId, attachmentId },
          (deps.now ?? (() => new Date()))(),
        );
        if (result.kind === 'refused') {
          return sendError(reply, result.status, result.code, { code: result.code });
        }

        const broadcast = deps.broadcastEdited ?? ((message, conversationId) =>
          fastify.socketIOHandler?.getManager()?.broadcastMessageEdited(message as never, conversationId) ?? Promise.resolve());
        broadcast(result.message, result.conversationId).catch((error: unknown) =>
          logger.error('call-recording: bubble broadcast failed', { callId, error }));

        const notifications = deps.notifications ?? fastify.notificationService;
        if (notifications) {
          notifyCallRecordingReady(
            { prisma, notifications },
            {
              recorderId: userId,
              recipientUserIds: result.consentedUserIds,
              conversationId: result.conversationId,
              callSessionId: callId,
              messageId: result.message.id,
              kind: result.mediaKind,
            },
          ).catch((error: unknown) => logger.error('call-recording: notification failed', { callId, error }));
        }

        return sendSuccess(reply, { recordingId, messageId: result.message.id, attachmentId, kind: result.recordingKind });
      } catch (error) {
        logger.error('call-recording: link failed', { error });
        return sendError(reply, 500, 'INTERNAL_ERROR');
      }
    },
  );
}
