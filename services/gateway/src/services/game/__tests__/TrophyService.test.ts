/**
 * LES TROPHÉES (#9387) — gravés une fois, rangés par le membre, vus par un
 * visiteur au MOIS près et selon le réglage du membre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { leagueCupTrophy, seasonCupTrophy } from '@meeshy/shared/utils/game/trophies';
import { TrophyService } from '../TrophyService';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
}));

const setup = () => {
  const db = fakeGameDb();
  seedUser(db, {}, USER);
  seedUser(db, {}, OTHER);
  return { db, service: new TrophyService(db.prisma) };
};

describe('TrophyService.award', () => {
  it('grave une fois, rejouer ne grave rien', async () => {
    const { db, service } = setup();
    const spec = leagueCupTrophy({ weekKey: '2026-10-12', league: 'jade', cup: 'gold' });

    expect(await service.award(USER, spec)).toBe(true);
    expect(await service.award(USER, spec)).toBe(false);
    expect(db.gameTrophy.rows.map((r) => r.key)).toEqual(['trophy.league-cup.2026-10-12.jade.gold']);
  });

  it('les trophées de Flamme tombent à 100 et 365 jours, une fois', async () => {
    const { db, service } = setup();
    await service.awardFlameTrophies({ userId: USER, previousLongest: 99, longest: 100 });
    await service.awardFlameTrophies({ userId: USER, previousLongest: 100, longest: 100 });
    await service.awardFlameTrophies({ userId: USER, previousLongest: 100, longest: 400 });
    expect(db.gameTrophy.rows.map((r) => r.key).sort()).toEqual(['trophy.flame.100', 'trophy.flame.365']);
  });
});

describe('TrophyService.showcaseFor', () => {
  it('un ami voit les clés au MOIS près — jamais le jour', async () => {
    const { db, service } = setup();
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });
    await service.award(USER, seasonCupTrophy(1), new Date('2026-12-06T21:45:00Z'));

    const view = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER });

    expect(view).toEqual({ visible: true, items: [{ key: 'trophy.season-cup.1', awardedMonth: '2026-12' }], order: ['trophy.season-cup.1'] });
    expect(JSON.stringify(view)).not.toContain('06T21');
  });

  it('un inconnu reçoit visible:false et rien d’autre, par défaut', async () => {
    const { service } = setup();
    await service.award(USER, seasonCupTrophy(1));
    expect(await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER })).toEqual({ visible: false, items: [], order: [] });
  });

  it('l’ordre choisi par le membre passe devant le reste', async () => {
    const { db, service } = setup();
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });
    await service.award(USER, seasonCupTrophy(1), new Date('2026-12-06T00:00:00Z'));
    await service.award(USER, leagueCupTrophy({ weekKey: '2026-10-12', league: 'quartz', cup: 'bronze' }), new Date('2026-10-18T00:00:00Z'));
    db.gameProfile.rows.push({ id: 'p', userId: USER, showcaseOrder: ['trophy.league-cup.2026-10-12.quartz.bronze'] });

    const view = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER });

    expect(view.order).toEqual(['trophy.league-cup.2026-10.quartz.bronze', 'trophy.season-cup.1']);
  });

  it('un visiteur ne lit jamais la semaine d’une coupe : aucune chaîne de jour dans toute la réponse (D-3)', async () => {
    const { db, service } = setup();
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });
    await service.award(USER, leagueCupTrophy({ weekKey: '2026-09-28', league: 'jade', cup: 'gold' }), new Date('2026-10-05T00:05:00Z'));
    await service.award(USER, leagueCupTrophy({ weekKey: '2026-10-12', league: 'jade', cup: 'gold' }), new Date('2026-10-19T00:05:00Z'));
    await service.award(USER, seasonCupTrophy(1), new Date('2026-12-06T21:45:00Z'));
    db.gameProfile.rows.push({ id: 'p', userId: USER, showcaseOrder: ['trophy.league-cup.2026-09-28.jade.gold'] });

    const view = await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER });

    expect(JSON.stringify(view)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(view.items).toEqual([
      { key: 'trophy.league-cup.2026-10.jade.gold', awardedMonth: '2026-10', count: 2 },
      { key: 'trophy.season-cup.1', awardedMonth: '2026-12' },
    ]);
  });

  it('le membre lui-même lit ses clés complètes', async () => {
    const { service } = setup();
    await service.award(USER, leagueCupTrophy({ weekKey: '2026-10-12', league: 'jade', cup: 'gold' }), new Date('2026-10-19T00:05:00Z'));
    const view = await service.showcaseFor({ viewer: { userId: USER, role: 'USER' }, targetId: USER });
    expect(view.order).toEqual(['trophy.league-cup.2026-10-12.jade.gold']);
  });

  it('un blocage rend la vitrine invisible même réglée sur « tout le monde »', async () => {
    const { db, service } = setup();
    db.gameProfile.rows.push({ id: 'p', userId: USER, showcaseVisibility: 'everyone' });
    db.user.rows[1]!.blockedUserIds = [USER];
    await service.award(USER, seasonCupTrophy(1));
    expect((await service.showcaseFor({ viewer: { userId: OTHER, role: 'USER' }, targetId: USER })).visible).toBe(false);
  });
});
