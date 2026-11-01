/**
 * #11266 — le quota journalier d'envoi : un compteur Redis
 * `uploads:bytes:{userId}:{jour}` (jour UTC), un repli en mémoire quand Redis
 * manque ou tombe — le quota est une garde d'abus, jamais une panne d'envoi.
 */
import { createUploadQuota, uploadQuotaKey, type UploadQuotaRedis } from '../upload-quota';

const GIB = 1024 * 1024 * 1024;
const NOON = Date.UTC(2026, 10, 1, 12, 0, 0);
const QUOTAS = { registered: 10 * GIB, anonymous: 1 * GIB };

function fakeRedis(): UploadQuotaRedis & { readonly store: Map<string, number>; readonly ttl: Map<string, number> } {
  const store = new Map<string, number>();
  const ttl = new Map<string, number>();
  return {
    store,
    ttl,
    async get(key: string) {
      return store.has(key) ? String(store.get(key)) : null;
    },
    async incrby(key: string, by: number) {
      const next = (store.get(key) ?? 0) + by;
      store.set(key, next);
      return next;
    },
    async expire(key: string, seconds: number) {
      ttl.set(key, seconds);
      return 1;
    },
  };
}

function brokenRedis(): UploadQuotaRedis {
  const fail = async (): Promise<never> => {
    throw new Error('ECONNREFUSED');
  };
  return { get: fail, incrby: fail, expire: fail };
}

describe('uploadQuotaKey', () => {
  it('nomme le compteur par utilisateur et par jour UTC', () => {
    expect(uploadQuotaKey('u1', NOON)).toBe('uploads:bytes:u1:2026-11-01');
    expect(uploadQuotaKey('u1', Date.UTC(2026, 10, 1, 23, 59, 59))).toBe('uploads:bytes:u1:2026-11-01');
    expect(uploadQuotaKey('u1', Date.UTC(2026, 10, 2, 0, 0, 0))).toBe('uploads:bytes:u1:2026-11-02');
  });
});

describe('createUploadQuota — sur Redis', () => {
  it('admet un envoi sous le quota et compte ses octets, le compteur expirant de lui-même', async () => {
    const redis = fakeRedis();
    const quota = createUploadQuota({ redis, quotas: QUOTAS });

    expect(await quota.check({ userId: 'u1', role: 'registered', incomingBytes: 3 * GIB, now: NOON })).toEqual({ allowed: true });
    await quota.record({ userId: 'u1', bytes: 3 * GIB, now: NOON });

    expect(redis.store.get('uploads:bytes:u1:2026-11-01')).toBe(3 * GIB);
    expect(redis.ttl.get('uploads:bytes:u1:2026-11-01')).toBeGreaterThanOrEqual(24 * 3600);
  });

  it('refuse l’envoi qui ferait dépasser le quota du jour, et dit quand réessayer', async () => {
    const redis = fakeRedis();
    const quota = createUploadQuota({ redis, quotas: QUOTAS });
    await quota.record({ userId: 'u1', bytes: 9 * GIB, now: NOON });

    const verdict = await quota.check({ userId: 'u1', role: 'registered', incomingBytes: 2 * GIB, now: NOON });

    expect(verdict).toEqual({ allowed: false, usedBytes: 9 * GIB, quotaBytes: 10 * GIB, retryAfterSeconds: 12 * 3600 });
  });

  it('l’anonyme a son propre quota, plus bas', async () => {
    const quota = createUploadQuota({ redis: fakeRedis(), quotas: QUOTAS });
    const verdict = await quota.check({ userId: 'p1', role: 'anonymous', incomingBytes: 1 * GIB + 1, now: NOON });
    expect(verdict.allowed).toBe(false);
  });

  it('le compteur repart à zéro le lendemain', async () => {
    const quota = createUploadQuota({ redis: fakeRedis(), quotas: QUOTAS });
    await quota.record({ userId: 'u1', bytes: 10 * GIB, now: NOON });
    const tomorrow = NOON + 24 * 3600 * 1000;
    expect(await quota.check({ userId: 'u1', role: 'registered', incomingBytes: 1, now: tomorrow })).toEqual({ allowed: true });
  });

  it('un compte n’entame pas le quota d’un autre', async () => {
    const quota = createUploadQuota({ redis: fakeRedis(), quotas: QUOTAS });
    await quota.record({ userId: 'u1', bytes: 10 * GIB, now: NOON });
    expect(await quota.check({ userId: 'u2', role: 'registered', incomingBytes: 1 * GIB, now: NOON })).toEqual({ allowed: true });
  });

  it('ne compte rien pour un envoi vide', async () => {
    const redis = fakeRedis();
    await createUploadQuota({ redis, quotas: QUOTAS }).record({ userId: 'u1', bytes: 0, now: NOON });
    expect(redis.store.size).toBe(0);
  });
});

describe('createUploadQuota — sans Redis', () => {
  it('compte en mémoire quand Redis est absent', async () => {
    const quota = createUploadQuota({ redis: null, quotas: QUOTAS });
    await quota.record({ userId: 'u1', bytes: 10 * GIB, now: NOON });
    expect((await quota.check({ userId: 'u1', role: 'registered', incomingBytes: 1, now: NOON })).allowed).toBe(false);
  });

  it('une panne Redis ne bloque aucun envoi : le compte se replie en mémoire', async () => {
    const quota = createUploadQuota({ redis: brokenRedis(), quotas: QUOTAS });
    expect(await quota.check({ userId: 'u1', role: 'registered', incomingBytes: 1 * GIB, now: NOON })).toEqual({ allowed: true });
    await quota.record({ userId: 'u1', bytes: 10 * GIB, now: NOON });
    expect((await quota.check({ userId: 'u1', role: 'registered', incomingBytes: 1, now: NOON })).allowed).toBe(false);
  });
});
