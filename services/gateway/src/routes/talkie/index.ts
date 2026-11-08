import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { currentSessionOf } from '../../services/auth/current-session';
import { processTalkieRelay } from '../../services/talkie/talkieCut';
import { verifyTalkieAudioToken } from '../../services/talkie/talkieAudioToken';
import { TALKIE_AUDIO_MIME } from '../../services/talkie/talkiePush';
import type { TalkieRelay } from '../../services/talkie/talkieRelay';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess, sendUnauthorized } from '../../utils/response';
import { retireSurplusTokens } from '../push-tokens';

type AudioQuery = { readonly e?: string; readonly t?: string };
type AudioRequest = FastifyRequest<{ Params: { talkieId: string }; Querystring: AudioQuery }>;

const TALKIE_ID = /^[0-9a-f]{24}$/;

const pushToTalkTokenSchema = z.object({
  token: z.string().min(10).max(500),
  apnsEnvironment: z.enum(['development', 'production']).optional(),
  bundleId: z.string().max(255).optional(),
  deviceId: z.string().max(255).optional(),
  deviceName: z.string().max(100).optional(),
  appVersion: z.string().max(50).optional(),
});
const pushToTalkUnregisterSchema = z.object({ token: z.string().min(10).max(500).optional() });

const hasCapability = (request: AudioRequest): boolean => typeof request.query.t === 'string' && request.query.t !== '';

const registeredUserOf = (request: FastifyRequest): string | null => {
  const auth = (request as UnifiedAuthRequest).authContext;
  return auth?.isAuthenticated && auth.registeredUser ? auth.userId : null;
};

/**
 * Qui lit : le porteur d'une capacité signée pour CE destinataire (l'extension de notification), ou le
 * destinataire authentifié. La garde du `talkie:join` suit dans le relais. `null` : personne.
 */
function readerOf(request: AudioRequest, talkieId: string, relay: TalkieRelay): string | null {
  if (!hasCapability(request)) return registeredUserOf(request);
  const toUserId = relay.recipientOf(talkieId);
  if (toUserId === null) return null;
  const valid = verifyTalkieAudioToken({ talkieId, toUserId, expiresAt: request.query.e, token: request.query.t, now: new Date() });
  return valid ? toUserId : null;
}

/**
 * Le talkie réveillé (#17142) :
 * - `GET /talkie/:talkieId/audio` — la voix gardée en mémoire, fragments ADTS concaténés (`audio/aac`), pendant la
 *   prise de parole et `TALKIE_JOIN_WINDOW_MS` après. Le destinataire seul (capacité signée du push, ou jeton de
 *   session), même garde que `talkie:join`. Rien n'est persisté : passé la fenêtre, 404.
 * - `POST /users/me/push-to-talk-token` / `DELETE` — le jeton PushToTalk iOS (`PushToken.type = 'pushtotalk'`).
 */
