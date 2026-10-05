/**
 * LA PURGE DU JEU (#9384 à #9392, conformité I-1) — toutes les tables du jeu
 * disparaissent avec le compte, et un TÉMOIN D'EXHAUSTIVITÉ confronte l'inventaire
 * au schéma : un modèle de jeu par compte qui n'y figure pas fait tomber la suite.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_PURGED_MODELS, purgeGameData } from '../GamePurge';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

type SchemaModel = { readonly name: string; readonly documentation: string; readonly fields: readonly string[] };

/** Les modèles du `schema.prisma`, lus tels qu'écrits : le nom, les `///` qui le précèdent, les champs. */
function schemaModels(): SchemaModel[] {
  const text = readFileSync(resolve(__dirname, '../../../../../../packages/shared/prisma/schema.prisma'), 'utf8');
  const lines = text.split('\n');
  const models: SchemaModel[] = [];
  let doc: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.startsWith('///')) doc.push(line);
    else if (/^model\s+\w+\s*\{/.test(line)) {
      const name = /^model\s+(\w+)/.exec(line)![1]!;
      const fields: string[] = [];
      for (let j = i + 1; j < lines.length && !lines[j]!.startsWith('}'); j += 1) {
        const field = /^\s{2}(\w+)\s+\S/.exec(lines[j]!);
        if (field && !lines[j]!.trim().startsWith('//')) fields.push(field[1]!);
      }
      models.push({ name, documentation: doc.join(' '), fields });
      doc = [];
    } else doc = [];
  }
  return models;
}

const MODELS = schemaModels();

/** Les modèles du schéma qui portent une ligne PAR COMPTE et se réclament d'une issue du jeu (#9373 à #9392). */
const gameModelsInSchema = MODELS
  .filter((model) => /#93(7[3-9]|[89]\d)\b/.test(model.documentation))
  .filter((model) => model.fields.some((field) => ['userId', 'inviterId', 'inviteeId'].includes(field)))
  .map((model) => lowerFirst(model.name));

describe('exhaustivité de la purge', () => {
  it('chaque modèle du jeu par compte du schéma est purgé (ou est un duo, purgé par ses deux bouts)', () => {
    const covered = new Set<string>([...GAME_PURGED_MODELS, 'gameDuo']);
    expect(gameModelsInSchema.filter((name) => !covered.has(name))).toEqual([]);
  });

  it('le témoin voit bien les modèles du jeu : il n’est pas vide', () => {
    expect(gameModelsInSchema).toEqual(expect.arrayContaining(['gloryLedger', 'dailyMission', 'gameDay', 'leagueMembership', 'gameTrophy']));
  });

  it('l’inventaire ne nomme que des modèles qui existent', () => {
    const names = new Set(MODELS.map((model) => lowerFirst(model.name)));
    expect(GAME_PURGED_MODELS.filter((name) => !names.has(name))).toEqual([]);
  });
});

describe('purgeGameData', () => {
  const seed = () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 40, prestige: 2, flameFreezes: 1, guideSeen: ['a'], publicLeagueConsentAt: new Date(), publicLeagueConsentVersion: 'v1' });
    seedUser(db, { levelRecord: 10 }, OTHER);
    for (const [model, rows] of Object.entries({
      dailyMission: [{ id: 'a', userId: USER }, { id: 'a2', userId: OTHER }],
      gameDay: [{ id: 'b', userId: USER }],
      engagementQuota: [{ id: 'c', userId: USER }],
      meeshLedger: [{ id: 'd', userId: USER, actorId: OTHER }, { id: 'd2', userId: OTHER, actorId: USER }],
      gloryLedger: [{ id: 'e', userId: USER }, { id: 'e2', userId: OTHER, actorId: USER }],
      gameProfile: [{ id: 'f', userId: USER }],
      leaguePseudonym: [{ id: 'g', userId: USER }],
      leagueMembership: [{ id: 'h', userId: USER }, { id: 'h2', userId: OTHER }],
      gameWeekPoints: [{ id: 'i', userId: USER }],
      gameDuoSlot: [{ id: 'j', userId: USER }],
      gameSeason: [{ id: 'k', userId: USER }],
      gameTrophy: [{ id: 'l', userId: USER }],
      atlasStamp: [{ id: 'm', userId: USER }],
      gameDuo: [{ id: 'n', inviterId: USER, inviteeId: OTHER }, { id: 'n2', inviterId: OTHER, inviteeId: USER }, { id: 'n3', inviterId: OTHER, inviteeId: '68a0000000000000000000ff' }],
    })) (db as unknown as Record<string, { rows: unknown[] }>)[model]!.rows.push(...rows);
    return db;
  };

  it('supprime chaque ligne du compte dans chaque table, et rien de ceux des autres', async () => {
    const db = seed();
    const summary = await purgeGameData(db.prisma, USER);

    expect(summary.duosDeleted).toBe(2);
    for (const model of GAME_PURGED_MODELS) {
      const rows = (db as unknown as Record<string, { rows: { userId: string }[] }>)[model]!.rows;
      expect(rows.filter((row) => row.userId === USER)).toEqual([]);
    }
    expect(db.dailyMission.rows.map((r) => r.id)).toEqual(['a2']);
    expect(db.leagueMembership.rows.map((r) => r.id)).toEqual(['h2']);
    expect(db.gameDuo.rows.map((r) => r.id)).toEqual(['n3']);
  });

  it('dépersonnalise les dons faits aux autres (actorId), sans supprimer leur historique', async () => {
    const db = seed();
    await purgeGameData(db.prisma, USER);
    expect(db.meeshLedger.rows).toEqual([expect.objectContaining({ id: 'd2', actorId: null })]);
    expect(db.gloryLedger.rows).toEqual([expect.objectContaining({ id: 'e2', actorId: null })]);
  });

  it('efface les colonnes de jeu et le consentement de ligue du compte, pas ceux des autres', async () => {
    const db = seed();
    await purgeGameData(db.prisma, USER);
    expect(db.user.rows.find((u) => u.id === USER)).toMatchObject({ publicLeagueConsentAt: null, publicLeagueConsentVersion: null, levelRecord: null, prestige: null, flameFreezes: null, guideSeen: [] });
    expect(db.user.rows.find((u) => u.id === OTHER)!.levelRecord).toBe(10);
  });

  it('est idempotent', async () => {
    const db = seed();
    await purgeGameData(db.prisma, USER);
    const second = await purgeGameData(db.prisma, USER);
    expect(second.duosDeleted).toBe(0);
    expect(Object.values(second.deleted).every((n) => n === 0)).toBe(true);
  });
});
