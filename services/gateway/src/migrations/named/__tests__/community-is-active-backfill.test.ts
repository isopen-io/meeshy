import type { Db } from 'mongodb';
import { NAMED_MIGRATIONS } from '../registry';
import { runNamedMigration } from '../runner';

/**
 * #10924 — « mes communautés » était VIDE pour les communautés créées avant que
 * `isActive` existe : le filtre `isActive: true` (#8876) ne retient pas une
 * colonne ABSENTE (Prisma Mongo, mesuré sur staging : `true` = 4, `not: false`
 * = 4, total = 12). Huit communautés sur dix en production, quatorze adhésions
 * aussi. La migration pose `isActive: true` là où la colonne manque, et nulle
 * part ailleurs : une communauté DÉSACTIVÉE (`false`) le reste.
 */

const NAME = '2026-10-18-community-is-active-backfill';

type Update = { readonly collection: string; readonly filter: unknown; readonly update: unknown };

function fakeDb(missing: Readonly<Record<string, number>>, updates: Update[]): Db {
  const collection = (name: string) => ({
    countDocuments: async () => missing[name] ?? 0,
    updateMany: async (filter: unknown, update: unknown) => {
      updates.push({ collection: name, filter, update });
      return { modifiedCount: missing[name] ?? 0 };
    },
  });
  return { collection } as unknown as Db;
}

describe('backfill de isActive sur les communautés et adhésions héritées (#10924)', () => {
  it('est enregistrée parmi les migrations nommées', () => {
    expect(NAMED_MIGRATIONS.map((migration) => migration.name)).toContain(NAME);
  });

  it('pose isActive: true UNIQUEMENT là où la colonne manque, sur Community et CommunityMember', async () => {
    const updates: Update[] = [];
    await runNamedMigration({
      name: NAME,
      apply: true,
      db: fakeDb({ Community: 8, CommunityMember: 14 }, updates),
      env: {},
      log: () => undefined,
    });
    expect(updates).toEqual([
      { collection: 'Community', filter: { isActive: { $exists: false } }, update: { $set: { isActive: true } } },
      { collection: 'CommunityMember', filter: { isActive: { $exists: false } }, update: { $set: { isActive: true } } },
    ]);
  });

  it('à blanc, elle compte sans écrire', async () => {
    const updates: Update[] = [];
    const lines: string[] = [];
    await runNamedMigration({
      name: NAME,
      apply: false,
      db: fakeDb({ Community: 8, CommunityMember: 14 }, updates),
      env: {},
      log: (line) => lines.push(line),
    });
    expect(updates).toEqual([]);
    expect(lines.join('\n')).toContain('Community sans isActive : 8');
    expect(lines.join('\n')).toContain('CommunityMember sans isActive : 14');
  });
});