export async function talkieRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { talkieId: string }; Querystring: AudioQuery }>('/talkie/:talkieId/audio', {
    onRequest: [async (request: AudioRequest, reply: FastifyReply) => {
      if (!hasCapability(request)) await fastify.authenticate(request, reply);
    }],
    schema: {
      description: 'The kept voice of a waking talkie, concatenated ADTS frames (audio/aac): recipient only (signed capability from the push, or bearer), during the talk and 60 s after. 404 otherwise, whatever the reason.',
      tags: ['talkie'],
      summary: 'Waking talkie audio',
      params: { type: 'object', required: ['talkieId'], properties: { talkieId: { type: 'string', maxLength: 24 } } },
      querystring: { type: 'object', properties: { e: { type: 'string', maxLength: 16 }, t: { type: 'string', maxLength: 64 } } },
      response: { 401: errorResponseSchema, 404: errorResponseSchema, 500: errorResponseSchema },
    },
  }, async (request: AudioRequest, reply: FastifyReply) => {
    try {
      const relay = processTalkieRelay();
      const talkieId = request.params.talkieId.toLowerCase();
      if (!relay || !TALKIE_ID.test(talkieId)) return sendNotFound(reply, 'Talkie introuvable');
      const reader = readerOf(request, talkieId, relay);
      if (reader === null) return sendNotFound(reply, 'Talkie introuvable');
      const audio = await relay.audioFor(talkieId, reader);
      if (audio.ok === false) return sendNotFound(reply, 'Talkie introuvable');
      return reply
        .header('Content-Type', TALKIE_AUDIO_MIME)
        .header('Cache-Control', 'no-store, private')
        .header('Content-Length', String(audio.data.byteLength))
        .send(Buffer.from(audio.data.buffer, audio.data.byteOffset, audio.data.byteLength));
    } catch (error) {
      logError(fastify.log, '[TALKIE_AUDIO] Error', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.post('/users/me/push-to-talk-token', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Register the iOS PushToTalk token (PTChannelManager) of this device: a talkie to me while I have no socket wakes it with an APNs pushtotalk push.',
      tags: ['users', 'push-notifications', 'talkie'],
      summary: 'Register PushToTalk token',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 10, maxLength: 500 },
          apnsEnvironment: { type: 'string', enum: ['development', 'production'] },
          bundleId: { type: 'string', maxLength: 255 },
          deviceId: { type: 'string', maxLength: 255 },
          deviceName: { type: 'string', maxLength: 100 },
          appVersion: { type: 'string', maxLength: 50 },
        },
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string' } } } } },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = registeredUserOf(request);
    if (!userId) return sendUnauthorized(reply, 'Authentication required');
    const parsed = pushToTalkTokenSchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Invalid request data');
    const body = parsed.data;
    try {
      const registeredAt = new Date();
      await fastify.prisma.pushToken.deleteMany({
        where: { token: body.token, type: 'pushtotalk', userId: { not: userId } },
      });
      const fields = {
        platform: 'ios',
        deviceId: body.deviceId,
        deviceName: body.deviceName,
        appVersion: body.appVersion,
        bundleId: body.bundleId,
        apnsEnvironment: body.apnsEnvironment ?? 'production',
        isActive: true,
        registeredAt,
        sessionId: currentSessionOf(request).sessionId,
      };
      const saved = await fastify.prisma.pushToken.upsert({
        where: { userId_token_type: { userId, token: body.token, type: 'pushtotalk' } },
        update: { ...fields, failedAttempts: 0, lastError: null },
        create: { userId, token: body.token, type: 'pushtotalk', ...fields },
        select: { id: true, type: true },
      });
      if (body.deviceId) {
        await fastify.prisma.pushToken.updateMany({
          where: { isActive: true, id: { not: saved.id }, userId, deviceId: body.deviceId, type: 'pushtotalk' },
          data: { isActive: false },
        });
      }
      await retireSurplusTokens(fastify, { userId, type: 'pushtotalk', keepId: saved.id });
      return sendSuccess(reply, { id: saved.id, type: saved.type });
    } catch (error) {
      logError(fastify.log, '[PUSH_TO_TALK_TOKEN] Error registering', error);
      return sendInternalError(reply, 'Failed to register PushToTalk token');
    }
  });

  fastify.delete('/users/me/push-to-talk-token', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Unregister my PushToTalk token (one token, or all of mine when no token is given).',
      tags: ['users', 'push-notifications', 'talkie'],
      summary: 'Unregister PushToTalk token',
      body: { type: 'object', properties: { token: { type: 'string', minLength: 10, maxLength: 500 } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { deletedCount: { type: 'number' } } } } },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = registeredUserOf(request);
    if (!userId) return sendUnauthorized(reply, 'Authentication required');
    const parsed = pushToTalkUnregisterSchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendBadRequest(reply, 'Invalid request data');
    try {
      const result = await fastify.prisma.pushToken.deleteMany({
        where: { userId, type: 'pushtotalk', ...(parsed.data.token ? { token: parsed.data.token } : {}) },
      });
      return sendSuccess(reply, { deletedCount: result.count });
    } catch (error) {
      logError(fastify.log, '[PUSH_TO_TALK_TOKEN] Error unregistering', error);
      return sendInternalError(reply, 'Failed to unregister PushToTalk token');
    }
  });
}
