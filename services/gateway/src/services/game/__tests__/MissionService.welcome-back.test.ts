/**
 * LE RETOUR (#20218, #17373) — un joueur qui revient après sept jours sans journée de jeu tire trois Rêves allégés,
 * une fois par période de trente jours. La loi (`welcomeBackDay`, `isEasedDreamDay`, `easedProfile`) vient de
 * `@meeshy/shared/utils/game/welcome-back` : on teste qu'elle est appliquée au tirage, et que le jour du retour est
 * gravé sur le compte.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MISSION_TEMPLATES } from '@meeshy/shared/utils/game/missions';
import { MissionService } from '../MissionService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-20T10:00:00Z');
const DAY = '2026-10-20';
const LEVEL_20 = 100 * 20 * 20;

const floorOf = (templateKey: unknown): number => MISSION_TEMPLATES.find((t) => t.key === templateKey)!.minTarget;

/** Un compte très actif : chaque geste que les gabarits mesurent, des milliers de fois. */
const setup = (userFields: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20, ...userFields });
  const operations = [...new Set(MISSION_TEMPLATES.flatMap((t) => (t.habit ? [t.habit.operation] : [])))];
  operations.forEach((axisKey, index) => db.engagementCounter.rows.push({ id: `c${index}`, userId: USER, axisKey, count: 6000 }));
  const creditPoints = jest.fn<(userId: string, points: number, axisKey: string) => Promise<void>>().mockResolvedValue(undefined);
  return { db, service: new MissionService(db.prisma, { creditPoints }) };
};

/** La dernière journée de jeu : un acte tiré ce jour-là. */
const playedOn = (db: FakeGameDb, dayKey: string) =>
  db.dailyMission.rows.push({
    id: `played-${dayKey}`,
    userId: USER,
    dayKey,
    slot: 0,
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
    createdAt: new Date(`${dayKey}T08:00:00Z`),
  });

const todayRows = (db: FakeGameDb) => db.dailyMission.rows.filter((row) => row.dayKey === DAY);
const eased = (db: FakeGameDb) => todayRows(db).every((row) => row.target === floorOf(row.templateKey));
const account = (db: FakeGameDb) => db.user.rows.find((row) => row.id === USER)!;

describe('MissionService.ensureToday — le Rêve d’un joueur qui revient', () => {
  it('le témoin a du relief : un compte actif qui n’est pas parti tire au-dessus du plancher', async () => {
    const { db, service } = setup();
    playedOn(db, '2026-10-19');

    await service.ensureToday(USER, NOW);

    expect(todayRows(db)).toHaveLength(3);
    expect(eased(db)).toBe(false);
    expect(account(db).gameWelcomeBackDay).toBeUndefined();
  });

  it('après sept jours sans journée de jeu : chaque acte au plancher, et le jour du retour est gravé', async () => {
    const { db, service } = setup();
    playedOn(db, '2026-10-13');

    await service.ensureToday(USER, NOW);

    expect(todayRows(db)).toHaveLength(3);
    expect(eased(db)).toBe(true);
    expect(account(db).gameWelcomeBackDay).toBe(DAY);
  });

  it('six jours : rien n’est allégé', async () => {
    const { db, service } = setup();
    playedOn(db, '2026-10-14');

    await service.ensureToday(USER, NOW);

    expect(eased(db)).toBe(false);
    expect(account(db).gameWelcomeBackDay).toBeUndefined();
  });

  it('le surlendemain du retour reste allégé ; le quatrième jour, non', async () => {
    const second = setup({ gameWelcomeBackDay: '2026-10-18' });
    playedOn(second.db, '2026-10-19');
    await second.service.ensureToday(USER, NOW);
    expect(eased(second.db)).toBe(true);

    const fourth = setup({ gameWelcomeBackDay: '2026-10-17' });
    playedOn(fourth.db, '2026-10-19');
    await fourth.service.ensureToday(USER, NOW);
    expect(eased(fourth.db)).toBe(false);
  });

  it('un second départ dans les trente jours ne rouvre aucun retour, et le jour gravé ne change pas', async () => {
    const { db, service } = setup({ gameWelcomeBackDay: '2026-10-01' });
    playedOn(db, '2026-10-10');

    await service.ensureToday(USER, NOW);

    expect(eased(db)).toBe(false);
    expect(account(db).gameWelcomeBackDay).toBe('2026-10-01');
  });

  it('un compte qui n’a jamais eu de journée de jeu commence : il ne revient pas', async () => {
    const { db, service } = setup();

    await service.ensureToday(USER, NOW);

    expect(account(db).gameWelcomeBackDay).toBeUndefined();
  });

  it('sous le niveau 5, le premier Rêve d’un joueur qui revient est allégé aussi', async () => {
    const { db, service } = setup({ engagementScore: 10 * 4 * 4, levelRecord: 4 });
    playedOn(db, '2026-10-01');

    await service.ensureToday(USER, NOW);

    expect(todayRows(db)).toHaveLength(1);
    expect(eased(db)).toBe(true);
  });

  it('changer un acte un jour allégé tire un acte allégé', async () => {
    const { db, service } = setup();
    playedOn(db, '2026-10-01');
    db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: 5, reason: 'grant', requestId: 'octroi-0001' });
    await service.ensureToday(USER, NOW);
    const easy = todayRows(db).find((row) => row.slot === 0)!;
    const before = easy.templateKey;

    await service.reroll({ userId: USER, missionId: String(easy.id), requestId: 'reroll-retour-0001', now: NOW });

    const changed = db.dailyMission.rows.find((row) => row.id === easy.id)!;
    expect(changed.templateKey).not.toBe(before);
    expect(changed.target).toBe(floorOf(changed.templateKey));
  });
});
