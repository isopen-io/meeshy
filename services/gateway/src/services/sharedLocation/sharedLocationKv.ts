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
 *
 * Une session que la prise remplace ou que l'arrêt éteint entre, dans le MÊME script, dans
 * l'ensemble « à retirer » : si le retrait échoue ensuite, un nouvel essai le retrouve, et
 * ceux qui la voyaient reçoivent quand même leur fin. Chaque session tient aussi l'ensemble
 * de ceux qu'elle a servis (empreintes, jamais d'identifiant en clair) : la fin ne part
 * que vers eux.
 */
import type Redis from 'ioredis';

type PointerKeys = { readonly generation: string; readonly pointer: string; readonly retiring: string };

export type SharedLocationKv = {
  get(key: string): Promise<string | null>;
  /** Une lecture groupée, dans l'ordre des clés. */
  mget(keys: readonly string[]): Promise<readonly (string | null)[]>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Pose `session` comme pointeur si la génération vaut `generation` ; rend la session REMPLACÉE (aussi rangée « à retirer »). */
  claim(keys: PointerKeys, args: { readonly generation: string; readonly session: string; readonly ttlSeconds: number }): Promise<{ readonly claimed: boolean; readonly displaced: string | null }>;
  /** Écrit `value` sous `state` si le pointeur désigne encore `session`. */
  setIfCurrent(keys: { readonly pointer: string; readonly state: string }, args: { readonly session: string; readonly value: string; readonly ttlSeconds: number }): Promise<boolean>;
  /** Avance la génération, efface le pointeur, et rend la session qu'il désignait (aussi rangée « à retirer »). */
  advance(keys: PointerKeys): Promise<string | null>;
  /** Les sessions à retirer, puis le retrait d'une session de cet ensemble. */
  retiring(key: string): Promise<readonly string[]>;
  retired(key: string, session: string): Promise<void>;
  /** L'ensemble de ceux qu'une session a servis. */
  markSeen(key: string, members: readonly string[], ttlSeconds: number): Promise<void>;
  seenAmong(key: string, members: readonly string[]): Promise<readonly boolean[]>;
  unmarkSeen(key: string, members: readonly string[]): Promise<void>;
};

const CLAIM = `
local current = redis.call('GET', KEYS[1]) or '0'
if current ~= ARGV[1] then return {0, ''} end
local displaced = redis.call('GET', KEYS[2]) or ''
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
if displaced ~= '' then
  redis.call('SADD', KEYS[3], displaced)
  redis.call('EXPIRE', KEYS[3], ARGV[4])
end
return {1, displaced}`;

const SET_IF_CURRENT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1`;

const ADVANCE = `
redis.call('INCR', KEYS[1])
local previous = redis.call('GET', KEYS[2]) or ''
redis.call('DEL', KEYS[2])
if previous ~= '' then
  redis.call('SADD', KEYS[3], previous)
  redis.call('EXPIRE', KEYS[3], ARGV[1])
end
return previous`;

/** Le plus long partage (8 h) : une session à retirer n'a plus rien à dire au-delà. */
export const RETIRING_TTL_SECONDS = 8 * 3600;

const orNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export function redisSharedLocationKv(redis: Redis): SharedLocationKv {
  return {
    get: (key) => redis.get(key),
    mget: async (keys) => (keys.length === 0 ? [] : redis.mget(...keys)),
    set: async (key, value, ttlSeconds) => {
      await redis.set(key, value, 'EX', ttlSeconds);
    },
    del: async (key) => {
      await redis.del(key);
    },
    claim: async (keys, args) => {
      const [claimed, displaced] = (await redis.eval(CLAIM, 3, keys.generation, keys.pointer, keys.retiring, args.generation, args.session, String(args.ttlSeconds), String(RETIRING_TTL_SECONDS))) as [number, string];
      return { claimed: claimed === 1, displaced: orNull(displaced) };
    },
    setIfCurrent: async (keys, args) =>
      (await redis.eval(SET_IF_CURRENT, 2, keys.pointer, keys.state, args.session, args.value, String(args.ttlSeconds))) === 1,
    advance: async (keys) => orNull(await redis.eval(ADVANCE, 3, keys.generation, keys.pointer, keys.retiring, String(RETIRING_TTL_SECONDS))),
    retiring: (key) => redis.smembers(key),
    retired: async (key, session) => {
      await redis.srem(key, session);
    },
    markSeen: async (key, members, ttlSeconds) => {
      if (members.length === 0) return;
      const result = await redis.multi().sadd(key, ...members).expire(key, ttlSeconds).exec();
      const failure = result?.find(([error]) => error !== null)?.[0];
      if (!result || failure) throw failure ?? new Error('shared location seen set not written');
    },
    seenAmong: async (key, members) => {
      if (members.length === 0) return [];
      const flags = await redis.smismember(key, ...members);
      return flags.map((flag) => flag === 1);
    },
    unmarkSeen: async (key, members) => {
      if (members.length > 0) await redis.srem(key, ...members);
    },
  };
}

/** Sans Redis, le partage est indisponible : aucune donnée ne se range ailleurs. */
export const UNAVAILABLE_SHARED_LOCATION_KV: SharedLocationKv = {
  get: () => Promise.reject(new Error('shared location store unavailable')),
  mget: () => Promise.reject(new Error('shared location store unavailable')),
  set: () => Promise.reject(new Error('shared location store unavailable')),
  del: () => Promise.reject(new Error('shared location store unavailable')),
  claim: () => Promise.reject(new Error('shared location store unavailable')),
  setIfCurrent: () => Promise.reject(new Error('shared location store unavailable')),
  advance: () => Promise.reject(new Error('shared location store unavailable')),
  retiring: () => Promise.reject(new Error('shared location store unavailable')),
  retired: () => Promise.reject(new Error('shared location store unavailable')),
  markSeen: () => Promise.reject(new Error('shared location store unavailable')),
  seenAmong: () => Promise.reject(new Error('shared location store unavailable')),
  unmarkSeen: () => Promise.reject(new Error('shared location store unavailable')),
};
