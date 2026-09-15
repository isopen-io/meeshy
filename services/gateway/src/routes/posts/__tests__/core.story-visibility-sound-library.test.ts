/**
 * #6581 — LA SURPRISE DE LA RECETTE : une story sans `visibility` explicite
 * rend **201**, et n'entre JAMAIS dans la bibliothèque de sons.
 *
 * Le défaut n'est pas la règle — `FRIENDS` par défaut sur une story est
 * fail-closed, donc JUSTE. Ce qui surprend est que rien ne le DIT : la
 * publication réussit, le son emprunté est accepté par le schéma, et aucun
 * compteur ne bouge. Mesuré en production le 2026-09-15 sur le compte
 * `atabeth` : deux stories identiques au `visibility` près, l'une `PUBLIC`
 * (`usageCount` 1 → 2), l'autre sans le champ (`visibility` servie `FRIENDS`,
 * `usageCount` figé à 2). **Un 201 ne prouve pas qu'un son est né, ni qu'un
 * son a été réutilisé.**
 *
 * Ce témoin est un CLIQUET, pas un correctif : il grave la chaîne complète
 * — le défaut de `POST /posts` (routes/posts/core.ts), l'éligibilité
 * (`feedsSoundLibrary`) et la capture (`SoundCaptureService`) — pour qu'aucun
 * lot ne puisse en changer un maillon sans voir les deux autres. Le défaut de
 * visibilité et la règle de bibliothèque vivent dans deux fichiers qui ne se
 * connaissent pas ; c'est exactement le genre d'écart qu'aucun unitaire ne
 * voit.
 *
 * Les deux moitiés sont RÉELLES : la visibilité est celle que la route résout
 * (lue sur l'appel à `createPost`), et la capture est le vrai service sur un
 * Prisma double.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerCoreRoutes } from '../core';
import { feedsSoundLibrary } from '../../../services/posts/soundEligibility';
import { SoundCaptureService } from '../../../services/posts/SoundCaptureService';

jest.mock('../../../services/PostService', () => ({ PostService: jest.fn() }));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../services/posts/StoryTextObjectTranslationService', () => ({
  StoryTextObjectTranslationService: {
    shared: { handleTranslationCompleted: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
  },
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn(() => []),
    resolveUsernames: jest.fn(async () => new Map()),
    createPostMentions: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(({ op }: { op: () => Promise<unknown> }) => op()),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn(() => ({})),
}));

// Même double que `core.story-translation.test.ts` : sans Redis disponible le
// seau partagé `social:write:create` est fail-closed et rendrait 429 avant
// d'atteindre ce que ce fichier mesure.
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }),
  }),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

const AUTHOR_ID = 'user-atabeth';
const SOUND_ID = 'a1b2c3d4e5f60718293a4b5c';
const TRACK_ID = 'trk-rumba';

type CreatePostArgs = { visibility?: string; repostOfId?: string | null };

/**
 * Monte `POST /posts` et rend la visibilité que la ROUTE a résolue — c'est
 * elle, et non le corps soumis, qui gouverne la bibliothèque.
 */
async function visibiliteResolue(payload: Record<string, unknown>): Promise<string | undefined> {
  const createPost = jest.fn<(args: CreatePostArgs) => Promise<Record<string, unknown>>>()
    .mockImplementation(async (args) => ({
      id: 'post-6581',
      type: 'STORY',
      authorId: AUTHOR_ID,
      visibility: args.visibility,
      content: null,
      originalLanguage: null,
    }));

  const { PostService } = await import('../../../services/PostService') as {
    PostService: jest.MockedClass<typeof import('../../../services/PostService').PostService>;
  };
  (PostService as jest.MockedClass<any>).mockImplementation(() => ({
    createPost,
    getPostById: jest.fn(),
    updatePost: jest.fn(),
    deletePost: jest.fn(),
  }));

  const app: FastifyInstance = Fastify({ logger: false });
  (app as unknown as Record<string, unknown>).socialEvents = {
    broadcastStoryCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    broadcastPostCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const requiredAuth = async (request: import('fastify').FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = {
      isAuthenticated: true,
      registeredUser: { id: AUTHOR_ID, emailVerifiedAt: new Date() },
    };
  };

  registerCoreRoutes(app, {} as never, requiredAuth);
  await app.ready();

  const res = await app.inject({ method: 'POST', url: '/posts', payload });
  await app.close();

  expect(res.statusCode).toBe(201);
  return createPost.mock.calls[0]?.[0]?.visibility;
}

/** Prisma double : le son emprunté existe, est public, et n'est pas coupé. */
function makePrisma() {
  return {
    sound: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: SOUND_ID, isPublic: true, uploaderId: 'user-quelquun-dautre', mutedAt: null, durationMs: 6023 },
      ]),
      create: jest.fn<any>().mockResolvedValue({ id: 'sound-neuf' }),
      update: jest.fn<any>().mockResolvedValue({}),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    soundUsage: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      upsert: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(1),
    },
    postMedia: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
}

