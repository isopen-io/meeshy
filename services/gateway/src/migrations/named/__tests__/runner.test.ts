import type { Db } from 'mongodb';
import { NAMED_MIGRATIONS, type NamedMigration } from '../registry';
import { runNamedMigration } from '../runner';
import { DryRunWriteRefused } from '../read-only-db';
import { describeMongoshMigration, mongoshMode } from '../mongosh';

type Call = { readonly target: string; readonly method: string };

const WRITE_METHODS = new Set([
  'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
  'bulkWrite', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'createIndex',
  'createIndexes', 'dropIndex', 'dropIndexes', 'drop', 'rename', 'command', 'createCollection',
]);

function cursorOf<T>(rows: readonly T[]) {
  return { toArray: async () => [...rows] };
}

function fakeDb(calls: Call[]): Db {
  const record = (target: string, method: string) => calls.push({ target, method });
  const collection = (name: string) => ({
    find: (..._args: unknown[]) => { record(name, 'find'); return cursorOf([{ _id: { toHexString: () => 'a'.repeat(24) }, postId: 'p', sessionKey: 'raw-token', createdAt: new Date(0) }]); },
    findOne: async () => { record(name, 'findOne'); return null; },
    listIndexes: () => { record(name, 'listIndexes'); return cursorOf([]); },
    countDocuments: async () => { record(name, 'countDocuments'); return 3; },
    aggregate: () => { record(name, 'aggregate'); return cursorOf([]); },
    updateOne: async () => { record(name, 'updateOne'); return { modifiedCount: 1 }; },
    updateMany: async () => { record(name, 'updateMany'); return { modifiedCount: 3 }; },
    deleteOne: async () => { record(name, 'deleteOne'); return { deletedCount: 1 }; },
    insertOne: async () => { record(name, 'insertOne'); return {}; },
    createIndex: async () => { record(name, 'createIndex'); return 'idx'; },
    dropIndex: async () => { record(name, 'dropIndex'); return {}; },
  });
  const db = {
    collection,
    listCollections: () => { record('db', 'listCollections'); return cursorOf([{ name: 'AnonymousPostOpen' }]); },
    command: async () => { record('db', 'command'); return { ok: 1 }; },
  };
  return db as unknown as Db;
}

const writesOf = (calls: readonly Call[]) => calls.filter((call) => WRITE_METHODS.has(call.method));

const ENV = {
  READER_KEY_HMAC_SECRET: 's'.repeat(48),
  RAW_READING_RETENTION_DAYS: '760',
  ATTACHMENT_URL_SIGNING_KEY: Buffer.alloc(32, 7).toString('base64'),
} as const;

/** Le retour arrière du scellement (#13100) ne s'applique que scellement suspendu. */
const envOf = (name: string) => (name.endsWith('-unseal') ? { ...ENV, AT_REST_FILE_SEALING: 'off' } : ENV);

const silent = () => undefined;

describe('migrations nommées de la passerelle — exécuteur embarqué dans l’image (#10865)', () => {
  it.each(NAMED_MIGRATIONS.map((migration) => migration.name))(
    'à blanc, %s ne fait AUCUNE écriture et rend un rapport',
    async (name) => {
      const calls: Call[] = [];
      const lines: string[] = [];
      await runNamedMigration({ name, apply: false, db: fakeDb(calls), env: envOf(name), log: (line) => lines.push(line) });
      expect(writesOf(calls)).toEqual([]);
      expect(lines.join('\n')).toContain('À BLANC');
    },
  );

  it.each(NAMED_MIGRATIONS.map((migration) => migration.name))(
    'avec --apply, %s écrit',
    async (name) => {
      const calls: Call[] = [];
      await runNamedMigration({ name, apply: true, db: fakeDb(calls), env: envOf(name), log: silent });
      expect(writesOf(calls).length).toBeGreaterThan(0);
    },
  );

  it('à blanc, une migration qui tenterait d’écrire est refusée avant d’atteindre la base', async () => {
    const calls: Call[] = [];
    const rogue: NamedMigration = {
      name: 'rogue',
      issue: '#0',
      summary: 'écrit même à blanc',
      run: async ({ db }) => {
        await db.collection('Post').updateMany({}, { $set: { x: 1 } });
      },
    };
    await expect(
      runNamedMigration({ name: 'rogue', apply: false, db: fakeDb(calls), env: ENV, log: silent, migrations: [rogue] }),
    ).rejects.toBeInstanceOf(DryRunWriteRefused);
    expect(writesOf(calls)).toEqual([]);
  });

  it('à blanc, un pipeline d’agrégation qui écrit ($out / $merge) est refusé', async () => {
    const calls: Call[] = [];
    const rogue: NamedMigration = {
      name: 'rogue-out',
      issue: '#0',
      summary: 'agrège vers une collection',
      run: async ({ db }) => {
        await db.collection('Post').aggregate([{ $match: {} }, { $out: 'Copy' }]).toArray();
      },
    };
    await expect(
      runNamedMigration({ name: 'rogue-out', apply: false, db: fakeDb(calls), env: ENV, log: silent, migrations: [rogue] }),
    ).rejects.toBeInstanceOf(DryRunWriteRefused);
    expect(calls).toEqual([]);
  });

  it('un nom inconnu échoue en citant les migrations disponibles', async () => {
    await expect(
      runNamedMigration({ name: 'nope', apply: false, db: fakeDb([]), env: ENV, log: silent }),
    ).rejects.toThrow(NAMED_MIGRATIONS[0].name);
  });

  it('la clé de lecteur exige le secret de la passerelle visée, même à blanc', async () => {
    await expect(
      runNamedMigration({
        name: '2026-10-13-anonymous-post-open-reader-key',
        apply: false,
        db: fakeDb([]),
        env: {},
        log: silent,
      }),
    ).rejects.toThrow('READER_KEY_HMAC_SECRET');
  });
});

describe('migrations mongosh — la convention de mode se lit dans le script', () => {
  it('APPLY ⇒ à blanc par défaut', () => {
    expect(mongoshMode('const apply = process.env.APPLY === "1";')).toBe('apply-to-write');
  });

  it('DRY_RUN ⇒ écrit par défaut', () => {
    expect(mongoshMode("const dryRun = process.env.DRY_RUN === '1';")).toBe('dry-run-to-simulate');
  });

  it('ni l’un ni l’autre ⇒ écrit sans mode à blanc', () => {
    expect(mongoshMode('db.Message.createIndex({ a: 1 });')).toBe('writes-only');
  });

  it('la commande servie lit le script DEPUIS l’image passerelle et l’envoie au mongosh de la base', () => {
    const lines = describeMongoshMigration({
      file: '2026-10-12-post-reading-counters-backfill.mongodb.js',
      mode: 'dry-run-to-simulate',
      gateway: 'meeshy-gateway',
      database: 'meeshy-database',
    });
    expect(lines.join('\n')).toContain(
      'docker exec meeshy-gateway cat /app/packages/shared/prisma/migrations/2026-10-12-post-reading-counters-backfill.mongodb.js | docker exec -i -e DRY_RUN=1 meeshy-database mongosh "$URI" --quiet',
    );
  });
});
