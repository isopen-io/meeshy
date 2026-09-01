/**
 * @jest-environment node
 *
 * Unit tests for PostService and PostCommentService.
 *
 * All Prisma calls are mocked — these tests verify service logic
 * (authorization guards, reaction accounting, counter updates)
 * without touching the database.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { PostCommentService } from '../../services/PostCommentService';
import { MediaService } from '../../services/MediaService';
import type { PostReactionService } from '../../services/PostReactionService';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';

// PostAudioService uses a singleton that requires initialization — mock it entirely
// so PostService tests don't depend on ZMQ / SocialEventsHandler setup.
jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: {
      processPostAudio: jest.fn().mockReturnValue(Promise.resolve()),
    },
    init: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockPrisma() {
  const prisma: any = {
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    postComment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    commentReaction: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
      // `unlikeComment` lit la pile TRIÉE avant de retirer (2026-08-25) :
      // l'emoji demandé la restreint, son absence la laisse entière, et la tête
      // est la cible — c'est ce qui rend « retirer la DERNIÈRE posée » possible.
      // Défaut vide : sans cible, le retrait est un no-op idempotent.
      findMany: jest.fn().mockResolvedValue([]),
      // Plafond des cinq réactions (2026-08-20) : `PostCommentService.likeComment`
      // consulte `findFirst` (l'émoji est-il déjà posé ?) puis, si non, `count`
      // (place encore disponible ?) AVANT toute purge/upsert. Défauts « personne
      // n'a encore réagi » : ces tests veulent une création normale.
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    postBookmark: {
      upsert: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    postView: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    postImpression: {
      deleteMany: jest.fn(),
    },
    postMedia: {
      // `{ count }` par défaut : le code compare le nombre de médias
      // effectivement rattachés à celui demandé pour ne jamais écarter un
      // média en silence. Un mock qui rend `undefined` casserait sur `.count`.
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      findFirst: jest.fn(),
      // `[]` par défaut : la règle de composition REEL (`qualifiesAsReel`)
      // matérialise les mimeTypes des médias à classifier via findMany.
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    participant: {
      findMany: jest.fn(),
    },
    postReaction: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    friendRequest: {
      findMany: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return prisma;
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'user-author',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello world',
    reactions: [],
    reactionSummary: {},
    reactionCount: 0,
    likeCount: 0,
    commentCount: 5,
    shareCount: 0,
    repostCount: 0,
    isPinned: false,
    deletedAt: null,
    ...overrides,
  };
}

function createMockPostReactionService() {
  return {
    addReaction: jest.fn<PostReactionService['addReaction']>().mockResolvedValue({ id: 'rxn-1', postId: 'post-1', userId: 'user-liker', emoji: '❤️', createdAt: new Date(), updatedAt: new Date() }),
    removeReaction: jest.fn<PostReactionService['removeReaction']>().mockResolvedValue(true),
  } as unknown as PostReactionService;
}

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-1',
    postId: 'post-1',
    authorId: 'user-commenter',
    content: 'Nice post!',
    parentId: null,
    likeCount: 3,
    replyCount: 0,
    reactionSummary: {},
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PostService
// ---------------------------------------------------------------------------

describe('PostService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let mediaService: MediaService;
  let mockReactionService: PostReactionService;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    mediaService = new MediaService();
    mockReactionService = createMockPostReactionService();
    service = new PostService(prisma, mediaService, undefined, mockReactionService);
  });

  // -----------------------------------------------------------------------
  // createPost
  // -----------------------------------------------------------------------

  describe('createPost', () => {
    const basePostData = {
      type: PostType.POST,
      visibility: PostVisibility.PUBLIC,
    };

    it('creates a post and links mediaIds without mobileTranscription', async () => {
      const post = makePost();
      prisma.post.create.mockResolvedValue(post);
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost({ ...basePostData, mediaIds: ['media-1', 'media-2'] }, 'user-1');

      // Garde de rattachement : le média doit être LIBRE (ni post ni
      // commentaire) ET appartenir à l'auteur — un tiers ne peut plus
      // s'approprier un média en attente en devinant son id.
      const claim = prisma.postMedia.updateMany.mock.calls[0][0];
      expect(claim.where.id).toEqual({ in: ['media-1', 'media-2'] });
      // « Libre » sous les DEUX formes MongoDB — présent à null OU champ
      // absent : Prisma-Mongo ne matche pas l'absence avec `null`, et le
      // handler TUS ne pose pas `commentId` (incident prod 2026-07-31→08-01).
      expect(claim.where.AND).toEqual([
        { OR: [{ postId: null }, { postId: { isSet: false } }] },
        { OR: [{ commentId: null }, { commentId: { isSet: false } }] },
      ]);
      expect(claim.where.uploaderId).toBe('user-1');
      expect(claim.data).toEqual({ postId: 'post-1' });
      // findFirst is called to detect audio media for Whisper processing
      expect(prisma.postMedia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['media-1', 'media-2'] }, mimeType: { startsWith: 'audio/' } },
        }),
      );
      // No audio media found — update is not called
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
    });

    it('grave le RANG de chaque média = sa position dans mediaIds', async () => {
      // `PostMedia.order` est `@default(0)` et le handler TUS ne l'écrit pas :
      // sans ce site, les N médias d'un post arrivent tous à 0, et la lecture
      // (`orderBy: { order: 'asc' }`) rend l'ordre d'ACHÈVEMENT des uploads
      // parallèles, pas celui de la sélection. L'aperçu optimiste du composer
      // est juste, puis le refetch le mélange.
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost({ ...basePostData, mediaIds: ['media-1', 'media-2'] }, 'user-1');

      const orderWrites = prisma.postMedia.updateMany.mock.calls
        .map((call: any[]) => call[0])
        .filter((args: any) => args.data?.order !== undefined);
      expect(orderWrites).toEqual([
        { where: { id: 'media-1', postId: 'post-1' }, data: { order: 0 } },
        { where: { id: 'media-2', postId: 'post-1' }, data: { order: 1 } },
      ]);
    });

    it('does not query postMedia when no mediaIds are provided', async () => {
      prisma.post.create.mockResolvedValue(makePost());

      await service.createPost(basePostData, 'user-1');

      expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
      expect(prisma.postMedia.findFirst).not.toHaveBeenCalled();
    });

    it('saves mobileTranscription in the first audio PostMedia when provided', async () => {
      const post = makePost();
      prisma.post.create.mockResolvedValue(post);
      prisma.postMedia.findFirst.mockResolvedValue({ id: 'media-audio', fileUrl: '/uploads/audio.m4a' });
      prisma.postMedia.update.mockResolvedValue({});

      const mobileTranscription = {
        text: 'Hello world',
        language: 'en',
        confidence: 0.95,
        duration_ms: 3000,
        segments: [],
      };

      await service.createPost(
        { ...basePostData, mediaIds: ['media-audio', 'media-img'], mobileTranscription },
        'user-1',
      );

      expect(prisma.postMedia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['media-audio', 'media-img'] }, mimeType: { startsWith: 'audio/' } },
          select: { id: true, fileUrl: true },
        }),
      );

      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'media-audio' },
        data: {
          transcription: {
            text: 'Hello world',
            language: 'en',
            confidence: 0.95,
            duration_ms: 3000,
            segments: [],
            source: 'mobile',
          },
        },
      });
    });

    it('does not update postMedia transcription when no audio PostMedia is found', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      const mobileTranscription = { text: 'Hello', language: 'en', segments: [] };

      await service.createPost(
        { ...basePostData, mediaIds: ['media-img'], mobileTranscription },
        'user-1',
      );

      expect(prisma.postMedia.findFirst).toHaveBeenCalled();
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
    });

    it('always looks for audio PostMedia when mediaIds present to enable Whisper processing', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        { ...basePostData, mediaIds: ['media-img'] },
        'user-1',
      );

      // findFirst is always called to detect audio media (for Whisper fire-and-forget)
      expect(prisma.postMedia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['media-img'] }, mimeType: { startsWith: 'audio/' } },
        }),
      );
      // No audio media → no transcription update
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
    });

    it('writes alt text only for media ids present in mediaIds', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        {
          ...basePostData,
          mediaIds: ['media-1', 'media-2'],
          mediaAlt: { 'media-1': 'A cat on a windowsill', 'media-foreign': 'not requested' },
        },
        'user-1',
      );

      expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
        where: { id: 'media-1', postId: 'post-1' },
        data: { alt: 'A cat on a windowsill' },
      });
      // `media-foreign` never appeared in `mediaIds` — never touched.
      expect(prisma.postMedia.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'media-foreign' }) }),
      );
    });

    it('clears alt (null) when the client sends an empty string', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        { ...basePostData, mediaIds: ['media-1'], mediaAlt: { 'media-1': '   ' } },
        'user-1',
      );

      expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
        where: { id: 'media-1', postId: 'post-1' },
        data: { alt: null },
      });
    });

    // ── #4055 — la LÉGENDE par média, jumelle exacte de `alt` ──────────────
    //
    // `PostMedia.caption` existait, était SERVIE (`postIncludes.ts`) et n'était
    // écrite par PERSONNE : ni les routes, ni iOS, ni le web. Ces témoins
    // gardent les deux moitiés du contrat — ce qui s'écrit, et ce qui ne
    // s'écrit PAS.

    it('writes the caption only for media ids present in mediaIds', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        {
          ...basePostData,
          mediaIds: ['media-1', 'media-2'],
          mediaCaption: { 'media-1': 'Coucher de soleil à Dakar', 'media-foreign': 'jamais demandé' },
        },
        'user-1',
      );

      expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
        where: { id: 'media-1', postId: 'post-1' },
        data: { caption: 'Coucher de soleil à Dakar' },
      });
      // Un id absent de `mediaIds` n'est pas une permission d'écrire ailleurs.
      const foreign = prisma.postMedia.updateMany.mock.calls
        .map((call: any[]) => call[0])
        .filter((args: any) => args.where?.id === 'media-foreign');
      expect(foreign).toEqual([]);
    });

    it('clears the caption (null) when the client sends blank', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        { ...basePostData, mediaIds: ['media-1'], mediaCaption: { 'media-1': '   ' } },
        'user-1',
      );

      expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
        where: { id: 'media-1', postId: 'post-1' },
        data: { caption: null },
      });
    });

    // ── L'ASSAINISSEMENT — la garde qui existait et n'était appelée par rien ──
    //
    // `content` est assaini à TROIS sites de la route (`core.ts`, lignes 362,
    // 507, 768) ; `mediaAlt` et `mediaCaption` ne l'étaient à AUCUN. Le texte
    // partait brut de `parsed.data` jusqu'à `postMedia.updateMany`.
    //
    // Le plus troublant n'est pas l'absence de la garde mais sa PRÉSENCE :
    // `sanitizeMediaCaptions` vivait dans `core.ts`, son doc-comment citait
    // #4055, et aucune ligne du dépôt ne l'appelait. Une garde écrite puis
    // jamais câblée ne se signale nulle part — elle compile, elle se relit
    // bien, et elle donne à qui la croise l'impression que le champ est gardé.
    //
    // Les deux colonnes partagent leur écriture (`applyMediaText`), donc elles
    // partagent leur assainissement : c'est le point de passage obligé avant la
    // base, et le seul qu'un futur appelant de `createPost` ne puisse pas
    // contourner.

    it('sanitizes the caption before it reaches the database', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        {
          ...basePostData,
          mediaIds: ['media-1'],
          mediaCaption: { 'media-1': 'Coucher de soleil <script>alert(1)</script>' },
        },
        'user-1',
      );

      const written = prisma.postMedia.updateMany.mock.calls
        .map((call: any[]) => call[0])
        .find((args: any) => args.data?.caption !== undefined);
      expect(written?.data.caption).not.toContain('<script>');
      expect(written?.data.caption).toContain('Coucher de soleil');
    });

    it('sanitizes the alt text too — the two columns share one write', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        {
          ...basePostData,
          mediaIds: ['media-1'],
          mediaAlt: { 'media-1': '<img src=x onerror=alert(1)>un chat' },
        },
        'user-1',
      );

      const written = prisma.postMedia.updateMany.mock.calls
        .map((call: any[]) => call[0])
        .find((args: any) => args.data?.alt !== undefined);
      expect(written?.data.alt).not.toContain('onerror');
      expect(written?.data.alt).toContain('un chat');
    });

    // Un texte qui n'est QUE du balisage devient vide, donc `null` — la même
    // phrase que la chaîne blanche : « il n'y a pas de légende ». Sans ce
    // témoin, l'assainissement pourrait écrire `''`, une valeur que la lecture
    // rend comme une légende présente et vide.
    it('clears the column when sanitizing leaves nothing', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        { ...basePostData, mediaIds: ['media-1'], mediaCaption: { 'media-1': '<script>x</script>' } },
        'user-1',
      );

      const written = prisma.postMedia.updateMany.mock.calls
        .map((call: any[]) => call[0])
        .find((args: any) => args.data?.caption !== undefined);
      expect(written?.data.caption).toBeNull();
    });

    it('never touches postMedia for caption when mediaCaption is omitted', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost({ ...basePostData, mediaIds: ['media-1'] }, 'user-1');

      const captionWrites = prisma.postMedia.updateMany.mock.calls
        .map((call: any[]) => call[0])
        .filter((args: any) => args.data && 'caption' in args.data);
      expect(captionWrites).toEqual([]);
    });

    // **La légende et l'alt sont deux SUJETS, pas deux noms du même texte.**
    // L'une décrit une image à qui ne la voit pas ; l'autre dit ce que l'auteur
    // publie sous elle. Un applicateur partagé rend l'écriture croisée facile —
    // ce témoin l'interdit.
    it('writes alt and caption to their OWN column, never across', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost(
        {
          ...basePostData,
          mediaIds: ['media-1'],
          mediaAlt: { 'media-1': 'texte alternatif' },
          mediaCaption: { 'media-1': 'légende' },
        },
        'user-1',
      );

      const writes = prisma.postMedia.updateMany.mock.calls
        .map((call: any[]) => call[0])
        .filter((args: any) => args.data && ('alt' in args.data || 'caption' in args.data));
      expect(writes).toEqual(
        expect.arrayContaining([
          { where: { id: 'media-1', postId: 'post-1' }, data: { alt: 'texte alternatif' } },
          { where: { id: 'media-1', postId: 'post-1' }, data: { caption: 'légende' } },
        ]),
      );
      expect(writes).toHaveLength(2);
    });

    it('never touches postMedia for alt when mediaAlt is omitted', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      prisma.postMedia.findFirst.mockResolvedValue(null);

      await service.createPost({ ...basePostData, mediaIds: ['media-1'] }, 'user-1');

      // Le COMPTE d'appels ne dit plus « alt » depuis que la réclamation est
      // suivie du RANG (`applyMediaOrder`) : c'est l'absence d'écriture
      // PORTANT `alt` qui exprime l'intention de ce témoin.
      const altWrites = prisma.postMedia.updateMany.mock.calls
        .map((call: any[]) => call[0])
        .filter((args: any) => args.data && 'alt' in args.data);
      expect(altWrites).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // createPost — geo discoverability (INDÉPENDANTE de metadata.location)
  // -----------------------------------------------------------------------

  describe('createPost — geo discoverability', () => {
    const basePostData = { type: PostType.POST, visibility: PostVisibility.PUBLIC };
    const place = { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: null, category: null };

    it('persists geoPoint/geoPrecision when discoverabilityPrecision is provided with a valid location', async () => {
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-1', ...args.data }));

      await service.createPost({
        ...basePostData,
        location: place,
        discoverabilityPrecision: 'CITY',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      // CITY arrondit à 0.1° (~10km) — cf. geoDiscoverability.ts.
      expect(createCall.data.geoPoint).toEqual({ type: 'Point', coordinates: [2.3, 48.9] });
      expect(createCall.data.geoPrecision).toBe('CITY');
    });

    it('quantizes EXACT precision to the unrounded coordinate', async () => {
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-2', ...args.data }));

      await service.createPost({
        ...basePostData,
        location: place,
        discoverabilityPrecision: 'EXACT',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.geoPoint).toEqual({ type: 'Point', coordinates: [2.2945, 48.8584] });
      expect(createCall.data.geoPrecision).toBe('EXACT');
    });

    it('leaves geoPoint/geoPrecision null when discoverabilityPrecision is absent, even with a valid location', async () => {
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-3', ...args.data }));

      await service.createPost({ ...basePostData, location: place }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.geoPoint).toBeUndefined();
      expect(createCall.data.geoPrecision).toBeUndefined();
    });

    it('leaves geoPoint/geoPrecision null when discoverabilityPrecision is provided but location is absent', async () => {
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-4', ...args.data }));

      await service.createPost({ ...basePostData, discoverabilityPrecision: 'CITY' }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.geoPoint).toBeUndefined();
      expect(createCall.data.geoPrecision).toBeUndefined();
    });

    it('ignores a client-supplied geoPoint/geoPrecision passthrough — the server always recomputes its own', async () => {
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-5', ...args.data }));

      await service.createPost({
        ...basePostData,
        // Un attaquant qui contournerait le schéma Zod de la route et
        // fournirait ces champs directement au service ne doit jamais les
        // voir atterrir tels quels dans l'écriture Prisma — même garde que
        // `metadata` (cf. sharedPlace.ts).
        geoPoint: { type: 'Point', coordinates: [999, 999] },
        geoPrecision: 'EXACT',
      } as any, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.geoPoint).toBeUndefined();
      expect(createCall.data.geoPrecision).toBeUndefined();
    });

    it('does not persist geoPoint/geoPrecision when the location coordinates are invalid, even with a valid precision', async () => {
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-6', ...args.data }));

      await service.createPost({
        ...basePostData,
        location: { latitude: 999, longitude: 2.2945, name: null, address: null, category: null },
        discoverabilityPrecision: 'CITY',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.geoPoint).toBeUndefined();
      expect(createCall.data.geoPrecision).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // createPost with repostOfId
  // -----------------------------------------------------------------------

  describe('createPost with repostOfId', () => {
    it('calculates originalRepostOfId from repostOfId', async () => {
      const original = makePost({ id: 'orig-1', repostOfId: null, originalRepostOfId: null });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'new-1', ...args.data }));

      await service.createPost({
        type: PostType.STORY,
        visibility: PostVisibility.PUBLIC,
        content: 'hi',
        repostOfId: 'orig-1',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.repostOfId).toBe('orig-1');
      expect(createCall.data.originalRepostOfId).toBe('orig-1');
    });

    it('flattens originalRepostOfId when chained', async () => {
      const intermediate = makePost({ id: 'inter-1', repostOfId: 'root-1', originalRepostOfId: 'root-1' });
      prisma.post.findFirst.mockResolvedValue(intermediate);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'new-2', ...args.data }));

      await service.createPost({
        type: PostType.STORY,
        visibility: PostVisibility.PUBLIC,
        repostOfId: 'inter-1',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.originalRepostOfId).toBe('root-1');
    });

    it('does not set repost fields when repostOfId is omitted', async () => {
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'new-3', ...args.data }));

      await service.createPost({
        type: PostType.POST,
        visibility: PostVisibility.PUBLIC,
        content: 'normal post',
      }, 'user-1');

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.repostOfId).toBeUndefined();
      expect(createCall.data.originalRepostOfId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // likePost
  // -----------------------------------------------------------------------

  describe('likePost', () => {
    it('returns null when addReaction throws "not found"', async () => {
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockRejectedValue(new Error('Post not found'));

      const result = await service.likePost('000000000000000000000001', 'user-1');
      expect(result).toBeNull();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('delegates to addReaction and syncs Json mirror with 1 entry', async () => {
      const createdAt = new Date('2025-01-01T00:00:00Z');
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockResolvedValue({ id: 'rxn-1', postId: 'post-1', userId: 'user-liker', emoji: '🔥', createdAt, updatedAt: createdAt });

      const post = makePost({ likeCount: 1, reactionCount: 1 });
      // findFirst: first call returns post for Json rebuild, second call returns enriched post
      prisma.post.findFirst
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce(post);
      prisma.postReaction.findMany.mockResolvedValue([
        { userId: 'user-liker', emoji: '🔥', createdAt },
      ]);
      prisma.post.update.mockResolvedValue(post);

      const result = await service.likePost('post-1', 'user-liker', '🔥');

      expect(mockReactionService.addReaction).toHaveBeenCalledWith({
        postId: 'post-1',
        userId: 'user-liker',
        emoji: '🔥',
      });
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: expect.objectContaining({
            reactions: [{ userId: 'user-liker', emoji: '🔥', createdAt: createdAt.toISOString() }],
            likeCount: 1,
          }),
        }),
      );
      expect(result).toEqual(post);
    });

    it('is idempotent — addReaction returns existing reaction, Json shows 1 entry (no duplication)', async () => {
      const createdAt = new Date('2025-01-01T00:00:00Z');
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockResolvedValue({ id: 'rxn-1', postId: 'post-1', userId: 'user-liker', emoji: '❤️', createdAt, updatedAt: createdAt });

      const post = makePost({ likeCount: 1, reactions: [{ userId: 'user-liker', emoji: '❤️', createdAt: createdAt.toISOString() }] });
      prisma.post.findFirst
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce(post);
      prisma.postReaction.findMany.mockResolvedValue([
        { userId: 'user-liker', emoji: '❤️', createdAt },
      ]);
      prisma.post.update.mockResolvedValue(post);

      const result = await service.likePost('post-1', 'user-liker');

      expect(mockReactionService.addReaction).toHaveBeenCalledTimes(1);
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reactions: [{ userId: 'user-liker', emoji: '❤️', createdAt: createdAt.toISOString() }],
            likeCount: 1,
          }),
        }),
      );
      expect(result).toEqual(post);
    });

    it('returns null and skips Json update when post is deleted (addReaction throws "deleted")', async () => {
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockRejectedValue(new Error('Post has been deleted'));

      const result = await service.likePost('000000000000000000000001', 'user-1');
      expect(result).toBeNull();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('propagates unexpected errors from addReaction', async () => {
      (mockReactionService.addReaction as ReturnType<typeof jest.fn>)
        .mockRejectedValue(new Error('DB connection lost'));

      await expect(service.likePost('post-1', 'user-1')).rejects.toThrow('DB connection lost');
    });
  });

  // -----------------------------------------------------------------------
  // unlikePost
  // -----------------------------------------------------------------------

  describe('unlikePost', () => {
    it('returns null when the post does not exist (findFirst before removeReaction)', async () => {
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.unlikePost('000000000000000000000001', 'user-1');
      expect(result).toBeNull();
    });

    it('removes the reaction and syncs Json mirror with 0 entries', async () => {
      (mockReactionService.removeReaction as ReturnType<typeof jest.fn>).mockResolvedValue(true);

      const post = makePost({ likeCount: 0 });
      prisma.post.findFirst
        .mockResolvedValueOnce(post)
        .mockResolvedValueOnce(post);
      prisma.postReaction.findMany
        // First call: fetch user's existing reaction to find emoji
        .mockResolvedValueOnce([{ userId: 'user-liker', emoji: '❤️', createdAt: new Date() }])
        // Second call: after removeReaction, rebuild Json mirror (0 rows)
        .mockResolvedValueOnce([]);
      prisma.post.update.mockResolvedValue(post);

      const result = await service.unlikePost('post-1', 'user-liker');

      expect(mockReactionService.removeReaction).toHaveBeenCalledWith({
        postId: 'post-1',
        userId: 'user-liker',
        emoji: '❤️',
      });
      expect(result?.removedEmoji).toBe('❤️');
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: expect.objectContaining({
            reactions: [],
            likeCount: 0,
          }),
        }),
      );
      expect(result?.post).toEqual(post);
    });

    it('is idempotent — no reaction exists, returns post unchanged without calling removeReaction', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.unlikePost('post-1', 'user-1');

      expect(mockReactionService.removeReaction).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(result?.post).toEqual(post);
      expect(result?.removedEmoji).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // sharePost
  // -----------------------------------------------------------------------

  describe('sharePost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.sharePost('missing', 'user-1');
      expect(result).toBeNull();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('increments shareCount for an existing post', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      const updatedPost = makePost({ shareCount: 1 });
      prisma.post.update.mockResolvedValue(updatedPost);

      const result = await service.sharePost('post-1', 'user-1', 'twitter');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { shareCount: { increment: 1 } },
        }),
      );
      expect(result).toEqual(updatedPost);
    });
  });

  // -----------------------------------------------------------------------
  // pinPost
  // -----------------------------------------------------------------------

  describe('pinPost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.pinPost('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }));

      await expect(service.pinPost('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('sets isPinned to true for the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));
      const pinnedPost = makePost({ isPinned: true });
      prisma.post.update.mockResolvedValue(pinnedPost);

      const result = await service.pinPost('post-1', 'user-1');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { isPinned: true },
        }),
      );
      expect(result).toEqual(pinnedPost);
    });
  });

  // -----------------------------------------------------------------------
  // unpinPost
  // -----------------------------------------------------------------------

  describe('unpinPost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.unpinPost('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }));

      await expect(service.unpinPost('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('sets isPinned to false for the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', isPinned: true }));
      const unpinnedPost = makePost({ isPinned: false });
      prisma.post.update.mockResolvedValue(unpinnedPost);

      const result = await service.unpinPost('post-1', 'user-1');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { isPinned: false },
        }),
      );
      expect(result).toEqual(unpinnedPost);
    });
  });

  // -----------------------------------------------------------------------
  // getPostViews
  // -----------------------------------------------------------------------

  describe('getPostViews', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.getPostViews('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }));

      await expect(service.getPostViews('post-1', 'user-1')).rejects.toThrow('FORBIDDEN');
    });

    it('returns paginated views with hasMore=true when more items exist', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));

      const viewItems = [
        { id: 'v1', userId: 'u1', postId: 'post-1', viewedAt: new Date() },
        { id: 'v2', userId: 'u2', postId: 'post-1', viewedAt: new Date() },
      ];
      prisma.postView.findMany.mockResolvedValue(viewItems);
      prisma.postView.count.mockResolvedValue(10);

      const result = await service.getPostViews('post-1', 'user-1', 2, 0);

      expect(result).toEqual({
        items: viewItems,
        total: 10,
        hasMore: true,
      });
    });

    it('returns hasMore=false when all items are fetched', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));
      prisma.postView.findMany.mockResolvedValue([
        { id: 'v1', userId: 'u1', postId: 'post-1', viewedAt: new Date() },
      ]);
      prisma.postView.count.mockResolvedValue(1);

      const result = await service.getPostViews('post-1', 'user-1', 50, 0);

      expect(result).toEqual({
        items: expect.any(Array),
        total: 1,
        hasMore: false,
      });
    });

    it('uses default limit and offset values', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));
      prisma.postView.findMany.mockResolvedValue([]);
      prisma.postView.count.mockResolvedValue(0);

      await service.getPostViews('post-1', 'user-1');

      expect(prisma.postView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // repostPost
  // -----------------------------------------------------------------------

  describe('repostPost', () => {
    it('returns null when the original post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.repostPost('missing', 'user-1');
      expect(result).toBeNull();
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('creates a repost linked to the original and increments repostCount', async () => {
      const original = makePost({ id: 'original-1', visibility: 'PUBLIC' });
      prisma.post.findFirst.mockResolvedValue(original);

      const repost = makePost({ id: 'repost-1', repostOfId: 'original-1', authorId: 'user-reposter' });
      prisma.post.create.mockResolvedValue(repost);
      prisma.post.update.mockResolvedValue(original);

      const result = await service.repostPost('original-1', 'user-reposter');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorId: 'user-reposter',
            type: 'POST',
            visibility: 'PUBLIC',
            repostOfId: 'original-1',
            isQuote: false,
          }),
        }),
      );

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'original-1' },
          data: { repostCount: { increment: 1 } },
        }),
      );
      expect(result).toEqual(repost);
    });

    // ─── Audience choisie au repost ─────────────────────────────────────────
    //
    // Le composer de repost affiche un sélecteur d'audience (Public / Amis /
    // Privé) — mais `visibility` n'atteignait AUCUNE couche : ni le handler du
    // composer, ni le SDK, ni cette méthode, qui recopiait `original.visibility`.
    // Comme un repost n'est autorisé que sur un original PUBLIC, TOUT repost
    // sortait en PUBLIC. L'utilisateur qui choisissait « Privé » publiait en
    // grand public sans le savoir.

    it('honours the visibility chosen by the reposter', async () => {
      const original = makePost({ id: 'original-1', visibility: 'PUBLIC' });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'repost-1' }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('original-1', 'user-reposter', { visibility: 'PRIVATE' as never });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ visibility: 'PRIVATE' }),
        }),
      );
    });

    it('falls back to the original visibility when the reposter picks nothing', async () => {
      const original = makePost({ id: 'original-1', visibility: 'PUBLIC' });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'repost-1' }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('original-1', 'user-reposter');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ visibility: 'PUBLIC' }),
        }),
      );
    });

    it('creates a quote repost with content', async () => {
      const original = makePost({ id: 'original-1', visibility: 'PUBLIC' });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost());
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('original-1', 'user-reposter', { content: 'Great post!', isQuote: true });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'Great post!',
            isQuote: true,
            visibility: 'PUBLIC',
          }),
        }),
      );
    });

    it('sets originalRepostOfId to original.id when original is a root post', async () => {
      const original = makePost({ id: 'original-1', repostOfId: null, originalRepostOfId: null });
      prisma.post.findFirst.mockResolvedValue(original);
      const repost = makePost({ id: 'repost-1', repostOfId: 'original-1', originalRepostOfId: 'original-1' });
      prisma.post.create.mockResolvedValue(repost);
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('original-1', 'user-reposter');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            repostOfId: 'original-1',
            originalRepostOfId: 'original-1',
          }),
        })
      );
    });

    it('flattens originalRepostOfId when original is itself a repost', async () => {
      const original = makePost({
        id: 'intermediate-1',
        repostOfId: 'root-1',
        originalRepostOfId: 'root-1',
      });
      prisma.post.findFirst.mockResolvedValue(original);
      const repost = makePost({ id: 'repost-2', repostOfId: 'intermediate-1' });
      prisma.post.create.mockResolvedValue(repost);
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('intermediate-1', 'user-reposter');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            repostOfId: 'intermediate-1',
            originalRepostOfId: 'root-1',
          }),
        })
      );
    });

    it('accepts targetType option to override default repost type', async () => {
      const original = makePost({ id: 'story-1', type: PostType.STORY });
      prisma.post.findFirst.mockResolvedValue(original);
      const repost = makePost({ id: 'repost-3', repostOfId: 'story-1', type: PostType.STORY });
      prisma.post.create.mockResolvedValue(repost);
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('story-1', 'user-reposter', { targetType: PostType.STORY });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: PostType.STORY,
          }),
        })
      );
    });

    // ─── Reposter crée un POST, quel que soit le type de l'original ─────────
    //
    // Le défaut était `opts.targetType ?? original.type` : un repost HÉRITAIT
    // du type de sa source. Presque tous les sites d'appel iOS n'envoient rien
    // (seul le viewer de story passe `.post`), si bien que republier une story
    // depuis le fil, le profil ou le détail fabriquait une STORY — qui allait
    // dans le tray du reposteur et jamais dans son fil, alors que le geste
    // demandé était « partager dans mon fil ». Pire, le broadcast
    // `post:reposted` n'est pas typé : le fil l'insérait en direct, d'où le
    // même contenu vu dans le fil ET dans les stories.
    //
    // La règle produit (2026-08-19) : reposter crée toujours un POST, qui
    // PORTE l'original dans `repostOf`. Republier SA PROPRE story garde son
    // chemin dédié (`POST /posts/:postId/republish` → `republishStory`), non
    // touché ici.

    it('creates a POST when reposting a story without an explicit targetType', async () => {
      const original = makePost({ id: 'story-inherit', type: PostType.STORY });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'repost-inherit', repostOfId: 'story-inherit' }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('story-inherit', 'user-reposter');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: PostType.POST }),
        })
      );
    });

    // Corollaire de la règle : un POST n'est pas éphémère, donc le repost ne
    // reçoit AUCUNE échéance. Sans cette garde, un repost hérité restait
    // balayable/masquable au bout de 20 h alors qu'il vit dans un fil.
    it('gives the repost of a story no expiry, since it is a POST', async () => {
      const original = makePost({ id: 'story-expiry', type: PostType.STATUS });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'repost-expiry', repostOfId: 'story-expiry' }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('story-expiry', 'user-reposter');

      const created = prisma.post.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(created.data.type).toBe(PostType.POST);
      expect(created.data.expiresAt).toBeUndefined();
    });

    it('rolls back media snapshot if a duplication fails partway', async () => {
      const original = makePost({
        id: 'story-1',
        type: PostType.STORY,
        media: [
          { id: 'm1', fileUrl: '/api/v1/attachments/file/m1.jpg', mimeType: 'image/jpeg', filePath: '2026/05/user/m1.jpg', fileName: 'm1.jpg', originalName: 'm1.jpg', fileSize: 1000 },
          { id: 'm2', fileUrl: '/api/v1/attachments/file/m2.mp4', mimeType: 'video/mp4', filePath: '2026/05/user/m2.mp4', fileName: 'm2.mp4', originalName: 'm2.mp4', fileSize: 5000 },
        ],
      });
      prisma.post.findFirst.mockResolvedValue(original);

      // First media duplication succeeds, second fails
      const duplicateMediaSpy = jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-m1.jpg', filePath: 'snapshots/new-m1.jpg', fileName: 'new-m1.jpg', fileSize: 1000, mimeType: 'image/jpeg' })
        .mockRejectedValueOnce(new Error('Upload failed'));
      const deleteMediaSpy = jest.spyOn(mediaService, 'deleteMedia').mockResolvedValue(undefined);

      await expect(
        service.repostPost('story-1', 'user-reposter', { targetType: PostType.POST })
      ).rejects.toThrow('Media snapshot or post creation failed during repost');

      // Verify the first duplicated media was rolled back
      expect(deleteMediaSpy).toHaveBeenCalledWith('/api/v1/attachments/file/new-m1.jpg');
      // Verify NO Post was created
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('duplicates media to new CDN URLs when reposting STORY as POST', async () => {
      const original = makePost({
        id: 'story-1',
        type: PostType.STORY,
        media: [
          { id: 'm1', fileUrl: '/api/v1/attachments/file/m1.jpg', mimeType: 'image/jpeg', filePath: '2026/05/user/m1.jpg', fileName: 'm1.jpg', originalName: 'm1.jpg', fileSize: 1000 },
          { id: 'm2', fileUrl: '/api/v1/attachments/file/m2.mp4', mimeType: 'video/mp4', filePath: '2026/05/user/m2.mp4', fileName: 'm2.mp4', originalName: 'm2.mp4', fileSize: 5000 },
        ],
        storyEffects: { someEffect: 'value' },
        audioUrl: '/api/v1/attachments/file/audio.mp3',
      });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'repost-snap' }));
      prisma.post.update.mockResolvedValue(original);

      const duplicateMediaSpy = jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-m1.jpg', filePath: '2026/05/snapshot/new-m1.jpg', fileName: 'new-m1.jpg', fileSize: 1000, mimeType: 'image/jpeg' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-m2.mp4', filePath: '2026/05/snapshot/new-m2.mp4', fileName: 'new-m2.mp4', fileSize: 5000, mimeType: 'video/mp4' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-audio.mp3', filePath: '2026/05/snapshot/new-audio.mp3', fileName: 'new-audio.mp3', fileSize: 2000, mimeType: 'audio/mpeg' });

      await service.repostPost('story-1', 'user-reposter', { targetType: PostType.POST });

      expect(duplicateMediaSpy).toHaveBeenCalledWith('/api/v1/attachments/file/m1.jpg');
      expect(duplicateMediaSpy).toHaveBeenCalledWith('/api/v1/attachments/file/m2.mp4');
      expect(duplicateMediaSpy).toHaveBeenCalledWith('/api/v1/attachments/file/audio.mp3');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: PostType.POST,
            audioUrl: '/api/v1/attachments/file/new-audio.mp3',
            storyEffects: { someEffect: 'value' },
          }),
        })
      );
    });

    it('snapshots moodEmoji, content and audio when reposting a STATUS as STATUS', async () => {
      // A STATUS is ephemeral (1h). A repost that merely referenced it would
      // render empty once the source expires. The repost must carry its own
      // copy of the mood + text + voice so it survives the original's TTL.
      const original = makePost({
        id: 'status-1',
        type: PostType.STATUS,
        visibility: 'PUBLIC',
        moodEmoji: '🔥',
        content: 'feeling great',
        originalLanguage: 'en',
        audioUrl: '/api/v1/attachments/file/mood.mp3',
      });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'status-repost' }));
      prisma.post.update.mockResolvedValue(original);

      const duplicateSpy = jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-mood.mp3', filePath: 'snap/new-mood.mp3', fileName: 'new-mood.mp3', fileSize: 1000, mimeType: 'audio/mpeg' });

      await service.repostPost('status-1', 'user-reposter', { targetType: PostType.STATUS });

      expect(duplicateSpy).toHaveBeenCalledWith('/api/v1/attachments/file/mood.mp3');
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: PostType.STATUS,
            moodEmoji: '🔥',
            content: 'feeling great',
            originalLanguage: 'en',
            audioUrl: '/api/v1/attachments/file/new-mood.mp3',
            repostOfId: 'status-1',
          }),
        })
      );
    });

    it('duplicates media + storyEffects when reposting a STORY as STORY', async () => {
      const original = makePost({
        id: 'story-2',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        media: [
          { id: 'm1', fileUrl: '/api/v1/attachments/file/s1.jpg', mimeType: 'image/jpeg', filePath: 'p/s1.jpg', fileName: 's1.jpg', originalName: 's1.jpg', fileSize: 1000 },
        ],
        storyEffects: { canvas: 'fx' },
        audioUrl: '/api/v1/attachments/file/bg.mp3',
      });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'story-repost' }));
      prisma.post.update.mockResolvedValue(original);

      const duplicateSpy = jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-s1.jpg', filePath: 'snap/new-s1.jpg', fileName: 'new-s1.jpg', fileSize: 1000, mimeType: 'image/jpeg' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-bg.mp3', filePath: 'snap/new-bg.mp3', fileName: 'new-bg.mp3', fileSize: 500, mimeType: 'audio/mpeg' });

      await service.repostPost('story-2', 'user-reposter', { targetType: PostType.STORY });

      expect(duplicateSpy).toHaveBeenCalledWith('/api/v1/attachments/file/s1.jpg');
      expect(duplicateSpy).toHaveBeenCalledWith('/api/v1/attachments/file/bg.mp3');
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: PostType.STORY,
            storyEffects: { canvas: 'fx' },
            audioUrl: '/api/v1/attachments/file/new-bg.mp3',
            repostOfId: 'story-2',
            media: { create: expect.arrayContaining([
              expect.objectContaining({ fileUrl: '/api/v1/attachments/file/new-s1.jpg' }),
            ]) },
          }),
        })
      );
    });

    it('returns null when original is deleted', async () => {
      prisma.post.findFirst.mockResolvedValue(null);
      const result = await service.repostPost('deleted-1', 'user-reposter');
      expect(result).toBeNull();
    });

    it('returns null when original is expired', async () => {
      const expiredOriginal = makePost({
        id: 'expired-1',
        type: PostType.STORY,
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.post.findFirst.mockResolvedValue(expiredOriginal);
      const result = await service.repostPost('expired-1', 'user-reposter');
      expect(result).toBeNull();
    });

    // Loi d'audience (2026-08-19) : ce témoin exigeait un 403 sur TOUT original
    // non-`PUBLIC`, y compris republié à l'identique. La décision produit ouvre
    // la republication aux stories non publiques à audience égale ou plus
    // restreinte — ce n'est donc plus l'audience de l'ORIGINAL qui refuse, mais
    // l'ÉLARGISSEMENT. Loi et témoins complets :
    // `@meeshy/shared/utils/repost-audience` + `PostService.repostAudience.test.ts`.
    it('throws 403 when the requested audience is BROADER than the original', async () => {
      const privateOriginal = makePost({ id: 'private-1', visibility: 'PRIVATE' });
      prisma.post.findFirst.mockResolvedValue(privateOriginal);
      await expect(
        service.repostPost('private-1', 'user-reposter', { visibility: 'PUBLIC' as never })
      ).rejects.toMatchObject({ statusCode: 403, code: 'REPOST_AUDIENCE_WIDENING' });
    });

    it('lets a non-public original be reposted UNCHANGED — same audience, never broader', async () => {
      const privateOriginal = makePost({ id: 'private-1', visibility: 'PRIVATE' });
      prisma.post.findFirst.mockResolvedValue(privateOriginal);

      await expect(service.repostPost('private-1', 'user-reposter')).resolves.not.toBeNull();
    });

    it('rolls back media AND audio when prisma.post.create fails', async () => {
      const original = makePost({
        id: 'story-x',
        type: PostType.STORY,
        media: [{ id: 'm1', fileUrl: '/api/v1/attachments/file/m1.jpg', mimeType: 'image/jpeg' }],
        audioUrl: '/api/v1/attachments/file/audio.mp3',
      });
      prisma.post.findFirst.mockResolvedValue(original);

      jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-m1.jpg', filePath: 'p', fileName: 'new-m1.jpg', fileSize: 100, mimeType: 'image/jpeg' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-audio.mp3', filePath: 'p', fileName: 'new-audio.mp3', fileSize: 200, mimeType: 'audio/mpeg' });
      const deleteSpy = jest.spyOn(mediaService, 'deleteMedia').mockResolvedValue(undefined);

      prisma.post.create.mockRejectedValue(new Error('DB constraint violation'));

      await expect(
        service.repostPost('story-x', 'user-1', { targetType: PostType.POST })
      ).rejects.toThrow();

      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/attachments/file/new-m1.jpg');
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/attachments/file/new-audio.mp3');
    });

    it('sets expiresAt to 20h from now when reposting as STORY', async () => {
      const original = makePost({ id: 'src-1', type: PostType.STORY });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'r-1', ...args.data }));
      prisma.post.update.mockResolvedValue(original);

      const before = Date.now();
      await service.repostPost('src-1', 'user-1', { targetType: PostType.STORY });
      const after = Date.now();

      const createCall = prisma.post.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      expect(expiresAt).toBeInstanceOf(Date);
      const expectedMs = before + 20 * 3600_000;
      const actualMs = expiresAt.getTime();
      expect(actualMs).toBeGreaterThanOrEqual(expectedMs);
      expect(actualMs).toBeLessThanOrEqual(after + 20 * 3600_000);
    });

    it('sets expiresAt to 1h from now when reposting as STATUS', async () => {
      const original = makePost({ id: 'src-2', type: PostType.STATUS });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'r-2', ...args.data }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('src-2', 'user-1', { targetType: PostType.STATUS });

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.expiresAt).toBeInstanceOf(Date);
    });

    it('does NOT set expiresAt when reposting as POST', async () => {
      const original = makePost({ id: 'src-3', type: PostType.POST });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'r-3', ...args.data }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('src-3', 'user-1', { targetType: PostType.POST });

      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.expiresAt).toBeUndefined();
    });

    it('remaps storyEffects.mediaObjects postMediaId to the newly duplicated media (repost of an original)', async () => {
      const original = makePost({
        id: 'story-3',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        media: [
          { id: 'orig-media-1', fileUrl: '/api/v1/attachments/file/s1.jpg', mimeType: 'image/jpeg', filePath: 'p/s1.jpg', fileName: 's1.jpg', originalName: 's1.jpg', fileSize: 1000, order: 0 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true, x: 0, y: 0 }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(original);

      jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
        fileUrl: '/api/v1/attachments/file/new-s1.jpg', filePath: 'snap/new-s1.jpg', fileName: 'new-s1.jpg', fileSize: 1000, mimeType: 'image/jpeg',
      });

      prisma.post.create.mockResolvedValue(
        makePost({
          id: 'repost-level1',
          media: [{ id: 'new-media-1', order: 0, fileUrl: '/api/v1/attachments/file/new-s1.jpg' }],
          storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true, x: 0, y: 0 }] },
        })
      );
      prisma.post.update.mockResolvedValue(original);

      const result = await service.repostPost('story-3', 'user-reposter', { targetType: PostType.STORY });

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'repost-level1' },
        data: { storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'new-media-1', isBackground: true, x: 0, y: 0 }] } },
      });
      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'new-media-1', isBackground: true, x: 0, y: 0 }],
      });
    });

    it('remaps storyEffects to its OWN new media when reposting an already-reposted story (2-hop chain) — regression for the reported bug', async () => {
      // `levelOneRepost` represents a LEVEL-1 repost that is already
      // self-consistent (its storyEffects.mediaObjects[].postMediaId matches
      // its own media[].id) — exactly what repostPost now produces after this
      // fix. Reposting it must NOT leak the level-1 media id forward: the
      // level-2 repost must reference its own freshly duplicated media.
      const levelOneRepost = makePost({
        id: 'repost-level1',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        repostOfId: 'story-root',
        originalRepostOfId: 'story-root',
        media: [
          { id: 'level1-media-1', fileUrl: '/api/v1/attachments/file/level1.jpg', mimeType: 'image/jpeg', filePath: 'p/level1.jpg', fileName: 'level1.jpg', originalName: 'level1.jpg', fileSize: 1000, order: 0 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'level1-media-1', isBackground: true, x: 0, y: 0 }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(levelOneRepost);

      jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
        fileUrl: '/api/v1/attachments/file/level2.jpg', filePath: 'snap/level2.jpg', fileName: 'level2.jpg', fileSize: 1000, mimeType: 'image/jpeg',
      });

      prisma.post.create.mockResolvedValue(
        makePost({
          id: 'repost-level2',
          media: [{ id: 'level2-media-1', order: 0, fileUrl: '/api/v1/attachments/file/level2.jpg' }],
          storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'level1-media-1', isBackground: true, x: 0, y: 0 }] },
        })
      );
      prisma.post.update.mockResolvedValue(levelOneRepost);

      const result = await service.repostPost('repost-level1', 'user-reposter-2', { targetType: PostType.STORY });

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'repost-level2' },
        data: { storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'level2-media-1', isBackground: true, x: 0, y: 0 }] } },
      });
      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'level2-media-1', isBackground: true, x: 0, y: 0 }],
      });
      const storyEffectsJson = JSON.stringify(result?.storyEffects);
      expect(storyEffectsJson).not.toContain('level1-media-1');
    });

    it('generalizes beyond 2 hops: a 3rd repost also remaps to its own new media, never leaking earlier-level ids', async () => {
      const levelTwoRepost = makePost({
        id: 'repost-level2',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        repostOfId: 'repost-level1',
        originalRepostOfId: 'story-root',
        media: [
          { id: 'level2-media-1', fileUrl: '/api/v1/attachments/file/level2.jpg', mimeType: 'image/jpeg', filePath: 'p/level2.jpg', fileName: 'level2.jpg', originalName: 'level2.jpg', fileSize: 1000, order: 0 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'level2-media-1', isBackground: true, x: 0, y: 0 }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(levelTwoRepost);

      jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
        fileUrl: '/api/v1/attachments/file/level3.jpg', filePath: 'snap/level3.jpg', fileName: 'level3.jpg', fileSize: 1000, mimeType: 'image/jpeg',
      });

      prisma.post.create.mockResolvedValue(
        makePost({
          id: 'repost-level3',
          media: [{ id: 'level3-media-1', order: 0, fileUrl: '/api/v1/attachments/file/level3.jpg' }],
          storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'level2-media-1', isBackground: true, x: 0, y: 0 }] },
        })
      );
      prisma.post.update.mockResolvedValue(levelTwoRepost);

      const result = await service.repostPost('repost-level2', 'user-reposter-3', { targetType: PostType.STORY });

      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'level3-media-1', isBackground: true, x: 0, y: 0 }],
      });
      const storyEffectsJson = JSON.stringify(result?.storyEffects);
      expect(storyEffectsJson).not.toContain('level1-media-1');
      expect(storyEffectsJson).not.toContain('level2-media-1');
    });

    it('remaps storyEffects.audioPlayerObjects postMediaId alongside mediaObjects', async () => {
      const original = makePost({
        id: 'story-audio-1',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        media: [
          { id: 'orig-video-1', fileUrl: '/api/v1/attachments/file/v1.mp4', mimeType: 'video/mp4', filePath: 'p/v1.mp4', fileName: 'v1.mp4', originalName: 'v1.mp4', fileSize: 2000, order: 0 },
          { id: 'orig-audio-1', fileUrl: '/api/v1/attachments/file/a1.mp3', mimeType: 'audio/mpeg', filePath: 'p/a1.mp3', fileName: 'a1.mp3', originalName: 'a1.mp3', fileSize: 500, order: 1 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'orig-video-1', isBackground: true }],
          audioPlayerObjects: [{ id: 'el-2', postMediaId: 'orig-audio-1', volume: 0.8 }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(original);

      jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-v1.mp4', filePath: 'snap/new-v1.mp4', fileName: 'new-v1.mp4', fileSize: 2000, mimeType: 'video/mp4' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-a1.mp3', filePath: 'snap/new-a1.mp3', fileName: 'new-a1.mp3', fileSize: 500, mimeType: 'audio/mpeg' });

      prisma.post.create.mockResolvedValue(
        makePost({
          id: 'repost-audio',
          media: [
            { id: 'new-video-1', order: 0, fileUrl: '/api/v1/attachments/file/new-v1.mp4' },
            { id: 'new-audio-1', order: 1, fileUrl: '/api/v1/attachments/file/new-a1.mp3' },
          ],
          storyEffects: {
            mediaObjects: [{ id: 'el-1', postMediaId: 'orig-video-1', isBackground: true }],
            audioPlayerObjects: [{ id: 'el-2', postMediaId: 'orig-audio-1', volume: 0.8 }],
          },
        })
      );
      prisma.post.update.mockResolvedValue(original);

      const result = await service.repostPost('story-audio-1', 'user-reposter', { targetType: PostType.STORY });

      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'new-video-1', isBackground: true }],
        audioPlayerObjects: [{ id: 'el-2', postMediaId: 'new-audio-1', volume: 0.8 }],
      });
    });

    it('logs and keeps the original storyEffects when the post-create correction write fails, without failing the repost', async () => {
      const original = makePost({
        id: 'story-4',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        media: [
          { id: 'orig-media-1', fileUrl: '/api/v1/attachments/file/s1.jpg', mimeType: 'image/jpeg', filePath: 'p/s1.jpg', fileName: 's1.jpg', originalName: 's1.jpg', fileSize: 1000, order: 0 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(original);

      jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
        fileUrl: '/api/v1/attachments/file/new-s1.jpg', filePath: 'snap/new-s1.jpg', fileName: 'new-s1.jpg', fileSize: 1000, mimeType: 'image/jpeg',
      });

      const createdRepost = makePost({
        id: 'repost-fail-correction',
        media: [{ id: 'new-media-1', order: 0, fileUrl: '/api/v1/attachments/file/new-s1.jpg' }],
        storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true }] },
      });
      prisma.post.create.mockResolvedValue(createdRepost);

      // First update() call is the storyEffects correction (rejects); second
      // is the original post's repostCount increment (resolves normally).
      prisma.post.update
        .mockRejectedValueOnce(new Error('write conflict'))
        .mockResolvedValueOnce(original);

      const result = await service.repostPost('story-4', 'user-reposter', { targetType: PostType.STORY });

      expect(result).toBeDefined();
      expect(result?.id).toBe('repost-fail-correction');
      expect(prisma.post.update).toHaveBeenCalledTimes(2);
      expect(prisma.post.update).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ where: { id: 'story-4' }, data: { repostCount: { increment: 1 } } })
      );
      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true }],
      });
    });

    it('does not issue a correction update when storyEffects has no media references to remap', async () => {
      const original = makePost({
        id: 'story-text-only',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        storyEffects: { textObjects: [{ id: 'el-1', text: 'hello' }] },
      });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'repost-text-only', storyEffects: { textObjects: [{ id: 'el-1', text: 'hello' }] } }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('story-text-only', 'user-reposter', { targetType: PostType.STORY });

      expect(prisma.post.update).toHaveBeenCalledTimes(1);
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'story-text-only' }, data: { repostCount: { increment: 1 } } })
      );
    });
  });

  // -----------------------------------------------------------------------
  // getPostById — currentUserReactions enrichment
  // -----------------------------------------------------------------------

  describe('getPostById', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getPostById('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('returns post with currentUserReactions: [] when user has not reacted', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);

      const result = await service.getPostById('post-1', 'user-1');

      expect(result).not.toBeNull();
      expect((result as any).currentUserReactions).toEqual([]);
    });

    it('returns currentUserReactions: ["❤️"] when user reacted with that emoji', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ postId: 'post-1', emoji: '❤️' }]);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).currentUserReactions).toEqual(['❤️']);
    });

    it('returns currentUserReactions: ["❤️", "🔥"] for multi-emoji reactions', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([
        { postId: 'post-1', emoji: '❤️' },
        { postId: 'post-1', emoji: '🔥' },
      ]);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).currentUserReactions).toEqual(['❤️', '🔥']);
    });

    it('returns currentUserReactions: [] when currentUserId is undefined (anonymous read)', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getPostById('post-1', undefined);

      expect((result as any).currentUserReactions).toEqual([]);
      expect(prisma.postReaction.findMany).not.toHaveBeenCalled();
    });

    // Bookmark / repost personal-state enrichment — mirrors PostFeedService so
    // the post detail hydrates the SAME isBookmarkedByMe / isRepostedByMe as the
    // feed and reel viewer. Without these, the detail always showed "non
    // bookmarked" / "non reposted" even when the post was saved/reposted.

    it('returns isBookmarkedByMe: true when the viewer has bookmarked the post', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue({ postId: 'post-1' });
      prisma.post.count.mockResolvedValue(0);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).isBookmarkedByMe).toBe(true);
      expect((result as any).isRepostedByMe).toBe(false);
    });

    it('returns isBookmarkedByMe: false when the viewer has not bookmarked the post', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(0);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).isBookmarkedByMe).toBe(false);
    });

    it('returns isRepostedByMe: true when the viewer has reposted the post', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(1);

      const result = await service.getPostById('post-1', 'user-1');

      expect((result as any).isRepostedByMe).toBe(true);
    });

    it('returns bookmark/repost flags false for anonymous read without querying them', async () => {
      const post = makePost();
      prisma.post.findFirst.mockResolvedValue(post);
      prisma.friendRequest.findMany.mockResolvedValue([]);

      const result = await service.getPostById('post-1', undefined);

      expect((result as any).isBookmarkedByMe).toBe(false);
      expect((result as any).isRepostedByMe).toBe(false);
      expect(prisma.postBookmark.findFirst).not.toHaveBeenCalled();
      expect(prisma.post.count).not.toHaveBeenCalled();
    });

    // Repost simple → racine (chantier reposts cohérents & watermark, tâche
    // 9) : les flags personnels (isLikedByMe/currentUserReactions) d'un
    // repost simple reflètent l'état de l'utilisateur sur l'ORIGINAL — un des
    // deux chemins d'enrichissement gateway (l'autre est
    // `PostFeedService`). Une citation garde son propre état.

    it('redirects currentUserReactions/isLikedByMe to the ROOT for a simple repost', async () => {
      const repost = makePost({ id: 'repost-1', isQuote: false, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
      prisma.post.findFirst.mockResolvedValue(repost);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ postId: 'root-1', emoji: '❤️' }]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(0);

      const result = await service.getPostById('repost-1', 'user-1');

      expect(prisma.postReaction.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', postId: 'root-1' },
        select: { postId: true, emoji: true },
      });
      expect((result as any).currentUserReactions).toEqual(['❤️']);
      expect((result as any).isLikedByMe).toBe(true);
    });

    it('resolves the root through the FIRST hop of the chain (originalRepostOfId), not the intermediate parent', async () => {
      const repost = makePost({ id: 'repost-2', isQuote: false, repostOfId: 'middle-repost', originalRepostOfId: 'root-1' });
      prisma.post.findFirst.mockResolvedValue(repost);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(0);

      await service.getPostById('repost-2', 'user-1');

      expect(prisma.postReaction.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', postId: 'root-1' },
        select: { postId: true, emoji: true },
      });
    });

    it('a QUOTE keeps its own currentUserReactions/isLikedByMe — no redirect', async () => {
      const quote = makePost({ id: 'quote-1', isQuote: true, repostOfId: 'root-1', originalRepostOfId: 'root-1' });
      prisma.post.findFirst.mockResolvedValue(quote);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(0);

      await service.getPostById('quote-1', 'user-1');

      expect(prisma.postReaction.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', postId: 'quote-1' },
        select: { postId: true, emoji: true },
      });
    });

    // Review task-9, critique #1 : un repost simple SOURCÉ depuis une
    // STORY/STATUS ne redirige JAMAIS ses flags perso vers la racine — il
    // porte son propre instantané et garde sa PROPRE vie sociale. Sans cette
    // exclusion, lecture (ce flag) et écriture (like désormais posé sur le
    // repost lui-même, `resolveInteractionTarget`) divergeraient.
    it('a repost sourced from a STORY keeps its own currentUserReactions/isLikedByMe — no redirect to the ephemeral root', async () => {
      const repost = makePost({
        id: 'repost-story-1',
        isQuote: false,
        repostOfId: 'story-root-1',
        originalRepostOfId: 'story-root-1',
        repostOf: { id: 'story-root-1', type: 'STORY' },
      });
      prisma.post.findFirst.mockResolvedValue(repost);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([{ postId: 'repost-story-1', emoji: '❤️' }]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(0);

      const result = await service.getPostById('repost-story-1', 'user-1');

      expect(prisma.postReaction.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', postId: 'repost-story-1' },
        select: { postId: true, emoji: true },
      });
      expect((result as any).currentUserReactions).toEqual(['❤️']);
      expect((result as any).isLikedByMe).toBe(true);
    });

    it('a repost sourced from a STATUS keeps its own currentUserReactions/isLikedByMe — no redirect', async () => {
      const repost = makePost({
        id: 'repost-status-1',
        isQuote: false,
        repostOfId: 'status-root-1',
        originalRepostOfId: 'status-root-1',
        repostOf: { id: 'status-root-1', type: 'STATUS' },
      });
      prisma.post.findFirst.mockResolvedValue(repost);
      prisma.friendRequest.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.postBookmark.findFirst.mockResolvedValue(null);
      prisma.post.count.mockResolvedValue(0);

      await service.getPostById('repost-status-1', 'user-1');

      expect(prisma.postReaction.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', postId: 'repost-status-1' },
        select: { postId: true, emoji: true },
      });
    });
  });

  // -----------------------------------------------------------------------
  // deletePost
  // -----------------------------------------------------------------------

  describe('deletePost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.deletePost('missing', 'user-1', { actorRole: 'USER' });
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other-user' }));

      // Rôle USER : un non-auteur sans pouvoir de modération reste refusé.
      // Le droit de retrait n'est ouvert qu'à MODERATOR / ADMIN / BIGBOSS
      // (cf. posts-delete-moderator.test.ts).
      await expect(
        service.deletePost('post-1', 'user-1', { actorRole: 'USER' }),
      ).rejects.toThrow('FORBIDDEN');
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('soft-deletes the post by setting deletedAt', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1' }));
      const deletedPost = makePost({ deletedAt: new Date() });
      prisma.post.update.mockResolvedValue(deletedPost);

      const result = await service.deletePost('post-1', 'user-1', { actorRole: 'USER' });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: {
            deletedAt: expect.any(Date),
          },
        }),
      );
      expect(result).toEqual(deletedPost);
    });
  });

  describe('updatePost', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);
      const result = await service.updatePost('missing', 'user-1', { content: 'x' });
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'other', media: [] }));
      await expect(service.updatePost('post-1', 'user-1', { content: 'x' })).rejects.toThrow('FORBIDDEN');
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('switches a POST to a REEL when it carries a qualifying composition (video)', async () => {
      // Règle produit 2026-08-02 : video (>=3s) || audio (>=3s) || >= 2 images.
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [{ id: 'm1', mimeType: 'video/mp4', duration: 5000 }] }));
      prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.updatePost('post-1', 'user-1', { type: PostType.REEL });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.REEL }) }),
      );
    });

    it('removes only media that belongs to the post (ignores foreign ids)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [{ id: 'm1' }, { id: 'm2' }] }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.updatePost('post-1', 'user-1', { removeMediaIds: ['m1', 'foreign-media'] });

      expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1'] }, postId: 'post-1' },
      });
      expect(prisma.post.update).toHaveBeenCalled();
    });

    it('does not delete media when removeMediaIds is omitted', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [{ id: 'm1' }] }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.updatePost('post-1', 'user-1', { content: 'x' });

      expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
    });

    it('writes metadata.location on edit and preserves the other metadata blocks', async () => {
      // Le lieu à l'édition passe par le MÊME contrat qu'à la création :
      // écrit dans metadata.location, sans clobber postReplyTo/trackingLinks.
      prisma.post.findFirst.mockResolvedValue(makePost({
        authorId: 'user-1', type: 'POST', media: [],
        metadata: { postReplyTo: { id: 'other' } },
      }));
      prisma.post.update.mockResolvedValue(makePost());
      const place = { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: null, category: null };

      await service.updatePost('post-1', 'user-1', { location: place });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { postReplyTo: { id: 'other' }, location: place },
          }),
        }),
      );
    });

    it('removes metadata.location when location is null, keeping the other blocks', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({
        authorId: 'user-1', type: 'POST', media: [],
        metadata: {
          postReplyTo: { id: 'other' },
          location: { latitude: 1, longitude: 2, name: null, address: null, category: null },
        },
      }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.updatePost('post-1', 'user-1', { location: null });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { postReplyTo: { id: 'other' } },
          }),
        }),
      );
    });

    it('leaves metadata untouched when location is absent from the edit', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({
        authorId: 'user-1', type: 'POST', media: [],
        metadata: { location: { latitude: 1, longitude: 2, name: null, address: null, category: null } },
      }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.updatePost('post-1', 'user-1', { content: 'x' });

      const updateArg = prisma.post.update.mock.calls[0][0];
      expect(updateArg.data.metadata).toBeUndefined();
    });

    it('rejects removing the last media of a REEL (422) and deletes nothing', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'REEL', media: [{ id: 'm1' }] }));

      await expect(service.updatePost('post-1', 'user-1', { removeMediaIds: ['m1'] }))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('allows removing media from a REEL whose remaining composition still qualifies', async () => {
      // Retirer l'image laisse la vidéo — la composition reste qualifiante.
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'REEL', media: [{ id: 'm1', mimeType: 'image/jpeg' }, { id: 'm2', mimeType: 'video/mp4', duration: 5000 }] }));
      prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.updatePost('post-1', 'user-1', { removeMediaIds: ['m1'] });

      expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['m1'] }, postId: 'post-1' },
      });
    });

    it('rejects switching to REEL without media (422)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [] }));
      await expect(service.updatePost('post-1', 'user-1', { type: PostType.REEL }))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('rejects a STORY -> POST type change (422)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [{ id: 'm1' }] }));
      await expect(service.updatePost('post-1', 'user-1', { type: PostType.POST }))
        .rejects.toMatchObject({ statusCode: 422 });
    });

    it('rejects a type change on a repost (422)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', repostOfId: 'orig-1', media: [{ id: 'm1' }] }));
      await expect(service.updatePost('post-1', 'user-1', { type: PostType.REEL }))
        .rejects.toMatchObject({ statusCode: 422 });
    });

    it('does not write type when it is unchanged', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [] }));
      prisma.post.update.mockResolvedValue(makePost());
      await service.updatePost('post-1', 'user-1', { type: PostType.POST });
      expect(prisma.post.update.mock.calls[0][0].data.type).toBeUndefined();
    });

    it('updates originalLanguage and clears stale translations on language change', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', originalLanguage: 'en', content: 'hello', media: [] }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.updatePost('post-1', 'user-1', { originalLanguage: 'fr' });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originalLanguage: 'fr', translations: {} }),
        }),
      );
    });

    it('does not touch originalLanguage/translations when language is unchanged', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', originalLanguage: 'en', media: [] }));
      prisma.post.update.mockResolvedValue(makePost());
      await service.updatePost('post-1', 'user-1', { originalLanguage: 'en', content: 'updated' });
      const call = prisma.post.update.mock.calls[0][0];
      expect(call.data.originalLanguage).toBeUndefined();
      expect(call.data.translations).toBeUndefined();
    });

    // A regional variant of the stored language (fr-FR vs stored fr) must NOT be
    // treated as a language change — otherwise it wipes valid translations and
    // relaunches ZMQ jobs for nothing.
    it('does not re-translate a regional variant of the stored language (fr-FR vs fr)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', originalLanguage: 'fr', content: 'bonjour', media: [] }));
      prisma.post.update.mockResolvedValue(makePost());
      await service.updatePost('post-1', 'user-1', { originalLanguage: 'fr-FR' });
      const call = prisma.post.update.mock.calls[0][0];
      expect(call.data.originalLanguage).toBeUndefined();
      expect(call.data.translations).toBeUndefined();
    });

    it('canonicalizes a genuine language change before persisting (en_US -> en)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', originalLanguage: 'fr', content: 'hello', media: [] }));
      prisma.post.update.mockResolvedValue(makePost());
      await service.updatePost('post-1', 'user-1', { originalLanguage: 'en_US' });
      const call = prisma.post.update.mock.calls[0][0];
      expect(call.data.originalLanguage).toBe('en');
      expect(call.data.translations).toEqual({});
    });

    // -----------------------------------------------------------------------
    // Story edit — engagement reset (directive 2026-07-29)
    //
    // Editing a published STORY's content restarts its life: views, reactions
    // and impressions are wiped (rows + denormalized counters + embedded JSON)
    // so every viewer sees it as new again. The publication date never moves:
    // createdAt/expiresAt are NOT part of the update payload.
    // -----------------------------------------------------------------------

    describe('STORY content edit — engagement reset', () => {
      it('wipes views, reactions and impressions when storyEffects change', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', { storyEffects: { background: { kind: 'color' } } });

        expect(prisma.postView.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post-1' } });
        expect(prisma.postReaction.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post-1' } });
        expect(prisma.postImpression.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post-1' } });
        expect(prisma.post.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              viewCount: 0,
              impressionCount: 0,
              reactionCount: 0,
              likeCount: 0,
              reactionSummary: {},
              reactions: [],
              storyViews: [],
              isEdited: true,
              contentEditedAt: expect.any(Date),
            }),
          }),
        );
      });

      it('wipes stale translations on a content edit even without language change', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', originalLanguage: 'fr', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', { content: 'nouveau texte' });

        expect(prisma.post.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ translations: {} }) }),
        );
      });

      it('never touches createdAt or expiresAt (publication date is immutable)', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', { content: 'edited', storyEffects: {} });

        const dataArg = prisma.post.update.mock.calls[0][0].data;
        expect(dataArg).not.toHaveProperty('createdAt');
        expect(dataArg).not.toHaveProperty('expiresAt');
      });

      it('does NOT reset engagement on a visibility-only STORY update', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', { visibility: PostVisibility.FRIENDS, visibilityUserIds: [] });

        expect(prisma.postView.deleteMany).not.toHaveBeenCalled();
        expect(prisma.postReaction.deleteMany).not.toHaveBeenCalled();
        expect(prisma.postImpression.deleteMany).not.toHaveBeenCalled();
        const dataArg = prisma.post.update.mock.calls[0][0].data;
        expect(dataArg).not.toHaveProperty('viewCount');
        expect(dataArg).not.toHaveProperty('translations');
        expect(dataArg).not.toHaveProperty('contentEditedAt');
      });

      it('does NOT reset engagement when a non-STORY post is edited', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'POST', media: [] }));
        prisma.post.update.mockResolvedValue(makePost());

        await service.updatePost('post-1', 'user-1', { content: 'edited post' });

        expect(prisma.postView.deleteMany).not.toHaveBeenCalled();
        expect(prisma.postReaction.deleteMany).not.toHaveBeenCalled();
        const dataArg = prisma.post.update.mock.calls[0][0].data;
        expect(dataArg).not.toHaveProperty('viewCount');
      });
    });

    describe('mediaIds — attach pre-uploaded media on update', () => {
      it('attaches only PENDING media (postId null) to the post', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', { mediaIds: ['new-m1', 'new-m2'] });

        // Libre ET à l'auteur : `postId: null` seul laissait un tiers
        // s'approprier le média en attente de quelqu'un d'autre.
        const claim = prisma.postMedia.updateMany.mock.calls[0][0];
        expect(claim.where.id).toEqual({ in: ['new-m1', 'new-m2'] });
        // Les deux formes MongoDB d'un média libre (null OU champ absent) —
        // cf. l'incident prod 2026-07-31→08-01 sur `commentId` absent.
        expect(claim.where.AND).toEqual([
          { OR: [{ postId: null }, { postId: { isSet: false } }] },
          { OR: [{ commentId: null }, { commentId: { isSet: false } }] },
        ]);
        expect(claim.where.uploaderId).toBe('user-1');
        expect(claim.data).toEqual({ postId: 'post-1' });
      });

      it('grave le RANG des médias ajoutés par une édition', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', { mediaIds: ['new-m1', 'new-m2'] });

        const orderWrites = prisma.postMedia.updateMany.mock.calls
          .map((call: any[]) => call[0])
          .filter((args: any) => args.data?.order !== undefined);
        expect(orderWrites).toEqual([
          { where: { id: 'new-m1', postId: 'post-1' }, data: { order: 0 } },
          { where: { id: 'new-m2', postId: 'post-1' }, data: { order: 1 } },
        ]);
      });

      it('adding media to a STORY counts as a content edit (engagement reset)', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', { mediaIds: ['new-m1'] });

        expect(prisma.postView.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post-1' } });
      });

      it('never writes mediaIds as a scalar field on the post', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', { mediaIds: ['new-m1'] });

        expect(prisma.post.update.mock.calls[0][0].data).not.toHaveProperty('mediaIds');
      });

      it('REEL: newly added media counts toward the composition rule', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'REEL', media: [{ id: 'm1', mimeType: 'video/mp4', duration: 5000 }] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));
        // Le média fraîchement téléversé est matérialisé (mimeType/duration)
        // pour la règle de composition : la vidéo ajoutée garde le REEL
        // qualifiant.
        prisma.postMedia.findMany.mockResolvedValue([{ mimeType: 'video/quicktime', duration: 5000 }]);

        await service.updatePost('post-1', 'user-1', { removeMediaIds: ['m1'], mediaIds: ['new-m1'] });

        expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({
          where: { id: { in: ['m1'] }, postId: 'post-1' },
        });
        const claim = prisma.postMedia.updateMany.mock.calls[0][0];
        expect(claim.where.id).toEqual({ in: ['new-m1'] });
        expect(claim.where.uploaderId).toBe('user-1');
        expect(claim.data).toEqual({ postId: 'post-1' });
      });

      it('writes alt text for a newly attached media id', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', {
          mediaIds: ['new-m1'],
          mediaAlt: { 'new-m1': 'A sunset over the bay' },
        });

        expect(prisma.postMedia.updateMany).toHaveBeenCalledWith({
          where: { id: 'new-m1', postId: 'post-1' },
          data: { alt: 'A sunset over the bay' },
        });
      });

      it('ignores mediaAlt entries for ids not in this mediaIds request (already-attached media)', async () => {
        prisma.post.findFirst.mockResolvedValue(makePost({ authorId: 'user-1', type: 'STORY', media: [{ id: 'already-attached' }] }));
        prisma.post.update.mockResolvedValue(makePost({ type: 'STORY' }));

        await service.updatePost('post-1', 'user-1', {
          mediaIds: ['new-m1'],
          mediaAlt: { 'already-attached': 'sneaky rewrite', 'new-m1': 'ok' },
        });

        expect(prisma.postMedia.updateMany).not.toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ id: 'already-attached' }) }),
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // createPost — originalLanguage canonicalization (write boundary)
  // -----------------------------------------------------------------------

  describe('createPost originalLanguage canonicalization', () => {
    const base = { type: PostType.POST, visibility: PostVisibility.PUBLIC };

    it('canonicalizes a region-tagged claim before persisting (fr-FR -> fr)', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      await service.createPost({ ...base, content: 'Bonjour', originalLanguage: 'fr-FR' }, 'user-1');
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'fr' }) }),
      );
    });

    it('canonicalizes an underscore locale claim (en_US -> en)', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      await service.createPost({ ...base, content: 'Hi', originalLanguage: 'en_US' }, 'user-1');
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'en' }) }),
      );
    });

    it('keeps an irreducible ISO 639-3 claim verbatim (bas)', async () => {
      prisma.post.create.mockResolvedValue(makePost());
      await service.createPost({ ...base, content: 'mbolo', originalLanguage: 'bas' }, 'user-1');
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'bas' }) }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// PostCommentService
// ---------------------------------------------------------------------------

describe('PostCommentService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostCommentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new PostCommentService(prisma);
  });

  // -----------------------------------------------------------------------
  // addComment
  // -----------------------------------------------------------------------

  describe('addComment', () => {
    it('returns null when the post does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(null);

      const result = await service.addComment('missing', 'user-1', 'Hello');
      expect(result).toBeNull();
      expect(prisma.postComment.create).not.toHaveBeenCalled();
    });

    it('creates a top-level comment and increments commentCount', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());

      const createdComment = makeComment({ id: 'new-comment' });
      prisma.postComment.create.mockResolvedValue(createdComment);
      prisma.post.update.mockResolvedValue(makePost({ commentCount: 6 }));

      const result = await service.addComment('post-1', 'user-1', 'Great post!');

      expect(prisma.postComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            postId: 'post-1',
            authorId: 'user-1',
            content: 'Great post!',
          }),
        }),
      );
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { commentCount: { increment: 1 } },
        }),
      );
      // `media: []` — addComment now returns the (possibly empty) comment media.
      expect(result).toEqual({ ...createdComment, media: [] });
    });

    it('throws PARENT_NOT_FOUND when parentId does not exist', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      prisma.postComment.findFirst.mockResolvedValue(null);

      await expect(
        service.addComment('post-1', 'user-1', 'Reply', 'bad-parent'),
      ).rejects.toThrow('PARENT_NOT_FOUND');

      expect(prisma.postComment.create).not.toHaveBeenCalled();
    });

    it('creates a reply and increments both commentCount and parent replyCount', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      const parentComment = makeComment({ id: 'parent-1' });
      prisma.postComment.findFirst.mockResolvedValue(parentComment);

      const reply = makeComment({ id: 'reply-1', parentId: 'parent-1' });
      prisma.postComment.create.mockResolvedValue(reply);
      prisma.post.update.mockResolvedValue(makePost());
      prisma.postComment.update.mockResolvedValue(parentComment);

      const result = await service.addComment('post-1', 'user-1', 'Nice!', 'parent-1');

      expect(prisma.postComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: 'parent-1',
          }),
        }),
      );
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { commentCount: { increment: 1 } },
        }),
      );
      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'parent-1' },
          data: { replyCount: { increment: 1 } },
        }),
      );
      expect(result).toEqual({ ...reply, media: [] });
    });

    // Write-boundary canonicalization: the client sends the raw platform locale
    // (fr_FR / fr-FR); the stored PostComment.originalLanguage must be canonical
    // so the NLLB source + Prisme resolver line up with the message pipeline.
    it('canonicalizes a region-tagged claim before persisting (fr-FR -> fr)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      prisma.postComment.create.mockResolvedValue(makeComment({ id: 'c-fr' }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.addComment('post-1', 'user-1', 'Bonjour', undefined, undefined, 'fr-FR');

      expect(prisma.postComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'fr' }) }),
      );
    });

    it('keeps an irreducible ISO 639-3 claim verbatim (bas)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      prisma.postComment.create.mockResolvedValue(makeComment({ id: 'c-bas' }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.addComment('post-1', 'user-1', 'mbolo', undefined, undefined, 'bas');

      expect(prisma.postComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'bas' }) }),
      );
    });

    it('persists null when no language claim is provided', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost());
      prisma.postComment.create.mockResolvedValue(makeComment({ id: 'c-null' }));
      prisma.post.update.mockResolvedValue(makePost());

      await service.addComment('post-1', 'user-1', 'Hello');

      expect(prisma.postComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ originalLanguage: null }) }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // deleteComment
  // -----------------------------------------------------------------------

  describe('deleteComment', () => {
    it('returns null when the comment does not exist', async () => {
      prisma.postComment.findFirst.mockResolvedValue(null);

      const result = await service.deleteComment('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('throws FORBIDDEN when the user is not the author', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment({ authorId: 'other-user' }));

      await expect(service.deleteComment('comment-1', 'user-1')).rejects.toThrow('FORBIDDEN');
      expect(prisma.postComment.update).not.toHaveBeenCalled();
    });

    it('soft-deletes the comment (subtree) and decrements commentCount', async () => {
      prisma.postComment.findFirst.mockResolvedValue(
        makeComment({ authorId: 'user-1', parentId: null }),
      );
      // No descendant replies → BFS returns empty on the first pass.
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postComment.updateMany.mockResolvedValue({ count: 1 });
      prisma.post.update.mockResolvedValue({});

      const result = await service.deleteComment('comment-1', 'user-1');

      expect(prisma.postComment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['comment-1'] } },
          data: { deletedAt: expect.any(Date) },
        }),
      );
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { commentCount: { decrement: 1 } },
        }),
      );
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    it('cascades to surviving replies and decrements commentCount by 1 + reply count', async () => {
      prisma.postComment.findFirst.mockResolvedValue(
        makeComment({ authorId: 'user-1', parentId: null }),
      );
      // First BFS pass returns two direct replies; second pass (their ids) returns none.
      prisma.postComment.findMany
        .mockResolvedValueOnce([{ id: 'reply-1' }, { id: 'reply-2' }])
        .mockResolvedValueOnce([]);
      prisma.postComment.updateMany.mockResolvedValue({ count: 3 });
      prisma.post.update.mockResolvedValue({});

      await service.deleteComment('comment-1', 'user-1');

      const softDeleted = prisma.postComment.updateMany.mock.calls[0][0].where.id.in;
      expect([...softDeleted].sort()).toEqual(['comment-1', 'reply-1', 'reply-2']);
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { commentCount: { decrement: 3 } } }),
      );
    });

    it('decrements parent replyCount when deleting a reply', async () => {
      prisma.postComment.findFirst.mockResolvedValue(
        makeComment({ authorId: 'user-1', parentId: 'parent-1' }),
      );
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postComment.updateMany.mockResolvedValue({ count: 1 });
      prisma.postComment.update.mockResolvedValue({});
      prisma.post.update.mockResolvedValue({});

      await service.deleteComment('comment-1', 'user-1');

      // The subtree soft-delete goes through updateMany …
      expect(prisma.postComment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['comment-1'] } },
          data: { deletedAt: expect.any(Date) },
        }),
      );
      // … and only the direct parent's replyCount is decremented.
      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'parent-1' },
          data: { replyCount: { decrement: 1 } },
        }),
      );
    });

    it('does not decrement parent replyCount for a top-level comment', async () => {
      prisma.postComment.findFirst.mockResolvedValue(
        makeComment({ authorId: 'user-1', parentId: null }),
      );
      prisma.postComment.findMany.mockResolvedValue([]);
      prisma.postComment.updateMany.mockResolvedValue({ count: 1 });
      prisma.post.update.mockResolvedValue({});

      await service.deleteComment('comment-1', 'user-1');

      // Top-level delete: no parent replyCount update (the soft-delete uses updateMany).
      expect(prisma.postComment.update).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // likeComment
  // -----------------------------------------------------------------------

  describe('likeComment', () => {
    it('returns null when the comment does not exist', async () => {
      prisma.postComment.findFirst.mockResolvedValue(null);

      const result = await service.likeComment('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('upserts the reaction row (idempotent) and syncs likeCount = reactionCount = count(table)', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      prisma.commentReaction.upsert.mockResolvedValue({});
      // Après l'upsert, la table contient 4 ❤️ → likeCount/reactionCount = 4.
      prisma.commentReaction.groupBy.mockResolvedValue([{ emoji: '❤️', _count: { emoji: 4 } }]);
      const updatedComment = makeComment({ likeCount: 4, reactionCount: 4, reactionSummary: { '❤️': 4 } });
      prisma.postComment.update.mockResolvedValue(updatedComment);

      const result = await service.likeComment('comment-1', 'user-1');

      // Idempotent : un seul like par (commentId,userId,emoji) via la contrainte unique.
      expect(prisma.commentReaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { comment_user_reaction_unique: { commentId: 'comment-1', userId: 'user-1', emoji: '❤️' } },
          create: { commentId: 'comment-1', userId: 'user-1', emoji: '❤️' },
          update: {},
        }),
      );
      // Compteurs AUTORITAIRES depuis la table (pas d'increment aveugle).
      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comment-1' },
          data: { likeCount: 4, reactionCount: 4, reactionSummary: { '❤️': 4 } },
        }),
      );
      expect(result).toEqual(updatedComment);
    });

    it('rebuilds reactionSummary per emoji from the table', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      prisma.commentReaction.upsert.mockResolvedValue({});
      prisma.commentReaction.groupBy.mockResolvedValue([
        { emoji: '❤️', _count: { emoji: 2 } },
        { emoji: '🔥', _count: { emoji: 1 } },
      ]);
      prisma.postComment.update.mockResolvedValue(makeComment());

      await service.likeComment('comment-1', 'user-1', '🔥');

      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { likeCount: 3, reactionCount: 3, reactionSummary: { '❤️': 2, '🔥': 1 } },
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // unlikeComment
  // -----------------------------------------------------------------------

  describe('unlikeComment', () => {
    it('returns null when the comment does not exist', async () => {
      prisma.postComment.findFirst.mockResolvedValue(null);

      const result = await service.unlikeComment('missing', 'user-1');
      expect(result).toBeNull();
    });

    it('deletes the reaction row and syncs counters from the table', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      // `unlikeComment` lit d'abord la pile TRIÉE : l'emoji demandé la restreint,
      // son absence la laisse entière, et la tête est la cible. Sans ce double,
      // aucune cible n'est trouvée et rien n'est supprimé.
      prisma.commentReaction.findMany.mockResolvedValue([{ emoji: '❤️' }]);
      prisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
      prisma.commentReaction.groupBy.mockResolvedValue([{ emoji: '❤️', _count: { emoji: 1 } }]);
      const updatedComment = makeComment({ likeCount: 1, reactionCount: 1, reactionSummary: { '❤️': 1 } });
      prisma.postComment.update.mockResolvedValue(updatedComment);

      const result = await service.unlikeComment('comment-1', 'user-1', '❤️');

      expect(prisma.commentReaction.deleteMany).toHaveBeenCalledWith({
        where: { commentId: 'comment-1', userId: 'user-1', emoji: '❤️' },
      });
      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comment-1' },
          data: { likeCount: 1, reactionCount: 1, reactionSummary: { '❤️': 1 } },
        }),
      );
      // `removedEmoji` voyage AVEC le commentaire : la route diffuse ce que le
      // serveur a FAIT, jamais ce que le client a demandé.
      expect(result).toEqual({ ...updatedComment, removedEmoji: '❤️' });
    });

    it('drops the emoji key (and zeroes counters) when the table is empty', async () => {
      prisma.postComment.findFirst.mockResolvedValue(makeComment());
      prisma.commentReaction.findMany.mockResolvedValue([{ emoji: '❤️' }]);
      prisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
      prisma.commentReaction.groupBy.mockResolvedValue([]);
      prisma.postComment.update.mockResolvedValue(makeComment());

      await service.unlikeComment('comment-1', 'user-1', '❤️');

      expect(prisma.postComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { likeCount: 0, reactionCount: 0, reactionSummary: {} },
        }),
      );
    });
  });
});
