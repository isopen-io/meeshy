/**
 * #8891 / #9308 — **les copies figées AVANT #8886 / #8890 se rattrapent une
 * fois pour toutes, sans toucher ce qui n'est pas une copie.**
 *
 * Le témoin exécute les FICHIERS mongosh eux-mêmes (ceux que le porteur
 * rejouera en staging puis en production), dans un contexte isolé, contre une
 * collection simulée. Aucune copie TS de la règle ne peut donc dériver du
 * script : c'est le script qui est jugé. Sa fonction de nom est en plus tenue
 * égale, cas par cas, à `accountDisplayName` du gateway.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { accountDisplayName, type AccountNameFields } from '../../../services/participantNameSnapshots';
import { DELETED_ACCOUNT_DISPLAY_NAME } from '../../../services/messaging/deletedAccountDisplayName';

const MIGRATIONS = resolve(__dirname, '../../../../../../packages/shared/prisma/migrations');
const AVATAR_SCRIPT = resolve(MIGRATIONS, '2026-10-04-participant-avatar-snapshots.mongodb.js');
const NAME_SCRIPT = resolve(MIGRATIONS, '2026-10-04-participant-name-snapshots.mongodb.js');

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
type SetUpdate = { readonly $set: Doc };
type BulkOp = { readonly updateOne: { readonly filter: Filter; readonly update: SetUpdate } };

const isOperatorObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const matchesOperator = (value: unknown, op: string, arg: unknown): boolean => {
  switch (op) {
    case '$gt':
      return value !== undefined && String(value) > String(arg);
    case '$in':
      return Array.isArray(arg) && arg.some((candidate) => candidate === value);
    case '$ne':
      return arg === null ? value !== null && value !== undefined : value !== arg;
    case '$type':
      return arg === 'string' && typeof value === 'string';
    default:
      throw new Error(`opérateur non simulé : ${op}`);
  }
};

const matchesField = (value: unknown, condition: unknown): boolean =>
  isOperatorObject(condition)
    ? Object.entries(condition).every(([op, arg]) => matchesOperator(value, op, arg))
    : value === condition || (condition === null && value === undefined);

const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([field, condition]) => matchesField(doc[field], condition));

const project = (doc: Doc, projection: Record<string, number> | undefined): Doc =>
  projection
    ? Object.fromEntries(Object.entries(doc).filter(([field]) => projection[field] === 1))
    : { ...doc };

/**
 * Une base simulée : la seule chose mutable du témoin, parce que c'est ce
 * qu'une migration modifie. Elle tient le compte des lectures par collection
 * (les lots) et garde chaque opération d'écriture (ce qui part).
 */
const fakeDatabase = (seed: Readonly<Record<string, readonly Doc[]>>, hooks: { beforeBulkWrite?: (store: Doc[]) => void } = {}) => {
  const store = new Map(Object.entries(seed).map(([name, docs]) => [name, docs.map((doc) => ({ ...doc }))]));
  const reads = new Map<string, number>();
  const bulkOps: BulkOp[] = [];
  const updateManyCalls: Array<{ filter: Filter; update: SetUpdate }> = [];

  const applySet = (doc: Doc, update: SetUpdate): boolean => {
    const changed = Object.entries(update.$set).some(([field, value]) => doc[field] !== value);
    Object.assign(doc, update.$set);
    return changed;
  };

  const collection = (name: string) => {
    const docs = (): Doc[] => store.get(name) ?? [];
    return {
      find: (filter: Filter, projection?: Record<string, number>) => {
        reads.set(name, (reads.get(name) ?? 0) + 1);
        const found = docs()
          .filter((doc) => matches(doc, filter))
          .sort((a, b) => String(a._id).localeCompare(String(b._id)));
        const cursor = (rows: Doc[]) => ({
          sort: () => cursor(rows),
          limit: (n: number) => cursor(rows.slice(0, n)),
          toArray: () => rows.map((doc) => project(doc, projection)),
        });
        return cursor(found);
      },
      updateMany: (filter: Filter, update: SetUpdate) => {
        updateManyCalls.push({ filter, update });
        const modifiedCount = docs().filter((doc) => matches(doc, filter)).filter((doc) => applySet(doc, update)).length;
        return { matchedCount: modifiedCount, modifiedCount };
      },
      bulkWrite: (ops: readonly BulkOp[]) => {
        hooks.beforeBulkWrite?.(docs());
        bulkOps.push(...ops);
        const modifiedCount = ops.filter(({ updateOne }) => {
          const target = docs().find((doc) => matches(doc, updateOne.filter));
          return target ? applySet(target, updateOne.update) : false;
        }).length;
        return { modifiedCount };
      },
    };
  };

  return {
    db: { getCollection: collection },
    rows: (name: string): readonly Doc[] => store.get(name) ?? [],
    readsOf: (name: string): number => reads.get(name) ?? 0,
    bulkOps,
    updateManyCalls,
  };
};

