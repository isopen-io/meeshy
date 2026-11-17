/**
 * Des COMPTEURS À FENÊTRE GLISSANTE pour le relais de la confirmation d'un appareil et pour
 * ses annonces (#19156, spec 2026-11-17 § 5.2 et § 5.3 : « tous les plafonds en fenêtres
 * glissantes »).
 *
 * Le limiteur commun de la passerelle (`utils/rate-limiter.ts`) compte par fenêtre FIXE :
 * à cheval sur deux fenêtres, il laisse passer le double de son plafond. Ici, chaque événement
 * est daté et compte exactement une heure (ou la fenêtre donnée), ni plus ni moins.
 *
 * Redis (ensemble trié, un script Lua atomique) quand il est là ; sinon, et sur une panne de
 * Redis, une mémoire du processus — un plafond dégradé (par processus) reste un plafond.
 * Ce sont des contrôles d'HYGIÈNE : aucune garantie de sécurité ne repose sur eux (§ 5).
 */
import { randomBytes } from 'crypto';
import type { Redis } from 'ioredis';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'E2EESlidingWindow' });

export type WindowVerdict = {
  /** Vrai : l'événement est compté. Faux : le plafond est atteint, rien n'est compté. */
  readonly allowed: boolean;
  /** Les événements de la fenêtre, celui-ci compris quand il est compté. */
  readonly count: number;
  /** Secondes avant qu'un événement sorte de la fenêtre ; 0 quand l'événement est compté. */
  readonly retryAfter: number;
};

type WindowParams = { readonly max: number; readonly windowMs: number; readonly now: number };

export type SlidingWindowCounter = {
  /** Compte un événement pour `key` s'il reste de la place sous `max` dans les `windowMs` qui précèdent `now`. */
  hit(key: string, params: WindowParams): Promise<WindowVerdict>;
  /** Dit si un événement serait admis, SANS le compter ni créer de clé : on vérifie toutes les fenêtres avant d'en débiter une. */
  peek(key: string, params: WindowParams): Promise<WindowVerdict>;
};

const retryAfterOf = (oldest: number, windowMs: number, now: number): number => Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));

/** Au-delà de ce nombre de clés, la mémoire élague celles dont le dernier événement a passé la plus longue fenêtre servie. */
const MEMORY_PRUNE_AT = 10_000;
/** Le plafond DUR du repli : au-delà, les clés les plus anciennement créées sont oubliées (un plafond dégradé reste borné en mémoire). */
export const MEMORY_MAX_KEYS = 20_000;
const LONGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** La mémoire du processus : un tableau de dates par clé, élagué, et jamais plus de `MEMORY_MAX_KEYS` clés. */
export function createMemorySlidingWindow(options: { readonly maxKeys?: number } = {}): SlidingWindowCounter {
  const maxKeys = options.maxKeys ?? MEMORY_MAX_KEYS;
  const events = new Map<string, number[]>();
  const prune = (now: number, windowMs: number) => {
    if (events.size < Math.min(MEMORY_PRUNE_AT, maxKeys)) return;
    const horizon = now - Math.max(windowMs, LONGEST_WINDOW_MS);
    events.forEach((dates, key) => {
      if ((dates[dates.length - 1] ?? 0) <= horizon) events.delete(key);
    });
    const excess = events.size - maxKeys + 1;
    if (excess <= 0) return;
    [...events.keys()].slice(0, excess).forEach((key) => events.delete(key));
  };
  const liveOf = (key: string, windowMs: number, now: number): number[] => (events.get(key) ?? []).filter((date) => date > now - windowMs);
  const refusal = (live: readonly number[], windowMs: number, now: number): WindowVerdict => ({
    allowed: false,
    count: live.length,
    retryAfter: retryAfterOf(live[0] ?? now, windowMs, now),
  });
  return {
    async hit(key, { max, windowMs, now }) {
      const live = liveOf(key, windowMs, now);
      if (live.length >= max) return refusal(live, windowMs, now);
      if (!events.has(key)) prune(now, windowMs);
      events.delete(key);
      events.set(key, [...live, now]);
      return { allowed: true, count: live.length + 1, retryAfter: 0 };
    },
    async peek(key, { max, windowMs, now }) {
      const live = liveOf(key, windowMs, now);
      return live.length >= max ? refusal(live, windowMs, now) : { allowed: true, count: live.length, retryAfter: 0 };
    },
  };
}

/** Élague, compte, et ajoute seulement sous le plafond — d'un bloc, sans course entre deux lecteurs. */
const HIT_SCRIPT = `
local cutoff = tonumber(ARGV[1]) - tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, count, oldest[2] or ARGV[1]}
end
redis.call('ZADD', KEYS[1], tonumber(ARGV[1]), ARGV[4])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
return {1, count + 1, 0}
`;

/** Le même compte, sans rien ajouter. */
const PEEK_SCRIPT = `
local cutoff = tonumber(ARGV[1]) - tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local count = redis.call('ZCARD', KEYS[1])
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
return {count, oldest[2] or ARGV[1]}
`;

export function createSlidingWindow(redis?: Redis | null): SlidingWindowCounter {
  const memory = createMemorySlidingWindow();
  if (!redis) return memory;
  return {
    async hit(key, params) {
      try {
        const member = `${params.now}:${randomBytes(6).toString('hex')}`;
        const [allowed, count, oldest] = (await redis.eval(
          HIT_SCRIPT,
          1,
          `e2ee:window:${key}`,
          String(params.now),
          String(params.windowMs),
          String(params.max),
          member,
        )) as [number, number, string | number];
        return allowed === 1
          ? { allowed: true, count: Number(count), retryAfter: 0 }
          : { allowed: false, count: Number(count), retryAfter: retryAfterOf(Number(oldest), params.windowMs, params.now) };
      } catch (error) {
        logger.warn('e2ee sliding window store unavailable; process memory counts instead', { error });
        return memory.hit(key, params);
      }
    },
    async peek(key, params) {
      try {
        const [count, oldest] = (await redis.eval(PEEK_SCRIPT, 1, `e2ee:window:${key}`, String(params.now), String(params.windowMs))) as [number, string | number];
        return Number(count) >= params.max
          ? { allowed: false, count: Number(count), retryAfter: retryAfterOf(Number(oldest), params.windowMs, params.now) }
          : { allowed: true, count: Number(count), retryAfter: 0 };
      } catch (error) {
        logger.warn('e2ee sliding window store unavailable; process memory counts instead', { error });
        return memory.peek(key, params);
      }
    },
  };
}
