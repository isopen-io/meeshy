/**
 * La porte socket du TALKIE (#13935, D-4) : `talkie:start`, `talkie:send-chunk`,
 * `talkie:end`, `talkie:join` (#17142) et la fin d'une socket. Règles et raisons :
 * `services/talkie/`.
 *
 * Un compte INSCRIT seulement : un invité de lien n'a pas de cercle. Un relais par
 * processus, partagé par toutes les sockets de l'instance.
 *
 * Une voix réveillée vit sur l'instance de son ÉMETTEUR ; le destinataire réveillé peut
 * se connecter sur une autre. Un `talkie:join` qu'aucune session locale ne connaît est
 * donc relayé aux autres instances (`serverSideEmit`, adaptateur Redis) avec l'identité
 * AUTHENTIFIÉE par l'instance qui l'a reçu ; celle qui porte la voix la rejoue à la
 * socket nommée, que l'adaptateur atteint où qu'elle soit.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CLIENT_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { TALKIE_ERROR_CODES, talkieJoinPayloadSchema, type TalkieStartAck } from '@meeshy/shared/types/talkie';
import { z } from 'zod';
import { getCacheStore } from '../../services/CacheStore';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { judgeTalkie } from '../../services/talkie/talkieGate';
import { TalkieRelay } from '../../services/talkie/talkieRelay';
import { readTalkieCut, registerProcessTalkieRelay } from '../../services/talkie/talkieCut';
import { mostRecentSharedConversation } from '../../services/talkie/talkieFallback';
import { sendTalkieWake, talkieWakeChannel } from '../../services/talkie/talkiePush';
import { getPushNotificationService, type SendPushOptions } from '../../services/PushNotificationService';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter.js';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { ServerEmitIOWithRooms } from '../serverEmit';

const logger = enhancedLogger.child({ module: 'TalkieHandler' });

/** Trente prises de parole par minute et par compte : une conversation à la voix, jamais un tuyau. */
export const TALKIE_START_RATE = { max: 30, windowMs: 60_000, keyPrefix: 'talkie:start:u' } as const;