type FakeDatabase = ReturnType<typeof fakeDatabase>;

/**
 * Charge le fichier mongosh tel qu'il part en production : il s'exécute dès le
 * chargement (sur la base fournie, avec l'environnement fourni), et ses
 * fonctions de premier niveau restent lisibles dans le contexte.
 */
const loadScript = (file: string, options: { env?: Record<string, string>; database?: FakeDatabase } = {}) => {
  const database = options.database ?? fakeDatabase({});
  const printed: string[] = [];
  const context = vm.createContext({
    db: database.db,
    print: (line: unknown) => printed.push(String(line)),
    process: { env: options.env ?? {} },
  });
  vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file });
  // Frontière avec un script non typé : le contexte expose ses fonctions par nom.
  const fn = <T>(name: string): T => context[name] as T;
  return { fn, printed, database };
};

type MigrationOptions = { readonly apply: boolean; readonly batchSize: number };
type Decision = { readonly action: string; readonly reason?: string; readonly displayName?: string };
type AvatarReport = { read: number; toRelease: number; released: number; spared: Record<string, number> };
type NameReport = { read: number; toRewrite: number; rewritten: number; kept: number; spared: Record<string, number> };

const hex = (n: number): string => n.toString(16).padStart(24, '0');

const participant = (n: number, overrides: Doc = {}): Doc => ({
  _id: hex(1000 + n),
  conversationId: hex(9000),
  type: 'user',
  userId: hex(n),
  displayName: `Ancien ${n}`,
  avatar: null,
  nickname: null,
  role: 'member',
  ...overrides,
});

const account = (n: number, overrides: Doc = {}): Doc => ({
  _id: hex(n),
  username: `user${n}`,
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: `Nouveau ${n}`,
  avatar: `https://cdn/compte-${n}.jpg`,
  deletedAt: null,
  ...overrides,
});

const APPLY = { apply: true, batchSize: 500 } as const;
const DRY = { apply: false, batchSize: 500 } as const;

