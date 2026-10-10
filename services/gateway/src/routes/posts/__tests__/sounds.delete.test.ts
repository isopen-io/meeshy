import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { registerSoundRoutes } from '../sounds';
import { registerStoryAudioRoutes } from '../audio';

/**
 * #9848 — un auteur retire de sa bibliothèque un son qu'il a téléversé ou
 * qu'on a extrait de ses vidéos.
 *
 * Le retrait est LOGIQUE (`Sound.deletedAt`) : le son quitte toutes les listes
 * et ne s'emprunte plus, mais les posts déjà publiés continuent de le jouer —
 * ceux des autres compris. La garde est fail-closed : l'auteur, ADMIN et
 * BIGBOSS, personne d'autre.
 */

const ID = '507f1f77bcf86cd799439011';

type Role = 'USER' | 'MODERATOR' | 'AUDIT' | 'ANALYST' | 'ADMIN' | 'BIGBOSS';

function auth(userId: string, role: Role) {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'registered', registeredUser: { id: userId, username: 'tester', role },
      userId, hasFullAccess: true,
    };
  };
}

function anonymousAuth() {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'anonymous', anonymousUser: { id: 'participant-1' },
      userId: 'participant-1', hasFullAccess: false,
    };
  };
}

async function buildApp(prisma: unknown, preValidation: (request: unknown) => Promise<void>) {
  const app = Fastify();
  const client = prisma as import('@meeshy/shared/prisma/client').PrismaClient;
  registerSoundRoutes(app, client, preValidation);
  registerStoryAudioRoutes(app, client, preValidation);
  await app.ready();
  return app;
}

function soundPrisma(initial: Record<string, unknown> | null) {
  let row = initial;
  return {
    sound: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockImplementation(async () => row),
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      update: jest.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>()
        .mockImplementation(async (args) => ({ ...(row ?? {}), ...args.data })),
      updateMany: jest.fn<(args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>>()
        .mockImplementation(async (args) => {
          if (row && !row['deletedAt']) row = { ...row, ...args.data };
          return { count: 1 };
        }),
    },
    soundUsage: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
        { soundId: ID, postId: 'post-public-1', createdAt: new Date('2026-10-03T10:00:00.000Z') },
        { soundId: ID, postId: 'post-public-1', createdAt: new Date('2026-10-02T10:00:00.000Z') },
        { soundId: ID, postId: 'post-public-2', createdAt: new Date('2026-10-01T10:00:00.000Z') },
      ]),
    },
    post: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([
        { id: 'post-public-1', viewCount: 10 },
        { id: 'post-public-2', viewCount: 5 },
      ]),
    },
  };
}

const ownSound = { id: ID, uploaderId: 'author-1', deletedAt: null };

