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
import { dailyChest, dayEffort } from '@meeshy/shared/utils/game/chest';
import { MissionService } from '../MissionService';
import { GameRefusal } from '../GameRefusal';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-05T10:00:00Z');
const DAY = '2026-10-05';
const LEVEL_20 = 100 * 20 * 20;
/** Le profil d'un compte sans compteur, sans contact, sans communauté et d'une seule langue — celui de `seedUser`. */
const NO_PROFILE = { capabilities: [], habits: {} } as const;

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

    const expected = drawDailyMissions({ userId: USER, dayKey: DAY, level: 20, flameDays: 0, treasury: 0, profile: NO_PROFILE });
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

  it('un tirage INTERROMPU (une seule ligne posée) est complété au prochain accès, sans toucher la ligne posée', async () => {
    const { db, service } = setup();
    const first = drawDailyMissions({ userId: USER, dayKey: DAY, level: 20, flameDays: 0, treasury: 0 }).missions[0]!;
    insertMission(db, { templateKey: first.templateKey, signal: first.signal, target: first.target, reward: first.reward, progress: 1 });

    const today = await service.ensureToday(USER, NOW);

    expect(today.rows.map((r) => r.slot)).toEqual([0, 1, 2]);
    expect(today.rows[0]?.progress).toBe(1);
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

    const expected = drawDailyMissions({ userId: USER, dayKey: DAY, level: 6, flameDays: 25, treasury: 50, profile: NO_PROFILE });
    expect(db.dailyMission.rows.map((r) => r.reward)).toEqual(expected.missions.map((m) => m.reward));
    expect(db.dailyMission.rows[2]?.difficulty).toBe('gold');
  });

  it('le jour se lit dans le fuseau de l’utilisateur', async () => {
    const { db, service } = setup({ timezone: 'Pacific/Auckland' });

    await service.ensureToday(USER, new Date('2026-10-05T12:00:00Z'));

    expect(new Set(db.dailyMission.rows.map((r) => r.dayKey))).toEqual(new Set(['2026-10-06']));
  });
});

