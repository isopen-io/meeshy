/**
 * Négociation de forme à la lecture (O17, spec §C3 rév. 7) + sentinelle.
 *
 * Table : v1 + sans caps ⇒ v1 tel quel (restitution garantie) ; v1 + caps ≥ 3
 * ⇒ v3 si `CANVAS_V3_READ` armé, sinon v1 ; v3-natif + caps ≥ 3 ⇒ v3 ;
 * v3-natif + SANS caps ⇒ SENTINELLE v1 localisée — sauf média porteur, où
 * `storyEffects` est OMIS (le média se lit, pas d'invite par-dessus une vidéo).
 *
 * La sentinelle est GÉNÉRÉE à la lecture, jamais stockée, active dès le merge
 * (indépendante des drapeaux). L'invite suit la langue résolue du LECTEUR
 * (`authContext.userLanguage`, déjà résolue par le middleware d'auth).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks (mêmes que storyEffectsWire.test.ts — harnais core routes) ─────────

const mockGetPostById = jest.fn<any>().mockResolvedValue(null);

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: jest.fn<any>(),
    updatePost: jest.fn<any>(),
    republishStory: jest.fn<any>(),
    repostPost: jest.fn<any>(),
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));

jest.mock('../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// ─── Imports après mocks ──────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../routes/posts/core';
import { PostFeedService } from '../../../services/PostFeedService';
import { resolveWireForm } from '../storyEffectsV3';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

const FIXTURES = join(__dirname, '../../../../../../packages/shared/fixtures/canvas-v3');
const loadV1Blob = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, 'v1-legacy-full.json'), 'utf8')) as Record<string, unknown>;
const loadV1Golden = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, 'v1-legacy-full.v3.json'), 'utf8')) as Record<string, unknown>;
const loadV3Blob = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, 'minimal-text.json'), 'utf8')) as Record<string, unknown>;

async function buildApp(readerLanguage: string = 'fr'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {
    postMention: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  } as any;
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userLanguage: readerLanguage,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  };

  app.decorate('notificationService', null as any);
  app.decorate('socialEvents', {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
  } as any);

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

const storyRow = (storyEffects: unknown, extra: Record<string, unknown> = {}) => ({
  id: POST_ID, type: 'STORY', authorId: USER_ID, visibility: 'PUBLIC',
  visibilityUserIds: [], mentions: [], storyEffects, ...extra,
});

describe('négociation O17 sur GET /posts/:postId', () => {
  const savedFlag = process.env.CANVAS_V3_READ;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    delete process.env.CANVAS_V3_READ;
  });

  afterAll(() => {
    if (savedFlag === undefined) {
      delete process.env.CANVAS_V3_READ;
    } else {
      process.env.CANVAS_V3_READ = savedFlag;
    }
  });

  it('(1) blob v1, requête SANS x-canvas-caps : le blob ressort TEL QUEL', async () => {
    const v1 = loadV1Blob();
    mockGetPostById.mockResolvedValue(storyRow(v1));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.storyEffects).toEqual(v1);
    await app.close();
  });

  it('(2) blob v1, x-canvas-caps: 3, CANVAS_V3_READ=1 : le golden v3 gelé', async () => {
    process.env.CANVAS_V3_READ = '1';
    mockGetPostById.mockResolvedValue(storyRow(loadV1Blob()));
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET', url: `/posts/${POST_ID}`, headers: { 'x-canvas-caps': '3' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.storyEffects).toEqual(loadV1Golden());
    await app.close();
  });

  it('(3) blob v3-natif, SANS caps : sentinelle v1 localisée, jamais de scenes', async () => {
    mockGetPostById.mockResolvedValue(storyRow(loadV3Blob()));
    const app = await buildApp('fr');

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    const effects = res.json().data.storyEffects;
    expect(effects).not.toHaveProperty('scenes');
    expect(effects.background).toBe('1E1B4B');
    expect(effects.textObjects[0].text).toContain('Mets à jour Meeshy');
    await app.close();
  });

  it('(4) blob v3-natif, caps 3 : v3 toEqual — il n\'a pas d\'autre forme', async () => {
    const v3 = loadV3Blob();
    mockGetPostById.mockResolvedValue(storyRow(v3));
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET', url: `/posts/${POST_ID}`, headers: { 'x-canvas-caps': '3' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.storyEffects).toEqual(v3);
    await app.close();
  });

  it('(5) blob v3 + attachment média porteur, SANS caps : média servi, storyEffects OMIS', async () => {
    mockGetPostById.mockResolvedValue(storyRow(loadV3Blob(), {
      media: [{ id: 'm1', mediaUrl: 'https://cdn.example.com/v.mp4', mediaType: 'VIDEO' }],
    }));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.media).toHaveLength(1);
    expect(data.storyEffects).toBeUndefined();
    await app.close();
  });

  it('(6) l\'invite suit la langue résolue du lecteur — repli fr', async () => {
    mockGetPostById.mockResolvedValue(storyRow(loadV3Blob()));
    const appEn = await buildApp('en');
    const resEn = await appEn.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(resEn.json().data.storyEffects.textObjects[0].text).toContain('Update Meeshy');
    await appEn.close();

    mockGetPostById.mockResolvedValue(storyRow(loadV3Blob()));
    const appUnknown = await buildApp('xx');
    const resUnknown = await appUnknown.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(resUnknown.json().data.storyEffects.textObjects[0].text).toContain('Mets à jour Meeshy');
    await appUnknown.close();
  });

  it('(7) repost d\'une story v3-native, SANS caps : repostOf porte la sentinelle localisée', async () => {
    mockGetPostById.mockResolvedValue({
      id: 'repost-1', type: 'POST', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], mentions: [],
      repostOf: { id: POST_ID, type: 'STORY', storyEffects: loadV3Blob() },
    });
    const app = await buildApp('en');

    const res = await app.inject({ method: 'GET', url: '/posts/repost-1' });

    expect(res.statusCode).toBe(200);
    const nested = res.json().data.repostOf;
    expect(nested.storyEffects).not.toHaveProperty('scenes');
    expect(nested.storyEffects.textObjects[0].text).toContain('Update Meeshy');
    await app.close();
  });
});

// ─── (8) Garde de source : le trou F1 ne peut pas se rouvrir ─────────────────

describe('garde de source — withMentions porte TOUJOURS un paramètre lecteur dans les services', () => {
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  const callsWithoutSecondArgument = (source: string): number => {
    const code = stripComments(source);
    let violations = 0;
    let from = code.indexOf('withMentions(');
    while (from !== -1) {
      let depth = 0;
      let hasTopLevelComma = false;
      for (let i = from + 'withMentions('.length - 1; i < code.length; i += 1) {
        const c = code[i];
        if (c === '(' || c === '[' || c === '{') depth += 1;
        else if (c === ')' || c === ']' || c === '}') {
          depth -= 1;
          if (depth === 0) break;
        } else if (c === ',' && depth === 1) {
          hasTopLevelComma = true;
        }
      }
      if (!hasTopLevelComma) violations += 1;
      from = code.indexOf('withMentions(', from + 1);
    }
    return violations;
  };

  it.each([
    '../../PostFeedService.ts',
    '../PostAudioService.ts',
  ])('%s : aucun appel withMentions( sans second argument', (relativePath) => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8');
    expect(source).toContain('withMentions(');
    expect(callsWithoutSecondArgument(source)).toBe(0);
  });
});

// ─── (9) Feed de bout en bout : getStories négocie pour SON lecteur ──────────

describe('getStories — le tray négocie la forme pour le lecteur', () => {
  function storiesPrisma(storyEffects: unknown) {
    return {
      post: {
        findMany: jest.fn<any>().mockResolvedValue([{
          id: POST_ID,
          type: 'STORY',
          authorId: USER_ID,
          visibility: 'PUBLIC',
          createdAt: new Date('2026-08-01T10:00:00Z'),
          expiresAt: null,
          postMentions: [],
          media: [],
          storyEffects,
        }]),
      },
      postView: { findMany: jest.fn<any>().mockResolvedValue([]) },
      postReaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
      postMention: { findMany: jest.fn<any>().mockResolvedValue([]) },
      friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
      participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      communityMember: { findMany: jest.fn<any>().mockResolvedValue([]) },
    } as any;
  }

  it('lecteur SANS caps : blob v3-natif ⇒ sentinelle localisée', async () => {
    const service = new PostFeedService(storiesPrisma(loadV3Blob()));

    const result = await service.getStories(USER_ID, {
      reader: { readerLanguage: 'en' },
    });

    const effects = (result.items[0] as { storyEffects?: Record<string, unknown> }).storyEffects;
    expect(effects).not.toHaveProperty('scenes');
    expect((effects as { textObjects: { text: string }[] }).textObjects[0].text)
      .toContain('Update Meeshy');
  });

  it('lecteur caps 3 : blob v3-natif ⇒ v3 toEqual', async () => {
    const v3 = loadV3Blob();
    const service = new PostFeedService(storiesPrisma(v3));

    const result = await service.getStories(USER_ID, {
      reader: { canvasCaps: 3, readerLanguage: 'en' },
    });

    expect((result.items[0] as { storyEffects?: unknown }).storyEffects).toEqual(v3);
  });
});

// ─── resolveWireForm — la décision, testée à sec ─────────────────────────────

describe('resolveWireForm — la table O17 est une fonction pure', () => {
  const v1 = { background: 'color:#101010', textObjects: [] };
  const v3 = { v: 3, scenes: [] };

  it('v1 + sans caps ⇒ as-is, armé ou pas', () => {
    expect(resolveWireForm(v1, undefined, false)).toBe('as-is');
    expect(resolveWireForm(v1, undefined, true)).toBe('as-is');
  });

  it('v1 + caps 3 ⇒ convert si armé, sinon as-is', () => {
    expect(resolveWireForm(v1, 3, true)).toBe('convert');
    expect(resolveWireForm(v1, 3, false)).toBe('as-is');
  });

  it('v3-natif + caps 3 ⇒ as-is ; v3-natif + sans caps ⇒ sentinel', () => {
    expect(resolveWireForm(v3, 3, false)).toBe('as-is');
    expect(resolveWireForm(v3, 3, true)).toBe('as-is');
    expect(resolveWireForm(v3, undefined, true)).toBe('sentinel');
  });

  it('le prédicat est la MARQUE (v >= 3), jamais la validité du schéma', () => {
    const invalidButMarked = { v: 4, garbage: true };
    expect(resolveWireForm(invalidButMarked, 3, true)).toBe('as-is');
    expect(resolveWireForm(invalidButMarked, undefined, false)).toBe('sentinel');
  });
});
