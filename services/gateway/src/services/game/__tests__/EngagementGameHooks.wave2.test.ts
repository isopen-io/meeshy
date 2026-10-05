/**
 * LA VAGUE 2 BRANCHÉE SUR LES GESTES (#9385, #9386, #9387) — un signal avance la
 * mission du jour ET le duo de la semaine, une mission achevée donne ses étoiles
 * à la saison, une série qui franchit 100 ou 365 jours grave le trophée de Flamme.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EngagementGameHooks } from '../EngagementGameHooks';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
}));

const NOW = new Date('2026-10-14T12:00:00Z');

const setup = () => {
  const db = fakeGameDb();
  for (const id of [USER, OTHER]) seedUser(db, { engagementScore: 4000, levelRecord: 20 }, id);
  db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: USER, receiverId: OTHER });
  const creditPoints = jest.fn<(userId: string, points: number, axis: string) => Promise<void>>().mockResolvedValue(undefined);
  return { db, hooks: new EngagementGameHooks(db.prisma, creditPoints as never), creditPoints };
};

describe('un signal de jeu', () => {
  it('avance le duo actif de la semaine en plus de la mission', async () => {
    const { db, hooks } = setup();
    const { duoId } = await hooks.duo.invite({ inviterId: USER, friendId: OTHER, now: NOW });
    await hooks.duo.accept({ userId: OTHER, duoId, now: NOW });
    const signal = db.gameDuo.rows[0]!.signal as string;

    await hooks.onSignal(USER, signal, { now: NOW, ...(signal === 'reply-distinct-conversations' ? { key: 'c1' } : {}) });

    expect(db.gameDuo.rows[0]!.inviterProgress).toBe(1);
  });

  it('l’échec du duo ne retient pas la mission, ni l’inverse', async () => {
    const { db, hooks } = setup();
    (db.gameDuoSlot as unknown as { findUnique: () => Promise<never> }).findUnique = () => Promise.reject(new Error('down'));
    const missionSpy = jest.spyOn(hooks.missions, 'onSignal').mockResolvedValue(undefined);

    await expect(hooks.onSignal(USER, 'axis:tool.reaction', { now: NOW })).resolves.toBeUndefined();
    expect(missionSpy).toHaveBeenCalledTimes(1);
  });
});

describe('une mission achevée', () => {
  it('donne ses étoiles à la saison (1 · 1 · 2 · 3 selon la difficulté)', async () => {
    const { db, hooks } = setup();
    db.dailyMission.rows.push({
      id: 'm1', userId: USER, dayKey: '2026-10-14', slot: 0, templateKey: 't', difficulty: 'hard', signal: 'axis:tool.reaction',
      prism: false, target: 1, progress: 0, reward: 50, glory: 0, seen: [], completedAt: null, paidPoints: null, rerolledAt: null, createdAt: NOW,
    });
    db.dailyMission.rows.push(
      { id: 'm2', userId: USER, dayKey: '2026-10-14', slot: 1, templateKey: 't2', difficulty: 'easy', signal: 'x', prism: false, target: 9, progress: 0, reward: 10, glory: 0, seen: [], completedAt: null, createdAt: NOW },
      { id: 'm3', userId: USER, dayKey: '2026-10-14', slot: 2, templateKey: 't3', difficulty: 'medium', signal: 'y', prism: false, target: 9, progress: 0, reward: 10, glory: 0, seen: [], completedAt: null, createdAt: NOW },
    );

    await hooks.missions.onSignal(USER, 'axis:tool.reaction', { now: NOW, dayKey: '2026-10-14', timezone: 'UTC', record: 20 });

    expect(db.dailyMission.rows[0]!.completedAt).not.toBeNull();
    expect(db.gameSeason.rows).toHaveLength(1);
    expect(db.gameSeason.rows[0]).toMatchObject({ userId: USER, number: 1, stars: 2 });
  });
});

describe('une série de Flamme', () => {
  it('qui franchit 100 jours grave le trophée de Flamme, une fois', async () => {
    const { db, hooks } = setup();
    const plan = { previousLongest: 99, longest: 100 } as never;

    await hooks.onStreak(USER, plan);
    await hooks.onStreak(USER, plan);

    expect(db.gameTrophy.rows.map((t) => t.key)).toEqual(['trophy.flame.100']);
  });
});
