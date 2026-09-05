/**
 * Favori, impression (unitaire et en LOT) et partage ne touchent que ce que
 * l'appelant a le droit de LIRE — issue #4146.
 *
 * Les quatre points d'entrée ne filtraient que `deletedAt`. Ce que ça coûtait,
 * dans l'ordre de gravité :
 *
 *  - le FAVORI était un IDOR complet : tout compte mettait en favori une story
 *    `FRIENDS` ou un post `ONLY` dont il est exclu, et l'incrément de
 *    `bookmarkCount` ANNONÇAIT ce favori à l'auteur — qui apprenait ainsi qu'un
 *    tiers avait atteint son contenu restreint. La route ignorait de plus le
 *    `null` du service et répondait `{ bookmarked: true }` sur un post
 *    inexistant : elle AFFIRMAIT un effet qui n'avait pas eu lieu ;
 *  - le PARTAGE frappait un `TrackingLink` — attribuable (`createdBy`) et
 *    persistant — vers le détail d'un post illisible ;
 *  - l'IMPRESSION gonflait les analytiques d'un contenu restreint, et la route
 *    UNITAIRE était en prime un ORACLE D'EXISTENCE : `update` levait P2025
 *    (500) sur un id inconnu et rendait 200 sur un id connu.
 *
 * Le LOT est le témoin qui compte : `updateMany` ne lève JAMAIS, donc une
 * régression y passerait sans bruit là où l'unitaire finirait par exploser.
 *
 * Refus = 404 pour les TROIS cas — absent, supprimé, hors audience. Un témoin
 * de cette forme doit donc exiger l'ÉGALITÉ des deux réponses, pas seulement
 * leur code : c'est la seule assertion qu'un futur `sendNotFound` bavard ferait
 * rougir.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockBookmarkPost = jest.fn<any>().mockResolvedValue({ success: true, bookmarkCount: 7 });
const mockUnbookmarkPost = jest.fn<any>().mockResolvedValue({ success: true, bookmarkCount: 6 });
const mockSharePost = jest.fn<any>().mockResolvedValue({ shareCount: 3 });
const mockShareWithTrackingLink = jest.fn<any>().mockResolvedValue({
  shared: true, shareCount: 4, token: 'tok123', shortUrl: 'https://app.example.com/l/tok123', reused: false,
});

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    bookmarkPost: (...a: any[]) => mockBookmarkPost(...a),
    unbookmarkPost: (...a: any[]) => mockUnbookmarkPost(...a),
    sharePost: (...a: any[]) => mockSharePost(...a),
    shareWithTrackingLink: (...a: any[]) => mockShareWithTrackingLink(...a),
    getPostById: jest.fn<any>().mockResolvedValue(null),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEWER_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd7994390aa';
const PUBLIC_ID = '507f1f77bcf86cd799439021';
const FRIENDS_STORY_ID = '507f1f77bcf86cd799439022';
const ONLY_ID = '507f1f77bcf86cd799439023';
const MISSING_ID = '507f1f77bcf86cd799439024';

// ─── Harness ──────────────────────────────────────────────────────────────────

type Acl = {
  id: string;
  authorId: string;
  visibility: string;
  visibilityUserIds: string[];
  expiresAt: Date | null;
};

function acl(id: string, visibility: string, visibilityUserIds: string[] = [], authorId = AUTHOR_ID): Acl {
  return { id, authorId, visibility, visibilityUserIds, expiresAt: null };
}

/** L'univers par défaut : un post PUBLIC lisible, une story FRIENDS et un post
 *  ONLY dont le lecteur est exclu, et un id qui ne correspond à rien. */
function defaultUniverse(): Record<string, Acl> {
  return {
    [PUBLIC_ID]: acl(PUBLIC_ID, 'PUBLIC'),
    [FRIENDS_STORY_ID]: acl(FRIENDS_STORY_ID, 'FRIENDS'),
    [ONLY_ID]: acl(ONLY_ID, 'ONLY', [AUTHOR_ID]),
  };
}

type PrismaDouble = ReturnType<typeof makePrisma>;

