/**
 * La loi des trois gestes de modération d'une publication (#10315) :
 * « Mettre en privé », « Mettre hors ligne », « Remettre en ligne ».
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  nextModerationState,
  withdrawsAudience,
  publicationStateOf,
  heldAgainstAuthor,
  type PostModerationState,
} from '../publication-moderation';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const EARLIER = new Date('2026-10-11T08:00:00.000Z');

const state = (over: Partial<PostModerationState> = {}): PostModerationState => ({
  visibility: 'PUBLIC',
  moderationHiddenAt: null,
  moderationPriorVisibility: null,
  ...over,
});

describe('nextModerationState — mettre en privé', () => {
  it("force PRIVATE et retient l'audience de l'auteur pour la rendre", () => {
    expect(nextModerationState('make-private', state({ visibility: 'FRIENDS' }), NOW)).toEqual({
      visibility: 'PRIVATE',
      moderationHiddenAt: null,
      moderationPriorVisibility: 'FRIENDS',
    });
  });

  it('ne touche à rien quand la publication est déjà privée', () => {
    expect(nextModerationState('make-private', state({ visibility: 'PRIVATE' }), NOW)).toBeNull();
  });

  it("retient l'audience COURANTE, jamais une audience retenue périmée", () => {
    const after = nextModerationState('make-private', state({ visibility: 'ONLY', moderationPriorVisibility: 'PUBLIC' }), NOW);
    expect(after?.moderationPriorVisibility).toBe('ONLY');
  });
});

describe('nextModerationState — mettre hors ligne', () => {
  it('date le retrait, force PRIVATE et retient l’audience', () => {
    expect(nextModerationState('take-offline', state({ visibility: 'PUBLIC' }), NOW)).toEqual({
      visibility: 'PRIVATE',
      moderationHiddenAt: NOW,
      moderationPriorVisibility: 'PUBLIC',
    });
  });

  it("garde l'audience retenue par une mise en privé antérieure", () => {
    const after = nextModerationState('take-offline', state({ visibility: 'PRIVATE', moderationPriorVisibility: 'COMMUNITY' }), NOW);
    expect(after).toEqual({ visibility: 'PRIVATE', moderationHiddenAt: NOW, moderationPriorVisibility: 'COMMUNITY' });
  });

  it("ne retient rien quand l'auteur l'avait lui-même rendue privée", () => {
    const after = nextModerationState('take-offline', state({ visibility: 'PRIVATE' }), NOW);
    expect(after?.moderationPriorVisibility).toBeNull();
  });

  it('ne redate pas un retrait déjà en place', () => {
    expect(nextModerationState('take-offline', state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER }), NOW)).toBeNull();
  });
});

describe('nextModerationState — remettre en ligne', () => {
  it("lève le retrait et rend l'audience que l'auteur avait choisie", () => {
    const after = nextModerationState('restore', state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER, moderationPriorVisibility: 'EXCEPT' }), NOW);
    expect(after).toEqual({ visibility: 'EXCEPT', moderationHiddenAt: null, moderationPriorVisibility: null });
  });

  it("n'écrase pas une audience que l'auteur a rouverte après une mise en privé", () => {
    const after = nextModerationState('restore', state({ visibility: 'FRIENDS', moderationPriorVisibility: 'PUBLIC' }), NOW);
    expect(after).toEqual({ visibility: 'FRIENDS', moderationHiddenAt: null, moderationPriorVisibility: null });
  });

  it("laisse privée une publication que l'auteur avait rendue privée lui-même", () => {
    const after = nextModerationState('restore', state({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER }), NOW);
    expect(after).toEqual({ visibility: 'PRIVATE', moderationHiddenAt: null, moderationPriorVisibility: null });
  });

  it("n'a rien à faire sur une publication jamais modérée", () => {
    expect(nextModerationState('restore', state({ visibility: 'PUBLIC' }), NOW)).toBeNull();
  });
});

describe('withdrawsAudience', () => {
  it("vaut vrai quand le geste retire la publication à son audience", () => {
    expect(withdrawsAudience(state({ visibility: 'FRIENDS' }), state({ visibility: 'PRIVATE' }))).toBe(true);
  });

  it('vaut faux quand elle était déjà privée', () => {
    expect(withdrawsAudience(state({ visibility: 'PRIVATE' }), state({ visibility: 'PRIVATE', moderationHiddenAt: NOW }))).toBe(false);
  });
});

describe('publicationStateOf', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    visibility: 'PUBLIC' as const,
    deletedAt: null,
    expiresAt: null,
    moderationHiddenAt: null,
    ...over,
  });

  it('dit « supprimée » avant tout autre état', () => {
    expect(publicationStateOf(row({ deletedAt: EARLIER, moderationHiddenAt: EARLIER }), NOW)).toBe('deleted');
  });

  it('dit « hors ligne » pour un retrait de modération', () => {
    expect(publicationStateOf(row({ visibility: 'PRIVATE', moderationHiddenAt: EARLIER }), NOW)).toBe('offline');
  });

  it('dit « expirée » pour une story passée', () => {
    expect(publicationStateOf(row({ expiresAt: EARLIER }), NOW)).toBe('expired');
  });

  it('dit « privée » pour une audience réduite à son auteur', () => {
    expect(publicationStateOf(row({ visibility: 'PRIVATE' }), NOW)).toBe('private');
  });

  it('dit « en ligne » sinon', () => {
    expect(publicationStateOf(row({ visibility: 'FRIENDS', expiresAt: new Date('2026-10-13T00:00:00Z') }), NOW)).toBe('online');
  });
});

describe("heldAgainstAuthor — l'auteur ne rouvre pas l'audience d'une publication mise hors ligne", () => {
  const POST = '507f1f77bcf86cd799439022';
  const AUTHOR = '507f1f77bcf86cd799439011';
  const OTHER = '507f1f77bcf86cd799439099';
  const prismaWith = (row: { authorId: string; moderationHiddenAt: Date | null } | null) => {
    const findFirst = jest.fn<any>().mockResolvedValue(row);
    return { prisma: { post: { findFirst } }, findFirst };
  };

  it("retient l'auteur qui rouvre une publication hors ligne", async () => {
    const { prisma } = prismaWith({ authorId: AUTHOR, moderationHiddenAt: EARLIER });
    expect(await heldAgainstAuthor(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'PUBLIC' })).toBe(true);
  });

  it("laisse passer une publication en ligne", async () => {
    const { prisma } = prismaWith({ authorId: AUTHOR, moderationHiddenAt: null });
    expect(await heldAgainstAuthor(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'PUBLIC' })).toBe(false);
  });

  it("ne dit rien à un autre que l'auteur — aucun oracle sur l'état de modération", async () => {
    const { prisma } = prismaWith({ authorId: AUTHOR, moderationHiddenAt: EARLIER });
    expect(await heldAgainstAuthor(prisma, { postId: POST, userId: OTHER, requestedVisibility: 'PUBLIC' })).toBe(false);
  });

  it("ne lit rien quand l'audience ne change pas, ou reste privée", async () => {
    const { prisma, findFirst } = prismaWith({ authorId: AUTHOR, moderationHiddenAt: EARLIER });
    expect(await heldAgainstAuthor(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: undefined })).toBe(false);
    expect(await heldAgainstAuthor(prisma, { postId: POST, userId: AUTHOR, requestedVisibility: 'PRIVATE' })).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
