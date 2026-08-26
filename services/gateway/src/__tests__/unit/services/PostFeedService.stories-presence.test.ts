/**
 * PostFeedService.getStories — author presence enrichment (2026-07-10)
 *
 * The story viewer shows an identity interstitial (avatar + name + presence)
 * at every group switch. Presence must be resolvable AT SWITCH TIME from the
 * feed payload itself — not lazily after the slide is already displayed.
 * The stories path therefore selects `isOnline` + `lastActiveAt` on the
 * author, while the regular post feed keeps the lean author shape (presence
 * exposure stays scoped to people allowed to see the story).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest as jestGlobal } from '@jest/globals';

const mockResolveForTargets = jestGlobal.fn<any>();
jestGlobal.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
}));

import { PostFeedService } from '../../../services/PostFeedService';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { GlobalUserRoleType } from '@meeshy/shared/types/role-types';

const FULL = { showOnline: true, showLastSeenTimestamp: true };
const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

let mockPostFindMany: jest.Mock;
let mockPrisma: PrismaClient;

beforeEach(() => {
  mockResolveForTargets.mockReset().mockImplementation(async (_v: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, FULL])),
  );
  mockPostFindMany = jest.fn().mockResolvedValue([]);

  mockPrisma = {
    post: { findMany: mockPostFindMany } as unknown as PrismaClient['post'],
    postReaction: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postReaction'],
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['friendRequest'],
    participant: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['participant'],
    postView: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postView'],
    postBookmark: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postBookmark'],
    postImpression: { groupBy: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postImpression'],
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaClient['user'],
    postMention: { findMany: jest.fn().mockResolvedValue([]) } as unknown as PrismaClient['postMention'],
  } as unknown as PrismaClient;
});

describe('PostFeedService.getStories — author presence (isOnline/lastActiveAt)', () => {
  it('selects author presence fields on the full stories include', async () => {
    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1');

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.include?.author?.select?.isOnline).toBe(true);
    expect(args.include?.author?.select?.lastActiveAt).toBe(true);
  });

  it('selects author presence fields on the tray projection', async () => {
    const service = new PostFeedService(mockPrisma);
    await service.getStories('user-1', { projection: 'tray' });

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.select?.author?.select?.isOnline).toBe(true);
    expect(args.select?.author?.select?.lastActiveAt).toBe(true);
  });

  it('keeps the lean author shape (no presence) on the regular feed', async () => {
    const service = new PostFeedService(mockPrisma);
    await service.getFeed('user-1', 1, 20);

    const args = mockPostFindMany.mock.calls[0][0];
    expect(args.include?.author?.select?.isOnline).toBeUndefined();
    expect(args.include?.author?.select?.lastActiveAt).toBeUndefined();
  });
});

// ─── Gate de présence sur l'auteur de story ──────────────────────────────────
//
// Charger `isOnline`/`lastActiveAt` est une décision produit (l'interstitiel
// d'identité doit être complet à l'instant du switch de groupe) ; les SERVIR
// bruts n'en est pas une. Les témoins ci-dessus figeaient le `select` et rien
// d'autre : la valeur sortait sans jamais passer par `PresenceVisibilityService`.
//
// Régime UNIQUE et STRICT (directive produit 2026-08-25) : quelle que soit la
// visibilité de la story (PUBLIC, FRIENDS, COMMUNITY, ONLY…), TOUS les auteurs
// de la page passent par le même `resolveForTargets(viewer, ids)` — self ou
// ADMIN/BIGBOSS toujours privilégié, sinon amitié ACCEPTÉE requise. Une
// co-appartenance de communauté ou un contact DM ne suffit plus à montrer la
// présence, même si elle a suffi à autoriser l'accès à la story elle-même.
// La résolution aveugle au viewer (préférences seules) a été SUPPRIMÉE du service.
describe('PostFeedService.getStories — la présence de l auteur est filtrée', () => {
  const LAST_SEEN = new Date('2026-08-22T10:00:00.000Z');

  function makeStory(over: Record<string, any> = {}) {
    return {
      id: 'story-1',
      type: 'story',
      visibility: PostVisibility.FRIENDS,
      createdAt: new Date('2026-08-22T09:00:00.000Z'),
      expiresAt: null,
      author: { id: 'author-1', username: 'awa', isOnline: true, lastActiveAt: LAST_SEEN },
      media: [],
      ...over,
    };
  }

  async function servedStories(stories: any[], opts?: { projection?: 'tray'; viewerRole?: GlobalUserRoleType }) {
    mockPostFindMany.mockResolvedValue(stories);
    const service = new PostFeedService(mockPrisma);
    const result = await service.getStories('user-1', opts);
    return result.items as any[];
  }

  it('masque la présence d un auteur lié (non public) dont le viewer USER n est pas ami', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([['author-1', HIDDEN]]));

    const [story] = await servedStories([makeStory({ visibility: PostVisibility.COMMUNITY })]);

    expect(story.author.isOnline).toBe(false);
    expect(story.author.lastActiveAt).toBeNull();
    const [viewer, ids] = mockResolveForTargets.mock.calls[0];
    expect(viewer).toEqual({ userId: 'user-1', role: 'USER' });
    expect(ids).toEqual(['author-1']);
  });

  it('conserve la présence d un ami (visible sous ses préférences)', async () => {
    const [story] = await servedStories([makeStory({ visibility: PostVisibility.FRIENDS })]);

    expect(story.author.isOnline).toBe(true);
    expect(story.author.lastActiveAt).toEqual(LAST_SEEN);
  });

  it('résout un auteur vu en PUBLIC par le même critère strict', async () => {
    await servedStories([makeStory({ visibility: PostVisibility.PUBLIC })]);

    expect(mockResolveForTargets).toHaveBeenCalled();
    const [viewer, ids] = mockResolveForTargets.mock.calls[0];
    expect(ids).toEqual(['author-1']);
    expect(viewer).toEqual({ userId: 'user-1', role: 'USER' });
  });

  // Un seul appel groupé pour tous les auteurs de la page, quelle que soit la
  // visibilité de chacune de leurs stories.
  it('résout tous les auteurs de la page en un seul appel groupé', async () => {
    await servedStories([
      makeStory({ id: 'story-public', visibility: PostVisibility.PUBLIC }),
      makeStory({ id: 'story-friends', visibility: PostVisibility.FRIENDS, author: { id: 'author-2', username: 'ben', isOnline: true, lastActiveAt: LAST_SEEN } }),
    ]);

    expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
    const ids = mockResolveForTargets.mock.calls[0][1] as string[];
    expect(new Set(ids)).toEqual(new Set(['author-1', 'author-2']));
  });

  it('le viewer ADMIN voit toute la présence, y compris d un auteur non ami', async () => {
    // Simule le bypass réel de PresenceVisibilityService.resolveForTargets :
    // un viewer ADMIN/BIGBOSS reçoit FULL pour tout le monde.
    mockResolveForTargets.mockImplementation(async (viewer: { role: string } | null, ids: string[]) =>
      new Map(ids.map((id) => [id, viewer?.role === 'ADMIN' ? FULL : HIDDEN])),
    );

    const [story] = await servedStories(
      [makeStory({ visibility: PostVisibility.COMMUNITY })],
      { viewerRole: 'ADMIN' },
    );

    expect(story.author.isOnline).toBe(true);
    expect(story.author.lastActiveAt).toEqual(LAST_SEEN);
    const [viewer] = mockResolveForTargets.mock.calls[0];
    expect(viewer).toEqual({ userId: 'user-1', role: 'ADMIN' });
  });

  it('ne masque jamais la présence sur MA propre story', async () => {
    await servedStories([
      makeStory({
        visibility: PostVisibility.PUBLIC,
        author: { id: 'user-1', username: 'moi', isOnline: true, lastActiveAt: LAST_SEEN },
      }),
    ]);

    const [viewer, ids] = mockResolveForTargets.mock.calls[0];
    expect(viewer).toEqual({ userId: 'user-1', role: 'USER' });
    expect(ids).toEqual(['user-1']);
  });

  // Le défaut est le refus : un id que le résolveur n'a pas rendu sort masqué.
  it('masque un auteur que le résolveur n a pas rendu', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());

    const [story] = await servedStories([makeStory()]);

    expect(story.author.isOnline).toBe(false);
    expect(story.author.lastActiveAt).toBeNull();
  });

  it('filtre aussi la projection tray', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([['author-1', HIDDEN]]));

    const [story] = await servedStories([makeStory()], { projection: 'tray' });

    expect(story.author.isOnline).toBe(false);
    expect(story.author.lastActiveAt).toBeNull();
  });

  it('n ouvre aucune résolution sur une page vide', async () => {
    await servedStories([]);

    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});
