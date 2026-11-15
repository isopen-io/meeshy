/**
 * La porte socket de l'ÉCOUTE PARTAGÉE (#13934, #16686) : `now-playing:update` et
 * `now-playing:clear`. Règles et projection : `services/nowPlaying/`.
 *
 * Un compte INSCRIT seulement : un invité de lien n'a pas de cercle. Le débit est borné
 * par un limiteur Redis partagé : un changement de morceau, jamais un flux. Le journal
 * ne porte jamais la charge (titre, origine) : seulement l'erreur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { NOW_PLAYING_ERROR_CODES, type NowPlayingAck, type NowPlayingClearAck } from '@meeshy/shared/types/now-playing';
import { getCacheStore } from '../../services/CacheStore';
import { clearNowPlayingOf, publishNowPlaying, type NowPlayingIo, type NowPlayingRelayDeps } from '../../services/nowPlaying/nowPlayingRelay';
import { nowPlayingRelayDepsOf } from '../../services/nowPlaying/nowPlayingDeps';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter.js';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'NowPlayingHandler' });

/** Trente changements par minute et par compte : on saute des morceaux, on ne diffuse pas un flux. */
export const NOW_PLAYING_RATE = { max: 30, windowMs: 60_000, keyPrefix: 'now-playing:u' } as const;

type NowPlayingSocket = {
  readonly id: string;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type NowPlayingHandlerDeps = {
  readonly relay: NowPlayingRelayDeps;
  readonly callerOf: (socketId: string) => { readonly userId: string; readonly isAnonymous: boolean } | null;
  /** `true` dans le débit, `false` au-delà, `null` quand le limiteur ne sait pas juger (on laisse passer). */
  readonly withinRate: (userId: string) => Promise<boolean | null>;
};

const UNAVAILABLE = { success: false, error: 'Écoute momentanément indisponible', code: NOW_PLAYING_ERROR_CODES.UNAVAILABLE } as const;
const NOT_ALLOWED = { success: false, error: 'Écoute indisponible', code: NOW_PLAYING_ERROR_CODES.INVALID } as const;
const RATE_LIMITED = { success: false, error: 'Trop de changements', code: NOW_PLAYING_ERROR_CODES.RATE_LIMITED } as const;

const replier = <T>(ack: unknown): ((response: T) => void) => (typeof ack === 'function' ? (ack as (r: T) => void) : () => undefined);

export function listenNowPlaying(socket: NowPlayingSocket, deps: NowPlayingHandlerDeps): void {
  const registered = (): string | null => {
    const caller = deps.callerOf(socket.id);
    return caller && !caller.isAnonymous ? caller.userId : null;
  };

  socket.on(CLIENT_EVENTS.NOW_PLAYING_UPDATE, (data: unknown, ack?: unknown) => {
    const reply = replier<NowPlayingAck>(ack);
    const userId = registered();
    if (!userId) return reply(NOT_ALLOWED);
    deps
      .withinRate(userId)
      .then((within) => (within === false ? RATE_LIMITED : publishNowPlaying(deps.relay, userId, data)))
      .then(reply, (error: unknown) => {
        logger.error('[NOW_PLAYING_UPDATE] Error', { error: error instanceof Error ? error.message : 'unknown' });
        reply(UNAVAILABLE);
      });
  });

  socket.on(CLIENT_EVENTS.NOW_PLAYING_CLEAR, (_data: unknown, ack?: unknown) => {
    const reply = replier<NowPlayingClearAck>(ack);
    const userId = registered();
    if (!userId) return reply(NOT_ALLOWED);
    clearNowPlayingOf(deps.relay, userId).then(reply, (error: unknown) => {
      logger.error('[NOW_PLAYING_CLEAR] Error', { error: error instanceof Error ? error.message : 'unknown' });
      reply(UNAVAILABLE);
    });
  });
}

let limiter: { readonly client: unknown; readonly limiter: RateLimiter } | null = null;

/** Le limiteur suit le client Redis du moment, comme celui du talkie (`TalkieHandler.ts`). */
const rateLimiter = (): RateLimiter => {
  const client = getCacheStore().getNativeClient();
  if (!limiter || limiter.client !== client) {
    limiter = { client, limiter: createCustomRateLimiter({ ...NOW_PLAYING_RATE }, client ?? undefined) };
  }
  return limiter.limiter;
};

export function nowPlayingHandlerDeps(params: {
  readonly prisma: PrismaClient;
  readonly io: NowPlayingIo;
  readonly socketToUser: ReadonlyMap<string, string>;
  readonly connectedUsers: ReadonlyMap<string, { readonly isAnonymous: boolean }>;
}): NowPlayingHandlerDeps {
  return {
    relay: nowPlayingRelayDepsOf(params),
    callerOf: (socketId) => {
      const userId = params.socketToUser.get(socketId);
      const user = userId ? params.connectedUsers.get(userId) : undefined;
      return userId && user ? { userId, isAnonymous: user.isAnonymous } : null;
    },
    withinRate: async (userId) => {
      const info = await rateLimiter().consume(userId, 1);
      return info === null ? null : info.retryAfter === undefined;
    },
  };
}
