/**
 * @jest-environment node
 *
 * #10510 — les index de la télémétrie v2 se posent par une fonction
 * IDEMPOTENTE et nommée : rejouée, elle ne pose rien de plus ; un index du
 * même nom mais d'une autre définition (un `db push` égaré, sans TTL ni
 * filtre partiel) est remplacé par la migration nommée. Au DÉMARRAGE
 * (#10851), le même conflit est SIGNALÉ, jamais retiré.
 */
import { describe, it, expect } from '@jest/globals';
import {
  createIndexSpec,
  ensureSocialEventIndexes,
  ensureSocialEventIndexesByCommand,
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

/**
 * Un Mongo 8 en mémoire, vu À TRAVERS Prisma 6 : `createIndexes` rend
 * `numIndexesBefore/After` et lève P2010 « Error code 85/86 » sur un conflit
 * (réponses relevées sur un `mongo:8.0` réel, #10851) ; `listIndexes` échoue
 * comme le décodeur de `$runCommandRaw` dès qu'un index porte
 * `partialFilterExpression: { x: { $type: 'string' } }` — « Unknown tagged
 * value », la cause racine de #10851.
 */
type SimIndex = { readonly name: string; readonly spec: Readonly<Record<string, unknown>> };

function mongoThroughPrisma(initial: Record<string, SimIndex[]> = {}) {
  const collections = new Map(Object.entries(initial).map(([name, indexes]) => [name, [...indexes]]));
  const commands: Record<string, unknown>[] = [];
  const prismaError = (code: number, label: string) => Object.assign(
    new Error(`Raw query failed. Code: \`unknown\`. Message: \`Kind: Command failed: Error code ${code} (${label}): …\``),
    { code: 'P2010', meta: { code: 'unknown', message: `Kind: Command failed: Error code ${code} (${label}): …` } },
  );
  const hasStringTag = (value: unknown): boolean =>
    typeof value === 'object' && value !== null &&
    (typeof (value as { $type?: unknown }).$type === 'string' || Object.values(value).some(hasStringTag));
  const runner = {
    async $runCommandRaw(command: Record<string, unknown>): Promise<unknown> {
      commands.push(command);
      if ('listIndexes' in command) {
        const firstBatch = (collections.get(String(command.listIndexes)) ?? []).map((index) => ({ v: 2, ...index.spec }));
        if (hasStringTag(firstBatch)) throw new Error('Unknown tagged value');
        return { cursor: { firstBatch }, ok: 1 };
      }
      if ('dropIndexes' in command) throw new Error('le démarrage ne retire jamais un index');
      const collection = String(command.createIndexes);
      const [requested] = command.indexes as Record<string, unknown>[];
      const existing = collections.get(collection) ?? [{ name: '_id_', spec: { key: { _id: 1 }, name: '_id_' } }];
      const before = existing.length;
      const named = existing.find((index) => index.name === requested.name);
      if (named) {
        if (JSON.stringify(named.spec) !== JSON.stringify(requested)) throw prismaError(86, 'IndexKeySpecsConflict');
        return { numIndexesBefore: before, numIndexesAfter: before, note: 'all indexes already exist', ok: 1 };
      }
      const { name: _ignored, ...requestedOptions } = requested;
      const sameKey = existing.find((index) => JSON.stringify(index.spec.key) === JSON.stringify(requested.key));
      if (sameKey) {
        const { name: _alsoIgnored, ...existingOptions } = sameKey.spec;
        if (JSON.stringify(existingOptions) !== JSON.stringify(requestedOptions)) throw prismaError(85, 'IndexOptionsConflict');
      }
      collections.set(collection, [...existing, { name: String(requested.name), spec: requested }]);
      return { numIndexesBefore: before, numIndexesAfter: before + 1, ok: 1 };
    },
  };
  return { runner, collections, commands };
}

describe('ensureSocialEventIndexesByCommand — le chemin du démarrage (#10851)', () => {
  it('pose les dix index sur une base vierge, alors qu’un listIndexes ne se décode plus dès le premier', async () => {
    const { runner, collections } = mongoThroughPrisma();
    await expect(runner.$runCommandRaw({ createIndexes: 'ContentEvent', indexes: [createIndexSpec(SOCIAL_EVENT_INDEXES[0])] }))
      .resolves.toMatchObject({ ok: 1 });
    await expect(runner.$runCommandRaw({ listIndexes: 'ContentEvent' })).rejects.toThrow('Unknown tagged value');

    const { runner: fresh, collections: freshCollections } = mongoThroughPrisma();
    const outcomes = await ensureSocialEventIndexesByCommand(fresh);

    expect(Object.values(outcomes)).toEqual(SOCIAL_EVENT_INDEXES.map(() => ({ outcome: 'created' })));
    for (const spec of SOCIAL_EVENT_INDEXES) {
      expect((freshCollections.get(spec.collection) ?? []).map((index) => index.name)).toContain(spec.name);
    }
    expect(collections.size).toBe(1);
  });

  it('rejouée, ne recrée rien : chaque index est « present » et aucune collection ne gagne d’index', async () => {
    const { runner, collections } = mongoThroughPrisma();
    await ensureSocialEventIndexesByCommand(runner);
    const countsAfterFirst = [...collections.entries()].map(([name, indexes]) => [name, indexes.length]);

    const second = await ensureSocialEventIndexesByCommand(runner);

    expect(Object.values(second)).toEqual(SOCIAL_EVENT_INDEXES.map(() => ({ outcome: 'present' })));
    expect([...collections.entries()].map(([name, indexes]) => [name, indexes.length])).toEqual(countsAfterFirst);
  });

  it('un index existant du MÊME NOM et d’une AUTRE clé est signalé, jamais retiré, et les autres se posent', async () => {
    const squatter = { name: POST_IMPRESSION_TTL_INDEX, spec: { key: { createdAt: 1 }, name: POST_IMPRESSION_TTL_INDEX } };
    const { runner, collections, commands } = mongoThroughPrisma({
      PostImpression: [{ name: '_id_', spec: { key: { _id: 1 }, name: '_id_' } }, squatter],
    });

    const outcomes = await ensureSocialEventIndexesByCommand(runner);

    expect(outcomes[POST_IMPRESSION_TTL_INDEX]).toEqual({ outcome: 'conflict', reason: expect.stringContaining('86') });
    expect(collections.get('PostImpression')).toContainEqual(squatter);
    expect(commands.some((command) => 'dropIndexes' in command)).toBe(false);
    expect(Object.entries(outcomes).filter(([name]) => name !== POST_IMPRESSION_TTL_INDEX).map(([, outcome]) => outcome))
      .toEqual(SOCIAL_EVENT_INDEXES.slice(1).map(() => ({ outcome: 'created' })));
  });

  it('un index d’un autre nom sur la même clé SANS TTL est signalé, jamais retiré', async () => {
    const pushed = { name: 'ContentEvent_expiresAt_idx', spec: { key: { expiresAt: 1 }, name: 'ContentEvent_expiresAt_idx' } };
    const { runner, collections } = mongoThroughPrisma({ ContentEvent: [pushed] });

    const outcomes = await ensureSocialEventIndexesByCommand(runner);

    expect(outcomes.ContentEvent_expiresAt_ttl).toEqual({ outcome: 'conflict', reason: expect.stringContaining('85') });
    expect(collections.get('ContentEvent')).toContainEqual(pushed);
  });

  it('une panne qui n’est pas un conflit d’index remonte', async () => {
    const runner = { async $runCommandRaw(): Promise<unknown> { throw new Error('Server selection timeout'); } };

    await expect(ensureSocialEventIndexesByCommand(runner)).rejects.toThrow('Server selection timeout');
  });

  it('la commande de création porte TTL et filtre partiel, sans clé indéfinie', () => {
    expect(createIndexSpec(SOCIAL_EVENT_INDEXES[0])).toEqual({
      key: { eventKey: 1 }, name: 'ContentEvent_eventKey_unique', unique: true,
      partialFilterExpression: { eventKey: { $type: 'string' } },
    });
    expect(createIndexSpec(SOCIAL_EVENT_INDEXES[1])).toEqual({
      key: { expiresAt: 1 }, name: 'ContentEvent_expiresAt_ttl', expireAfterSeconds: 0,
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

describe('#10771, #10773 — l’empreinte du lecteur est indexée là où une ligne sans consentement la porte', () => {
  it.each(['PostImpression', 'PostEngagement'])('%s : (readerKey, postId), sur les seules lignes qui portent une empreinte', (collection) => {
    expect(SOCIAL_EVENT_INDEXES).toContainEqual(expect.objectContaining({
      collection,
      key: { readerKey: 1, postId: 1 },
      partialFilterExpression: { readerKey: { $exists: true } },
    }));
  });
});
