/**
 * Redirection sociale des reposts simples vers la racine (chantier reposts
 * cohérents & watermark, tâche 9).
 *
 * `resolveInteractionTarget`/`resolveConsumptionTarget` sont le POINT UNIQUE
 * partagé par REST (interactions.ts, comments.ts) et socket
 * (PostReactionHandler) pour décider SUR QUEL post une interaction
 * (like/réaction, commentaire, lecture du fil) s'applique réellement :
 * - post normal ou CITATION (`isQuote:true`) → lui-même
 * - repost SIMPLE (`isQuote:false`, `repostOfId` renseigné) → sa RACINE
 *   (`originalRepostOfId ?? repostOfId`)
 * La redirection n'outrepasse jamais la visibilité de la racine : un acteur
 * qui ne peut plus interagir/consommer la racine (ACL resserrée après coup)
 * est refusé exactement comme un post introuvable — jamais un crédit
 * silencieux sur un post qu'il ne peut pas voir.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import { resolveInteractionTarget, resolveConsumptionTarget } from '../postVisibility';

const AUTHOR_ID = 'author-1';
const ROOT_ID = 'root-post-1';
const REPOST_ID = 'repost-post-1';
const VIEWER_ID = 'viewer-1';

type FakePost = {
  id: string;
  authorId: string;
  visibility: PostVisibility;
  visibilityUserIds: string[];
  isQuote: boolean;
  repostOfId: string | null;
  originalRepostOfId: string | null;
};

const makePost = (overrides: Partial<FakePost> = {}): FakePost => ({
  id: REPOST_ID,
  authorId: AUTHOR_ID,
  visibility: PostVisibility.PUBLIC,
  visibilityUserIds: [],
  isQuote: false,
  repostOfId: null,
  originalRepostOfId: null,
  ...overrides,
});

function makePrisma(byId: Record<string, FakePost | null>) {
  return {
    post: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(byId[where.id] ?? null)),
    },
    friendRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    communityMember: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    participant: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  };
}

describe('resolveInteractionTarget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the post itself when it is not a repost', async () => {
    const post = makePost({ id: 'plain-post-1', repostOfId: null });
    const prisma = makePrisma({ 'plain-post-1': post });

    const target = await resolveInteractionTarget(prisma as any, 'plain-post-1', VIEWER_ID);

    expect(target?.id).toBe('plain-post-1');
    expect(prisma.post.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns the quote repost itself — quotes keep their own social life', async () => {
    const quote = makePost({ id: REPOST_ID, isQuote: true, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID });
    const prisma = makePrisma({ [REPOST_ID]: quote, [ROOT_ID]: makePost({ id: ROOT_ID }) });

    const target = await resolveInteractionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    expect(target?.id).toBe(REPOST_ID);
    expect(prisma.post.findFirst).toHaveBeenCalledTimes(1);
  });

  it('redirects a simple repost to its immediate original when there is no chain', async () => {
    const repost = makePost({ id: REPOST_ID, isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID });
    const root = makePost({ id: ROOT_ID });
    const prisma = makePrisma({ [REPOST_ID]: repost, [ROOT_ID]: root });

    const target = await resolveInteractionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    expect(target?.id).toBe(ROOT_ID);
    expect(prisma.post.findFirst).toHaveBeenCalledTimes(2);
  });

  it('redirects a repost-of-a-repost to originalRepostOfId, never the intermediate parent', async () => {
    const MIDDLE_ID = 'middle-repost-1';
    const repost = makePost({ id: REPOST_ID, isQuote: false, repostOfId: MIDDLE_ID, originalRepostOfId: ROOT_ID });
    const root = makePost({ id: ROOT_ID });
    const prisma = makePrisma({ [REPOST_ID]: repost, [ROOT_ID]: root });

    const target = await resolveInteractionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    expect(target?.id).toBe(ROOT_ID);
  });

  it('returns null when the displayed post itself is not interactable', async () => {
    const post = makePost({ id: REPOST_ID, visibility: PostVisibility.PRIVATE });
    const prisma = makePrisma({ [REPOST_ID]: post });

    const target = await resolveInteractionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    expect(target).toBeNull();
    // Short-circuits — never even looks up a root when the displayed post itself is refused.
    expect(prisma.post.findFirst).toHaveBeenCalledTimes(1);
  });

  it('refuses the action (returns null) when the root is no longer interactable — never a silent credit', async () => {
    const repost = makePost({ id: REPOST_ID, isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID, visibility: PostVisibility.PUBLIC });
    // Root visibility tightened after the repost was created (e.g. author locked it down).
    const root = makePost({ id: ROOT_ID, visibility: PostVisibility.PRIVATE });
    const prisma = makePrisma({ [REPOST_ID]: repost, [ROOT_ID]: root });

    const target = await resolveInteractionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    expect(target).toBeNull();
  });

  it('returns null when the root has been deleted (findFirst returns null)', async () => {
    const repost = makePost({ id: REPOST_ID, isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID });
    const prisma = makePrisma({ [REPOST_ID]: repost, [ROOT_ID]: null });

    const target = await resolveInteractionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    expect(target).toBeNull();
  });

  it('returns null when the displayed post is absent/deleted', async () => {
    const prisma = makePrisma({ [REPOST_ID]: null });

    const target = await resolveInteractionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    expect(target).toBeNull();
  });

  it('lets the root author interact with their own root through a stranger\'s repost', async () => {
    const repost = makePost({ id: REPOST_ID, authorId: 'reposter-1', isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID, visibility: PostVisibility.PUBLIC });
    const root = makePost({ id: ROOT_ID, authorId: VIEWER_ID, visibility: PostVisibility.PRIVATE });
    const prisma = makePrisma({ [REPOST_ID]: repost, [ROOT_ID]: root });

    const target = await resolveInteractionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    expect(target?.id).toBe(ROOT_ID);
  });
});

describe('resolveConsumptionTarget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redirects a simple repost to its root using the CONSUMPTION verdict (amis ∪ contacts DM)', async () => {
    const repost = makePost({ id: REPOST_ID, isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID, visibility: PostVisibility.FRIENDS });
    const root = makePost({ id: ROOT_ID, visibility: PostVisibility.FRIENDS });
    const prisma = makePrisma({ [REPOST_ID]: repost, [ROOT_ID]: root });
    prisma.participant.findMany.mockResolvedValue([{ conversationId: 'conv-1' }]);
    prisma.participant.findFirst.mockResolvedValue({ id: 'pt-1' });

    const target = await resolveConsumptionTarget(prisma as any, REPOST_ID, VIEWER_ID);

    // Not a friend, but a DM contact — canUserConsumePost admits it, canUserInteractWithPost would not.
    expect(target?.id).toBe(ROOT_ID);
  });

  it('accepts an anonymous viewer (userId undefined) on a PUBLIC chain', async () => {
    const repost = makePost({ id: REPOST_ID, isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID, visibility: PostVisibility.PUBLIC });
    const root = makePost({ id: ROOT_ID, visibility: PostVisibility.PUBLIC });
    const prisma = makePrisma({ [REPOST_ID]: repost, [ROOT_ID]: root });

    const target = await resolveConsumptionTarget(prisma as any, REPOST_ID, undefined);

    expect(target?.id).toBe(ROOT_ID);
  });

  it('refuses an anonymous viewer when the root is not PUBLIC', async () => {
    const repost = makePost({ id: REPOST_ID, isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID, visibility: PostVisibility.PUBLIC });
    const root = makePost({ id: ROOT_ID, visibility: PostVisibility.FRIENDS });
    const prisma = makePrisma({ [REPOST_ID]: repost, [ROOT_ID]: root });

    const target = await resolveConsumptionTarget(prisma as any, REPOST_ID, undefined);

    expect(target).toBeNull();
  });
});
