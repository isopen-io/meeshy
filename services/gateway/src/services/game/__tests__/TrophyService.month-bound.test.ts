/**
 * #10240 — CE QU'UN VISITEUR VOIT DES TROPHÉES EST FIGÉ AU MOIS, comme la constellation (#10053).
 *
 * `awardedMonth` n'était qu'une étiquette : un trophée gagné aujourd'hui apparaissait EN DIRECT dans la vitrine d'un
 * ami — relire la vitrine (ou le compte de trophées du profil) donnait sa date d'obtention au jour, voire à l'heure.
 * Un trophée de Flamme (100 / 365 jours) ou de Prestige date une présence. Un visiteur ne voit désormais que les
 * trophées obtenus STRICTEMENT avant minuit UTC du 1er du mois courant (`constellationVisitorBound`, la même borne que
 * la constellation). Le membre lui-même les voit en direct. ADMIN est un visiteur ici (seul le membre lit tout).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { flameTrophy, seasonCupTrophy } from '@meeshy/shared/utils/game/trophies';
import { TrophyService } from '../TrophyService';
import { GameStandingService } from '../GameStandingService';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
}));

const TODAY = new Date('2026-10-11T12:00:00Z');
const FLAME_100 = 'trophy.flame.100';

const setup = () => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 1000, levelRecord: 5 }, USER);
  seedUser(db, {}, OTHER);
  db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: OTHER, receiverId: USER });
  const trophies = new TrophyService(db.prisma);
  return { db, trophies, standing: new GameStandingService(db.prisma) };
};

const friend = { userId: OTHER, role: 'USER' as const };
const admin = { userId: OTHER, role: 'ADMIN' as const };
const self = { userId: USER, role: 'USER' as const };

const keysSeenBy = async (trophies: TrophyService, viewer: typeof friend | typeof admin | typeof self, now: Date) =>
  (await trophies.showcaseFor({ viewer, targetId: USER, now })).items.map((i) => i.key);

describe('la vitrine d’un visiteur est figée au 1er du mois (#10240)', () => {
  it('un trophée obtenu aujourd’hui n’apparaît pas à un ami avant le 1er du mois suivant ; le membre le voit tout de suite', async () => {
    const { trophies } = setup();
    await trophies.award(USER, seasonCupTrophy(1), new Date('2026-09-20T20:00:00Z'));
    await trophies.award(USER, flameTrophy(100), new Date('2026-10-11T07:42:00Z'));

    expect(await keysSeenBy(trophies, friend, TODAY)).toEqual(['trophy.season-cup.1']);
    expect(await keysSeenBy(trophies, friend, new Date('2026-10-31T23:59:59Z'))).toEqual(['trophy.season-cup.1']);
    expect(await keysSeenBy(trophies, self, TODAY)).toContain(FLAME_100);
    expect((await keysSeenBy(trophies, friend, new Date('2026-11-01T00:00:00Z'))).sort()).toEqual([FLAME_100, 'trophy.season-cup.1'].sort());
  });

  it('relire la vitrine pendant le mois rend la MÊME réponse avant et après l’obtention', async () => {
    const { trophies } = setup();
    await trophies.award(USER, seasonCupTrophy(1), new Date('2026-09-20T20:00:00Z'));
    const before = await trophies.showcaseFor({ viewer: friend, targetId: USER, now: TODAY });
    await trophies.award(USER, flameTrophy(365), TODAY);
    const after = await trophies.showcaseFor({ viewer: friend, targetId: USER, now: new Date(TODAY.getTime() + 60_000) });
    expect(after).toEqual(before);
  });

  it('la borne est l’instant minuit UTC du 1er : obtenu à 23:59:59 le dernier jour du mois, il attend le mois suivant', async () => {
    const { trophies } = setup();
    await trophies.award(USER, flameTrophy(100), new Date('2026-10-31T23:59:59.999Z'));
    expect(await keysSeenBy(trophies, friend, new Date('2026-10-31T23:59:59.999Z'))).toEqual([]);
    expect(await keysSeenBy(trophies, friend, new Date('2026-11-01T00:00:00.000Z'))).toEqual([FLAME_100]);
    await trophies.award(USER, flameTrophy(365), new Date('2026-11-01T00:00:00.000Z'));
    expect(await keysSeenBy(trophies, friend, new Date('2026-11-15T00:00:00Z'))).toEqual([FLAME_100]);
  });

  it('un administrateur est un visiteur : il ne voit pas non plus le trophée du mois courant', async () => {
    const { trophies } = setup();
    await trophies.award(USER, flameTrophy(100), new Date('2026-10-11T07:42:00Z'));
    expect(await keysSeenBy(trophies, admin, TODAY)).toEqual([]);
  });

  it('l’ordre choisi par le membre ne fait pas réapparaître un trophée du mois courant', async () => {
    const { db, trophies } = setup();
    await trophies.award(USER, seasonCupTrophy(1), new Date('2026-09-20T20:00:00Z'));
    await trophies.award(USER, flameTrophy(100), new Date('2026-10-11T07:42:00Z'));
    db.gameProfile.rows.push({ id: 'p', userId: USER, showcaseOrder: [FLAME_100, 'trophy.season-cup.1'] });
    const view = await trophies.showcaseFor({ viewer: friend, targetId: USER, now: TODAY });
    expect(view.order).toEqual(['trophy.season-cup.1']);
    expect(JSON.stringify(view)).not.toContain('flame');
  });
});

describe('le nombre de trophées du profil est figé à la même borne (#10240)', () => {
  it('un ami lit le compte d’avant le mois ; le membre lit le compte en direct', async () => {
    const { trophies, standing } = setup();
    await trophies.award(USER, seasonCupTrophy(1), new Date('2026-09-20T20:00:00Z'));
    await trophies.award(USER, flameTrophy(100), new Date('2026-10-11T07:42:00Z'));

    expect((await standing.standingFor({ viewer: friend, targetId: USER, now: TODAY })).standing?.trophyCount).toBe(1);
    expect((await standing.standingFor({ viewer: admin, targetId: USER, now: TODAY })).standing?.trophyCount).toBe(1);
    expect((await standing.standingFor({ viewer: self, targetId: USER, now: TODAY })).standing?.trophyCount).toBe(2);
    expect((await standing.standingFor({ viewer: friend, targetId: USER, now: new Date('2026-11-01T00:00:00Z') })).standing?.trophyCount).toBe(2);
  });
});
