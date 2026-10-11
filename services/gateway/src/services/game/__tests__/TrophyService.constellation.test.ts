/**
 * LA CONSTELLATION D'UN AUTRE MEMBRE (#10053) — elle suit le réglage de la vitrine, et ne dit que ses ÉTOILES :
 * jamais le total de fragments, qui avance d'un coffre du jour et dirait les journées de présence.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { TrophyService } from '../TrophyService';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
}));

const setup = (chestFragmentDays: number, claimedSteps: number[] = []) => {
  const db = fakeGameDb();
  seedUser(db, {}, USER);
  seedUser(db, {}, OTHER);
  for (let i = 0; i < chestFragmentDays; i += 1) {
    const day = String(i + 1).padStart(2, '0');
    db.gameDay.rows.push({ id: `d${i}`, userId: USER, dayKey: `2026-09-${day}`, rerollCount: 0, chestClaimedAt: new Date(), chestFragment: true });
  }
  db.gameDay.rows.push({ id: 'sans', userId: USER, dayKey: '2026-10-01', rerollCount: 0, chestClaimedAt: new Date(), chestFragment: false });
  if (claimedSteps.length > 0) db.gameSeason.rows.push({ id: 's1', userId: USER, season: 1, claimedSteps, stars: 0 });
  return { db, service: new TrophyService(db.prisma) };
};

describe('TrophyService.showcaseFor — la constellation (#10053)', () => {
  it('un ami voit les étoiles allumées : ⌊ collectés ÷ 10 ⌋, sources confondues', async () => {
    const { db, service } = setup(19, [5, 15, 25]);
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });

    const view = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER });

    expect(view.visible).toBe(true);
    expect(view.constellation).toEqual({ stars: 2 });
  });

  it('ne sert jamais le total de fragments à un visiteur', async () => {
    const { db, service } = setup(17);
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });

    const view = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER });

    expect(view.constellation).toEqual({ stars: 1 });
    expect(JSON.stringify(view)).not.toContain('17');
    expect(JSON.stringify(view)).not.toContain('collected');
  });

  it('une vitrine fermée ne dit rien de la constellation — la même réponse qu’un compte inconnu', async () => {
    const { service } = setup(40);
    const refused = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER });
    const unknown = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: '64b7f0c2a1b2c3d4e5f6a7ff' });
    expect(refused).toEqual({ visible: false, items: [], order: [] });
    expect(refused).toEqual(unknown);
  });

  it('le membre lui-même lit sa constellation', async () => {
    const { service } = setup(30);
    const view = await service.showcaseFor({ viewer: { userId: USER, role: 'USER' }, targetId: USER });
    expect(view.constellation).toEqual({ stars: 3 });
  });
});
