/**
 * LES ÉCRITURES DU JEU MARQUENT LE COMPTE « À ÉVALUER » (#10175, L19 — § 5.16.4) : un point gagné, un score,
 * une série ou un succès peuvent faire franchir une étape app fermée. Le marquage ne se fait que l'interrupteur
 * allumé, et une marque qui tombe ne retient jamais le geste.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EngagementGameHooks } from '../EngagementGameHooks';
import { memoryPhotoMomentMarks, type PhotoMomentMarks } from '../PhotoMomentMarks';
import { fakeGameDb, seedUser, USER } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const setup = (on: boolean, marks: PhotoMomentMarks = memoryPhotoMomentMarks()) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 4000, levelRecord: 20 }, USER);
  const hooks = new EngagementGameHooks(db.prisma, (async () => undefined) as never, { photoMarks: marks, photoPushOn: () => on });
  return { hooks, marks };
};

describe('le marquage « à évaluer »', () => {
  it('allumé : un point gagné, un score, une série, un succès marquent le compte', async () => {
    for (const touch of [
      (h: EngagementGameHooks) => h.onPointsGained(USER, 5),
      (h: EngagementGameHooks) => h.onScore(USER, 10, 20),
      (h: EngagementGameHooks) => h.onStreak(USER, { longest: 3, previousLongest: 3 } as never),
      (h: EngagementGameHooks) => h.onAchievement(USER, 'unknown-key'),
    ]) {
      const { hooks, marks } = setup(true);
      await touch(hooks);
      expect(await marks.drain(10)).toEqual([USER]);
    }
  });

  it('éteint : rien n’est marqué', async () => {
    const { hooks, marks } = setup(false);
    await hooks.onPointsGained(USER, 5);
    expect(await marks.drain(10)).toEqual([]);
  });

  it('une marque qui tombe ne retient pas le geste', async () => {
    const broken: PhotoMomentMarks = { mark: async () => Promise.reject(new Error('redis down')), drain: async () => [] };
    const { hooks } = setup(true, broken);
    await expect(hooks.onPointsGained(USER, 5)).resolves.toBeUndefined();
  });
});
