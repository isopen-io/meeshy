/**
 * Le détail d'une communauté dit au LECTEUR ce qu'il y est (#6378).
 *
 * iOS (`CommunityDetailViewModel.applyMembership`) et Android
 * (`CommunityMembership.resolve`) décidaient « Rejoindre » ou « Quitter » en
 * cherchant le lecteur dans `members[]` — que `flattenCommunityCounts` retire
 * et que `communitySchema` ne déclare pas. Un membre non créateur se voyait
 * donc offrir « Rejoindre » (409) et jamais « Quitter ». Le détail sert
 * désormais `currentUserRole` : le rôle ACTIF du lecteur, `admin` pour le
 * créateur, `null` sinon.
 *
 * Et un départ ferme la porte : une ligne `isActive: false` (laissée par
 * POST /leave) ne donne plus accès à une communauté privée.
 *
 * Le faux Prisma APPLIQUE le `where` imbriqué que la route demande : la loi
 * se lit sur ce que la base rendrait, pas sur la forme de la requête.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

import { communityRoutes } from '../../../../routes/communities/index';

type MemberRow = { readonly userId: string; readonly role: string; readonly isActive: boolean };
type CommunityRow = {
  readonly id: string;
  readonly identifier: string;
  readonly isPrivate: boolean;
  readonly createdBy: string;
  readonly members: readonly MemberRow[];
};

type MemberWhere = { userId?: string; isActive?: boolean };
type FindArgs = {
  where: { id?: string; identifier?: string; isActive?: boolean };
  include?: {
    members?: boolean | { where?: MemberWhere; take?: number };
    _count?: { select: { members?: boolean | { where?: MemberWhere } } };
  };
};

const CREATOR = 'u-creator';
const MEMBER = 'u-member';
const MODERATOR = 'u-moderator';
const FORMER = 'u-former';
const STRANGER = 'u-stranger';

const community = (overrides: Partial<CommunityRow> = {}): CommunityRow => ({
  id: 'comm-1',
  identifier: 'mshy_club',
  isPrivate: false,
  createdBy: CREATOR,
  members: [
    { userId: CREATOR, role: 'admin', isActive: true },
    { userId: MEMBER, role: 'member', isActive: true },
    { userId: MODERATOR, role: 'moderator', isActive: true },
    { userId: FORMER, role: 'member', isActive: false },
  ],
  ...overrides,
});

const matches = (row: MemberRow, where: MemberWhere | undefined) =>
  (where?.userId === undefined || where.userId === row.userId) &&
  (where?.isActive === undefined || where.isActive === row.isActive);

const fakePrisma = (row: CommunityRow) => {
  const findFirst = jest.fn(async (args: FindArgs) => {
    const found = args.where.id === row.id || args.where.identifier === row.identifier;
    if (!found) return null;
    const memberInclude = args.include?.members;
    const memberWhere = typeof memberInclude === 'object' ? memberInclude.where : undefined;
    const countInclude = args.include?._count?.select.members;
    const countWhere = typeof countInclude === 'object' ? countInclude.where : undefined;
    return {
      id: row.id,
      identifier: row.identifier,
      name: 'Club',
      isPrivate: row.isPrivate,
      isActive: true,
      createdBy: row.createdBy,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      creator: { id: CREATOR, username: 'alice', displayName: 'Alice', avatar: null },
      members: row.members.filter((member) => matches(member, memberWhere)).map((member) => ({
        ...member,
        user: { id: member.userId, username: member.userId, displayName: null, avatar: null, isOnline: true },
      })),
      _count: { members: row.members.filter((member) => matches(member, countWhere)).length, Conversation: 2 },
    };
  });
  return { community: { findFirst }, communityMember: {}, conversation: {}, user: {} };
};

const detailAs = async (viewer: string, row: CommunityRow, path = row.id) => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', fakePrisma(row) as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      userId: viewer,
      registeredUser: { id: viewer },
    };
  });
  await app.register(communityRoutes);
  await app.ready();
  const response = await app.inject({ method: 'GET', url: `/communities/${path}` });
  await app.close();
  return response;
};

describe('GET /communities/:id — le rôle du lecteur', () => {
  it.each([
    [MEMBER, 'member'],
    [MODERATOR, 'moderator'],
    [CREATOR, 'admin'],
  ])('%s lit son rôle actif : %s', async (viewer, role) => {
    const response = await detailAs(viewer, community());
    expect(response.statusCode).toBe(200);
    expect(response.json().data.currentUserRole).toBe(role);
  });

  it('le créateur sans ligne de membre reste administrateur', async () => {
    const response = await detailAs(CREATOR, community({ members: [] }));
    expect(response.json().data.currentUserRole).toBe('admin');
  });

  it('un non-membre lit une communauté publique, sans rôle', async () => {
    const response = await detailAs(STRANGER, community());
    expect(response.statusCode).toBe(200);
    expect(response.json().data.currentUserRole).toBeNull();
  });

  it('un ancien membre lit une communauté publique, sans rôle : son départ compte', async () => {
    const response = await detailAs(FORMER, community());
    expect(response.json().data.currentUserRole).toBeNull();
  });

  it('le rôle se sert aussi quand le lien porte l’identifiant', async () => {
    const response = await detailAs(MEMBER, community(), 'mshy_club');
    expect(response.json().data.currentUserRole).toBe('member');
  });
});

describe('GET /communities/:id — communauté privée', () => {
  it('un membre actif y entre', async () => {
    const response = await detailAs(MEMBER, community({ isPrivate: true }));
    expect(response.statusCode).toBe(200);
  });

  it('un étranger est refusé', async () => {
    const response = await detailAs(STRANGER, community({ isPrivate: true }));
    expect(response.statusCode).toBe(403);
  });

  it('un ancien membre est refusé : quitter ferme la porte', async () => {
    const response = await detailAs(FORMER, community({ isPrivate: true }));
    expect(response.statusCode).toBe(403);
  });
});

describe('GET /communities/:id — ce qui part à côté', () => {
  it('ne sert ni la liste des membres ni leur présence', async () => {
    const response = await detailAs(MEMBER, community());
    const data = response.json().data;
    expect(data.members).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('isOnline');
    expect(JSON.stringify(data)).not.toContain(MODERATOR);
  });

  it('le compteur ne compte que les membres actifs', async () => {
    const response = await detailAs(MEMBER, community());
    expect(response.json().data.memberCount).toBe(3);
  });
});