type TalkieSocket = {
  readonly id: string;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type TalkieCaller = { readonly userId: string; readonly isAnonymous: boolean } | null;

/** L'événement ENTRE instances qui relaie un `talkie:join` inconnu localement (jamais émis par un client). */
export const TALKIE_JOIN_RELAY = 'talkie:join-relay';
const joinRelaySchema = z.object({ socketId: z.string().min(1).max(64), userId: z.string().regex(/^[0-9a-fA-F]{24}$/), talkieId: talkieJoinPayloadSchema.shape.talkieId });
export type TalkieJoinRelay = z.infer<typeof joinRelaySchema>;

export type TalkieHandlerDeps = {
  readonly relay: TalkieRelay;
  readonly callerOf: (socketId: string) => TalkieCaller;
  /** Relaie aux AUTRES instances un join dont la voix n'est pas ici ; absent ⇒ instance unique. */
  readonly forwardJoin?: (join: TalkieJoinRelay) => void;
};

/** Ce que l'adaptateur de Socket.IO offre entre instances ; absent des doubles et sans adaptateur. */
type InterServer = {
  serverSideEmit(event: string, payload: TalkieJoinRelay): unknown;
  on(event: string, listener: (payload: unknown) => void): unknown;
};
const interServerOf = (io: object): InterServer | null =>
  'serverSideEmit' in io && typeof io.serverSideEmit === 'function' && 'on' in io && typeof io.on === 'function' ? (io as InterServer) : null;

const NOT_ALLOWED: TalkieStartAck = { success: false, error: 'Talkie indisponible', code: TALKIE_ERROR_CODES.NOT_ALLOWED };

export function listenTalkie(socket: TalkieSocket, deps: TalkieHandlerDeps): void {
  const registered = (): string | null => {
    const caller = deps.callerOf(socket.id);
    return caller && !caller.isAnonymous ? caller.userId : null;
  };

  socket.on(CLIENT_EVENTS.TALKIE_START, (data: unknown, ack?: unknown) => {
    const reply = typeof ack === 'function' ? (ack as (r: TalkieStartAck) => void) : () => undefined;
    const userId = registered();
    if (!userId) return reply(NOT_ALLOWED);
    deps.relay.start(socket.id, userId, data).then(reply, (error: unknown) => {
      logger.error('[TALKIE_START] Error', { error });
      reply({ success: false, error: 'Talkie momentanément indisponible', code: TALKIE_ERROR_CODES.UNAVAILABLE });
    });
  });

  socket.on(CLIENT_EVENTS.TALKIE_SEND_CHUNK, (data: unknown) => {
    const userId = registered();
    if (!userId) return;
    deps.relay.chunk(socket.id, userId, data).catch((error: unknown) => logger.error('[TALKIE_CHUNK] Error', { error }));
  });

  socket.on(CLIENT_EVENTS.TALKIE_END, (data: unknown) => {
    const userId = registered();
    if (userId) deps.relay.end(socket.id, userId, data);
  });

  socket.on(CLIENT_EVENTS.TALKIE_JOIN, (data: unknown) => {
    const userId = registered();
    if (!userId) return;
    deps.relay
      .join(socket.id, userId, data)
      .then((outcome) => {
        const parsed = talkieJoinPayloadSchema.safeParse(data);
        if (outcome === 'unknown' && parsed.success) deps.forwardJoin?.({ socketId: socket.id, userId, talkieId: parsed.data.talkieId });
      })
      .catch((error: unknown) => logger.error('[TALKIE_JOIN] Error', { error }));
  });

  socket.on('disconnect', () => deps.relay.socketGone(socket.id));
}

const relays = new WeakMap<object, TalkieRelay>();

/** Le relais du processus, créé une fois pour un `io` et enregistré pour la coupure (`talkieCut.ts`). */
export function talkieHandlerDeps(params: {
  readonly prisma: PrismaClient;
  readonly io: ServerEmitIOWithRooms;
  readonly socketToUser: ReadonlyMap<string, string>;
  readonly connectedUsers: ReadonlyMap<string, { readonly isAnonymous: boolean }>;
}): TalkieHandlerDeps {
  const existing = relays.get(params.io);
  const relay = existing ?? createRelay(params);
  const interServer = interServerOf(params.io);
  if (!existing) {
    relays.set(params.io, relay);
    registerProcessTalkieRelay(relay);
    interServer?.on(TALKIE_JOIN_RELAY, (payload) => {
      const join = joinRelaySchema.safeParse(payload);
      if (!join.success) return;
      relay.join(join.data.socketId, join.data.userId, { talkieId: join.data.talkieId }).catch((error: unknown) => logger.error('[TALKIE_JOIN] Relay error', { error }));
    });
  }
  return {
    relay,
    ...(interServer
      ? {
          forwardJoin: (join: TalkieJoinRelay) => {
            try {
              interServer.serverSideEmit(TALKIE_JOIN_RELAY, join);
            } catch (error) {
              logger.debug('[TALKIE_JOIN] No inter-server channel', { error });
            }
          },
        }
      : {}),
    callerOf: (socketId) => {
      const userId = params.socketToUser.get(socketId);
      const user = userId ? params.connectedUsers.get(userId) : undefined;
      return userId && user ? { userId, isAnonymous: user.isAnonymous } : null;
    },
  };
}

function createRelay(params: { readonly prisma: PrismaClient; readonly io: ServerEmitIOWithRooms }): TalkieRelay {
  // Le limiteur Redis partagé (jamais `socket-rate-limiter`, en mémoire par processus) suit le
  // client Redis du moment : un limiteur né sans Redis ne reste pas en mémoire pour la vie du processus.
  let limiter: { readonly client: unknown; readonly limiter: RateLimiter } | null = null;
  const startLimiter = (): RateLimiter => {
    const client = getCacheStore().getNativeClient();
    if (!limiter || limiter.client !== client) {
      limiter = { client, limiter: createCustomRateLimiter({ ...TALKIE_START_RATE }, client ?? undefined) };
    }
    return limiter.limiter;
  };
  const presence = getPresenceVisibilityService(params.prisma);
  const wakeDeps = {
    prisma: params.prisma,
    push: { sendToUser: (options: SendPushOptions) => getPushNotificationService(params.prisma).sendToUser(options) },
    now: () => new Date(),
  };
  return new TalkieRelay({
    io: params.io,
    wake: (wake) => sendTalkieWake(wakeDeps, { ...wake, phase: 'live' }),
    followUp: ({ availableUntil, bytes, durationMs, ...pair }) => sendTalkieWake(wakeDeps, { ...pair, phase: 'ended', availableUntil, bytes, durationMs }),
    fallbackConversation: (fromUserId, toUserId) => mostRecentSharedConversation(params.prisma, fromUserId, toUserId),
    trace: (event, fields) => logger.info(event, fields),
    judge: async (fromUserId, toUserId) => {
      const verdict = await judgeTalkie(
        {
          prisma: params.prisma,
          now: () => new Date(),
          recipientConnected: async (userId) => (await params.io.in(ROOMS.user(userId)).fetchSockets()).length > 0,
          presenceServed: async (viewer, targetId) =>
            (await presence.resolveForTarget({ userId: viewer.userId, role: viewer.role as GlobalUserRoleType }, { id: targetId })).showOnline,
          wakeChannel: (userId) => talkieWakeChannel(params.prisma, userId),
        },
        fromUserId,
        toUserId,
      );
      if (verdict.ok === false) logger.info('[TALKIE_REFUSED]', { code: verdict.code, cause: verdict.cause, fromUserId, toUserId });
      return verdict;
    },
    withinStartRate: async (userId) => {
      const info = await startLimiter().consume(userId, 1);
      return info === null ? null : info.retryAfter === undefined;
    },
    cutAt: (fromUserId, toUserId) => readTalkieCut(getCacheStore(), fromUserId, toUserId, { requireShared: Boolean(process.env.REDIS_URL) }),
    now: () => Date.now(),
    report: (message, error) => logger.warn(message, { error }),
  });
}
