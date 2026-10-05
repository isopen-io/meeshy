/**
 * LES RÉGLAGES DU JEU ET QUI VOIT QUOI (#9387, conformité D-1 à D-5) —
 * « amis » par défaut, Atlas « moi seul », valeur inconnue = « moi seul »,
 * « Jeu masqué » et « caché de la recherche » plafonnent, le blocage prime
 * sur « tout le monde ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GameProfileService, settingsOf, storedVisibility } from '../GameProfileService';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

const hidingFromSearch = new Set<string>();
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { hideProfileFromSearch: hidingFromSearch.has(id) }])),
}));

const MEMBER = USER;
const READER = OTHER;

const befriend = (db: ReturnType<typeof fakeGameDb>) =>
  db.friendRequest.rows.push({ id: 'f1', status: 'accepted', senderId: READER, receiverId: MEMBER });

const setup = (profile: Record<string, unknown> = {}, member: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, member, MEMBER);
  seedUser(db, {}, READER);
  if (Object.keys(profile).length > 0) db.gameProfile.rows.push({ id: 'p1', userId: MEMBER, ...profile });
  return { db, service: new GameProfileService(db.prisma) };
};

const viewer = { userId: READER, role: 'USER' as const };

beforeEach(() => hidingFromSearch.clear());

describe('défauts et valeurs inconnues', () => {
  it('sans document : vitrine, rang, trésor « amis », Atlas « moi seul »', () => {
    expect(settingsOf(null).visibility).toEqual({ showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' });
  });

  it('une valeur stockée inconnue se lit « moi seul », jamais le défaut', () => {
    expect(storedVisibility({ showcaseVisibility: 'public' }, 'showcase')).toBe('me');
  });
});

describe('GameProfileService.facetVisibleTo', () => {
  it('par défaut un ami voit la vitrine, un inconnu non', async () => {
    const { db, service } = setup();
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'showcase' })).toBe(false);
    befriend(db);
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'showcase' })).toBe(true);
  });

  it('« tout le monde » ouvre à un inconnu, pas à un lecteur anonyme caché derrière le blocage', async () => {
    const { service } = setup({ showcaseVisibility: 'everyone' });
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'showcase' })).toBe(true);
    expect(await service.facetVisibleTo({ viewer: null, targetId: MEMBER, facet: 'showcase' })).toBe(true);
  });

  it('le blocage, dans un sens ou l’autre, ferme même une vitrine « tout le monde »', async () => {
    const { db, service } = setup({ showcaseVisibility: 'everyone' }, { blockedUserIds: [READER] });
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'showcase' })).toBe(false);
    db.user.rows[0]!.blockedUserIds = [];
    db.user.rows[1]!.blockedUserIds = [MEMBER];
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'showcase' })).toBe(false);
  });

  it('« caché de la recherche » plafonne « tout le monde » à « amis »', async () => {
    const { db, service } = setup({ showcaseVisibility: 'everyone' });
    hidingFromSearch.add(MEMBER);
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'showcase' })).toBe(false);
    befriend(db);
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'showcase' })).toBe(true);
  });

  it('« Jeu masqué » ramène tout à « moi seul », amis compris', async () => {
    const { db, service } = setup({ showcaseVisibility: 'everyone', gameHiddenAt: new Date() });
    befriend(db);
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'showcase' })).toBe(false);
  });

  it('soi et les ADMIN voient toujours ; un MODERATOR est un utilisateur ordinaire', async () => {
    const { service } = setup({ showcaseVisibility: 'me' });
    expect(await service.facetVisibleTo({ viewer: { userId: MEMBER, role: 'USER' }, targetId: MEMBER, facet: 'showcase' })).toBe(true);
    expect(await service.facetVisibleTo({ viewer: { userId: READER, role: 'ADMIN' }, targetId: MEMBER, facet: 'showcase' })).toBe(true);
    expect(await service.facetVisibleTo({ viewer: { userId: READER, role: 'MODERATOR' }, targetId: MEMBER, facet: 'showcase' })).toBe(false);
  });

  it('l’Atlas reste « moi seul » même quand la vitrine est « tout le monde »', async () => {
    const { service } = setup({ showcaseVisibility: 'everyone' });
    expect(await service.facetVisibleTo({ viewer, targetId: MEMBER, facet: 'atlas' })).toBe(false);
  });
});

describe('GameProfileService — écritures', () => {
  it('updateVisibility ne touche que les facettes données et rend les réglages résultants', async () => {
    const { service } = setup();
    const result = await service.updateVisibility(MEMBER, { rank: 'everyone' });
    expect(result).toEqual({ showcase: 'friends', rank: 'everyone', treasury: 'friends', atlas: 'me' });
    expect((await service.updateVisibility(MEMBER, { atlas: 'friends' })).rank).toBe('everyone');
  });

  it('une valeur hors du vocabulaire n’est pas écrite', async () => {
    const { db, service } = setup();
    await service.updateVisibility(MEMBER, { showcase: 'public' as never });
    expect(db.gameProfile.rows).toHaveLength(0);
  });

  it('setShowcaseOrder ne garde que les trophées possédés, sans doublon', async () => {
    const { service } = setup();
    const kept = await service.setShowcaseOrder(MEMBER, ['a', 'zz', 'a', 'b'], ['a', 'b', 'c']);
    expect(kept).toEqual(['a', 'b']);
    expect((await service.settings(MEMBER)).showcaseOrder).toEqual(['a', 'b']);
  });

  it('« Jeu masqué » et l’opposition à la ligue Amis se posent et se retirent', async () => {
    const { service } = setup();
    await service.setGameHidden(MEMBER, true);
    await service.setFriendsLeagueOptOut(MEMBER, true);
    expect(await service.settings(MEMBER)).toMatchObject({ gameHidden: true, friendsLeagueOptedOut: true });
    await service.setGameHidden(MEMBER, false);
    expect((await service.settings(MEMBER)).gameHidden).toBe(false);
  });
});
