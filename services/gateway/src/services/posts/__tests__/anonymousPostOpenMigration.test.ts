/**
 * @jest-environment node
 *
 * #10483 G11 — la migration des ouvertures anonymes : chaque `sessionKey`
 * BRUT (valeur de X-Session-Token, credential pour un invité) devient une clé
 * de lecteur HMAC, chaque ligne reçoit sa fin de vie (création + 90 j), l'index
 * TTL est posé. Rejouée, elle ne modifie rien.
 */
import { describe, it, expect } from '@jest/globals';
import { hashSessionToken } from '../../../utils/session-token';
import { readerKeyOf } from '../readerKey';
import {
  migrateAnonymousPostOpens,
  type AnonymousPostOpenMigrationStore,
  type StoredOpen,
} from '../anonymousPostOpenMigration';

const SECRET = 'c'.repeat(64);
const POST = '507f1f77bcf86cd799439011';
const GUEST = '507f1f77bcf86cd7994390ee';
const JOUR = 86_400_000;
const creeLe = new Date('2026-09-01T10:00:00.000Z');

function memoryStore(rows: StoredOpen[], guests: Record<string, string> = {}, ttl: 'absent' | 'plain' | 'ttl' = 'absent') {
  const state = { rows: rows.map((row) => ({ ...row })), ttl, writes: 0 };
  const store: AnonymousPostOpenMigrationStore = {
    async legacyRows() {
      return state.rows.filter((row) => row.expiresAt === undefined || row.expiresAt === null || !/^[0-9a-f]{64}$/.test(row.sessionKey));
    },
    async rekey(id, next) {
      const target = state.rows.find((row) => row.id === id);
      if (!target) return 'updated';
      const clash = state.rows.some((row) => row.id !== id && row.postId === target.postId && row.sessionKey === next.sessionKey);
      if (clash) return 'duplicate';
      state.writes += 1;
      Object.assign(target, next);
      return 'updated';
    },
    async remove(id) {
      state.writes += 1;
      state.rows = state.rows.filter((row) => row.id !== id);
    },
    async guestIdByTokenHash(hash) {
      return Object.entries(guests).find(([token]) => hashSessionToken(token) === hash)?.[1];
    },
    async ensureTtlIndex(dryRun) {
      if (state.ttl === 'ttl') return 'present';
      const outcome = state.ttl === 'plain' ? 'converted' : 'created';
      if (!dryRun) {
        state.writes += 1;
        state.ttl = 'ttl';
      }
      return outcome;
    },
  };
  return { store, state };
}

const brut = (id: string, sessionKey: string, extra: Partial<StoredOpen> = {}): StoredOpen =>
  ({ id, postId: POST, sessionKey, createdAt: creeLe, ...extra });

describe('migrateAnonymousPostOpens', () => {
  it('hache chaque clé brute, pose expiresAt = createdAt + 90 j et l’index TTL', async () => {
    const { store, state } = memoryStore([brut('a', 'visitor_1'), brut('b', 'ios-uuid-2')]);

    const report = await migrateAnonymousPostOpens(store, { secret: SECRET });

    expect(report).toMatchObject({ scanned: 2, rekeyed: 2, merged: 0, ttlIndex: 'created' });
    expect(state.rows.map((row) => row.sessionKey)).toEqual([
      readerKeyOf({ sessionToken: 'visitor_1' }, SECRET),
      readerKeyOf({ sessionToken: 'ios-uuid-2' }, SECRET),
    ]);
    state.rows.forEach((row) => expect(row.expiresAt?.getTime()).toBe(creeLe.getTime() + 90 * JOUR));
    expect(JSON.stringify(state.rows)).not.toContain('visitor_1');
  });

  it('le jeton d’un invité devient la clé de son participant — celle que la passerelle calcule désormais', async () => {
    const { store, state } = memoryStore([brut('a', 'anon_123_abc_dev')], { anon_123_abc_dev: GUEST });

    await migrateAnonymousPostOpens(store, { secret: SECRET });

    expect(state.rows[0].sessionKey).toBe(readerKeyOf({ sessionToken: 'anon_123_abc_dev', participantId: GUEST }, SECRET));
  });

  it('deux jetons d’un même invité sur un même post fusionnent en UNE ligne', async () => {
    const { store, state } = memoryStore(
      [brut('a', 'anon_iphone'), brut('b', 'anon_web')],
      { anon_iphone: GUEST, anon_web: GUEST },
    );

    const report = await migrateAnonymousPostOpens(store, { secret: SECRET });

    expect(report).toMatchObject({ rekeyed: 1, merged: 1 });
    expect(state.rows).toHaveLength(1);
  });

  it('une ligne déjà migrée n’est pas retouchée — un second passage ne modifie rien', async () => {
    const { store, state } = memoryStore([brut('a', 'visitor_1'), brut('b', 'visitor_2')]);
    await migrateAnonymousPostOpens(store, { secret: SECRET });
    const apres = JSON.stringify(state.rows);
    const ecritures = state.writes;

    const second = await migrateAnonymousPostOpens(store, { secret: SECRET });

    expect(second).toMatchObject({ scanned: 0, rekeyed: 0, merged: 0, ttlIndex: 'present' });
    expect(JSON.stringify(state.rows)).toBe(apres);
    expect(state.writes).toBe(ecritures);
  });

  it('une ligne écrite par la nouvelle passerelle (hex 64 + expiresAt) est laissée telle quelle', async () => {
    const cle = readerKeyOf({ sessionToken: 'visitor_1' }, SECRET);
    const expiresAt = new Date(creeLe.getTime() + 90 * JOUR);
    const { store, state } = memoryStore([brut('a', cle, { expiresAt })], {}, 'ttl');

    const report = await migrateAnonymousPostOpens(store, { secret: SECRET });

    expect(report).toMatchObject({ scanned: 0, rekeyed: 0 });
    expect(state.rows[0]).toMatchObject({ sessionKey: cle, expiresAt });
  });

  it('un index ordinaire sur expiresAt devient TTL', async () => {
    const { store } = memoryStore([], {}, 'plain');

    expect((await migrateAnonymousPostOpens(store, { secret: SECRET })).ttlIndex).toBe('converted');
  });

  it('à blanc (dryRun), elle compte sans rien écrire', async () => {
    const { store, state } = memoryStore([brut('a', 'visitor_1')]);

    const report = await migrateAnonymousPostOpens(store, { secret: SECRET, dryRun: true });

    expect(report).toMatchObject({ scanned: 1, rekeyed: 1, ttlIndex: 'created' });
    expect(state.rows[0].sessionKey).toBe('visitor_1');
    expect(state.writes).toBe(0);
  });
});