function makePrisma(opts: {
  universe?: Record<string, Acl>;
  isFriend?: boolean;
  isDirectContact?: boolean;
  reference?: { expiredViewAt: Date | null } | null;
} = {}) {
  const universe = opts.universe ?? defaultUniverse();
  const findMany = jest.fn<any>().mockImplementation(({ where }: any) => {
    // Le MÊME délégué sert deux questions : la passe d'audience du lot
    // (`where.id.in`) et la résolution des racines de repost
    // (`where.repostOfId`). Les distinguer ici évite qu'un témoin d'ACL soit
    // satisfait par le double de l'autre requête.
    if (where?.repostOfId !== undefined) return Promise.resolve([]);
    const ids: string[] = where?.id?.in ?? [];
    return Promise.resolve(ids.map((id) => universe[id]).filter(Boolean));
  });
  return {
    post: {
      findFirst: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(universe[where.id] ?? null)),
      findMany,
      update: jest.fn<any>().mockResolvedValue({ repostOfId: null, originalRepostOfId: null }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postComment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    postImpression: {
      create: jest.fn<any>().mockResolvedValue({}),
      createMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(opts.isFriend ? { id: 'fr-1' } : null) },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(opts.isDirectContact ? [{ conversationId: 'conv-1' }] : []),
      findFirst: jest.fn<any>().mockResolvedValue(opts.isDirectContact ? { id: 'pt-1' } : null),
    },
    postMention: { findUnique: jest.fn<any>().mockResolvedValue(opts.reference ?? null) },
  } as any;
}

const broadcastPostBookmarked = jest.fn<any>();

async function buildApp(prisma: PrismaDouble): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', null as any);
  app.decorate('socialEvents', { broadcastPostBookmarked } as any);
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: VIEWER_ID, role: 'USER', username: 'alice' },
    };
  };
  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockBookmarkPost.mockClear();
  mockBookmarkPost.mockResolvedValue({ success: true, bookmarkCount: 7 });
  mockUnbookmarkPost.mockClear();
  mockSharePost.mockClear();
  mockShareWithTrackingLink.mockClear();
  broadcastPostBookmarked.mockClear();
});

// ─── POST /posts/:postId/bookmark ─────────────────────────────────────────────

