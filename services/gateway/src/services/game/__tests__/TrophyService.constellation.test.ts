/**
 * LA CONSTELLATION D'UN AUTRE MEMBRE (#10053) — elle suit le réglage de la vitrine, et ne dit que ses ÉTOILES :
 * jamais le total de fragments, qui avance d'un coffre du jour et dirait les journées de présence. Et ces étoiles
 * sont FIGÉES au mois, comme `awardedMonth` : un visiteur les lit sur les fragments d'avant le 1er du mois courant
 * (coffres des jours antérieurs, saisons terminées avant), jamais en direct — sinon relire la vitrine dirait le jour
 * où une étoile s'allume, donc quand la personne a joué. Le membre lui-même lit son total en direct.
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
    db.gameDay.rows.push({ id: `d${i}`, userId: USER, dayKey: `2026-09-${day}`, rerollCount: 0, chestClaimedAt: new Date(`2026-09-${day}T12:00:00Z`), chestFragment: true });
  }
  db.gameDay.rows.push({ id: 'sans', userId: USER, dayKey: '2026-10-01', rerollCount: 0, chestClaimedAt: new Date(), chestFragment: false });
  if (claimedSteps.length > 0) db.gameSeason.rows.push({ id: 's1', userId: USER, number: 1, claimedSteps, stars: 0 });
  return { db, service: new TrophyService(db.prisma) };
};

const NOW = new Date('2026-10-11T12:00:00Z');

describe('TrophyService.showcaseFor — la constellation (#10053)', () => {
  it('un ami voit les étoiles allumées : ⌊ collectés ÷ 10 ⌋, sources confondues (saison terminée avant le mois)', async () => {
    const { db, service } = setup(19, [5, 15, 25]);
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });

    const view = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER, now: new Date('2027-03-02T12:00:00Z') });

    expect(view.visible).toBe(true);
    expect(view.constellation).toEqual({ stars: 2 });
  });

  it('ne sert jamais le total de fragments à un visiteur', async () => {
    const { db, service } = setup(17);
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });

    const view = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER, now: NOW });

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
    const view = await service.showcaseFor({ viewer: { userId: USER, role: 'USER' }, targetId: USER, now: NOW });
    expect(view.constellation).toEqual({ stars: 3 });
  });

  it('un fragment collecté ce mois-ci ne change RIEN pour un visiteur avant le mois suivant ; le membre le voit tout de suite', async () => {
    const { db, service } = setup(9);
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });
    db.gameDay.rows.push({ id: 'today', userId: USER, dayKey: '2026-10-11', rerollCount: 0, chestClaimedAt: new Date('2026-10-11T11:00:00Z'), chestFragment: true });
    const friend = { viewer: { userId: OTHER, role: 'USER' as const }, targetId: USER };

    expect((await service.showcaseFor({ ...friend, now: NOW })).constellation).toEqual({ stars: 0 });
    expect((await service.showcaseFor({ ...friend, now: new Date('2026-10-31T23:00:00Z') })).constellation).toEqual({ stars: 0 });
    expect((await service.showcaseFor({ viewer: { userId: USER, role: 'USER' }, targetId: USER, now: NOW })).constellation).toEqual({ stars: 1 });
    expect((await service.showcaseFor({ ...friend, now: new Date('2026-11-01T12:00:00Z') })).constellation).toEqual({ stars: 1 });
  });

  it('un coffre d’un jour LOCAL d’avant le mois, réclamé après le 1er UTC (fuseau négatif, journée qui déborde), ne compte qu’au mois suivant', async () => {
    const { db, service } = setup(9);
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });
    db.gameDay.rows.push({ id: 'late', userId: USER, dayKey: '2026-10-31', rerollCount: 0, chestClaimedAt: new Date('2026-11-01T18:30:00Z'), chestFragment: true });
    const friend = { viewer: { userId: OTHER, role: 'USER' as const }, targetId: USER };

    expect((await service.showcaseFor({ ...friend, now: new Date('2026-11-01T17:00:00Z') })).constellation).toEqual({ stars: 0 });
    expect((await service.showcaseFor({ ...friend, now: new Date('2026-11-01T19:00:00Z') })).constellation).toEqual({ stars: 0 });
    expect((await service.showcaseFor({ ...friend, now: new Date('2026-12-01T00:30:00Z') })).constellation).toEqual({ stars: 1 });
  });

  it('les étapes d’une saison EN COURS ne comptent pour un visiteur qu’à partir du mois qui suit sa fin', async () => {
    const { db, service } = setup(0, [5, 15, 25, 35]);
    db.gameDay.rows.push(...Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, userId: USER, dayKey: `2026-11-0${i + 1}`, rerollCount: 0, chestClaimedAt: new Date(`2026-11-0${i + 1}T12:00:00Z`), chestFragment: true })));
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });
    const friend = { viewer: { userId: OTHER, role: 'USER' as const }, targetId: USER };

    expect((await service.showcaseFor({ ...friend, now: new Date('2027-02-14T12:00:00Z') })).constellation).toEqual({ stars: 0 });
    expect((await service.showcaseFor({ ...friend, now: new Date('2027-03-01T12:00:00Z') })).constellation).toEqual({ stars: 1 });
  });
});
