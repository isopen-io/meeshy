/**
 * LE MAGASIN DU PARTAGE TEMPORAIRE DE POSITION (#16980) — Redis, STRICT, atomique.
 *
 * `CacheStore` se replie en mémoire locale quand Redis échoue : pour ce partage, ce repli
 * mentirait. Un arrêt rangé dans la seule mémoire d'une instance laisserait, au retour de
 * Redis, le partage servi par toutes les autres (audit avant fusion de #16986). Ce magasin
 * parle donc au client natif, sans repli : une panne LÈVE, le geste rend `UNAVAILABLE` et
 * le client réessaie.
 *
 * Les trois gestes qui décident de ce qui est courant sont atomiques (scripts Lua) :
 * prendre le pointeur sous condition de génération en rendant la session remplacée,
 * écrire une position sous condition que sa session soit courante, et arrêter en avançant
 * la génération. Les clés d'un compte partagent une étiquette de hachage `{<id>}`.
 */
import type Redis from 'ioredis';

export type SharedLocationKv = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Pose `session` comme pointeur si la génération vaut `generation` ; rend la session REMPLACÉE. */
  claim(keys: { readonly generation: string; readonly pointer: string }, args: { readonly generation: string; readonly session: string; readonly ttlSeconds: number }): Promise<{ readonly claimed: boolean; readonly displaced: string | null }>;
  /** Écrit `value` sous `state` si le pointeur désigne encore `session`. */
  setIfCurrent(keys: { readonly pointer: string; readonly state: string }, args: { readonly session: string; readonly value: string; readonly ttlSeconds: number }): Promise<boolean>;
  /** Avance la génération, efface le pointeur, et rend la session qu'il désignait. */
  advance(keys: { readonly generation: string; readonly pointer: string }): Promise<string | null>;
};

const CLAIM = `
local current = redis.call('GET', KEYS[1]) or '0'
if current ~= ARGV[1] then return {0, ''} end
local displaced = redis.call('GET', KEYS[2]) or ''
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return {1, displaced}`;

const SET_IF_CURRENT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1`;

const ADVANCE = `
redis.call('INCR', KEYS[1])
local previous = redis.call('GET', KEYS[2]) or ''
redis.call('DEL', KEYS[2])
return previous`;

const orNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export function redisSharedLocationKv(redis: Redis): SharedLocationKv {
  return {
    get: (key) => redis.get(key),
    set: async (key, value, ttlSeconds) => {
      await redis.set(key, value, 'EX', ttlSeconds);
    },
    del: async (key) => {
      await redis.del(key);
    },
    claim: async (keys, args) => {
      const [claimed, displaced] = (await redis.eval(CLAIM, 2, keys.generation, keys.pointer, args.generation, args.session, String(args.ttlSeconds))) as [number, string];
      return { claimed: claimed === 1, displaced: orNull(displaced) };
    },
    setIfCurrent: async (keys, args) =>
      (await redis.eval(SET_IF_CURRENT, 2, keys.pointer, keys.state, args.session, args.value, String(args.ttlSeconds))) === 1,
    advance: async (keys) => orNull(await redis.eval(ADVANCE, 2, keys.generation, keys.pointer)),
  };
}

/** Sans Redis, le partage est indisponible : aucune donnée ne se range ailleurs. */
export const UNAVAILABLE_SHARED_LOCATION_KV: SharedLocationKv = {
  get: () => Promise.reject(new Error('shared location store unavailable')),
  set: () => Promise.reject(new Error('shared location store unavailable')),
  del: () => Promise.reject(new Error('shared location store unavailable')),
  claim: () => Promise.reject(new Error('shared location store unavailable')),
  setIfCurrent: () => Promise.reject(new Error('shared location store unavailable')),
  advance: () => Promise.reject(new Error('shared location store unavailable')),
};