describe('la journée de jeu est monotone : changer de fuseau ne fait pas gagner un jour', () => {
  const EAST = 'Pacific/Kiritimati';
  const openedDay = (db: FakeGameDb, dayKey: string, openedAt: Date, completed: boolean) => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      insertMission(db, { dayKey, difficulty, createdAt: openedAt, ...(completed ? { completedAt: openedAt } : {}) });
    }
  };

  it('passer à l’est moins de 20 h après l’ouverture du jour ne tire pas les missions du lendemain', async () => {
    const { db, service } = setup();
    openedDay(db, DAY, NOW, true);
    db.user.rows[0]!.timezone = EAST;

    const today = await service.ensureToday(USER, new Date('2026-10-05T12:00:00Z'));

    expect(today.dayKey).toBe(DAY);
    expect(db.dailyMission.rows.filter((r) => r.dayKey !== DAY)).toHaveLength(0);
  });

  it('passer à l’est ne rouvre pas le coffre du jour : il reste réclamé', async () => {
    const { db, service, creditPoints } = setup();
    openedDay(db, DAY, NOW, true);
    await service.claimChest({ userId: USER, requestId: 'coffre-fuseau-1', now: NOW });
    db.user.rows[0]!.timezone = EAST;

    const again = await service.claimChest({ userId: USER, requestId: 'coffre-fuseau-2', now: new Date('2026-10-05T12:00:00Z') });

    expect(again.status).toBe('already-claimed');
    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('20 h après l’ouverture, la journée du fuseau s’ouvre', async () => {
    const { db, service } = setup();
    openedDay(db, DAY, NOW, true);
    db.user.rows[0]!.timezone = EAST;

    const next = await service.ensureToday(USER, new Date('2026-10-06T06:00:00Z'));

    expect(next.dayKey).toBe('2026-10-06');
    expect(db.dailyMission.rows.filter((r) => r.dayKey === '2026-10-06')).toHaveLength(3);
  });

  it('un fuseau qui recule ne revient pas à la veille : le geste fait avancer la journée ouverte', async () => {
    const { db, service } = setup();
    insertMission(db, { dayKey: '2026-10-06', createdAt: new Date('2026-10-05T11:00:00Z'), target: 3 });

    await service.onSignal(USER, 'axis:content.text_message', { now: new Date('2026-10-05T12:00:00Z'), dayKey: DAY, timezone: 'UTC' });

    expect(db.dailyMission.rows.find((r) => r.dayKey === '2026-10-06')?.progress).toBe(1);
    expect(db.dailyMission.rows.filter((r) => r.dayKey === DAY)).toHaveLength(0);
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

  it('refuse un jour qui ne porte pas ses trois missions, même toutes faites', async () => {
    const { db, service } = setup();
    insertMission(db, { completedAt: NOW });

    const error = await refusal(() => service.claimChest({ userId: USER, requestId: 'coffre-0009', now: NOW }));

    expect(error.code).toBe('CHEST_NOT_READY');
  });

  it('refuse tant que les trois missions ne sont pas faites', async () => {
    const { db, service } = setup();
    insertMission(db, { completedAt: NOW });
    insertMission(db, {});
    insertMission(db, {});

    const error = await refusal(() => service.claimChest({ userId: USER, requestId: 'coffre-0001', now: NOW }));

    expect(error.code).toBe('CHEST_NOT_READY');
  });

  it('s’ouvre une fois les trois faites : le contenu de la loi pour l’effort du jour, crédité une seule fois', async () => {
    const { db, service, creditPoints } = setup();
    allDone(db);

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-0002', now: NOW });

    const rows = db.dailyMission.rows.map((r) => ({ templateKey: String(r.templateKey), difficulty: String(r.difficulty), target: Number(r.target) }));
    // Aucune Meesh frappée : la prime se tire au cours de la 1re, 1 221 points — ce compte tire un cinquième.
    const drawn = dailyChest({ userId: USER, dayKey: DAY, effort: dayEffort(rows), nextMeeshPrice: 1221 });
    expect(issue.status).toBe('claimed');
    expect(issue.reward).toEqual(drawn);
    expect(drawn).toMatchObject({ points: 760 + 244, glory: 76, bonus: 'fifth', bonusPoints: 244 });
    expect(creditPoints).toHaveBeenCalledWith(USER, drawn.points, expect.any(String));
  });

  it('paie plus de points quand les missions du jour sont plus lourdes (#10011)', async () => {
    const light = setup();
    allDone(light.db);
    const heavy = setup();
    insertMission(heavy.db, { completedAt: NOW, templateKey: 'send-texts', target: 15 });
    insertMission(heavy.db, { completedAt: NOW, difficulty: 'medium', templateKey: 'comment-text', signal: 'comment-others-post', target: 6 });
    insertMission(heavy.db, { completedAt: NOW, difficulty: 'gold', templateKey: 'publish-posts', signal: 'axis:content.post', target: 3 });

    const lightIssue = await light.service.claimChest({ userId: USER, requestId: 'coffre-leger-1', now: NOW });
    const heavyIssue = await heavy.service.claimChest({ userId: USER, requestId: 'coffre-lourd-1', now: NOW });

    expect(heavyIssue.reward.points).toBeGreaterThan(lightIssue.reward.points);
    expect(heavyIssue.reward.points - (heavyIssue.reward.bonusPoints ?? 0)).toBe(10_000);
    expect(heavyIssue.reward.glory).toBe(1000);
  });

  it('grave la Gloire du coffre UNE fois, sous la clé du jour, et la garde sur la journée', async () => {
    const { db, service } = setup();
    allDone(db);

    const first = await service.claimChest({ userId: USER, requestId: 'coffre-gloire-1', now: NOW });
    await service.claimChest({ userId: USER, requestId: 'coffre-gloire-1', now: NOW });

    const lines = db.gloryLedger.rows.filter((r) => r.reason === 'chest');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ delta: first.reward.glory, requestId: `chest:${DAY}` });
    expect(db.gameDay.rows[0]).toMatchObject({ chestGlory: first.reward.glory, chestBonus: first.reward.bonus, chestBonusPoints: first.reward.bonusPoints });
  });

  it('ajoute son fragment d\'étoile au total collecté — coffres d\'avant et étapes de saison compris —, une seule fois', async () => {
    const { db, creditPoints } = setup();
    const service = new MissionService(db.prisma, {
      creditPoints,
      chest: () => ({ points: 500, fragment: true, freeze: false, glory: 50, bonus: 'none', bonusPoints: 0 }),
    });
    db.gameDay.rows.push({ id: 'veille', userId: USER, dayKey: '2026-10-01', rerollCount: 0, chestClaimedAt: NOW, chestFragment: true });
    db.gameDay.rows.push({ id: 'avant-veille', userId: USER, dayKey: '2026-09-30', rerollCount: 0, chestClaimedAt: NOW, chestFragment: false });
    db.gameSeason.rows.push({ id: 's1', userId: USER, number: 1, stars: 80, claimedSteps: [1, 5, 10, 15] });
    allDone(db);

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-etoile-1', now: NOW });
    const again = await service.claimChest({ userId: USER, requestId: 'coffre-etoile-1', now: NOW });

    expect(issue).toMatchObject({ status: 'claimed', reward: { fragment: true }, starFragments: { collected: 1 + 1 + 2 } });
    expect(again).toMatchObject({ status: 'already-claimed', reward: { fragment: true }, starFragments: { collected: 4 } });
    expect(db.meeshLedger.rows).toHaveLength(0);
  });

  it('crédite la prime en points, au cours de la Meesh du COMPTE lu à la réclamation, et ne frappe rien', async () => {
    const { db, creditPoints } = setup();
    const seen: number[] = [];
    const service = new MissionService(db.prisma, {
      creditPoints,
      chest: (params) => {
        seen.push(params.nextMeeshPrice);
        return { points: 500 + params.nextMeeshPrice, fragment: false, freeze: false, glory: 50, bonus: 'whole', bonusPoints: params.nextMeeshPrice };
      },
    });
    for (let n = 0; n < 10; n += 1) db.meeshLedger.rows.push({ id: `m${n}`, userId: USER, delta: 1, reason: 'mint', requestId: `frappe-${n}`, createdAt: new Date('2026-10-04T12:00:00Z') });
    allDone(db);

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-prime-1', now: NOW });

    expect(seen).toEqual([1587]);
    expect(issue.reward).toMatchObject({ points: 500 + 1587, bonus: 'whole', bonusPoints: 1587 });
    expect(creditPoints).toHaveBeenCalledWith(USER, 500 + 1587, expect.anything());
    expect(db.meeshLedger.rows).toHaveLength(10);
  });

  it('des points qui ne passent pas rendent le coffre : un nouvel essai ne paie la Gloire qu’une fois', async () => {
    const { db } = setup();
    const creditPoints = jest
      .fn<(userId: string, points: number, axisKey: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('crédit indisponible'))
      .mockResolvedValue(undefined);
    const service = new MissionService(db.prisma, { creditPoints });
    allDone(db);

    await service.claimChest({ userId: USER, requestId: 'coffre-panne-1', now: NOW }).catch(() => undefined);
    expect(db.gameDay.rows[0]).toMatchObject({ chestClaimedAt: null, chestBonus: null, chestBonusPoints: null, chestGlory: null });
    const retry = await service.claimChest({ userId: USER, requestId: 'coffre-panne-2', now: NOW });

    expect(retry.status).toBe('claimed');
    expect(db.gloryLedger.rows.filter((r) => r.reason === 'chest')).toHaveLength(1);
    expect(creditPoints).toHaveBeenCalledTimes(2);
  });

  it('rejouer un coffre ouvert AVANT #10011 rend zéro Gloire, aucune prime, son fragment d\'étoile, sans rien créditer', async () => {
    const { db, service, creditPoints } = setup();
    allDone(db);
    db.gameDay.rows.push({ id: 'ancien', userId: USER, dayKey: DAY, rerollCount: 0, chestClaimedAt: NOW, chestPoints: 140, chestFragment: true, chestFreeze: false });

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-ancien', now: NOW });

    expect(issue).toMatchObject({ status: 'already-claimed', reward: { points: 140, fragment: true, freeze: false, glory: 0 }, starFragments: { collected: 1 } });
    expect('bonus' in issue.reward).toBe(false);
    expect(creditPoints).not.toHaveBeenCalled();
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
      chest: () => ({ points: 100, fragment: true, freeze: true, glory: 0, bonus: 'none', bonusPoints: 0 }),
    });
    allDone(db);

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-0004', now: NOW });

    expect(issue.reward).toEqual({ points: 100, fragment: true, freeze: true, glory: 0, bonus: 'none', bonusPoints: 0 });
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
      chest: () => ({ points: 100, fragment: false, freeze: true, glory: 0, bonus: 'none', bonusPoints: 0 }),
    });
    allDone(db);
    const update = db.user.update.bind(db.user);
    const updateMany = db.user.updateMany.bind(db.user);
    const panne = (async () => {
      throw new Error('écriture du gel indisponible');
    }) as never;
    db.user.update = panne;
    db.user.updateMany = panne;

    await service.claimChest({ userId: USER, requestId: 'coffre-0007', now: NOW }).catch(() => undefined);
    db.user.update = update;
    db.user.updateMany = updateMany;
    await service.claimChest({ userId: USER, requestId: 'coffre-0008', now: NOW }).catch(() => undefined);

    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('un gel ACHETÉ pendant l’ouverture du coffre n’est pas écrasé par le gel offert', async () => {
    const { db, creditPoints } = setup({ flameFreezes: 0 });
    const service = new MissionService(db.prisma, {
      creditPoints,
      chest: () => ({ points: 100, fragment: false, freeze: true, glory: 0, bonus: 'none', bonusPoints: 0 }),
    });
    allDone(db);
    const findUnique = db.user.findUnique.bind(db.user);
    let bought = false;
    db.user.findUnique = (async (args: Parameters<typeof findUnique>[0]) => {
      const row = await findUnique(args);
      if (!bought && args.select?.flameFreezes && !args.select?.lastRelightDay) {
        bought = true;
        db.user.rows[0]!.flameFreezes = 1;
      }
      return row;
    }) as typeof db.user.findUnique;

    await service.claimChest({ userId: USER, requestId: 'coffre-0010', now: NOW });

    expect(db.user.rows[0]?.flameFreezes).toBe(2);
  });

  it('un gel du coffre emplit la réserve quand il y a de la place', async () => {
    const { db, creditPoints } = setup({ flameFreezes: 1 });
    const service = new MissionService(db.prisma, {
      creditPoints,
      chest: () => ({ points: 100, fragment: false, freeze: true, glory: 0, bonus: 'none', bonusPoints: 0 }),
    });
    allDone(db);

    await service.claimChest({ userId: USER, requestId: 'coffre-0005', now: NOW });

    expect(db.user.rows[0]?.flameFreezes).toBe(2);
  });
});