describe('#8891 — libérer les copies de photo figées', () => {
  // Le script s'exécute au chargement : il est chargé sur une base VIDE, et sa
  // migration est rejouée sur la base du cas — les lectures comptées sont les siennes.
  const avatarScript = (database: FakeDatabase = fakeDatabase({})) => {
    const loaded = loadScript(AVATAR_SCRIPT);
    return {
      ...loaded,
      decide: loaded.fn<(row: Doc) => Decision>('avatarSnapshotDecision'),
      run: (options: MigrationOptions) =>
        loaded.fn<(db: unknown, o: MigrationOptions) => AvatarReport>('runAvatarSnapshotMigration')(database.db, options),
    };
  };

  describe('la décision — la règle de #8886, ligne par ligne', () => {
    const { decide } = avatarScript();

    it('libère la copie posée sur la ligne d’un inscrit', () => {
      expect(decide(participant(1, { avatar: 'https://cdn/old.jpg' }))).toEqual({ action: 'release' });
    });

    it('épargne une ligne anonyme — sa photo n’a aucun compte où retomber', () => {
      expect(decide(participant(1, { type: 'anonymous', userId: null, avatar: 'https://cdn/a.jpg' }))).toEqual({ action: 'spare', reason: 'anonymous' });
    });

    it('épargne une ligne `user` sans compte lié', () => {
      expect(decide(participant(1, { userId: null, avatar: 'https://cdn/a.jpg' }))).toEqual({ action: 'spare', reason: 'no-account' });
    });

    it('laisse une ligne sans copie', () => {
      expect(decide(participant(1, { avatar: null }))).toEqual({ action: 'keep' });
    });
  });

  it('À BLANC compte les copies à libérer et n’écrit rien', () => {
    const database = fakeDatabase({
      Participant: [participant(1, { avatar: 'a.jpg' }), participant(2, { avatar: 'b.jpg' }), participant(3)],
    });

    const report = avatarScript(database).run(DRY);

    expect(report).toMatchObject({ read: 2, toRelease: 2, released: 0 });
    expect(database.updateManyCalls).toHaveLength(0);
    expect(database.rows('Participant').map((row) => row.avatar)).toEqual(['a.jpg', 'b.jpg', null]);
  });

  it('APPLY libère la photo des inscrits seulement, et n’écrit que `avatar`', () => {
    const anonymous = participant(2, { type: 'anonymous', userId: null, avatar: 'anon.jpg', displayName: 'Invité' });
    const database = fakeDatabase({
      Participant: [participant(1, { avatar: 'old.jpg', nickname: 'Doudou' }), anonymous],
    });

    const report = avatarScript(database).run(APPLY);

    expect(report).toMatchObject({ read: 1, toRelease: 1, released: 1 });
    const [member, guest] = database.rows('Participant');
    expect(member).toEqual({ ...participant(1, { avatar: null, nickname: 'Doudou' }) });
    expect(guest).toEqual(anonymous);
    expect(database.updateManyCalls.map((call) => Object.keys(call.update.$set))).toEqual([['avatar']]);
  });

  it('est idempotente : une seconde exécution ne relit ni ne libère rien', () => {
    const database = fakeDatabase({
      Participant: [participant(1, { avatar: 'a.jpg' }), participant(2, { avatar: 'b.jpg' })],
    });
    const { run } = avatarScript(database);

    run(APPLY);
    const second = run(APPLY);

    expect(second).toMatchObject({ read: 0, toRelease: 0, released: 0 });
  });

  it('parcourt la collection par lots bornés, à blanc comme en écriture', () => {
    const seed = [1, 2, 3, 4, 5].map((n) => participant(n, { avatar: `${n}.jpg` }));
    const dry = fakeDatabase({ Participant: seed });
    const written = fakeDatabase({ Participant: seed });

    const dryReport = avatarScript(dry).run({ apply: false, batchSize: 2 });
    const writtenReport = avatarScript(written).run({ apply: true, batchSize: 2 });

    expect(dryReport).toMatchObject({ read: 5, toRelease: 5, released: 0 });
    expect(dry.readsOf('Participant')).toBe(3);
    expect(writtenReport).toMatchObject({ read: 5, toRelease: 5, released: 5 });
    expect(written.updateManyCalls).toHaveLength(3);
    expect(written.rows('Participant').every((row) => row.avatar === null)).toBe(true);
  });

  it('exécuté tel quel, il est à blanc par défaut et n’écrit qu’avec APPLY=1', () => {
    const seed = { Participant: [participant(1, { avatar: 'a.jpg' })] };
    const dry = fakeDatabase(seed);
    const written = fakeDatabase(seed);

    const dryRun = loadScript(AVATAR_SCRIPT, { database: dry });
    loadScript(AVATAR_SCRIPT, { database: written, env: { APPLY: '1' } });

    expect(dry.rows('Participant')[0].avatar).toBe('a.jpg');
    expect(dryRun.printed.join('\n')).toMatch(/À BLANC/);
    expect(dryRun.printed.join('\n')).toMatch(/À libérer\s+: 1/);
    expect(written.rows('Participant')[0].avatar).toBeNull();
  });
});

