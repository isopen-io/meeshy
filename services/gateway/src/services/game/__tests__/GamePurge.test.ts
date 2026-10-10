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
import { GAME_PURGED_MODELS, GAME_PURGE_EXCEPTIONS, purgeGameData } from '../GamePurge';
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

/** Les noms qui disent « jeu » même quand leur documentation ne cite pas d'issue. */
const GAME_NAME = /^(Game|League|Atlas|Achievement|DailyMission|GloryLedger|MeeshLedger|EngagementQuota|EngagementPostPoints|AffiliateVisit)/;

/** Les modèles du schéma qui portent une ligne PAR COMPTE et se réclament du jeu (issues #9373 à #9392, ou nom de jeu). */
const gameModelsInSchema = MODELS
  .filter((model) => /#93(7[3-9]|[89]\d)\b/.test(model.documentation) || GAME_NAME.test(model.name))
  .filter((model) => model.fields.some((field) => ['userId', 'inviterId', 'inviteeId', 'referredUserId', 'affiliateUserId'].includes(field)))
  .map((model) => lowerFirst(model.name));

describe('exhaustivité de la purge', () => {
  it('chaque modèle du jeu par compte du schéma est traité : purgé, ou nommé dans les exceptions justifiées', () => {
    const covered = new Set<string>([...GAME_PURGED_MODELS, ...Object.keys(GAME_PURGE_EXCEPTIONS)]);
    expect(gameModelsInSchema.filter((name) => !covered.has(name))).toEqual([]);
  });

  it('le témoin voit bien les modèles du jeu : il n’est pas vide', () => {
    expect(gameModelsInSchema).toEqual(expect.arrayContaining(['gloryLedger', 'dailyMission', 'gameDay', 'leagueMembership', 'gameTrophy']));
  });

  it('chaque exception dit pourquoi, et nomme un modèle qui existe', () => {
    const names = new Set(MODELS.map((model) => lowerFirst(model.name)));
    for (const [model, reason] of Object.entries(GAME_PURGE_EXCEPTIONS)) {
      expect(names.has(model)).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
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
      engagementPostPoints: [{ id: 'o', userId: USER, postId: 'p1', totalPoints: 4 }, { id: 'o2', userId: OTHER, postId: 'p1', totalPoints: 7 }],
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

  it('retire ce que les posts ont rapporté au compte (#9569) — la trace de ses gestes post par post —, pas ce qu’ils ont rapporté aux autres', async () => {
    const db = seed();
    const summary = await purgeGameData(db.prisma, USER);

    expect(summary.deleted.engagementPostPoints).toBe(1);
    expect(db.engagementPostPoints.rows.map((r) => r.id)).toEqual(['o2']);
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


describe('intégrité référentielle après la purge', () => {
  const PARTNER = '68a0000000000000000000aa';
  const P2 = '68a0000000000000000000bb';
  const WEEK = '2026-10-12';

  const duoWorld = (partnerDone: boolean) => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 }, USER);
    seedUser(db, { engagementScore: 4000, levelRecord: 20 }, PARTNER);
    db.gameDuo.rows.push({
      id: 'duo1', weekKey: WEEK, inviterId: USER, inviteeId: PARTNER, status: 'active', templateKey: 'duo-messages', signal: 'axis:content.text_message',
      prism: false, partTarget: 40, commonTarget: 80, inviterProgress: 10, inviteeProgress: partnerDone ? 40 : 5, inviterPaidAt: null, inviteePaidAt: null,
      inviterSeen: [], inviteeSeen: [], createdAt: new Date(),
    });
    db.gameDuoSlot.rows.push({ id: 's1', userId: USER, weekKey: WEEK, duoId: 'duo1' }, { id: 's2', userId: PARTNER, weekKey: WEEK, duoId: 'duo1' });
    return db;
  };

  it('un duo actif est terminé proprement : plus aucun duo ni emplacement ne pointe vers le compte effacé', async () => {
    const db = duoWorld(false);
    await purgeGameData(db.prisma, USER);
    expect(db.gameDuo.rows.filter((d) => d.inviterId === USER || d.inviteeId === USER)).toEqual([]);
    expect(db.gameDuoSlot.rows).toEqual([]);
  });

  it('le partenaire qui avait FINI sa part reçoit sa part simple, une fois ; sinon rien n’est payé', async () => {
    const paid: [string, number][] = [];
    const creditPoints = async (userId: string, points: number) => void paid.push([userId, points]);

    const done = duoWorld(true);
    await purgeGameData(done.prisma, USER, { creditPoints });
    await purgeGameData(done.prisma, USER, { creditPoints });
    expect(paid.map((p) => p[0])).toEqual([PARTNER]);
    expect(paid[0]![1]).toBeGreaterThan(0);

    paid.length = 0;
    const notDone = duoWorld(false);
    await purgeGameData(notDone.prisma, USER, { creditPoints });
    expect(paid).toEqual([]);
  });

  it('un crédit du partenaire qui échoue ne retient JAMAIS l’effacement : le compte est purgé, le duo aussi', async () => {
    const db = duoWorld(true);
    const creditPoints = async () => {
      throw new Error('credit down');
    };

    await expect(purgeGameData(db.prisma, USER, { creditPoints })).resolves.toBeDefined();
    expect(db.gameDuo.rows).toEqual([]);
    expect(db.gameDuoSlot.rows).toEqual([]);
  });

  it('une invitation en attente envoyée au compte effacé libère l’emplacement de l’invitant', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    seedUser(db, {}, PARTNER);
    db.gameDuo.rows.push({ id: 'duo2', weekKey: WEEK, inviterId: PARTNER, inviteeId: USER, status: 'invited', inviterProgress: 0, inviteeProgress: 0, createdAt: new Date() });
    db.gameDuoSlot.rows.push({ id: 's3', userId: PARTNER, weekKey: WEEK, duoId: 'duo2' });
    await purgeGameData(db.prisma, USER);
    expect(db.gameDuo.rows).toEqual([]);
    expect(db.gameDuoSlot.rows).toEqual([]);
  });

  it('un groupe de ligue ne garde aucun membre fantôme : appartenance, instantané et effectif suivent', async () => {
    const db = fakeGameDb();
    for (const id of [USER, PARTNER, P2]) seedUser(db, {}, id);
    db.leagueGroupWeek.rows.push({ id: 'g', groupId: 'G1', weekKey: WEEK, league: 'jade', memberCount: 3, snapshot: { [USER]: 90, [PARTNER]: 50, [P2]: 10 }, settledAt: null });
    for (const id of [USER, PARTNER, P2]) db.leagueMembership.rows.push({ id: `m-${id}`, userId: id, weekKey: WEEK, groupId: 'G1', league: 'jade', settledAt: null });

    await purgeGameData(db.prisma, USER);

    expect(db.leagueMembership.rows.map((m) => m.userId).sort()).toEqual([PARTNER, P2].sort());
    expect(db.leagueGroupWeek.rows[0]).toMatchObject({ memberCount: 2, snapshot: { [PARTNER]: 50, [P2]: 10 } });
    expect(JSON.stringify(db.leagueGroupWeek.rows[0]!.snapshot)).not.toContain(USER);
  });

  it('un groupe laissé vide est supprimé : aucune ligne orpheline', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    db.leagueGroupWeek.rows.push({ id: 'g', groupId: 'G9', weekKey: WEEK, league: 'quartz', memberCount: 1, snapshot: { [USER]: 5 }, settledAt: null });
    db.leagueMembership.rows.push({ id: 'm', userId: USER, weekKey: WEEK, groupId: 'G9', league: 'quartz', settledAt: null });
    await purgeGameData(db.prisma, USER);
    expect(db.leagueGroupWeek.rows).toEqual([]);
  });

  it('les visites de parrainage et les tampons ne gardent pas l’identifiant du compte', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    db.affiliateVisitSession.rows.push({ id: 'v1', sessionKey: 'k', affiliateUserId: USER, referredUserId: null }, { id: 'v2', sessionKey: 'k2', affiliateUserId: PARTNER, referredUserId: USER });
    await purgeGameData(db.prisma, USER);
    expect(db.affiliateVisitSession.rows).toEqual([expect.objectContaining({ id: 'v2', referredUserId: null })]);
  });
});

describe('un compte qui a beaucoup joué n’est pas purgé à moitié (#9481)', () => {
  const PARTNER = '68a0000000000000000000aa';
  const COUNT = 1203;
  const weekOf = (n: number) => `W${String(n).padStart(5, '0')}`;

  it('plus de borne à 500 duos : tous les duos du compte, et leurs emplacements, disparaissent', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    seedUser(db, {}, PARTNER);
    for (let n = 0; n < COUNT; n += 1) {
      const [inviterId, inviteeId] = n % 2 === 0 ? [USER, PARTNER] : [PARTNER, USER];
      db.gameDuo.rows.push({ id: `d${n}`, weekKey: weekOf(n), inviterId, inviteeId, status: 'abandoned', inviterProgress: 0, inviteeProgress: 0, createdAt: new Date() });
      db.gameDuoSlot.rows.push({ id: `s${n}`, userId: USER, weekKey: weekOf(n), duoId: `d${n}` });
    }
    db.gameDuo.rows.push({ id: 'other', weekKey: weekOf(0), inviterId: PARTNER, inviteeId: '68a0000000000000000000ff', status: 'active', inviterProgress: 0, inviteeProgress: 0, createdAt: new Date() });

    const summary = await purgeGameData(db.prisma, USER);

    expect(summary.duosDeleted).toBe(COUNT);
    expect(db.gameDuo.rows.map((d) => d.id)).toEqual(['other']);
    expect(db.gameDuoSlot.rows).toEqual([]);
  });

  it('plus de borne à 50 duos ouverts : chacun est terminé proprement avant d’être effacé', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    seedUser(db, {}, PARTNER);
    for (let n = 0; n < 120; n += 1) {
      db.gameDuo.rows.push({ id: `d${n}`, weekKey: weekOf(n), inviterId: USER, inviteeId: PARTNER, status: 'invited', inviterProgress: 0, inviteeProgress: 0, createdAt: new Date() });
    }

    const summary = await purgeGameData(db.prisma, USER, { creditPoints: async () => undefined });

    expect(summary.duosSettled).toBe(120);
    expect(db.gameDuo.rows).toEqual([]);
  });

  it('plus de borne à 500 groupes de ligue : aucun membre fantôme ne reste', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    for (let n = 0; n < COUNT; n += 1) {
      db.leagueGroupWeek.rows.push({ id: `g${n}`, groupId: `G${n}`, weekKey: weekOf(n), league: 'jade', memberCount: 2, snapshot: { [USER]: 1, [PARTNER]: 2 }, settledAt: null });
      db.leagueMembership.rows.push({ id: `m${n}`, userId: USER, weekKey: weekOf(n), groupId: `G${n}`, league: 'jade', settledAt: null });
      db.leagueMembership.rows.push({ id: `p${n}`, userId: PARTNER, weekKey: weekOf(n), groupId: `G${n}`, league: 'jade', settledAt: null });
    }

    const summary = await purgeGameData(db.prisma, USER);

    expect(summary.leagueGroupsTouched).toBe(COUNT);
    expect(db.leagueMembership.rows.every((m) => m.userId === PARTNER)).toBe(true);
    expect(db.leagueGroupWeek.rows.every((g) => g.memberCount === 1)).toBe(true);
  });
});