describe('POST /posts/:postId/bookmark — le favori suit l’audience de LECTURE', () => {
  it('refuse une story FRIENDS à un non-ami, et n’écrit ni favori ni compteur', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: `/posts/${FRIENDS_STORY_ID}/bookmark` });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    expect(mockBookmarkPost).not.toHaveBeenCalled();
    expect(broadcastPostBookmarked).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un post ONLY dont le lecteur est exclu', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: `/posts/${ONLY_ID}/bookmark` });

    expect(res.statusCode).toBe(404);
    expect(mockBookmarkPost).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend EXACTEMENT la même réponse sur un post inexistant que sur un post hors audience', async () => {
    const app = await buildApp(makePrisma());

    const missing = await app.inject({ method: 'POST', url: `/posts/${MISSING_ID}/bookmark` });
    const hidden = await app.inject({ method: 'POST', url: `/posts/${ONLY_ID}/bookmark` });

    expect(missing.statusCode).toBe(hidden.statusCode);
    expect(missing.json()).toEqual(hidden.json());
    expect(mockBookmarkPost).not.toHaveBeenCalled();
    await app.close();
  });

  it('n’affirme plus un effet qui n’a pas eu lieu : le `null` du service rend 404 et n’annonce rien', async () => {
    mockBookmarkPost.mockResolvedValueOnce(null);
    const app = await buildApp(makePrisma());

    const res = await app.inject({ method: 'POST', url: `/posts/${PUBLIC_ID}/bookmark` });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    expect(broadcastPostBookmarked).not.toHaveBeenCalled();
    await app.close();
  });

  it('ADMET un ami sur la story FRIENDS — la garde n’est pas un refus généralisé', async () => {
    const app = await buildApp(makePrisma({ isFriend: true }));

    const res = await app.inject({ method: 'POST', url: `/posts/${FRIENDS_STORY_ID}/bookmark` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ bookmarked: true, bookmarkCount: 7 });
    expect(mockBookmarkPost).toHaveBeenCalledWith(FRIENDS_STORY_ID, VIEWER_ID);
    await app.close();
  });

  it('ADMET un contact DM non-ami — l’audience est celle de la LECTURE, pas de l’interaction', async () => {
    const app = await buildApp(makePrisma({ isFriend: false, isDirectContact: true }));

    const res = await app.inject({ method: 'POST', url: `/posts/${FRIENDS_STORY_ID}/bookmark` });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('ADMET un lecteur seulement RÉFÉRENCÉ dans la story — ce que `GET /posts/:id` lui ouvre déjà', async () => {
    const app = await buildApp(makePrisma({ reference: { expiredViewAt: null } }));

    const res = await app.inject({ method: 'POST', url: `/posts/${FRIENDS_STORY_ID}/bookmark` });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /posts/:postId/bookmark — retirer ce qu’on a soi-même posé ne dépend d’aucune audience', () => {
  it('laisse retirer un favori sur une story devenue illisible — sinon il serait irrévocable', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({ method: 'DELETE', url: `/posts/${FRIENDS_STORY_ID}/bookmark` });

    expect(res.statusCode).toBe(200);
    expect(mockUnbookmarkPost).toHaveBeenCalledWith(FRIENDS_STORY_ID, VIEWER_ID);
    await app.close();
  });
});

// ─── POST /posts/:postId/impression ───────────────────────────────────────────

describe('POST /posts/:postId/impression — l’unitaire cesse d’être un oracle d’existence', () => {
  it('refuse une story FRIENDS à un non-ami sans écrire une seule ligne d’impression', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST', url: `/posts/${FRIENDS_STORY_ID}/impression`, payload: { source: 'story' },
    });

    expect(res.statusCode).toBe(404);
    expect(prisma.postImpression.create).not.toHaveBeenCalled();
    expect(prisma.post.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend la même réponse sur un id inconnu que sur un id hors audience — plus de 500 P2025 révélateur', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const missing = await app.inject({ method: 'POST', url: `/posts/${MISSING_ID}/impression`, payload: {} });
    const hidden = await app.inject({ method: 'POST', url: `/posts/${ONLY_ID}/impression`, payload: {} });

    expect(missing.statusCode).toBe(404);
    expect(missing.statusCode).toBe(hidden.statusCode);
    expect(missing.json()).toEqual(hidden.json());
    // #4150 — l'alias délègue au point d'ingestion, qui écrit ses occurrences
    // en LOT : c'est `createMany` qu'il faut interroger, `create` n'étant plus
    // appelé par aucun chemin (donc trivialement « jamais appelé »).
    expect(prisma.postImpression.createMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('compte normalement une impression sur un post lisible', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST', url: `/posts/${PUBLIC_ID}/impression`, payload: { source: 'detail' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
    expect(prisma.postImpression.createMany).toHaveBeenCalledWith({
      data: [{ postId: PUBLIC_ID, userId: VIEWER_ID, source: 'detail' }],
    });
    await app.close();
  });
});

// ─── POST /posts/impressions/batch ────────────────────────────────────────────

describe('POST /posts/impressions/batch — le LOT réduit ses ids par audience en une passe', () => {
  it('n’écrit que les ids admis et n’en compte pas un de plus', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [PUBLIC_ID, FRIENDS_STORY_ID, ONLY_ID, MISSING_ID], source: 'feed' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(1);
    expect(prisma.postImpression.createMany).toHaveBeenCalledWith({
      data: [{ postId: PUBLIC_ID, userId: VIEWER_ID, source: 'feed' }],
    });
    const touchedIds = prisma.post.updateMany.mock.calls
      .flatMap(([args]: any[]) => args.where?.id?.in ?? []);
    expect(touchedIds).toEqual([PUBLIC_ID]);
    await app.close();
  });

  it('un lot entièrement hors audience n’écrit RIEN — `updateMany` ne lève jamais, c’est là que ça passerait inaperçu', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [FRIENDS_STORY_ID, ONLY_ID, MISSING_ID] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(0);
    expect(prisma.postImpression.createMany).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('un id inconnu et un id hors audience rendent la MÊME réponse', async () => {
    const app = await buildApp(makePrisma());

    const unknown = await app.inject({
      method: 'POST', url: '/posts/impressions/batch', payload: { postIds: [MISSING_ID] },
    });
    const hidden = await app.inject({
      method: 'POST', url: '/posts/impressions/batch', payload: { postIds: [ONLY_ID] },
    });

    expect(unknown.statusCode).toBe(hidden.statusCode);
    expect(unknown.json()).toEqual(hidden.json());
    await app.close();
  });

  it('résout l’audience des cinquante ids en UNE passe, sur les ids DISTINCTS', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [PUBLIC_ID, PUBLIC_ID, FRIENDS_STORY_ID] },
    });

    const aclCalls = prisma.post.findMany.mock.calls
      .filter(([args]: any[]) => args.where?.repostOfId === undefined);
    expect(aclCalls).toHaveLength(1);
    expect(aclCalls[0][0].where.id.in).toEqual([PUBLIC_ID, FRIENDS_STORY_ID]);
    await app.close();
  });

  it('conserve une impression par APPARITION pour les ids admis', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [PUBLIC_ID, PUBLIC_ID, ONLY_ID] },
    });

    expect(res.json().data.recorded).toBe(2);
    const increments = prisma.post.updateMany.mock.calls
      .map(([args]: any[]) => args.data.impressionCount.increment);
    expect(increments).toEqual([2]);
    await app.close();
  });

  it('enregistre TOUS les ids admis au-delà de 50 — le plafond du schéma (100) est le seul, plus de troncature silencieuse', async () => {
    const bulkIds = Array.from({ length: 60 }, (_, i) => `507f1f77bcf86cd79944${i.toString(16).padStart(4, '0')}`);
    const universe = Object.fromEntries(bulkIds.map((id) => [id, acl(id, 'PUBLIC')]));
    const prisma = makePrisma({ universe });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: bulkIds, source: 'feed' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(60);
    expect(prisma.postImpression.createMany).toHaveBeenCalledWith({
      data: bulkIds.map((postId) => ({ postId, userId: VIEWER_ID, source: 'feed' })),
    });
    await app.close();
  });
});

