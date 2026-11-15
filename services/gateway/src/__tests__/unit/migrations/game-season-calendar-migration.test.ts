/**
 * #10016 / #10232 — **le calendrier des saisons passe en base : la saison 1 est seedée telle que la constante la
 * fixe (aucun changement visible), jamais réécrite si l'admin l'a posée, et tout se défait.**
 *
 * Le témoin exécute le FICHIER mongosh lui-même, contre des collections simulées : c'est le script qui est jugé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { normalizeSeasonSchedule, scheduledSeasonCalendar } from '@meeshy/shared/utils/game/season-schedule';
import { seasonCalendar } from '@meeshy/shared/utils/game/season';

const SCRIPT = resolve(__dirname, '../../../../../../packages/shared/prisma/migrations/2026-10-11-game-season-calendar.mongodb.js');

type Doc = Record<string, unknown>;

const matches = (doc: Doc, filter: Doc): boolean => Object.entries(filter).every(([k, v]) => doc[k] === v);

function fakeDatabase(seed: Readonly<Record<string, Doc[]>> = {}) {
  const data: Record<string, Doc[]> = { GameSeasonDefinition: [], GameSeasonProposal: [], _migration_2026_10_11_season_calendar: [], ...structuredClone(seed) };
  const indexes: string[] = [];
  const collection = (name: string) => {
    const docs = data[name];
    if (!docs) throw new Error(`collection inattendue : ${name}`);
    return {
      createIndex: (_keys: Doc, opts: { name: string }) => {
        indexes.push(opts.name);
        return opts.name;
      },
      findOne: (filter: Doc = {}) => docs.find((d) => matches(d, filter)) ?? null,
      updateOne: (filter: Doc, update: { $setOnInsert?: Doc }, opts: { upsert?: boolean }) => {
        const found = docs.find((d) => matches(d, filter));
        if (found) return { matchedCount: 1, upsertedCount: 0 };
        if (!opts.upsert) return { matchedCount: 0, upsertedCount: 0 };
        docs.push({ ...filter, ...structuredClone(update.$setOnInsert ?? {}) });
        return { matchedCount: 0, upsertedCount: 1 };
      },
      deleteMany: (filter: Doc) => {
        const keep = docs.filter((d) => !matches(d, filter));
        const deletedCount = docs.length - keep.length;
        docs.splice(0, docs.length, ...keep);
        return { deletedCount };
      },
    };
  };
  return { db: { getCollection: collection }, data, indexes };
}

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  vm.runInContext(readFileSync(SCRIPT, 'utf8'), vm.createContext({ db: database.db, print: (l: unknown) => printed.push(String(l)), process: { env } }));
  return printed.join('\n');
};

describe('migration du calendrier des saisons', () => {
  it('à blanc : n’écrit rien', () => {
    const database = fakeDatabase();
    expect(run(database)).toContain('À BLANC');
    expect(database.data.GameSeasonDefinition).toEqual([]);
    expect(database.indexes).toEqual([]);
  });

  it('APPLY=1 : seed la saison 1, pose les index, et la loi rend la constante', () => {
    const database = fakeDatabase();
    expect(run(database, { APPLY: '1' })).toContain('saison 1 : posée');
    expect(database.data.GameSeasonDefinition).toEqual([
      expect.objectContaining({ number: 1, startDay: '2026-12-21', status: 'scheduled', themeKey: 'language:fr', stepPoints: 100, copy: null, revision: 1 }),
    ]);
    expect(database.indexes).toEqual(expect.arrayContaining(['GameSeasonDefinition_number_key', 'GameSeasonDefinition_revision_key']));
    const schedule = normalizeSeasonSchedule({ revision: 1, seasons: database.data.GameSeasonDefinition });
    expect(schedule.seasons).toHaveLength(1);
    for (const n of [1, 2, 3, 12]) expect(scheduledSeasonCalendar(schedule, n)).toEqual(seasonCalendar(n));
  });

  it('rejouable : une seconde exécution ne double rien et ne réécrit pas une saison 1 posée par l’admin', () => {
    const database = fakeDatabase({ GameSeasonDefinition: [{ number: 1, startDay: '2027-01-04', status: 'scheduled', themeKey: 'language:es', stepPoints: 150, copy: null, revision: 3 }] });
    expect(run(database, { APPLY: '1' })).toContain('déjà présente');
    expect(run(database, { APPLY: '1' })).toContain('déjà présente');
    expect(database.data.GameSeasonDefinition).toEqual([expect.objectContaining({ startDay: '2027-01-04', revision: 3 })]);
    expect(database.data._migration_2026_10_11_season_calendar).toEqual([]);
  });

  it('ROLLBACK=1 retire le seed s’il est intact, et laisse une saison réécrite depuis', () => {
    const database = fakeDatabase();
    run(database, { APPLY: '1' });
    expect(run(database, { ROLLBACK: '1' })).toContain('saison 1 du seed retirée : 1');
    expect(database.data.GameSeasonDefinition).toEqual([]);
    expect(database.data._migration_2026_10_11_season_calendar).toEqual([]);

    run(database, { APPLY: '1' });
    database.data.GameSeasonDefinition[0]!.revision = 4;
    database.data.GameSeasonDefinition[0]!.startDay = '2027-01-04';
    expect(run(database, { ROLLBACK: '1' })).toContain('laissée en place');
    expect(database.data.GameSeasonDefinition).toHaveLength(1);
  });

  it('ROLLBACK=1 sans seed : rien à retirer', () => {
    expect(run(fakeDatabase(), { ROLLBACK: '1' })).toContain('rien à retirer');
  });

  it('n’écrase pas une programmation antérieure : pas de seed (révision 1 en double évitée)', () => {
    const database = fakeDatabase({ GameSeasonDefinition: [{ number: 2, startDay: '2027-03-01', status: 'scheduled', themeKey: 'language:ja', stepPoints: 100, copy: null, revision: 1 }] });
    expect(run(database, { APPLY: '1' })).toContain('seed inutile');
    expect(database.data.GameSeasonDefinition).toHaveLength(1);
  });
});
