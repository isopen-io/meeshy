import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BRING_RING_WINDOW_MS } from '@meeshy/shared/types/bring';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { getCacheStore } from '../../services/CacheStore';
import { getPushNotificationService } from '../../services/PushNotificationService';
import { bringAvailability, sendBring, stopBring, stopBringsOnBlock, type BringDeps, type BringOutcome, type BringQuota } from '../../services/bring/bringService';
import { bringServiceEnabled, criticalAlertsGranted } from '../../services/bring/bringPush';
import { thresholdsNow } from '../../services/relations/relationRequestGate';
import { relationIoOf } from '../../socketio/relationEvents';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter.js';
import { logError } from '../../utils/logger';
import { sendInternalError, sendSuccess } from '../../utils/response';
import { errorResponses, otherUserOf, relationLimiter, sendCoded, userIdParams } from '../relations/shared';

/**
 * Le jour calendaire le plus long (changement d'heure) plus une marge : la clé du
 * compteur porte le JOUR du destinataire, la durée de vie ne sert qu'à l'effacer.
 */
const QUOTA_WINDOW_MS = 26 * 3_600_000;

/**
 * Un limiteur par plafond (1, 3, 30…), tous sur le MÊME préfixe : le compteur d'une
 * paire et d'un jour est unique, seul le plafond qui le juge suit le niveau du moment.
 */
export function bringQuotaOf(fastify: { redis?: unknown }): BringQuota {
  const limiters = new Map<number, RateLimiter>();
  const limiterFor = (perDay: number): RateLimiter => {
    const existing = limiters.get(perDay);
    if (existing) return existing;
    const created = createCustomRateLimiter(
      { max: perDay, windowMs: QUOTA_WINDOW_MS, keyPrefix: 'bring:day' },
      (fastify.redis ?? undefined) as never,
    );
    limiters.set(perDay, created);
    return created;
  };
  return {
    consume: async (perDay, key, cost) => {
      const info = await limiterFor(perDay).consume(key, cost);
      return info === null ? null : { remaining: info.remaining, exceeded: info.retryAfter !== undefined };
    },
    release: (perDay, key) => limiterFor(perDay).release(key, 1),
  };
}

export function bringDepsOf(fastify: FastifyInstance, quota: BringQuota): BringDeps {
  return {
    prisma: fastify.prisma,
    cache: getCacheStore(),
    quota,
    thresholds: thresholdsNow(),
    io: relationIoOf(fastify),
    push: getPushNotificationService(fastify.prisma),
    now: () => new Date(),
    criticalAlerts: criticalAlertsGranted(),
    enabled: bringServiceEnabled(),
    report: (message, error) => logError(fastify.log, message, error),
  };
}

const reply$ = <T>(reply: FastifyReply, outcome: BringOutcome<T>) =>
  outcome.ok === true ? sendSuccess(reply, outcome.data, { statusCode: outcome.status }) : sendCoded(reply, outcome.status, outcome.message, outcome.code);

const availabilitySchema = {
  type: 'object',
  properties: {
    userId: { type: 'string' },
    available: { type: 'boolean' },
    perDay: { type: 'number', nullable: true },
    remainingToday: { type: 'number', nullable: true },
    resetsAt: { type: 'string' },
  },
} as const;

const sentSchema = {
  type: 'object',
  properties: {
    bringId: { type: 'string' },
    toUserId: { type: 'string' },
    sentAt: { type: 'string' },
    expiresAt: { type: 'string' },
    perDay: { type: 'number', nullable: true },
    remainingToday: { type: 'number', nullable: true },
  },
} as const;

const envelope = (data: object) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;

const bringIdParams = {
  type: 'object',
  required: ['bringId'],
  properties: { bringId: { type: 'string', maxLength: 64 } },
} as const;

/**
 * `/bring` — faire sonner le téléphone d'un Ami, d'un Proche ou d'un Sang, pour
 * l'urgence extrême (#13936, D-3). Contrat : `@meeshy/shared/types/bring`. Règles
 * et raisons : `services/bring/bringService.ts`.
 */
export async function bringRoutes(fastify: FastifyInstance): Promise<void> {
  const quota = bringQuotaOf(fastify);
  const deps = () => bringDepsOf(fastify, quota);
  // Le QUOTA du jour borne les sonneries ; ces seaux ne bornent que le débit des requêtes
  // (un Sang a droit à trente Brings par jour, chacun suivi de son arrêt).
  const reads = relationLimiter(fastify, 'bring:read:u', 120);
  const sends = relationLimiter(fastify, 'bring:send:u', 60);
  const stops = relationLimiter(fastify, 'bring:stop:u', 120);

  fastify.get<{ Params: { userId: string } }>('/:userId', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, reads.middleware()],
    schema: {
      description: 'Can I Bring this person, and how many are left today? available:false hides the button, without saying why.',
      tags: ['bring'],
      summary: 'Bring availability',
      params: userIdParams,
      response: { 200: envelope(availabilitySchema), ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const otherId = otherUserOf(request, reply);
      if (otherId === null) return reply;
      return sendSuccess(reply, await bringAvailability(deps(), request.user!.userId, otherId.toLowerCase()));
    } catch (error) {
      logError(fastify.log, 'Bring availability error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.post<{ Params: { userId: string } }>('/:userId', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, sends.middleware()],
    schema: {
      description: `Ring this person's phone for an extreme emergency (through Do Not Disturb). Open from Friend, a daily quota per pair, refused with the same BRING_NOT_ALLOWED whether the link is too low, my Bring is blocked or their reception is off. Rings for ${BRING_RING_WINDOW_MS / 1000} s at most.`,
      tags: ['bring'],
      summary: 'Send a Bring',
      params: userIdParams,
      response: { 200: envelope(sentSchema), 201: envelope(sentSchema), 403: errorResponseSchema, 503: errorResponseSchema, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const otherId = otherUserOf(request, reply);
      if (otherId === null) return reply;
      return reply$(reply, await sendBring(deps(), request.user!.userId, otherId.toLowerCase()));
    } catch (error) {
      logError(fastify.log, 'Send Bring error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.delete<{ Params: { bringId: string } }>('/:bringId', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, stops.middleware()],
    schema: {
      description: 'Stop a Bring: the recipient (one gesture) or the sender (cancel). Stops every device of the recipient.',
      tags: ['bring'],
      summary: 'Stop a Bring',
      params: bringIdParams,
      response: {
        200: envelope({ type: 'object', properties: { bringId: { type: 'string' }, stopped: { type: 'boolean' } } }),
        403: errorResponseSchema,
        ...errorResponses,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { bringId: string } }>, reply: FastifyReply) => {
    try {
      return reply$(reply, await stopBring(deps(), request.user!.userId, request.params.bringId.toLowerCase()));
    } catch (error) {
      logError(fastify.log, 'Stop Bring error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}

/**
 * Un blocage utilisateur vient d'être posé (`routes/directory/blocks.ts`) : les
 * Brings en vol entre les deux s'arrêtent chez leur destinataire, sans rien
 * apprendre au bloqué. Best-effort : le blocage est déjà écrit.
 */
export function stopBringsAfterUserBlock(fastify: FastifyInstance, blockerId: string, blockedId: string): void {
  const stop = async () => stopBringsOnBlock(bringDepsOf(fastify, bringQuotaOf(fastify)), { blockerId, blockedId, scope: 'user' });
  stop().catch((error: unknown) => logError(fastify.log, 'Bring not stopped after block:', error));
}