describe('les notifications de duo qui NOMMENT le compte effacé (revue adversariale #9490)', () => {
  const PARTNER = '68a0000000000000000000aa';
  const STRANGER_DUO = '68a0000000000000000000cc';
  const actor = (id: string) => ({ id, username: id === USER ? 'effacé' : 'autre', displayName: id === USER ? 'Marie Effacée' : 'Autre', avatar: 'a.png' });

  it('l’invitation et l’acceptation d’un duo, chez le partenaire, disparaissent avec le compte qui les a signées — rien d’autre', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    seedUser(db, {}, PARTNER);
    db.gameDuo.rows.push(
      { id: 'd1', weekKey: '2026-10-12', inviterId: USER, inviteeId: PARTNER, status: 'abandoned' },
      { id: 'd2', weekKey: '2026-10-05', inviterId: PARTNER, inviteeId: USER, status: 'completed' },
    );
    db.notification.rows.push(
      { id: 'n-invite', userId: PARTNER, type: 'game_duo_invited', actor: actor(USER), metadata: { duoId: 'd1' } },
      { id: 'n-accept', userId: PARTNER, type: 'game_duo_accepted', actor: actor(USER), metadata: { duoId: 'd2' } },
      { id: 'n-other-actor', userId: PARTNER, type: 'game_duo_invited', actor: actor(STRANGER_DUO), metadata: { duoId: 'd9' } },
      { id: 'n-league', userId: PARTNER, type: 'game_league_result', actor: null, metadata: {} },
      { id: 'n-message', userId: PARTNER, type: 'new_message', actor: actor(USER), metadata: {} },
    );

    await purgeGameData(db.prisma, USER);

    expect(db.notification.rows.map((n) => n.id).sort()).toEqual(['n-league', 'n-message', 'n-other-actor']);
  });
});
