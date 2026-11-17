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

export type SlidingWindowCounter = {
  /** Compte un événement pour `key` s'il reste de la place sous `max` dans les `windowMs` qui précèdent `now`. */
  hit(key: string, params: { readonly max: number; readonly windowMs: number; readonly now: number }): Promise<WindowVerdict>;
};

const retryAfterOf = (oldest: number, windowMs: number, now: number): number => Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));

/** La mémoire du processus : un tableau de dates par clé, élagué à chaque passage. */
export function createMemorySlidingWindow(): SlidingWindowCounter {
  const events = new Map<string, number[]>();
  const prune = (now: number, windowMs: number) => {
    if (events.size < 10_000) return;
    events.forEach((dates, key) => {
      if ((dates[dates.length - 1] ?? 0) <= now - windowMs) events.delete(key);
    });
  };
  return {
    async hit(key, { max, windowMs, now }) {
      prune(now, windowMs);
      const live = (events.get(key) ?? []).filter((date) => date > now - windowMs);
      if (live.length >= max) {
        events.set(key, live);
        return { allowed: false, count: live.length, retryAfter: retryAfterOf(live[0] ?? now, windowMs, now) };
      }
      events.set(key, [...live, now]);
      return { allowed: true, count: live.length + 1, retryAfter: 0 };
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
  };
}
