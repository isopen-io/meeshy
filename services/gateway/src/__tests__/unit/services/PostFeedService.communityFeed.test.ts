import { describe, it, expect, jest } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — ce que `getCommunityFeed` sert, et
 * à qui. La loi est celle du détail (`GET /communities/:id`) : une communauté
 * désactivée n'existe plus pour personne, une communauté privée ne se lit que
 * par ses membres actifs et son créateur. Un non-membre d'une communauté
 * publique lit ses publications PUBLIC ; un membre y ajoute les COMMUNITY. Un
 * blocage, dans un sens ou dans l'autre, retire l'auteur de la liste.
 */

const COMMUNITY_ID = '507f1f77bcf86cd799439044';

type CommunityRow = { readonly isPrivate: boolean; readonly createdBy: string } | null;

function makePrisma(options: {
  readonly community?: CommunityRow;
  readonly activeMember?: boolean;
  readonly blockedByViewer?: readonly string[];
  readonly blockersOfViewer?: readonly string[];
  readonly communityLookupFails?: boolean;
} = {}) {
  const community = options.community === undefined ? { isPrivate: false, createdBy: 'creator-1' } : options.community;
  return {
    post: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    postReaction: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    postBookmark: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    community: {
      findFirst: options.communityLookupFails
        ? jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('mongo down'))
        : jest.fn<() => Promise<unknown>>().mockResolvedValue(community),
    },
    communityMember: {
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(options.activeMember ? { id: 'm1' } : null),
    },
    user: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ blockedUserIds: [...(options.blockedByViewer ?? [])] }),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue((options.blockersOfViewer ?? []).map((id) => ({ id }))),
    },
  };
}

type Prisma = ReturnType<typeof makePrisma>;

const serve = async (prisma: Prisma, viewer: string | undefined) =>
  new PostFeedService(prisma as never).getCommunityFeed(COMMUNITY_ID, viewer);

const postWhere = (prisma: Prisma) => {
  const call = prisma.post.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }] | undefined;
  return call?.[0].where;
};

describe('PostFeedService.getCommunityFeed — qui lit quoi', () => {
  it('un membre actif lit les publications PUBLIC et COMMUNITY', async () => {
    const prisma = makePrisma({ activeMember: true });
    await serve(prisma, 'viewer-1');
    expect(postWhere(prisma)?.visibility).toEqual({ in: ['PUBLIC', 'COMMUNITY'] });
  });

  it('le créateur sans ligne active lit aussi les publications COMMUNITY', async () => {
    const prisma = makePrisma({ community: { isPrivate: true, createdBy: 'viewer-1' }, activeMember: false });
    await serve(prisma, 'viewer-1');
    expect(postWhere(prisma)?.visibility).toEqual({ in: ['PUBLIC', 'COMMUNITY'] });
  });

  it('un non-membre d’une communauté publique ne lit que les publications PUBLIC', async () => {
    const prisma = makePrisma({ activeMember: false });
    await serve(prisma, 'viewer-1');
    expect(postWhere(prisma)?.visibility).toBe('PUBLIC');
  });

  it('un visiteur sans compte d’une communauté publique ne lit que les publications PUBLIC', async () => {
    const prisma = makePrisma();
    await serve(prisma, undefined);
    expect(postWhere(prisma)?.visibility).toBe('PUBLIC');
    expect(prisma.communityMember.findFirst).not.toHaveBeenCalled();
  });

  it('un non-membre d’une communauté PRIVÉE ne lit rien, pas même une publication PUBLIC', async () => {
    const prisma = makePrisma({ community: { isPrivate: true, createdBy: 'creator-1' }, activeMember: false });
    const result = await serve(prisma, 'viewer-1');
    expect(result).toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('un visiteur sans compte d’une communauté PRIVÉE ne lit rien', async () => {
    const prisma = makePrisma({ community: { isPrivate: true, createdBy: 'creator-1' } });
    const result = await serve(prisma, undefined);
    expect(result.items).toEqual([]);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('une communauté désactivée ou inconnue ne sert rien, même à un ancien membre', async () => {
    const prisma = makePrisma({ community: null, activeMember: true });
    const result = await serve(prisma, 'viewer-1');
    expect(result).toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('la communauté se cherche VIVANTE (isActive), par son identifiant', async () => {
    const prisma = makePrisma();
    await serve(prisma, 'viewer-1');
    const call = prisma.community.findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(call[0].where).toEqual({ id: COMMUNITY_ID, isActive: true });
  });

  it('une panne de la lecture de la communauté ne sert rien (elle lève, jamais un fil ouvert)', async () => {
    const prisma = makePrisma({ communityLookupFails: true });
    await expect(serve(prisma, 'viewer-1')).rejects.toThrow('mongo down');
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('une panne de la lecture d’adhésion d’une communauté privée ne sert rien', async () => {
    const prisma = makePrisma({ community: { isPrivate: true, createdBy: 'creator-1' } });
    prisma.communityMember.findFirst.mockRejectedValue(new Error('mongo down'));
    const result = await serve(prisma, 'viewer-1');
    expect(result.items).toEqual([]);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});

describe('PostFeedService.getCommunityFeed — un identifiant malformé', () => {
  it('ne lit rien et ne lève pas (le connecteur MongoDB rendrait un 500)', async () => {
    const prisma = makePrisma({ activeMember: true });
    const result = await new PostFeedService(prisma as never).getCommunityFeed('pas-un-objectid', 'viewer-1');
    expect(result.items).toEqual([]);
    expect(prisma.community.findFirst).not.toHaveBeenCalled();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});

describe('PostFeedService.getCommunityFeed — un blocage retire l’auteur', () => {
  it('les auteurs que le lecteur a bloqués et ceux qui l’ont bloqué ne sont pas lus', async () => {
    const prisma = makePrisma({ activeMember: true, blockedByViewer: ['blocked-1'], blockersOfViewer: ['blocker-1'] });
    await serve(prisma, 'viewer-1');
    const where = postWhere(prisma);
    expect(where?.authorId).toEqual({ notIn: expect.arrayContaining(['blocked-1', 'blocker-1']) });
  });

  it('sans aucun blocage, la requête ne porte aucune exclusion d’auteur', async () => {
    const prisma = makePrisma({ activeMember: true });
    await serve(prisma, 'viewer-1');
    expect(postWhere(prisma)).not.toHaveProperty('authorId');
  });

  it('un visiteur sans compte ne lit aucun blocage', async () => {
    const prisma = makePrisma();
    await serve(prisma, undefined);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(postWhere(prisma)).not.toHaveProperty('authorId');
  });
});