/**
 * La jointure EXACTE que fait `PostService.createPost` : la visibilité résolue
 * par la route alimente `feedsSoundLibrary`, dont le verdict alimente
 * `captureSounds`. Aucun des deux maillons n'est simulé.
 */
async function capturer(visibility: string | undefined) {
  const prisma = makePrisma();
  const service = new SoundCaptureService(prisma as never, '/tmp/sounds', '/tmp/uploads');
  await service.captureSounds({
    postId: 'post-6581',
    authorId: AUTHOR_ID,
    feedsLibrary: feedsSoundLibrary({ visibility, repostOfId: null }),
    tracks: [{ trackId: TRACK_ID, soundId: SOUND_ID, startMs: 0, endMs: 6023 }],
  });
  return prisma;
}

const STORY_SANS_VISIBILITE = {
  type: 'STORY',
  content: 'Story rumba',
  storyEffects: {
    audioPlayerObjects: [{ id: TRACK_ID, soundId: SOUND_ID, isBackground: true, duration: 6 }],
  },
};

describe('POST /posts — une story sans `visibility` n’entre jamais dans la bibliothèque de sons (#6581)', () => {
  beforeEach(() => {
    process.env.SOUND_LIBRARY_ENABLED = 'true';
  });

  it('résout FRIENDS en silence, et ce défaut ferme la bibliothèque', async () => {
    const visibility = await visibiliteResolue(STORY_SANS_VISIBILITE);

    expect(visibility).toBe('FRIENDS');
    expect(feedsSoundLibrary({ visibility, repostOfId: null })).toBe(false);
  });

  it('n’enregistre AUCUN usage et ne crée AUCUN son — le 201 ne dit rien de la bibliothèque', async () => {
    const visibility = await visibiliteResolue(STORY_SANS_VISIBILITE);
    const prisma = await capturer(visibility);

    expect(prisma.soundUsage.upsert).not.toHaveBeenCalled();
    expect(prisma.sound.create).not.toHaveBeenCalled();
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  it('la MÊME story avec `visibility: PUBLIC` enregistre l’usage — seul le champ absent les sépare', async () => {
    const visibility = await visibiliteResolue({ ...STORY_SANS_VISIBILITE, visibility: 'PUBLIC' });

    expect(visibility).toBe('PUBLIC');

    const prisma = await capturer(visibility);

    expect(prisma.soundUsage.upsert).toHaveBeenCalledTimes(1);
    const [[call]] = prisma.soundUsage.upsert.mock.calls as unknown as [[{ create: Record<string, unknown> }]];
    expect(call.create).toMatchObject({ soundId: SOUND_ID, postId: 'post-6581', trackId: TRACK_ID });
    // `usageCount` est RECOMPTÉ, jamais incrémenté (cf. `recordUsage`).
    expect(prisma.sound.update).toHaveBeenCalledWith({ where: { id: SOUND_ID }, data: { usageCount: 1 } });
  });

  it('un POST sans `visibility` est PUBLIC, lui — le défaut dépend du TYPE, pas de la route', async () => {
    const visibility = await visibiliteResolue({ type: 'POST', content: 'Rumba congolaise' });

    expect(visibility).toBe('PUBLIC');
    expect(feedsSoundLibrary({ visibility, repostOfId: null })).toBe(true);
  });
});
