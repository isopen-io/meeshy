/**
 * Une publication `COMMUNITY` posée DANS une communauté (`Post.communityId`) ne se
 * lit que par les membres actifs de CETTE communauté et par son créateur — sur
 * toutes les portes (#16892). La règle « l'auteur partage UNE communauté
 * quelconque avec le lecteur » ne vaut que pour une publication sans communauté.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import { buildPostVisibilityOrFilter, canUserViewPost, type PostVisibilityRecord } from '../postVisibility';
import { getReadableCommunityIds, isCommunityReadableBy } from '../communityVisibility';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const COMMUNITY_X = '64b000000000000000000001';
const COMMUNITY_Y = '64b000000000000000000002';

const post = (overrides: MongoDocument = {}): MongoDocument => ({
  id: 'post-1',
  authorId: 'alice',
  visibility: PostVisibility.COMMUNITY,
  visibilityUserIds: [],
  ...overrides,
});

describe('filtre de liste — publication COMMUNITY rattachée à une communauté', () => {
  const visibleTo = (
    viewer: string,
    doc: MongoDocument,
    reach: { coMemberIds?: string[]; communityIds?: string[] },
  ) =>
    matchesMongoWhere(
      doc,
      buildPostVisibilityOrFilter(viewer, [], reach.coMemberIds ?? [], [], undefined, reach.communityIds ?? []) as MongoDocument,
    );

  it('un co-membre d’une AUTRE communauté de l’auteur ne la lit pas', () => {
    expect(visibleTo('bob', post({ communityId: COMMUNITY_X }), { coMemberIds: ['alice'], communityIds: [COMMUNITY_Y] })).toBe(false);
  });

  it('un membre de cette communauté la lit, même s’il n’y côtoie plus l’auteur', () => {
    expect(visibleTo('carol', post({ communityId: COMMUNITY_X }), { coMemberIds: [], communityIds: [COMMUNITY_X] })).toBe(true);
  });

  it('sans communauté lisible, personne d’autre que l’auteur', () => {
    expect(visibleTo('bob', post({ communityId: COMMUNITY_X }), {})).toBe(false);
    expect(visibleTo('alice', post({ communityId: COMMUNITY_X }), {})).toBe(true);
  });

  it('une publication COMMUNITY SANS communauté garde la règle du co-membre — champ nul ou absent', () => {
    expect(visibleTo('bob', post({ communityId: null }), { coMemberIds: ['alice'] })).toBe(true);
    expect(visibleTo('bob', post(), { coMemberIds: ['alice'] })).toBe(true);
    expect(visibleTo('dan', post(), { coMemberIds: [] })).toBe(false);
  });

  it('une publication PUBLIC rattachée à une communauté reste servie comme avant (#16893)', () => {
    expect(visibleTo('dan', post({ visibility: PostVisibility.PUBLIC, communityId: COMMUNITY_X }), {})).toBe(true);
  });
});

const record = (overrides: Partial<PostVisibilityRecord> = {}): PostVisibilityRecord => ({
  id: 'post-1',
  authorId: 'alice',
  visibility: PostVisibility.COMMUNITY,
  visibilityUserIds: [],
  expiresAt: null,
  communityId: COMMUNITY_X,
  ...overrides,
});

const aclPrisma = (opts: {
  community?: { createdBy: string } | null;
  membership?: { id: string } | null;
  sharesAnyCommunity?: boolean;
}) => ({
  community: { findFirst: jest.fn<any>().mockResolvedValue(opts.community === undefined ? { createdBy: 'zoe' } : opts.community) },
  communityMember: {
    findMany: jest.fn<any>().mockResolvedValue(opts.sharesAnyCommunity ? [{ communityId: COMMUNITY_Y }] : []),
    findFirst: jest.fn<any>().mockImplementation((args: { where: { communityId?: unknown } }) =>
      Promise.resolve(args.where.communityId === COMMUNITY_X ? (opts.membership ?? null) : opts.sharesAnyCommunity ? { id: 'm-y' } : null),
    ),
  },
  userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
});

describe('verdict unitaire — publication COMMUNITY rattachée à une communauté', () => {
  it('refuse un co-membre d’une autre communauté de l’auteur', async () => {
    const prisma = aclPrisma({ sharesAnyCommunity: true, membership: null });
    expect(await canUserViewPost(prisma as any, record(), 'bob')).toBe(false);
  });

  it('admet un membre actif de cette communauté', async () => {
    const prisma = aclPrisma({ membership: { id: 'm-x' } });
    expect(await canUserViewPost(prisma as any, record(), 'carol')).toBe(true);
  });

  it('admet le créateur de la communauté sans ligne de membre', async () => {
    const prisma = aclPrisma({ community: { createdBy: 'zoe' }, membership: null });
    expect(await canUserViewPost(prisma as any, record(), 'zoe')).toBe(true);
  });

  it('refuse tout le monde sauf l’auteur quand la communauté est désactivée ou absente', async () => {
    const prisma = aclPrisma({ community: null, membership: { id: 'm-x' } });
    expect(await canUserViewPost(prisma as any, record(), 'carol')).toBe(false);
    expect(await canUserViewPost(prisma as any, record(), 'alice')).toBe(true);
  });

  it('une panne de lecture vaut un refus', async () => {
    const prisma = aclPrisma({});
    prisma.community.findFirst.mockRejectedValue(new Error('down'));
    expect(await canUserViewPost(prisma as any, record(), 'carol')).toBe(false);
  });

  it('sans communauté, la règle du co-membre reste', async () => {
    const prisma = aclPrisma({ sharesAnyCommunity: true });
    expect(await canUserViewPost(prisma as any, record({ communityId: null }), 'bob')).toBe(true);
    expect(prisma.community.findFirst).not.toHaveBeenCalled();
  });
});

describe('getReadableCommunityIds', () => {
  it('rend les communautés vivantes dont le lecteur est membre actif ou créateur, sans doublon', async () => {
    const prisma = {
      communityMember: { findMany: jest.fn<any>().mockResolvedValue([{ communityId: COMMUNITY_X }]) },
      community: { findMany: jest.fn<any>().mockResolvedValue([{ id: COMMUNITY_X }, { id: COMMUNITY_Y }]) },
    };
    expect((await getReadableCommunityIds(prisma as any, 'carol')).sort()).toEqual([COMMUNITY_X, COMMUNITY_Y]);
    expect(prisma.communityMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'carol', isActive: true, community: { isActive: true } } }),
    );
    expect(prisma.community.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: 'carol', isActive: true } }),
    );
  });

  it('une panne rend une liste vide', async () => {
    const prisma = {
      communityMember: { findMany: jest.fn<any>().mockRejectedValue(new Error('down')) },
      community: { findMany: jest.fn<any>().mockResolvedValue([{ id: COMMUNITY_X }]) },
    };
    expect(await getReadableCommunityIds(prisma as any, 'carol')).toEqual([]);
  });
});

describe('isCommunityReadableBy', () => {
  it('refuse un identifiant malformé sans lire la base', async () => {
    const prisma = { community: { findFirst: jest.fn() }, communityMember: { findFirst: jest.fn() } };
    expect(await isCommunityReadableBy(prisma as any, 'not-an-id', 'carol')).toBe(false);
    expect(prisma.community.findFirst).not.toHaveBeenCalled();
  });
});