// ─── POST /posts/:postId/share ────────────────────────────────────────────────

describe('POST /posts/:postId/share — aucun lien tracé vers un post illisible', () => {
  it('refuse une story FRIENDS à un non-ami sans frapper le moindre TrackingLink', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'POST', url: `/posts/${FRIENDS_STORY_ID}/share`, payload: { generateLink: true },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    expect(mockShareWithTrackingLink).not.toHaveBeenCalled();
    expect(mockSharePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse aussi le partage NU d’un post ONLY — le compteur de l’auteur ne bouge pas', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({ method: 'POST', url: `/posts/${ONLY_ID}/share`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(mockSharePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend la même réponse sur un post inexistant que sur un post hors audience', async () => {
    const app = await buildApp(makePrisma());

    const missing = await app.inject({ method: 'POST', url: `/posts/${MISSING_ID}/share`, payload: {} });
    const hidden = await app.inject({ method: 'POST', url: `/posts/${ONLY_ID}/share`, payload: {} });

    expect(missing.statusCode).toBe(hidden.statusCode);
    expect(missing.json()).toEqual(hidden.json());
    await app.close();
  });

  it('frappe le lien pour un lecteur légitime — le contrat de réponse est inchangé', async () => {
    const app = await buildApp(makePrisma({ isFriend: true }));

    const res = await app.inject({
      method: 'POST', url: `/posts/${FRIENDS_STORY_ID}/share`,
      payload: { platform: 'system', generateLink: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      shared: true, shareCount: 4, token: 'tok123', shortUrl: 'https://app.example.com/l/tok123',
    });
    expect(mockShareWithTrackingLink).toHaveBeenCalledWith(
      FRIENDS_STORY_ID, VIEWER_ID, { baseUrl: 'https://app.example.com', platform: 'system' },
    );
    await app.close();
  });

  it('borne `platform` : une étiquette de 200 caractères est refusée AVANT toute écriture', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'POST', url: `/posts/${PUBLIC_ID}/share`,
      payload: { platform: 'x'.repeat(200) },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    expect(mockSharePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('borne `generateLink` : une valeur non booléenne ne se coerce plus en silence', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'POST', url: `/posts/${PUBLIC_ID}/share`,
      payload: { generateLink: 'yes' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockShareWithTrackingLink).not.toHaveBeenCalled();
    await app.close();
  });
});