describe('DELETE /sounds/:id — autorisation', () => {
  it('test_deleteSound_byItsAuthor_marksDeletedAt', async () => {
    const prisma = soundPrisma(ownSound);
    const res = await (await buildApp(prisma, auth('author-1', 'USER')))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });

    expect(res.statusCode).toBe(200);
    expect(prisma.sound.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.sound.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data['deletedAt']).toBeInstanceOf(Date);
    expect(Object.keys(call.data)).toEqual(['deletedAt']);
  });

  it.each<Role>(['ADMIN', 'BIGBOSS'])('test_deleteSound_by%s_isAllowed', async (role) => {
    const prisma = soundPrisma(ownSound);
    const res = await (await buildApp(prisma, auth('moderation-1', role)))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    expect(prisma.sound.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each<Role>(['USER', 'MODERATOR', 'AUDIT', 'ANALYST'])(
    'test_deleteSound_byAnother%s_isRefusedAndWritesNothing',
    async (role) => {
      const prisma = soundPrisma(ownSound);
      const res = await (await buildApp(prisma, auth('intrus-1', role)))
        .inject({ method: 'DELETE', url: `/sounds/${ID}` });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('NOT_SOUND_OWNER');
      expect(prisma.sound.update).not.toHaveBeenCalled();
      expect(prisma.sound.updateMany).not.toHaveBeenCalled();
    },
  );

  it('test_deleteSound_roleMissing_isRefused', async () => {
    const prisma = soundPrisma(ownSound);
    const app = Fastify();
    registerSoundRoutes(app, prisma as unknown as import('@meeshy/shared/prisma/client').PrismaClient,
      async (request: unknown) => {
        (request as Record<string, unknown>)['authContext'] = {
          type: 'registered', registeredUser: { id: 'intrus-1', username: 'x' },
          userId: 'intrus-1', hasFullAccess: true,
        };
      });
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(403);
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  it('test_deleteSound_anonymousParticipant_isUnauthorized', async () => {
    const prisma = soundPrisma(ownSound);
    const res = await (await buildApp(prisma, anonymousAuth()))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(401);
    expect(prisma.sound.findUnique).not.toHaveBeenCalled();
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  it('test_deleteSound_malformedId_isRejectedBeforeAnyRead', async () => {
    const prisma = soundPrisma(ownSound);
    const res = await (await buildApp(prisma, auth('author-1', 'USER')))
      .inject({ method: 'DELETE', url: '/sounds/pas-un-id' });
    expect(res.statusCode).toBe(400);
    expect(prisma.sound.findUnique).not.toHaveBeenCalled();
  });

  it('test_deleteSound_unknownSound_returns404', async () => {
    const prisma = soundPrisma(null);
    const res = await (await buildApp(prisma, auth('author-1', 'USER')))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('SOUND_NOT_FOUND');
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  it('test_deleteSound_lookupFails_writesNothing', async () => {
    const prisma = soundPrisma(ownSound);
    prisma.sound.findUnique.mockRejectedValue(new Error('mongo down'));
    const res = await (await buildApp(prisma, auth('author-1', 'USER')))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  /**
   * Un rejeu (file hors ligne, double tap) ne doit ni échouer ni réécrire la
   * date du premier retrait.
   */
  it('test_deleteSound_alreadyDeleted_isIdempotentAndKeepsTheFirstDate', async () => {
    const first = new Date('2026-10-01T10:00:00.000Z');
    const prisma = soundPrisma({ ...ownSound, deletedAt: first });
    const res = await (await buildApp(prisma, auth('author-1', 'USER')))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deletedAt).toBe(first.toISOString());
    expect(prisma.sound.update).not.toHaveBeenCalled();
    expect(prisma.sound.updateMany).not.toHaveBeenCalled();
  });

  it('test_deleteSound_alreadyDeletedByAnother_stillRefusesTheIntruder', async () => {
    const prisma = soundPrisma({ ...ownSound, deletedAt: new Date() });
    const res = await (await buildApp(prisma, auth('intrus-1', 'USER')))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('test_deleteSound_response_saysHowManyPostsStillPlayIt', async () => {
    const prisma = soundPrisma(ownSound);
    const res = await (await buildApp(prisma, auth('author-1', 'USER')))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(ID);
    expect(typeof body.data.deletedAt).toBe('string');
    expect(body.data.postCount).toBe(2);
  });

  it('test_deleteSound_response_neverLeaksContentHash', async () => {
    const prisma = soundPrisma({ ...ownSound, contentHash: 'secret-hash' });
    const res = await (await buildApp(prisma, auth('author-1', 'USER')))
      .inject({ method: 'DELETE', url: `/sounds/${ID}` });
    expect(res.body).not.toContain('secret-hash');
  });
});

describe('Un son retiré quitte les listes et sa page', () => {
  const NOT_DELETED = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

  it('test_getMine_excludesDeletedSounds', async () => {
    const prisma = soundPrisma(null);
    await (await buildApp(prisma, auth('author-1', 'USER'))).inject({ method: 'GET', url: '/sounds/mine' });
    const where = (prisma.sound.findMany.mock.calls[0][0] as { where: { AND: unknown[] } }).where;
    expect(where.AND).toContainEqual(NOT_DELETED);
  });

  it('test_publicLibraryAndSearch_excludeDeletedSounds', async () => {
    const prisma = soundPrisma(null);
    const app = await buildApp(prisma, auth('author-1', 'USER'));
    await app.inject({ method: 'GET', url: '/stories/audio' });
    await app.inject({ method: 'GET', url: '/stories/audio?q=pluie' });
    for (const call of prisma.sound.findMany.mock.calls) {
      const where = (call[0] as { where: { AND: unknown[] } }).where;
      expect(where.AND).toContainEqual(NOT_DELETED);
    }
    expect(prisma.sound.findMany).toHaveBeenCalledTimes(2);
  });

  it('test_getSound_deletedSound_returns410ForEveryone', async () => {
    const row = { id: ID, title: 'S', fileUrl: '/f.m4a', uploaderId: 'author-1', isPublic: true,
      mutedAt: null, deletedAt: new Date() };
    for (const userId of ['author-1', 'other-1']) {
      const prisma = soundPrisma(row);
      const res = await (await buildApp(prisma, auth(userId, 'USER')))
        .inject({ method: 'GET', url: `/sounds/${ID}` });
      expect(res.statusCode).toBe(410);
      expect(res.json().code).toBe('SOUND_DELETED');
    }
  });

  it('test_getSound_deletedPrivateSoundOfOther_stays403', async () => {
    const prisma = soundPrisma({ id: ID, uploaderId: 'author-1', isPublic: false, mutedAt: null,
      deletedAt: new Date() });
    const res = await (await buildApp(prisma, auth('other-1', 'USER')))
      .inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(403);
  });

  /**
   * Vide, pas 410 : un son INCONNU rend déjà une page vide sur cette route, et
   * elle ne doit être l'oracle d'existence de rien (#4146).
   */
  it('test_soundPostsPage_deletedSound_servesTheEmptyPageOfAnUnknownSound', async () => {
    const prisma = soundPrisma({ id: ID, deletedAt: new Date() });
    const res = await (await buildApp(prisma, auth('other-1', 'USER')))
      .inject({ method: 'GET', url: `/sounds/${ID}/posts` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().pagination).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    expect(prisma.soundUsage.findMany).not.toHaveBeenCalled();
  });

  it('test_soundPostsPage_liveSound_isStillServed', async () => {
    const prisma = soundPrisma({ id: ID, deletedAt: null });
    const res = await (await buildApp(prisma, auth('other-1', 'USER')))
      .inject({ method: 'GET', url: `/sounds/${ID}/posts` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  /**
   * Deux retraits simultanés : le second ne doit pas réécrire la date du
   * premier. L'écriture est CONDITIONNÉE à l'absence de `deletedAt`.
   */
  it('test_deleteSound_writeIsConditionalOnNotAlreadyDeleted', async () => {
    const prisma = soundPrisma(ownSound);
    await (await buildApp(prisma, auth('author-1', 'USER'))).inject({ method: 'DELETE', url: `/sounds/${ID}` });
    const call = (prisma.sound.updateMany.mock.calls[0][0]) as { where: Record<string, unknown> };
    expect(call.where).toEqual({ id: ID, ...NOT_DELETED });
  });

  it('test_patchSound_deletedSound_isRefusedAndWritesNothing', async () => {
    const prisma = soundPrisma({ ...ownSound, deletedAt: new Date() });
    const res = await (await buildApp(prisma, auth('author-1', 'USER')))
      .inject({ method: 'PATCH', url: `/sounds/${ID}`, payload: { title: 'Nouveau' } });
    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe('SOUND_DELETED');
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });
});
