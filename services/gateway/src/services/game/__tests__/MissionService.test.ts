/**
 * LES MISSIONS DU JOUR (#9375) — tirage paresseux, progression au geste,
 * récompense avec Bonus de Flamme et Heure du Prisme, changement payant,
 * coffre du jour. La loi (`drawDailyMissions`, `missionReward`…) vient de
 * `@meeshy/shared/utils/game` : on teste qu'elle est appliquée, jamais réécrite.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { drawDailyMissions } from '@meeshy/shared/utils/game/missions';
import { prismHourWindow } from '@meeshy/shared/utils/game/boosts';
import { dailyChest } from '@meeshy/shared/utils/game/chest';
import { MissionService } from '../MissionService';
import { GameRefusal } from '../GameRefusal';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-05T10:00:00Z');
const DAY = '2026-10-05';
const LEVEL_20 = 10 * 20 * 20;

const setup = (userFields: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20, ...userFields });
  const creditPoints = jest.fn<(userId: string, points: number, axisKey: string) => Promise<void>>().mockResolvedValue(undefined);
  const service = new MissionService(db.prisma, { creditPoints });
  return { db, service, creditPoints };
};

const insertMission = (db: FakeGameDb, fields: Record<string, unknown>) => {
  const row = {
    id: `mission-${db.dailyMission.rows.length}`,
    userId: USER,
    dayKey: DAY,
    slot: db.dailyMission.rows.length,
    templateKey: 'send-texts',
    difficulty: 'easy',
    signal: 'axis:content.text_message',
    prism: false,
    target: 3,
    progress: 0,
    reward: 40,
    glory: 0,
    seen: [],
    completedAt: null,
    paidPoints: null,
    rerolledAt: null,
    ...fields,
  };
  db.dailyMission.rows.push(row);
  return row;
};

const grant = (db: FakeGameDb, balance: number) =>
  db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: balance, reason: 'grant', requestId: 'octroi-0001' });

const refusal = async (work: () => Promise<unknown>): Promise<GameRefusal> => {
  try {
    await work();
  } catch (error) {
    if (error instanceof GameRefusal) return error;
    throw error;
  }
  throw new Error('aucun refus levé');
};

describe('MissionService.ensureToday — le tirage paresseux', () => {
  it('tire trois missions au premier accès du jour, celles de la loi partagée', async () => {
    const { db, service } = setup();

    const today = await service.ensureToday(USER, NOW);

    const expected = drawDailyMissions({ userId: USER, dayKey: DAY, level: 20, flameDays: 0, treasury: 0 });
    expect(today.dayKey).toBe(DAY);
    expect(today.unlocked).toBe(true);
    expect(db.dailyMission.rows.map((r) => r.templateKey)).toEqual(expected.missions.map((m) => m.templateKey));
    expect(db.dailyMission.rows.map((r) => r.slot)).toEqual([0, 1, 2]);
    expect(db.dailyMission.rows.map((r) => r.target)).toEqual(expected.missions.map((m) => m.target));
  });

  it('ne retire pas au second accès, et deux accès concurrents ne doublent rien', async () => {
    const { db, service } = setup();

    await Promise.all([service.ensureToday(USER, NOW), service.ensureToday(USER, NOW)]);
    await service.ensureToday(USER, NOW);

    expect(db.dailyMission.rows).toHaveLength(3);
  });

  it('ne tire rien avant le niveau 5 (les missions s’ouvrent au niveau 5)', async () => {
    const { db, service } = setup({ engagementScore: 10 * 4 * 4, levelRecord: 4 });

    const today = await service.ensureToday(USER, NOW);

    expect(today.unlocked).toBe(false);
    expect(db.dailyMission.rows).toHaveLength(0);
  });

  it('le niveau RECORD ouvre les missions même si une frappe a fait redescendre le niveau', async () => {
    const { service } = setup({ engagementScore: 10 * 4 * 4, levelRecord: 9 });
    expect((await service.ensureToday(USER, NOW)).unlocked).toBe(true);
  });

  it('une Flamme longue gonfle la récompense affichée (bonus de Flamme), la mission d’Or vient avec 50 Meeshes gardées', async () => {
    const { db, service } = setup({ engagementScore: 10 * 6 * 6, levelRecord: 6, currentStreakDays: 25, lastStreakDate: new Date('2026-10-04T00:00:00Z') });
    grant(db, 50);

    await service.ensureToday(USER, NOW);

    const expected = drawDailyMissions({ userId: USER, dayKey: DAY, level: 6, flameDays: 25, treasury: 50 });
    expect(db.dailyMission.rows.map((r) => r.reward)).toEqual(expected.missions.map((m) => m.reward));
    expect(db.dailyMission.rows[2]?.difficulty).toBe('gold');
  });

  it('le jour se lit dans le fuseau de l’utilisateur', async () => {
    const { db, service } = setup({ timezone: 'Pacific/Auckland' });

    await service.ensureToday(USER, new Date('2026-10-05T12:00:00Z'));

    expect(new Set(db.dailyMission.rows.map((r) => r.dayKey))).toEqual(new Set(['2026-10-06']));
  });
});

describe('MissionService.onSignal — la progression au geste', () => {
  it('un geste crédité sur l’axe de la mission la fait avancer', async () => {
    const { db, service } = setup();
    insertMission(db, { target: 3 });

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(db.dailyMission.rows[0]?.progress).toBe(1);
  });

  it('à l’objectif atteint, la récompense est créditée UNE fois, sur l’axe de la mission', async () => {
    const { db, service, creditPoints } = setup();
    insertMission(db, { target: 2, reward: 40 });

    for (let i = 0; i < 4; i += 1) await service.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(creditPoints).toHaveBeenCalledTimes(1);
    expect(creditPoints).toHaveBeenCalledWith(USER, 40, 'content.text_message');
    expect(db.dailyMission.rows[0]).toMatchObject({ completedAt: NOW, paidPoints: 40 });
  });

  it('pendant l’Heure du Prisme la mission compte double', async () => {
    const { db, service, creditPoints } = setup();
    insertMission(db, { target: 1, reward: 40 });
    const window = prismHourWindow({ userId: USER, dayKey: DAY });
    const inside = new Date(`${DAY}T00:00:00Z`);
    inside.setUTCMinutes(window.startMinute + 5);

    await service.onSignal(USER, 'axis:content.text_message', { now: inside });

    expect(creditPoints).toHaveBeenCalledWith(USER, 80, 'content.text_message');
    expect(db.dailyMission.rows[0]?.paidPoints).toBe(80);
  });

  it('hors de l’Heure du Prisme la récompense reste simple', async () => {
    const { db, service, creditPoints } = setup();
    insertMission(db, { target: 1, reward: 40 });
    const window = prismHourWindow({ userId: USER, dayKey: DAY });
    const outside = new Date(`${DAY}T00:00:00Z`);
    outside.setUTCMinutes(window.endMinute + 1);

    await service.onSignal(USER, 'axis:content.text_message', { now: outside });

    expect(creditPoints).toHaveBeenCalledWith(USER, 40, 'content.text_message');
  });

  it('un signal que la mission n’attend pas ne la touche pas', async () => {
    const { db, service, creditPoints } = setup();
    insertMission(db, { target: 1 });

    await service.onSignal(USER, 'axis:tool.reaction', { now: NOW });

    expect(db.dailyMission.rows[0]?.progress).toBe(0);
    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('une mission d’hier ne reçoit rien aujourd’hui', async () => {
    const { db, service } = setup();
    insertMission(db, { dayKey: '2026-10-04' });

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(db.dailyMission.rows.find((r) => r.dayKey === '2026-10-04')?.progress).toBe(0);
  });

  it('un signal DISTINCT compte une fois par clé : la même conversation deux fois ne vaut qu’un point', async () => {
    const { db, service } = setup();
    insertMission(db, { signal: 'reply-distinct-conversations', templateKey: 'reply-conversations', target: 3 });

    await service.onSignal(USER, 'reply-distinct-conversations', { now: NOW, key: 'conv-a' });
    await service.onSignal(USER, 'reply-distinct-conversations', { now: NOW, key: 'conv-a' });
    await service.onSignal(USER, 'reply-distinct-conversations', { now: NOW, key: 'conv-b' });

    expect(db.dailyMission.rows[0]).toMatchObject({ progress: 2, seen: ['conv-a', 'conv-b'] });
  });

  it('la mission d’Or grave 40 de Gloire, une seule fois', async () => {
    const { db, service } = setup();
    insertMission(db, {
      difficulty: 'gold',
      signal: 'replies-received-distinct-authors',
      templateKey: 'gold-replies-received',
      target: 1,
      reward: 250,
      glory: 40,
    });

    await service.onSignal(USER, 'replies-received-distinct-authors', { now: NOW, key: 'auteur-1' });
    await service.onSignal(USER, 'replies-received-distinct-authors', { now: NOW, key: 'auteur-2' });

    expect(db.gloryLedger.rows).toHaveLength(1);
    expect(db.gloryLedger.rows[0]).toMatchObject({ delta: 40, reason: 'mission-gold' });
  });

  it('si le crédit échoue, la mission n’est pas marquée faite : le prochain geste réessaie', async () => {
    const { db, service, creditPoints } = setup();
    insertMission(db, { target: 1, reward: 40 });
    creditPoints.mockRejectedValueOnce(new Error('score indisponible'));

    await expect(service.onSignal(USER, 'axis:content.text_message', { now: NOW })).rejects.toThrow('score indisponible');
    expect(db.dailyMission.rows[0]?.completedAt).toBeNull();

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW });
    expect(db.dailyMission.rows[0]?.completedAt).not.toBeNull();
  });

  it('une mission dont `completedAt` est ABSENT (ligne écrite sans lui) avance, se termine et paie', async () => {
    const { db, service, creditPoints } = setup();
    const row = insertMission(db, { target: 1, reward: 40 });
    delete (row as Record<string, unknown>).completedAt;
    delete (row as Record<string, unknown>).paidPoints;

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(creditPoints).toHaveBeenCalledTimes(1);
    expect(db.dailyMission.rows[0]).toMatchObject({ completedAt: NOW, paidPoints: 40 });
  });

  it('un signal DISTINCT fait avancer une mission dont `completedAt` est ABSENT', async () => {
    const { db, service } = setup();
    const row = insertMission(db, { signal: 'reply-distinct-conversations', templateKey: 'reply-conversations', target: 3 });
    delete (row as Record<string, unknown>).completedAt;

    await service.onSignal(USER, 'reply-distinct-conversations', { now: NOW, key: 'conv-a' });

    expect(db.dailyMission.rows[0]).toMatchObject({ progress: 1, seen: ['conv-a'] });
  });

  it('les missions TIRÉES par le service se terminent et paient (champs posés comme Prisma les écrit)', async () => {
    const { db, service, creditPoints } = setup();
    const today = await service.ensureToday(USER, NOW);
    const easy = today.rows[0]!;

    for (let i = 0; i < easy.target; i += 1) await service.onSignal(USER, easy.signal, { now: NOW, key: `cle-${i}` });

    expect(creditPoints).toHaveBeenCalledTimes(1);
    expect(db.dailyMission.rows.find((r) => r.id === easy.id)?.completedAt).toEqual(NOW);
  });

  it('sans mission aujourd’hui, le premier geste tire les trois puis compte', async () => {
    const { db, service } = setup();

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW });

    expect(db.dailyMission.rows).toHaveLength(3);
  });

  it('sous le niveau 5, un geste ne tire rien', async () => {
    const { db, service } = setup({ engagementScore: 10, levelRecord: 1 });

    await service.onSignal(USER, 'axis:content.text_message', { now: NOW, record: 1 });

    expect(db.dailyMission.rows).toHaveLength(0);
  });
});

describe('MissionService.reroll — changer une mission du jour', () => {
  const mission = (db: FakeGameDb, fields: Record<string, unknown> = {}) =>
    insertMission(db, { id: 'm-easy', slot: 0, templateKey: 'send-texts', signal: 'axis:content.text_message', ...fields });

  it('coûte 1 Meesh et rend une mission de même difficulté, autre gabarit, à zéro', async () => {
    const { db, service } = setup();
    mission(db, { progress: 2 });
    insertMission(db, { id: 'm-mid', slot: 1, difficulty: 'medium', templateKey: 'publish-post', signal: 'axis:content.post' });
    grant(db, 2);

    const issue = await service.reroll({ userId: USER, missionId: 'm-easy', requestId: 'change-0001', now: NOW });

    expect(issue.balance).toBe(1);
    expect(issue.mission).toMatchObject({ id: 'm-easy', difficulty: 'easy', progress: 0, completedAt: null });
    expect(issue.mission.templateKey).not.toBe('send-texts');
    expect(db.dailyMission.rows[0]).toMatchObject({ progress: 0, seen: [] });
    expect(db.dailyMission.rows[0]?.rerolledAt).toEqual(NOW);
    expect(db.meeshLedger.rows.at(-1)).toMatchObject({ delta: -1, reason: 'spend' });
  });

  it('une fois par jour : le second changement est refusé, sans débit', async () => {
    const { db, service } = setup();
    mission(db);
    insertMission(db, { id: 'm-mid', slot: 1, difficulty: 'medium', templateKey: 'publish-post', signal: 'axis:content.post' });
    grant(db, 3);
    await service.reroll({ userId: USER, missionId: 'm-easy', requestId: 'change-0001', now: NOW });

    const error = await refusal(() => service.reroll({ userId: USER, missionId: 'm-mid', requestId: 'change-0002', now: NOW }));

    expect(error.code).toBe('MISSION_REROLL_EXHAUSTED');
    expect(db.meeshLedger.rows.filter((r) => r.reason === 'spend')).toHaveLength(1);
  });

  it('refuse sans Meesh, avec le motif du solde', async () => {
    const { db, service } = setup();
    mission(db);

    const error = await refusal(() => service.reroll({ userId: USER, missionId: 'm-easy', requestId: 'change-0003', now: NOW }));

    expect(error.code).toBe('INSUFFICIENT_MEESHES');
  });

  it('refuse une mission déjà faite, introuvable, ou d’un autre compte', async () => {
    const { db, service } = setup();
    mission(db, { completedAt: NOW });
    insertMission(db, { id: 'm-autre', userId: '68a000000000000000000002', slot: 0 });
    grant(db, 3);

    const done = await refusal(() => service.reroll({ userId: USER, missionId: 'm-easy', requestId: 'change-0004', now: NOW }));
    const unknown = await refusal(() => service.reroll({ userId: USER, missionId: 'inconnue', requestId: 'change-0005', now: NOW }));
    const foreign = await refusal(() => service.reroll({ userId: USER, missionId: 'm-autre', requestId: 'change-0006', now: NOW }));

    expect(done.code).toBe('MISSION_REROLL_UNAVAILABLE');
    expect(unknown.code).toBe('MISSION_NOT_FOUND');
    expect(foreign.code).toBe('MISSION_NOT_FOUND');
  });

  it('rejouer le même requestId rend la même mission sans second débit', async () => {
    const { db, service } = setup();
    mission(db);
    insertMission(db, { id: 'm-mid', slot: 1, difficulty: 'medium', templateKey: 'publish-post', signal: 'axis:content.post' });
    grant(db, 3);

    const first = await service.reroll({ userId: USER, missionId: 'm-easy', requestId: 'change-0007', now: NOW });
    const again = await service.reroll({ userId: USER, missionId: 'm-easy', requestId: 'change-0007', now: NOW });

    expect(again.mission).toEqual(first.mission);
    expect(db.meeshLedger.rows.filter((r) => r.reason === 'spend')).toHaveLength(1);
  });
});

describe('MissionService.claimChest — le coffre du jour', () => {
  const allDone = (db: FakeGameDb) => {
    insertMission(db, { completedAt: NOW });
    insertMission(db, { completedAt: NOW, difficulty: 'medium' });
    insertMission(db, { completedAt: NOW, difficulty: 'hard' });
  };

  it('refuse tant que les trois missions ne sont pas faites', async () => {
    const { db, service } = setup();
    insertMission(db, { completedAt: NOW });
    insertMission(db, {});
    insertMission(db, {});

    const error = await refusal(() => service.claimChest({ userId: USER, requestId: 'coffre-0001', now: NOW }));

    expect(error.code).toBe('CHEST_NOT_READY');
  });

  it('s’ouvre une fois les trois faites : points du tirage du jour, crédités une seule fois', async () => {
    const { db, service, creditPoints } = setup();
    allDone(db);

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-0002', now: NOW });

    const drawn = dailyChest({ userId: USER, dayKey: DAY });
    expect(issue.status).toBe('claimed');
    expect(issue.reward).toEqual(drawn);
    expect(creditPoints).toHaveBeenCalledWith(USER, drawn.points, expect.any(String));
  });

  it('rejouer rend le même contenu sans rien créditer de plus', async () => {
    const { db, service, creditPoints } = setup();
    allDone(db);

    const first = await service.claimChest({ userId: USER, requestId: 'coffre-0003', now: NOW });
    const again = await service.claimChest({ userId: USER, requestId: 'coffre-0003', now: NOW });

    expect(again).toMatchObject({ status: 'already-claimed', reward: first.reward });
    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('un gel du coffre ne remplit jamais la réserve au-delà de 2', async () => {
    const { db, creditPoints } = setup({ flameFreezes: 2 });
    const service = new MissionService(db.prisma, {
      creditPoints,
      chest: () => ({ points: 100, fragment: true, freeze: true }),
    });
    allDone(db);

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-0004', now: NOW });

    expect(issue.reward).toEqual({ points: 100, fragment: true, freeze: true });
    expect(db.user.rows[0]?.flameFreezes).toBe(2);
  });

  it('un coffre écrit SANS ses champs de réclamation (état du jour posé avant lui) s’ouvre quand même', async () => {
    const { db, service, creditPoints } = setup();
    allDone(db);
    db.gameDay.rows.push({ id: 'jour-1', userId: USER, dayKey: DAY, rerollCount: 1 });

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-0006', now: NOW });

    expect(issue.status).toBe('claimed');
    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('un gel du coffre qui échoue ne rend pas le coffre : les points ne sont jamais payés deux fois', async () => {
    const { db, creditPoints } = setup({ flameFreezes: 1 });
    const service = new MissionService(db.prisma, {
      creditPoints,
      chest: () => ({ points: 100, fragment: false, freeze: true }),
    });
    allDone(db);
    const update = db.user.update.bind(db.user);
    db.user.update = (async () => {
      throw new Error('écriture du gel indisponible');
    }) as typeof db.user.update;

    await service.claimChest({ userId: USER, requestId: 'coffre-0007', now: NOW }).catch(() => undefined);
    db.user.update = update;
    await service.claimChest({ userId: USER, requestId: 'coffre-0008', now: NOW }).catch(() => undefined);

    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('un gel du coffre emplit la réserve quand il y a de la place', async () => {
    const { db, creditPoints } = setup({ flameFreezes: 1 });
    const service = new MissionService(db.prisma, {
      creditPoints,
      chest: () => ({ points: 100, fragment: false, freeze: true }),
    });
    allDone(db);

    await service.claimChest({ userId: USER, requestId: 'coffre-0005', now: NOW });

    expect(db.user.rows[0]?.flameFreezes).toBe(2);
  });
});
