/**
 * La porte socket du TALKIE (#13935, D-4) : `talkie:start`, `talkie:send-chunk`,
 * `talkie:end`, et la fin d'une socket. Règles et raisons : `services/talkie/`.
 *
 * Un compte INSCRIT seulement : un invité de lien n'a pas de cercle. Un relais par
 * processus, partagé par toutes les sockets de l'instance.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CLIENT_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { TALKIE_ERROR_CODES, type TalkieStartAck } from '@meeshy/shared/types/talkie';
import { getCacheStore } from '../../services/CacheStore';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';
import { judgeTalkie } from '../../services/talkie/talkieGate';
import { TalkieRelay } from '../../services/talkie/talkieRelay';
import { readTalkieCut, registerProcessTalkieRelay } from '../../services/talkie/talkieCut';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter.js';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { ServerEmitIOWithRooms } from '../serverEmit';

const logger = enhancedLogger.child({ module: 'TalkieHandler' });

/**
 * La voix scellée (#13949) n'est acceptée que sur `TALKIE_SEALED_VOICE_ENABLED=true`, lu à chaque ouverture.
 * Éteinte par défaut : elle ne s'allume qu'une fois des clients capables de la déchiffrer ET de refuser une voix
 * de paire chiffrée non scellée publiés, le plancher de version posé, et la conception auditée.
 */
export const talkieSealedVoiceEnabled = (): boolean => process.env.TALKIE_SEALED_VOICE_ENABLED === 'true';

/** Trente prises de parole par minute et par compte : une conversation à la voix, jamais un tuyau. */
export const TALKIE_START_RATE = { max: 30, windowMs: 60_000, keyPrefix: 'talkie:start:u' } as const;

type TalkieSocket = {
  readonly id: string;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type TalkieCaller = { readonly userId: string; readonly isAnonymous: boolean } | null;

export type TalkieHandlerDeps = {
  readonly relay: TalkieRelay;
  readonly callerOf: (socketId: string) => TalkieCaller;
};

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
  if (!existing) {
    relays.set(params.io, relay);
    registerProcessTalkieRelay(relay);
  }
  return {
    relay,
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
  return new TalkieRelay({
    io: params.io,
    judge: async (fromUserId, toUserId, sealed) => {
      const verdict = await judgeTalkie(
        {
          prisma: params.prisma,
          now: () => new Date(),
          recipientConnected: async (userId) => (await params.io.in(ROOMS.user(userId)).fetchSockets()).length > 0,
          presenceServed: async (viewer, targetId) =>
            (await presence.resolveForTarget({ userId: viewer.userId, role: viewer.role as GlobalUserRoleType }, { id: targetId })).showOnline,
        },
        fromUserId,
        toUserId,
        { sealed },
      );
      if (verdict.ok === false) logger.info('[TALKIE_REFUSED]', { code: verdict.code, cause: verdict.cause, fromUserId, toUserId });
      return verdict;
    },
    sealedVoiceAccepted: talkieSealedVoiceEnabled,
    withinStartRate: async (userId) => {
      const info = await startLimiter().consume(userId, 1);
      return info === null ? null : info.retryAfter === undefined;
    },
    cutAt: (fromUserId, toUserId) => readTalkieCut(getCacheStore(), fromUserId, toUserId, { requireShared: Boolean(process.env.REDIS_URL) }),
    now: () => Date.now(),
    report: (message, error) => logger.warn(message, { error }),
  });
}
