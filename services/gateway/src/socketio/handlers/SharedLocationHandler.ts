/**
 * La porte socket du PARTAGE TEMPORAIRE DE POSITION à des personnes (#14109, #16980) :
 * `location:share-start`, `location:share-update` et `location:share-stop`. Règles et
 * projection : `services/sharedLocation/`. Le partage DANS une conversation garde
 * `LocationHandler`.
 *
 * Un compte INSCRIT seulement : un invité de lien n'a pas de cercle. Le débit est borné
 * par un limiteur Redis partagé, au rythme du partage en conversation. Le journal ne
 * porte jamais la charge (coordonnées, destinataires) : seulement l'erreur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { SHARED_LOCATION_ERROR_CODES, type SharedLocationAck, type SharedLocationStopAck } from '@meeshy/shared/types/shared-location';
import { getCacheStore } from '../../services/CacheStore';
import {
  startSharedLocation,
  stopSharedLocation,
  updateSharedLocation,
  type SharedLocationIo,
  type SharedLocationRelayDeps,
} from '../../services/sharedLocation/sharedLocationRelay';
import { sharedLocationRelayDepsOf } from '../../services/sharedLocation/sharedLocationDeps';
import { createCustomRateLimiter, rateLimitDisabled, type RateLimiter, type RateLimitInfo } from '../../utils/rate-limiter.js';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'SharedLocationHandler' });

/** Cent vingt envois par minute et par compte, comme `LOCATION_LIVE_UPDATE` : une position, pas un flux. */
export const SHARED_LOCATION_RATE = { max: 120, windowMs: 60_000, keyPrefix: 'shared-location:u' } as const;

type SharedLocationSocket = {
  readonly id: string;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type SharedLocationHandlerDeps = {
  readonly relay: SharedLocationRelayDeps;
  readonly callerOf: (socketId: string) => { readonly userId: string; readonly isAnonymous: boolean } | null;
  /** `true` dans le débit, `false` au-delà (`sharedLocationWithinRate`). */
  readonly withinRate: (userId: string) => Promise<boolean>;
};

const UNAVAILABLE = { success: false, error: 'Position momentanément indisponible', code: SHARED_LOCATION_ERROR_CODES.UNAVAILABLE } as const;
const NOT_ALLOWED = { success: false, error: 'Partage indisponible', code: SHARED_LOCATION_ERROR_CODES.INVALID } as const;
const RATE_LIMITED = { success: false, error: 'Trop d\'envois', code: SHARED_LOCATION_ERROR_CODES.RATE_LIMITED } as const;

const replier = <T>(ack: unknown): ((response: T) => void) => (typeof ack === 'function' ? (ack as (r: T) => void) : () => undefined);

export function listenSharedLocation(socket: SharedLocationSocket, deps: SharedLocationHandlerDeps): void {
  const registered = (): string | null => {
    const caller = deps.callerOf(socket.id);
    return caller && !caller.isAnonymous ? caller.userId : null;
  };

  type Reply = SharedLocationAck | SharedLocationStopAck;
  const gate = (event: string, act: (userId: string, data: unknown) => Promise<Reply>, options: { readonly limited: boolean } = { limited: true }) => {
    socket.on(event, (data: unknown, ack?: unknown) => {
      const reply = replier<Reply>(ack);
      const userId = registered();
      if (!userId) return reply(NOT_ALLOWED);
      const answer = (within: boolean): Promise<Reply> => (within ? act(userId, data) : Promise.resolve(RATE_LIMITED));
      (options.limited ? deps.withinRate(userId) : Promise.resolve(true))
        .then(answer)
        .then(reply, (error: unknown) => {
          logger.error(`[${event}] Error`, { error: error instanceof Error ? error.message : 'unknown' });
          reply(UNAVAILABLE);
        });
    });
  };

  gate(CLIENT_EVENTS.SHARED_LOCATION_START, (userId, data) => startSharedLocation(deps.relay, userId, data));
  gate(CLIENT_EVENTS.SHARED_LOCATION_UPDATE, (userId, data) => updateSharedLocation(deps.relay, userId, data));
  // Arrêter n'est jamais limité : après une rafale de positions, on doit encore pouvoir se taire.
  gate(CLIENT_EVENTS.SHARED_LOCATION_STOP, (userId) => stopSharedLocation(deps.relay, userId), { limited: false });
}

let limiter: { readonly client: unknown; readonly limiter: RateLimiter } | null = null;

/** Le limiteur suit le client Redis du moment, comme celui de l'écoute (`NowPlayingHandler.ts`). */
const rateLimiter = (): RateLimiter => {
  const client = getCacheStore().getNativeClient();
  if (!limiter || limiter.client !== client) {
    limiter = { client, limiter: createCustomRateLimiter({ ...SHARED_LOCATION_RATE }, client ?? undefined) };
  }
  return limiter.limiter;
};

/**
 * Le repli du limiteur partagé quand son magasin est en panne : une fenêtre fixe par compte,
 * dans CE processus. Chaque position vise jusqu'à cinquante destinataires et relit la loi :
 * un débit sans borne n'est jamais la réponse à une panne. Les fenêtres sont rangées dans
 * l'ordre de leur ouverture, et les échues s'élaguent par la tête : jamais de balayage.
 */
export function localSharedLocationRate(rate: { readonly max: number; readonly windowMs: number } = SHARED_LOCATION_RATE): (userId: string, now: number) => boolean {
  const windows = new Map<string, { readonly start: number; readonly count: number }>();
  const prune = (now: number): void => {
    for (const [id, window] of windows) {
      if (now - window.start < rate.windowMs) return;
      windows.delete(id);
    }
  };
  return (userId, now) => {
    prune(now);
    const current = windows.get(userId);
    if (current && now - current.start < rate.windowMs) {
      windows.set(userId, { start: current.start, count: current.count + 1 });
      return current.count + 1 <= rate.max;
    }
    windows.delete(userId);
    windows.set(userId, { start: now, count: 1 });
    return 1 <= rate.max;
  };
}

/**
 * Le juge du débit : le limiteur partagé ; quand il ne juge pas, la limitation explicitement
 * coupée hors production (`RATE_LIMIT_DISABLED`) laisse passer, et une panne du magasin
 * passe la main au compteur local.
 */
export function sharedLocationWithinRate(params: {
  readonly consume: (userId: string) => Promise<RateLimitInfo | null>;
  readonly disabled: () => boolean;
  readonly local: (userId: string, now: number) => boolean;
  readonly now: () => number;
}): (userId: string) => Promise<boolean> {
  return async (userId) => {
    if (params.disabled()) return true;
    const info = await params.consume(userId);
    return info === null ? params.local(userId, params.now()) : info.retryAfter === undefined;
  };
}

export function sharedLocationHandlerDeps(params: {
  readonly prisma: PrismaClient;
  readonly io: SharedLocationIo;
  readonly socketToUser: ReadonlyMap<string, string>;
  readonly connectedUsers: ReadonlyMap<string, { readonly isAnonymous: boolean }>;
}): SharedLocationHandlerDeps {
  const withinRate = sharedLocationWithinRate({
    consume: (userId) => rateLimiter().consume(userId, 1),
    disabled: rateLimitDisabled,
    local: localSharedLocationRate(),
    now: () => Date.now(),
  });
  return {
    relay: sharedLocationRelayDepsOf(params),
    callerOf: (socketId) => {
      const userId = params.socketToUser.get(socketId);
      const user = userId ? params.connectedUsers.get(userId) : undefined;
      return userId && user ? { userId, isAnonymous: user.isAnonymous } : null;
    },
    withinRate,
  };
}
