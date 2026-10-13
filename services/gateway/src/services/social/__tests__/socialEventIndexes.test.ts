/**
 * @jest-environment node
 *
 * #10510 — les index de la télémétrie v2 se posent par une fonction
 * IDEMPOTENTE et nommée : rejouée, elle ne pose rien de plus ; un index du
 * même nom mais d'une autre définition (un `db push` égaré, sans TTL ni
 * filtre partiel) est remplacé.
 */
import { describe, it, expect } from '@jest/globals';
import {
  ensureSocialEventIndexes,
  rawCommandIndexStore,
  SOCIAL_EVENT_INDEXES,
  POST_IMPRESSION_TTL_INDEX,
  type ExistingIndex,
  type IndexSpec,
  type IndexStore,
} from '../socialEventIndexes';

function memoryStore(initial: Record<string, ExistingIndex[]> = {}) {
  const collections = new Map(Object.entries(initial).map(([name, indexes]) => [name, [...indexes]]));
  const writes: string[] = [];
  const store: IndexStore = {
    async list(collection) {
      return collections.get(collection) ?? [];
    },
    async create(spec: IndexSpec) {
      writes.push(`create ${spec.name}`);
      const { collection, ...index } = spec;
      const indexes = collections.get(collection) ?? [];
      if (indexes.some((existing) => existing.name === spec.name)) throw new Error(`index ${spec.name} déjà présent`);
      collections.set(collection, [...indexes, index]);
    },
    async drop(collection, name) {
      writes.push(`drop ${name}`);
      collections.set(collection, (collections.get(collection) ?? []).filter((index) => index.name !== name));
    },
  };
  return { store, collections, writes };
}

describe('ensureSocialEventIndexes', () => {
  it('appliquée deux fois, laisse UN index par nom — la seconde ne fait rien', async () => {
    const { store, collections, writes } = memoryStore();
    const first = await ensureSocialEventIndexes(store);
    const writesAfterFirst = writes.length;
    const second = await ensureSocialEventIndexes(store);

    expect(Object.values(first).every((outcome) => outcome === 'created')).toBe(true);
    expect(Object.values(second).every((outcome) => outcome === 'present')).toBe(true);
    expect(writes).toHaveLength(writesAfterFirst);
    for (const spec of SOCIAL_EVENT_INDEXES) {
      expect((collections.get(spec.collection) ?? []).filter((index) => index.name === spec.name)).toHaveLength(1);
    }
  });

  it('les index de clé sont uniques PARTIELS et les index d’échéance sont TTL', async () => {
    const { store, collections } = memoryStore();
    await ensureSocialEventIndexes(store);

    const impressions = collections.get('PostImpression') ?? [];
    expect(impressions.find((index) => index.name === 'PostImpression_eventKey_unique')).toMatchObject({
      unique: true, partialFilterExpression: { eventKey: { $type: 'string' } },
    });
    expect(impressions.find((index) => index.name === POST_IMPRESSION_TTL_INDEX)).toMatchObject({ expireAfterSeconds: 0 });
    expect((collections.get('ContentEvent') ?? []).find((index) => index.name === 'ContentEvent_expiresAt_ttl'))
      .toMatchObject({ expireAfterSeconds: 0 });
  });

  it('remplace un index du même nom posé SANS TTL, et un index d’un autre nom sur la même clé', async () => {
    const { store, collections } = memoryStore({
      PostImpression: [
        { name: '_id_', key: { _id: 1 } },
        { name: POST_IMPRESSION_TTL_INDEX, key: { expiresAt: 1 } },
        { name: 'PostImpression_postId_idx', key: { postId: 1 } },
      ],
      ContentEvent: [{ name: 'ContentEvent_expiresAt_idx', key: { expiresAt: 1 } }],
    });
    const outcomes = await ensureSocialEventIndexes(store);

    expect(outcomes[POST_IMPRESSION_TTL_INDEX]).toBe('replaced');
    expect(outcomes.ContentEvent_expiresAt_ttl).toBe('replaced');
    expect((collections.get('ContentEvent') ?? []).map((index) => index.name)).not.toContain('ContentEvent_expiresAt_idx');
    expect((collections.get('PostImpression') ?? []).map((index) => index.name)).toEqual(
      expect.arrayContaining(['_id_', 'PostImpression_postId_idx', POST_IMPRESSION_TTL_INDEX]),
    );
  });

  it('à blanc, n’écrit rien', async () => {
    const { store, writes } = memoryStore();
    const outcomes = await ensureSocialEventIndexes(store, { dryRun: true });

    expect(writes).toEqual([]);
    expect(Object.values(outcomes).every((outcome) => outcome === 'created')).toBe(true);
  });
});

describe('rawCommandIndexStore', () => {
  it('une collection absente se lit comme vide, et la commande de création porte TTL et filtre', async () => {
    const commands: Record<string, unknown>[] = [];
    const store = rawCommandIndexStore({
      async $runCommandRaw(command) {
        commands.push(command);
        if ('listIndexes' in command) throw Object.assign(new Error('ns does not exist'), { code: 26 });
        return { ok: 1 };
      },
    });

    expect(await store.list('ContentEvent')).toEqual([]);
    await store.create(SOCIAL_EVENT_INDEXES[0]);
    expect(commands[1]).toEqual({
      createIndexes: 'ContentEvent',
      indexes: [{
        key: { eventKey: 1 }, name: 'ContentEvent_eventKey_unique', unique: true,
        partialFilterExpression: { eventKey: { $type: 'string' } },
      }],
    });
  });
});

describe('bootstrapDatabase — les index v2 sont un invariant de CHAQUE démarrage', () => {
  it('les pose avant la porte du seed, même sur une base déjà peuplée', async () => {
    const { bootstrapDatabase } = await import('../../database-bootstrap');
    const calls: string[] = [];
    const step = (name: string) => async () => { calls.push(name); };
    await bootstrapDatabase({
      ensurePostGeoIndex: step('geo'),
      ensureFriendRequestIndexes: step('friends'),
      ensureContactDeltaIndex: step('contacts'),
      ensureSocialEventIndexes: step('social-events'),
      shouldInitialize: async () => { calls.push('gate'); return false; },
      initializeDatabase: step('seed'),
      ensureSeedAccountsVerified: step('verified'),
      ensureWorldConversation: step('world'),
    });

    expect(calls.indexOf('social-events')).toBeGreaterThan(-1);
    expect(calls.indexOf('social-events')).toBeLessThan(calls.indexOf('gate'));
  });
});