/**
 * LE COURS DE LA PRIME EST FIGÉ AU DÉBUT DU JOUR DE JEU (#10219, suite de #10011). La prime se tire au prix de la
 * prochaine Meesh pour les frappes ANTÉRIEURES au jour de jeu, gravé sur `GameDay.chestMintBase` à la première
 * lecture : une frappe du jour, avant l'ouverture, ne fait plus monter la prime.
 */
describe('MissionService.claimChest — la prime au cours du début du jour (#10219)', () => {
  const YESTERDAY = new Date('2026-10-04T12:00:00Z');
  /** Le jour de jeu s'ouvre au tirage de ses missions. */
  const OPENED = new Date('2026-10-05T06:00:00Z');
  const THIS_MORNING = new Date('2026-10-05T09:00:00Z');
  const allDone = (db: FakeGameDb, createdAt: Date = OPENED) => {
    insertMission(db, { completedAt: NOW, createdAt });
    insertMission(db, { completedAt: NOW, difficulty: 'medium', createdAt });
    insertMission(db, { completedAt: NOW, difficulty: 'hard', createdAt });
  };
  const mint = (db: FakeGameDb, n: number, createdAt: Date) =>
    db.meeshLedger.rows.push({ id: `m${n}`, userId: USER, delta: 1, reason: 'mint', requestId: `frappe-${n}`, createdAt });
  const spying = (db: FakeGameDb, creditPoints: ReturnType<typeof setup>['creditPoints']) => {
    const seen: number[] = [];
    const service = new MissionService(db.prisma, {
      creditPoints,
      chest: (params) => {
        seen.push(params.nextMeeshPrice);
        return { points: 500 + params.nextMeeshPrice, fragment: false, freeze: false, glory: 50, bonus: 'whole', bonusPoints: params.nextMeeshPrice };
      },
    });
    return { service, seen };
  };

  it('une frappe avant l’ouverture ne change pas la prime : le cours reste celui des frappes d’avant le jour', async () => {
    const { db, creditPoints } = setup();
    const { service, seen } = spying(db, creditPoints);
    for (let n = 0; n < 9; n += 1) mint(db, n, YESTERDAY);
    // La 10e frappe, CE MATIN : le prix de la 11e passerait de 1 221 à 1 587.
    mint(db, 9, THIS_MORNING);
    allDone(db);

    const issue = await service.claimChest({ userId: USER, requestId: 'coffre-cours-1', now: NOW });

    expect(seen).toEqual([1221]);
    expect(issue.reward).toMatchObject({ bonus: 'whole', bonusPoints: 1221 });
    expect(db.gameDay.rows[0]).toMatchObject({ dayKey: DAY, chestMintBase: 9 });
  });

  it('le montant est le même avant et après une frappe du jour : le cours lu à l’affichage est celui de la réclamation', async () => {
    const { db, creditPoints } = setup();
    const { service, seen } = spying(db, creditPoints);
    for (let n = 0; n < 9; n += 1) mint(db, n, YESTERDAY);
    allDone(db);

    const before = await service.chestPriceBase({ userId: USER, now: NOW });
    mint(db, 9, THIS_MORNING);
    const after = await service.chestPriceBase({ userId: USER, now: NOW });
    await service.claimChest({ userId: USER, requestId: 'coffre-cours-2', now: NOW });

    expect(before).toBe(9);
    expect(after).toBe(9);
    expect(seen).toEqual([1221]);
  });

  it('le cours GRAVÉ fait foi : il ne se recalcule pas, même si le registre dit autre chose', async () => {
    const { db, creditPoints } = setup();
    const { service, seen } = spying(db, creditPoints);
    for (let n = 0; n < 12; n += 1) mint(db, n, YESTERDAY);
    db.gameDay.rows.push({ id: 'grave', userId: USER, dayKey: DAY, rerollCount: 0, chestMintBase: 9 });
    allDone(db);

    await service.claimChest({ userId: USER, requestId: 'coffre-cours-3', now: NOW });

    expect(seen).toEqual([1221]);
    expect(db.gameDay.rows[0]).toMatchObject({ chestMintBase: 9 });
  });

  it('une journée sans cours gravé (ouverte avant #10219) le grave à la réclamation, une seule fois', async () => {
    const { db, creditPoints } = setup();
    const { service, seen } = spying(db, creditPoints);
    for (let n = 0; n < 10; n += 1) mint(db, n, YESTERDAY);
    db.gameDay.rows.push({ id: 'ancienne', userId: USER, dayKey: DAY, rerollCount: 0 });
    allDone(db);

    const first = await service.claimChest({ userId: USER, requestId: 'coffre-cours-4', now: NOW });
    mint(db, 10, THIS_MORNING);
    const again = await service.claimChest({ userId: USER, requestId: 'coffre-cours-4', now: NOW });

    expect(seen).toEqual([1587]);
    expect(again).toMatchObject({ status: 'already-claimed', reward: first.reward });
    expect(creditPoints).toHaveBeenCalledTimes(1);
    expect(db.gameDay.rows[0]).toMatchObject({ chestMintBase: 10 });
  });

  it('une frappe CONCURRENTE de la première lecture n’entre jamais dans le cours (constat 1 de l’audit)', async () => {
    const { db, creditPoints } = setup();
    const { service, seen } = spying(db, creditPoints);
    for (let n = 0; n < 9; n += 1) mint(db, n, YESTERDAY);
    allDone(db);
    // La frappe se valide PENDANT le calcul du cours : quelle que soit la requête qu'elle croise, elle est du jour.
    const count = db.prisma.meeshLedger.count.bind(db.prisma.meeshLedger);
    const findMany = db.prisma.meeshLedger.findMany.bind(db.prisma.meeshLedger);
    let injected = false;
    const inject = () => {
      if (injected) return;
      injected = true;
      mint(db, 9, NOW);
    };
    (db.prisma.meeshLedger as { count: unknown }).count = async (args: never) => {
      inject();
      return count(args);
    };
    (db.prisma.meeshLedger as { findMany: unknown }).findMany = async (args: never) => {
      const rows = await findMany(args);
      inject();
      return rows;
    };

    await service.claimChest({ userId: USER, requestId: 'coffre-course', now: NOW });

    expect(seen).toEqual([1221]);
  });

  it('un fuseau posé après une frappe du jour ne la reclasse pas « veille » (constat 2 de l’audit)', async () => {
    const { db, creditPoints } = setup({ timezone: 'Etc/GMT+12' });
    const { service, seen } = spying(db, creditPoints);
    for (let n = 0; n < 9; n += 1) mint(db, n, YESTERDAY);
    // 06 h 40 UTC : le 10-05 en UTC, le 10-04 au fuseau posé ensuite — mais APRÈS l'ouverture du jour de jeu.
    mint(db, 9, new Date('2026-10-05T06:40:00Z'));
    allDone(db);

    await service.claimChest({ userId: USER, requestId: 'coffre-fuseau-cours', now: NOW });

    expect(seen).toEqual([1221]);
  });

  it('une frappe faite AVANT l’ouverture du jour de jeu compte, même le même jour civil (constat 3 de l’audit)', async () => {
    const { db, creditPoints } = setup();
    const { service, seen } = spying(db, creditPoints);
    for (let n = 0; n < 9; n += 1) mint(db, n, YESTERDAY);
    // Le jour de jeu du 10-05 s'ouvre à 09 h 30 ; la frappe de 08 h appartient au jour d'avant.
    mint(db, 9, new Date('2026-10-05T08:00:00Z'));
    allDone(db, new Date('2026-10-05T09:30:00Z'));

    await service.claimChest({ userId: USER, requestId: 'coffre-jour-prolonge', now: NOW });

    expect(seen).toEqual([1587]);
  });
});
