/**
 * Route-level emission tests for community preference endpoints.
 *
 * Sibling of `conversation-preferences-broadcast.test.ts` (F71): PUT/DELETE
 * on community preferences didn't emit anything, so a second tab/device for
 * the same user never learned that a community was pinned/muted/archived/
 * hidden — it stayed stale until a manual refetch. These tests pin the fix:
 * both endpoints must broadcast `USER_PREFERENCES_UPDATED` to the user room,
 * same contract shape as the conversation-scoped variant (minus `version`,
 * since `UserCommunityPreferences` has no such field).
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import communityPreferencesRoutes from '../routes/community-preferences';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const TEST_USER_ID = '507f1f77bcf86cd799439011';
const TEST_COMMUNITY_ID = '507f1f77bcf86cd799439abc';

type EmitCall = { event: string; payload: unknown };

const buildPrismaMock = () => ({
  userCommunityPreferences: {
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    count: jest.fn<any>(),
    upsert: jest.fn<any>(),
    delete: jest.fn<any>(),
    updateMany: jest.fn<any>(),
  },
  communityMember: {
    findMany: jest.fn<any>(),
  },
});

const buildApp = async (prisma: ReturnType<typeof buildPrismaMock>) => {
  const emits: EmitCall[] = [];
  const rooms: string[] = [];
  const fakeIO = {
    to: (room: string) => {
      rooms.push(room);
      return {
        emit: (event: string, payload: unknown) => {
          emits.push({ event, payload });
        },
      };
    },
  };

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as any);
  app.decorate('socketIOHandler', { getManager: () => ({ io: fakeIO }) } as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: TEST_USER_ID, role: 'USER' },
      userId: TEST_USER_ID,
    };
  });

  await app.register(communityPreferencesRoutes);
  await app.ready();
  return { app, emits, rooms };
};

describe('community-preferences routes — socket emissions (F71)', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let env: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    env = await buildApp(prisma);
  });

  afterEach(async () => {
    await env.app.close();
  });

  it('PUT /user-preferences/communities/:id emits USER_PREFERENCES_UPDATED to the user room', async () => {
    const upsertedRow = {
      id: 'pref-1',
      userId: TEST_USER_ID,
      communityId: TEST_COMMUNITY_ID,
      isPinned: true,
      isMuted: false,
      isArchived: false,
      isHidden: false,
      notificationLevel: 'all',
      customName: null,
      categoryId: null,
      orderInCategory: null,
      createdAt: new Date('2026-07-05T00:00:00Z'),
      updatedAt: new Date('2026-07-05T00:01:00Z'),
    };
    prisma.userCommunityPreferences.upsert.mockResolvedValue(upsertedRow);

    const res = await env.app.inject({
      method: 'PUT',
      url: `/user-preferences/communities/${TEST_COMMUNITY_ID}`,
      payload: { isPinned: true },
    });

    expect(res.statusCode).toBe(200);

    expect(env.rooms).toContain(ROOMS.user(TEST_USER_ID));
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      communityId: TEST_COMMUNITY_ID,
      reset: false,
      preferences: expect.objectContaining({
        isPinned: true,
        isMuted: false,
        isArchived: false,
        isHidden: false,
        notificationLevel: 'all',
      }),
    });
  });

  it('DELETE /user-preferences/communities/:id emits USER_PREFERENCES_UPDATED with reset:true', async () => {
    prisma.userCommunityPreferences.delete.mockResolvedValue({} as any);

    const res = await env.app.inject({
      method: 'DELETE',
      url: `/user-preferences/communities/${TEST_COMMUNITY_ID}`,
    });

    expect(res.statusCode).toBe(200);

    expect(env.rooms).toContain(ROOMS.user(TEST_USER_ID));
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission).toBeDefined();
    expect(emission?.payload).toMatchObject({
      userId: TEST_USER_ID,
      communityId: TEST_COMMUNITY_ID,
      reset: true,
      preferences: null,
    });
  });

  /**
   * Le glisser-déposer est le TROISIÈME écrivain de `UserCommunityPreferences`,
   * et le lot F71 ci-dessus ne l'a pas énuméré : il a fermé les deux verbes qui
   * CHANGENT une préférence et laissé celui qui RÉORDONNE. La ligne étant par
   * UTILISATEUR, l'omission a exactement le coût que l'en-tête de ce fichier
   * décrit — un second appareil qui n'apprend jamais le geste.
   *
   * Son jumeau conversation (`reorderConversationPreferences`) diffuse depuis
   * toujours, et le handler de communauté le CITE pour lui emprunter son filtre
   * d'appartenance : la jumelle a été ouverte, et prise à moitié.
   */
  describe('POST /user-preferences/communities/reorder', () => {
    const OTHER_COMMUNITY_ID = '507f1f77bcf86cd799439def';

    it('broadcasts the reorder to the user room', async () => {
      prisma.communityMember.findMany.mockResolvedValue([
        { communityId: TEST_COMMUNITY_ID },
        { communityId: OTHER_COMMUNITY_ID },
      ]);
      prisma.userCommunityPreferences.upsert.mockResolvedValue({} as any);

      const res = await env.app.inject({
        method: 'POST',
        url: '/user-preferences/communities/reorder',
        payload: {
          updates: [
            { communityId: TEST_COMMUNITY_ID, orderInCategory: 0 },
            { communityId: OTHER_COMMUNITY_ID, orderInCategory: 1 },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(env.rooms).toContain(ROOMS.user(TEST_USER_ID));

      const emission = env.emits.find(
        (e) => e.event === SERVER_EVENTS.USER_PREFERENCES_COMMUNITY_REORDERED
      );
      expect(emission).toBeDefined();
      expect(emission?.payload).toEqual({
        userId: TEST_USER_ID,
        updates: [
          { communityId: TEST_COMMUNITY_ID, orderInCategory: 0 },
          { communityId: OTHER_COMMUNITY_ID, orderInCategory: 1 },
        ],
      });
    });

    /**
     * L'événement nomme ce qui a été ÉCRIT, jamais ce qui a été DEMANDÉ : le
     * filtre d'appartenance borne les deux ensemble. Sans cela, la diffusion
     * enverrait les autres appareils appliquer un ordre que la base ne porte
     * pas — et confirmerait au passage l'existence d'une communauté que
     * l'appelant n'a pas le droit de nommer.
     */
    it('names only the memberships that were actually written', async () => {
      prisma.communityMember.findMany.mockResolvedValue([{ communityId: TEST_COMMUNITY_ID }]);
      prisma.userCommunityPreferences.upsert.mockResolvedValue({} as any);

      const res = await env.app.inject({
        method: 'POST',
        url: '/user-preferences/communities/reorder',
        payload: {
          updates: [
            { communityId: TEST_COMMUNITY_ID, orderInCategory: 3 },
            { communityId: OTHER_COMMUNITY_ID, orderInCategory: 4 },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.userCommunityPreferences.upsert).toHaveBeenCalledTimes(1);

      const emission = env.emits.find(
        (e) => e.event === SERVER_EVENTS.USER_PREFERENCES_COMMUNITY_REORDERED
      );
      expect(emission?.payload).toEqual({
        userId: TEST_USER_ID,
        updates: [{ communityId: TEST_COMMUNITY_ID, orderInCategory: 3 }],
      });
    });

    it('emits nothing when no membership matches', async () => {
      prisma.communityMember.findMany.mockResolvedValue([]);

      const res = await env.app.inject({
        method: 'POST',
        url: '/user-preferences/communities/reorder',
        payload: { updates: [{ communityId: OTHER_COMMUNITY_ID, orderInCategory: 0 }] },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.userCommunityPreferences.upsert).not.toHaveBeenCalled();
      expect(env.emits).toHaveLength(0);
    });

    /**
     * Garde de CONTRAT, pas de comportement : `USER_PREFERENCES_REORDERED` est
     * décodé par iOS avec un `conversationId` NON optionnel, si bien qu'un item
     * de communauté posé dessus ferait échouer le décodage de l'événement
     * entier — emportant les réordonnancements de conversation qui voyagent
     * avec lui. Ce témoin tombe le jour où quelqu'un « simplifie » les deux
     * gestes sur un seul nom d'événement.
     */
    it('never borrows the conversation-scoped reorder event', async () => {
      prisma.communityMember.findMany.mockResolvedValue([{ communityId: TEST_COMMUNITY_ID }]);
      prisma.userCommunityPreferences.upsert.mockResolvedValue({} as any);

      await env.app.inject({
        method: 'POST',
        url: '/user-preferences/communities/reorder',
        payload: { updates: [{ communityId: TEST_COMMUNITY_ID, orderInCategory: 0 }] },
      });

      expect(
        env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_REORDERED)
      ).toBeUndefined();
    });
  });

  it('DELETE on a not-found preference row still returns 404 without emitting', async () => {
    prisma.userCommunityPreferences.delete.mockRejectedValue({ code: 'P2025' });

    const res = await env.app.inject({
      method: 'DELETE',
      url: `/user-preferences/communities/${TEST_COMMUNITY_ID}`,
    });

    expect(res.statusCode).toBe(404);
    const emission = env.emits.find((e) => e.event === SERVER_EVENTS.USER_PREFERENCES_UPDATED);
    expect(emission).toBeUndefined();
  });
});
