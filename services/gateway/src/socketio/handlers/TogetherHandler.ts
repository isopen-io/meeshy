/**
 * La porte socket de la séance « ENSEMBLE » (#17011, #17012) : `together:invite`,
 * `together:join`, `together:sync`, `together:leave`. Règles et état : `services/together/`.
 *
 * Un compte INSCRIT seulement : un invité de lien n'a pas de cercle. L'identité est celle
 * de la socket, jamais un champ de la charge. Le débit est borné par un limiteur Redis
 * partagé (lecture, pause, déplacement : des gestes, jamais un flux) ; quitter n'est jamais
 * limité. Le journal ne porte jamais la séance : seulement l'erreur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { TOGETHER_ERROR_CODES, type TogetherErrorCode } from '@meeshy/shared/types/together';
import { getCacheStore } from '../../services/CacheStore';
import { inviteTogether, joinTogether, leaveTogether, syncTogether, type TogetherIo } from '../../services/together/togetherRelay';
import { togetherRelayDepsOf } from '../../services/together/togetherDeps';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter.js';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'TogetherHandler' });

/** Soixante gestes par minute et par compte : on lit, on met en pause, on se déplace. */
export const TOGETHER_RATE = { max: 60, windowMs: 60_000, keyPrefix: 'together:u' } as const;

type TogetherSocket = {
  readonly id: string;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

type Relayed = (userId: string, data: unknown) => Promise<unknown>;

export type TogetherHandlerDeps = {
  readonly callerOf: (socketId: string) => { readonly userId: string; readonly isAnonymous: boolean } | null;
  /** `true` dans le débit, `false` au-delà, `null` quand le limiteur ne sait pas juger (on laisse passer). */
  readonly withinRate: (userId: string) => Promise<boolean | null>;
  readonly invite: Relayed;
  readonly join: Relayed;
  readonly sync: Relayed;
  readonly leave: Relayed;
};

const refusal = (code: TogetherErrorCode, error: string) => ({ success: false, error, code }) as const;
const NOT_ALLOWED = refusal(TOGETHER_ERROR_CODES.NOT_ALLOWED, 'Lecture ensemble indisponible');
const RATE_LIMITED = refusal(TOGETHER_ERROR_CODES.RATE_LIMITED, 'Trop de gestes');
const UNAVAILABLE = refusal(TOGETHER_ERROR_CODES.UNAVAILABLE, 'Lecture ensemble momentanément indisponible');

const replier = (ack: unknown): ((response: unknown) => void) => (typeof ack === 'function' ? (ack as (r: unknown) => void) : () => undefined);

export function listenTogether(socket: TogetherSocket, deps: TogetherHandlerDeps): void {
  const registered = (): string | null => {
    const caller = deps.callerOf(socket.id);
    return caller && !caller.isAnonymous ? caller.userId : null;
  };

  const route = (event: string, relayed: Relayed, limited: boolean): void => {
    socket.on(event, (data: unknown, ack?: unknown) => {
      const reply = replier(ack);
      const userId = registered();
      if (!userId) return reply(NOT_ALLOWED);
      const within = limited ? deps.withinRate(userId) : Promise.resolve(true);
      within
        .then((ok) => (ok === false ? RATE_LIMITED : relayed(userId, data)))
        .then(reply, (error: unknown) => {
          logger.error(`[${event}] Error`, { error: error instanceof Error ? error.message : 'unknown' });
          reply(UNAVAILABLE);
        });
    });
  };

  route(CLIENT_EVENTS.TOGETHER_INVITE, deps.invite, true);
  route(CLIENT_EVENTS.TOGETHER_JOIN, deps.join, true);
  route(CLIENT_EVENTS.TOGETHER_SYNC, deps.sync, true);
  route(CLIENT_EVENTS.TOGETHER_LEAVE, deps.leave, false);
}

let limiter: { readonly client: unknown; readonly limiter: RateLimiter } | null = null;

/** Le limiteur suit le client Redis du moment, comme celui du talkie (`TalkieHandler.ts`). */
const rateLimiter = (): RateLimiter => {
  const client = getCacheStore().getNativeClient();
  if (!limiter || limiter.client !== client) {
    limiter = { client, limiter: createCustomRateLimiter({ ...TOGETHER_RATE }, client ?? undefined) };
  }
  return limiter.limiter;
};

export function togetherHandlerDeps(params: {
  readonly prisma: PrismaClient;
  readonly io: TogetherIo;
  readonly socketToUser: ReadonlyMap<string, string>;
  readonly connectedUsers: ReadonlyMap<string, { readonly isAnonymous: boolean }>;
}): TogetherHandlerDeps {
  const relay = togetherRelayDepsOf(params);
  return {
    callerOf: (socketId) => {
      const userId = params.socketToUser.get(socketId);
      const user = userId ? params.connectedUsers.get(userId) : undefined;
      return userId && user ? { userId, isAnonymous: user.isAnonymous } : null;
    },
    withinRate: async (userId) => {
      const info = await rateLimiter().consume(userId, 1);
      return info === null ? null : info.retryAfter === undefined;
    },
    invite: (userId, data) => inviteTogether(relay, userId, data),
    join: (userId, data) => joinTogether(relay, userId, data),
    sync: (userId, data) => syncTogether(relay, userId, data),
    leave: (userId, data) => leaveTogether(relay, userId, data),
  };
}