describe('#9308 — réaligner les noms figés', () => {
  // Le script s'exécute au chargement : il est chargé sur une base VIDE, et sa
  // migration est rejouée sur la base du cas — les lectures comptées sont les siennes.
  const nameScript = (database: FakeDatabase = fakeDatabase({})) => {
    const loaded = loadScript(NAME_SCRIPT);
    return {
      ...loaded,
      decide: loaded.fn<(row: Doc, account: Doc | undefined) => Decision>('nameSnapshotDecision'),
      compose: loaded.fn<(account: AccountNameFields) => string>('accountDisplayName'),
      run: (options: MigrationOptions) =>
        loaded.fn<(db: unknown, o: MigrationOptions) => NameReport>('runNameSnapshotMigration')(database.db, options),
    };
  };

  describe('le nom composé est celui du gateway, cas par cas', () => {
    const { compose } = nameScript();
    const cases: ReadonlyArray<AccountNameFields> = [
      { displayName: 'Ada', firstName: 'Augusta', lastName: 'King', username: 'ada' },
      { displayName: '  Ada  ', firstName: null, lastName: null, username: 'ada' },
      { displayName: '   ', firstName: 'Augusta', lastName: 'King', username: 'ada' },
      { displayName: null, firstName: ' Augusta ', lastName: '', username: 'ada' },
      { displayName: null, firstName: '', lastName: 'King', username: 'ada' },
      { displayName: null, firstName: '  ', lastName: '  ', username: 'ada' },
      { displayName: null, firstName: null, lastName: null, username: 'ada' },
    ];

    it.each(cases)('%j', (fields) => {
      expect(compose(fields)).toBe(accountDisplayName(fields));
    });
  });

  describe('la décision', () => {
    const { decide } = nameScript();

    it('réécrit une copie qui diffère du nom du compte', () => {
      expect(decide(participant(1), account(1))).toEqual({ action: 'rewrite', displayName: 'Nouveau 1' });
    });

    it('compose le nom comme le gateway quand le compte n’a pas de displayName', () => {
      expect(decide(participant(1), account(1, { displayName: null }))).toEqual({ action: 'rewrite', displayName: 'Ada Lovelace' });
    });

    it('laisse une copie déjà alignée', () => {
      expect(decide(participant(1, { displayName: 'Nouveau 1' }), account(1))).toEqual({ action: 'keep' });
    });

    it('épargne la ligne « Compte supprimé », même si le compte existe encore', () => {
      expect(decide(participant(1, { displayName: DELETED_ACCOUNT_DISPLAY_NAME }), account(1))).toEqual({ action: 'spare', reason: 'deleted-account-row' });
    });

    it('épargne la ligne d’un compte supprimé ou disparu', () => {
      expect(decide(participant(1), account(1, { deletedAt: new Date('2026-09-01') }))).toEqual({ action: 'spare', reason: 'deleted-account' });
      expect(decide(participant(1), undefined)).toEqual({ action: 'spare', reason: 'missing-account' });
    });

    it('n’écrit jamais un nom vide dans une colonne requise', () => {
      const unnamed = account(1, { displayName: ' ', firstName: '', lastName: '', username: '  ' });
      expect(decide(participant(1), unnamed)).toEqual({ action: 'spare', reason: 'unnamed-account' });
    });

    it('épargne une ligne anonyme', () => {
      expect(decide(participant(1, { type: 'anonymous', userId: null }), undefined)).toEqual({ action: 'spare', reason: 'anonymous' });
    });
  });

  it('À BLANC compte ce qui serait réécrit et n’écrit rien', () => {
    const database = fakeDatabase({
      Participant: [participant(1), participant(2, { displayName: 'Nouveau 2' })],
      User: [account(1), account(2)],
    });

    const report = nameScript(database).run(DRY);

    expect(report).toMatchObject({ read: 2, kept: 1, toRewrite: 1, rewritten: 0 });
    expect(database.bulkOps).toHaveLength(0);
    expect(database.rows('Participant')[0].displayName).toBe('Ancien 1');
  });

  it('APPLY réécrit `displayName` seul — le surnom et les lignes épargnées restent', () => {
    const database = fakeDatabase({
      Participant: [
        participant(1, { nickname: 'Doudou' }),
        participant(2, { displayName: DELETED_ACCOUNT_DISPLAY_NAME }),
        participant(3),
        participant(4, { type: 'anonymous', userId: null, displayName: 'Invité' }),
      ],
      User: [account(1), account(2), account(3, { deletedAt: new Date('2026-09-01') })],
    });

    const report = nameScript(database).run(APPLY);

    expect(report).toMatchObject({ read: 3, toRewrite: 1, rewritten: 1, spared: { 'deleted-account-row': 1, 'deleted-account': 1 } });
    expect(database.rows('Participant').map((row) => [row.displayName, row.nickname])).toEqual([
      ['Nouveau 1', 'Doudou'],
      [DELETED_ACCOUNT_DISPLAY_NAME, null],
      ['Ancien 3', null],
      ['Invité', null],
    ]);
    expect(database.bulkOps.map((op) => Object.keys(op.updateOne.update.$set))).toEqual([['displayName']]);
  });

  it('un renommage survenu entre la lecture et l’écriture gagne', () => {
    const database = fakeDatabase(
      { Participant: [participant(1)], User: [account(1)] },
      {
        beforeBulkWrite: (rows) => {
          rows.forEach((row) => Object.assign(row, { displayName: 'Renommé à l’instant' }));
        },
      },
    );

    const report = nameScript(database).run(APPLY);

    expect(report).toMatchObject({ toRewrite: 1, rewritten: 0 });
    expect(database.rows('Participant')[0].displayName).toBe('Renommé à l’instant');
  });

  it('est idempotente : une seconde exécution ne réécrit rien', () => {
    const database = fakeDatabase({
      Participant: [participant(1), participant(2), participant(3, { displayName: DELETED_ACCOUNT_DISPLAY_NAME })],
      User: [account(1), account(2, { displayName: null }), account(3)],
    });
    const { run } = nameScript(database);

    const first = run(APPLY);
    const second = run(APPLY);

    expect(first).toMatchObject({ toRewrite: 2, rewritten: 2 });
    expect(second).toMatchObject({ read: 3, kept: 2, toRewrite: 0, rewritten: 0 });
  });

  it('lit les comptes une fois par lot borné', () => {
    const database = fakeDatabase({
      Participant: [1, 2, 3, 4, 5].map((n) => participant(n)),
      User: [1, 2, 3, 4, 5].map((n) => account(n)),
    });

    const report = nameScript(database).run({ apply: true, batchSize: 2 });

    expect(report).toMatchObject({ read: 5, toRewrite: 5, rewritten: 5 });
    expect(database.readsOf('Participant')).toBe(3);
    expect(database.readsOf('User')).toBe(3);
    expect(database.bulkOps).toHaveLength(5);
  });

  it('exécuté tel quel, il est à blanc par défaut, borne les lots et journalise ses comptes', () => {
    const seed = { Participant: [participant(1)], User: [account(1)] };
    const dry = fakeDatabase(seed);
    const written = fakeDatabase(seed);

    const dryRun = loadScript(NAME_SCRIPT, { database: dry, env: { BATCH_SIZE: '999999' } });
    loadScript(NAME_SCRIPT, { database: written, env: { APPLY: '1', BATCH_SIZE: 'n’importe quoi' } });

    const journal = dryRun.printed.join('\n');
    expect(dry.rows('Participant')[0].displayName).toBe('Ancien 1');
    expect(journal).toMatch(/À BLANC/);
    expect(journal).toMatch(/Lots de 5000/);
    expect(journal).toMatch(/Lues \(type user, compte lié\) : 1/);
    expect(journal).toMatch(/À réécrire\s+: 1/);
    expect(journal).toMatch(/Réécrites\s+: 0/);
    expect(written.rows('Participant')[0].displayName).toBe('Nouveau 1');
  });
});
