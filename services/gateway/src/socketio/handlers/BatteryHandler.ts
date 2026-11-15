/**
 * La porte socket de la BATTERIE (#14147) : `battery:report` (le téléphone de l'émetteur relève)
 * et `battery:pull` (un Sang demande un relevé maintenant). Règles et projection :
 * `services/battery/`. Jamais un message de conversation.
 *
 * Un compte INSCRIT seulement : un invité de lien n'a pas de cercle. Le débit est borné par un
 * limiteur Redis partagé, et le journal ne porte jamais la charge — seulement l'erreur.
 *
 * Le balayage d'extinction (10 min sans relevé en critique) démarre avec la première socket :
 * une minuterie par processus, et un verrou Redis par passe pour qu'une flotte de passerelles
 * n'annonce jamais deux fois la même extinction.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BATTERY_ERROR_CODES, type BatteryPullAck, type BatteryReportAck } from '@meeshy/shared/types/battery';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { getCacheStore } from '../../services/CacheStore';
import { batteryPullDepsOf, batteryRelayDepsOf } from '../../services/battery/batteryDeps';
import { requestBatteryPull, type BatteryPullDeps } from '../../services/battery/batteryPull';
import { markBatteryAlive, reportBattery, sweepBatteryOff, type BatteryRelayDeps } from '../../services/battery/batteryRelay';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter.js';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { SOCKET_SESSION_ID } from '../disconnectSession';
import type { ServerEmitIO } from '../serverEmit';

const logger = enhancedLogger.child({ module: 'BatteryHandler' });

/** Douze relevés par minute et par compte : un relevé par changement, jamais un flux. */
export const BATTERY_RATE = { max: 12, windowMs: 60_000, keyPrefix: 'battery:u' } as const;

/** Une passe par minute ; le verrou vit un peu moins, pour que la passe suivante ne le trouve jamais pris. */
export const BATTERY_SWEEP_INTERVAL_MS = 60_000;
const SWEEP_LOCK_KEY = 'battery:sweep-lock';
const SWEEP_LOCK_SECONDS = 50;

type BatterySocket = {
  readonly id: string;
  readonly data?: unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type BatteryHandlerDeps = {
  readonly relay: BatteryRelayDeps;
  readonly pull: BatteryPullDeps;
  readonly callerOf: (socketId: string) => { readonly userId: string; readonly isAnonymous: boolean } | null;
  /** `true` dans le débit, `false` au-delà, `null` quand le limiteur ne sait pas juger (on laisse passer). */
  readonly withinRate: (userId: string) => Promise<boolean | null>;
};

const UNAVAILABLE = { success: false, error: 'Batterie momentanément indisponible', code: BATTERY_ERROR_CODES.UNAVAILABLE } as const;
const NOT_ALLOWED = { success: false, error: 'Batterie indisponible', code: BATTERY_ERROR_CODES.INVALID } as const;
const RATE_LIMITED = { success: false, error: 'Trop de relevés', code: BATTERY_ERROR_CODES.RATE_LIMITED } as const;

const replier = <T>(ack: unknown): ((response: T) => void) => (typeof ack === 'function' ? (ack as (r: T) => void) : () => undefined);

export const sessionIdOfSocket = (socket: { readonly data?: unknown }): string | null => {
  const value = (socket.data as Record<string, unknown> | undefined)?.[SOCKET_SESSION_ID];
  return typeof value === 'string' ? value : null;
};

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : 'unknown');

export function listenBattery(socket: BatterySocket, deps: BatteryHandlerDeps): void {
  const registered = (): string | null => {
    const caller = deps.callerOf(socket.id);
    return caller && !caller.isAnonymous ? caller.userId : null;
  };

  socket.on(CLIENT_EVENTS.BATTERY_REPORT, (data: unknown, ack?: unknown) => {
    const reply = replier<BatteryReportAck>(ack);
    const userId = registered();
    if (!userId) return reply(NOT_ALLOWED);
    deps
      .withinRate(userId)
      .then((within) => (within === false ? RATE_LIMITED : reportBattery(deps.relay, { emitterId: userId, sessionId: sessionIdOfSocket(socket), payload: data })))
      .then(reply, (error: unknown) => {
        logger.error('[BATTERY_REPORT] Error', { error: failureMessage(error) });
        reply(UNAVAILABLE);
      });
  });

  socket.on(CLIENT_EVENTS.BATTERY_PULL, (data: unknown, ack?: unknown) => {
    const reply = replier<BatteryPullAck>(ack);
    const userId = registered();
    if (!userId) return reply(NOT_ALLOWED);
    requestBatteryPull(deps.pull, { readerId: userId, payload: data }).then(reply, (error: unknown) => {
      logger.error('[BATTERY_PULL] Error', { error: failureMessage(error) });
      reply(UNAVAILABLE);
    });
  });
}

/** Une passe du balayage, sous verrou partagé : rend `null` quand une autre passerelle la tient. */
export async function runBatterySweep(relay: BatteryRelayDeps): Promise<number | null> {
  if (!(await relay.cache.setnx(SWEEP_LOCK_KEY, String(relay.now()), SWEEP_LOCK_SECONDS))) return null;
  return sweepBatteryOff(relay);
}

let sweep: ReturnType<typeof setInterval> | null = null;
let processRelay: BatteryRelayDeps | null = null;

/** Idempotent : la première socket arme la minuterie du processus, les suivantes ne font rien. */
export function ensureBatterySweep(relay: BatteryRelayDeps): void {
  processRelay ??= relay;
  if (sweep !== null) return;
  sweep = setInterval(() => {
    runBatterySweep(relay).catch((error: unknown) => logger.error('[BATTERY_SWEEP] Error', { error: failureMessage(error) }));
  }, BATTERY_SWEEP_INTERVAL_MS);
  sweep.unref?.();
}

export function stopBatterySweep(): void {
  if (sweep !== null) clearInterval(sweep);
  sweep = null;
  processRelay = null;
}

/**
 * Une authentification de socket du TÉLÉPHONE SUIVI est un SIGNE DE VIE (spec § 4) : présumé éteint,
 * il est « rallumé » avant même son prochain relevé — un ordinateur qui se connecte ne dit rien du téléphone. Détaché, `.catch` posé ; sans
 * relais armé (aucune socket encore branchée sur ce processus), rien.
 */
export function noteBatteryAlive(params: { readonly userId: string; readonly sessionId: string | null }): void {
  const relay = processRelay;
  if (relay === null) return;
  const alive = async () => {
    if (await relay.isTrackedDevice(params)) await markBatteryAlive(relay, params.userId);
  };
  alive().catch((error: unknown) => logger.error('[BATTERY_ALIVE] Error', { error: failureMessage(error) }));
}

let limiter: { readonly client: unknown; readonly limiter: RateLimiter } | null = null;

const rateLimiter = (): RateLimiter => {
  const client = getCacheStore().getNativeClient();
  if (!limiter || limiter.client !== client) {
    limiter = { client, limiter: createCustomRateLimiter({ ...BATTERY_RATE }, client ?? undefined) };
  }
  return limiter.limiter;
};

export function batteryHandlerDeps(params: {
  readonly prisma: PrismaClient;
  readonly io: ServerEmitIO;
  readonly socketToUser: ReadonlyMap<string, string>;
  readonly connectedUsers: ReadonlyMap<string, { readonly isAnonymous: boolean }>;
}): BatteryHandlerDeps {
  const relay = batteryRelayDepsOf(params);
  ensureBatterySweep(relay);
  return {
    relay,
    pull: batteryPullDepsOf(params),
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
