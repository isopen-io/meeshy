/**
 * Un ANCIEN membre (`CommunityMember.isActive: false`, laissé par `POST /leave`
 * ou un retrait) n'est plus membre nulle part (#16603).
 *
 * #6378 a fermé le détail ; la liste, les conversations d'une communauté et le
 * rattachement d'une conversation décidaient encore « membre » sur l'EXISTENCE
 * d'une ligne, jamais sur son activité : un ancien membre voyait toujours les
 * communautés PRIVÉES qu'il avait quittées, et un ancien administrateur pouvait
 * encore y rattacher — ou en détacher — une conversation. Le compteur de la
 * liste comptait les partis quand le détail ne les comptait plus.
 *
 * Le double Prisma ci-dessous HONORE les `where` posés sur la relation
 * `members` (`some`, `include.where`, `_count.where`) : une garde qui vit dans
 * un `where` n'est visible d'un témoin que si le faux applique ce `where`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((text: string) => text) },
}));

import { registerCoreRoutes } from '../../../routes/communities/core';

const ALICE = '507f1f77bcf86cd799430011';
const BOB = '507f1f77bcf86cd799430012';
const CAROL = '507f1f77bcf86cd799430013';

const LEFT_PRIVATE = '507f1f77bcf86cd799430021';
const STILL_PRIVATE = '507f1f77bcf86cd799430022';
const OWN = '507f1f77bcf86cd799430023';
const SOURCE_LEFT = '507f1f77bcf86cd799430024';
const SOURCE_KEPT = '507f1f77bcf86cd799430025';

const CONV_FROM_LEFT_SOURCE = '507f1f77bcf86cd799430031';
const CONV_FROM_KEPT_SOURCE = '507f1f77bcf86cd799430032';

type Row = Record<string, unknown>;
type Membership = { readonly communityId: string; readonly userId: string; readonly role: string; readonly isActive: boolean };

const community = (id: string, createdBy: string, name: string): Row => ({
  id,
  identifier: `mshy_${id.slice(-4)}`,
  name,
  description: null,
  avatar: null,
  isPrivate: true,
  isActive: true,
  createdBy,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  creator: { id: createdBy, username: 'u', displayName: 'U', avatar: null },
});

const COMMUNITIES: readonly Row[] = [
  community(LEFT_PRIVATE, BOB, 'Quittée'),
  community(STILL_PRIVATE, BOB, 'Gardée'),
  community(OWN, ALICE, 'La mienne'),
  community(SOURCE_LEFT, BOB, 'Source quittée'),
  community(SOURCE_KEPT, BOB, 'Source gardée'),
];

const MEMBERSHIPS: readonly Membership[] = [
  { communityId: LEFT_PRIVATE, userId: BOB, role: 'admin', isActive: true },
  { communityId: LEFT_PRIVATE, userId: ALICE, role: 'admin', isActive: false },
  { communityId: STILL_PRIVATE, userId: BOB, role: 'admin', isActive: true },
  { communityId: STILL_PRIVATE, userId: ALICE, role: 'member', isActive: true },
  { communityId: OWN, userId: ALICE, role: 'admin', isActive: true },
  { communityId: OWN, userId: CAROL, role: 'member', isActive: false },
  { communityId: SOURCE_LEFT, userId: ALICE, role: 'admin', isActive: false },
  { communityId: SOURCE_KEPT, userId: ALICE, role: 'admin', isActive: true },
];

const conversation = (id: string, communityId: string): Row => ({
  id,
  communityId,
  participants: [{ userId: ALICE, role: 'admin', isActive: true }],
});

const CONVERSATIONS: readonly Row[] = [
  conversation(CONV_FROM_LEFT_SOURCE, SOURCE_LEFT),
  conversation(CONV_FROM_KEPT_SOURCE, SOURCE_KEPT),
];

const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

function memberMatches(member: Membership, where: unknown): boolean {
  if (!isObject(where)) return true;
  return Object.entries(where).every(([key, value]) => (member as unknown as Row)[key] === value);
}

const membersOf = (communityId: string, where: unknown): Membership[] =>
  MEMBERSHIPS.filter((m) => m.communityId === communityId && memberMatches(m, where));

function communityMatches(row: Row, where: unknown): boolean {
  if (!isObject(where)) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as unknown[]).some((clause) => communityMatches(row, clause));
    if (key === 'AND') return (value as unknown[]).every((clause) => communityMatches(row, clause));
    if (key === 'members') return membersOf(row.id as string, (value as Row).some).length > 0;
    if (isObject(value)) return true;
    return row[key] === value;
  });
}

function relationArgs(shape: unknown): Row | undefined {
  return isObject(shape) ? shape : undefined;
}

function project(row: Row, shape: Row | undefined): Row {
  const membersShape = shape?.members;
  const countShape = relationArgs(relationArgs(shape?._count)?.select);
  const members = membersShape
    ? membersOf(row.id as string, relationArgs(membersShape)?.where)
        .slice(0, (relationArgs(membersShape)?.take as number | undefined) ?? Infinity)
        .map((m) => ({ ...m, user: { id: m.userId, username: 'u', displayName: 'U', avatar: null } }))
    : undefined;
  const count = countShape
    ? { members: membersOf(row.id as string, relationArgs(countShape.members)?.where).length, Conversation: 0 }
    : undefined;
  return { ...row, ...(members ? { members } : {}), ...(count ? { _count: count } : {}) };
}

function makePrisma() {
  const read = (args: { where?: Row; include?: Row; select?: Row }) =>
    COMMUNITIES.filter((row) => communityMatches(row, args.where)).map((row) => project(row, args.include ?? args.select));
  return {
    community: {
      findMany: jest.fn<any>(async (args: { where?: Row; include?: Row }) => read(args)),
      count: jest.fn<any>(async (args: { where?: Row }) => read(args).length),
      findFirst: jest.fn<any>(async (args: { where?: Row; include?: Row; select?: Row }) => read(args)[0] ?? null),
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      findFirst: jest.fn<any>(async (args: { where: Row }) => CONVERSATIONS.find((c) => c.id === args.where.id) ?? null),
      update: jest.fn<any>(async (args: { where: Row; data: Row }) => ({
        ...CONVERSATIONS.find((c) => c.id === args.where.id),
        ...args.data,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        participants: [],
        _count: { messages: 0, participants: 1 },
      })),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]), findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: ALICE,
      hasFullAccess: true,
      registeredUser: { id: ALICE, username: 'alice', displayName: 'Alice', role: 'USER' },
    };
  });
  app.decorate('prisma', makePrisma());
  await registerCoreRoutes(app);
  await app.ready();
  return app;
}

describe('GET /communities — la liste de mes communautés', () => {
  it('ne montre plus une communauté privée que j’ai quittée, et garde celles où je suis encore', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/communities' });
    const ids = JSON.parse(res.body).data.map((row: Row) => row.id);

    expect(res.statusCode).toBe(200);
    expect(ids).not.toContain(LEFT_PRIVATE);
    expect(ids).toContain(STILL_PRIVATE);
    expect(ids).toContain(OWN);
    await app.close();
  });

  it('le total de pagination tait aussi la communauté quittée', async () => {
    const app = await build();
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/communities' })).body);

    expect(body.pagination.total).toBe(body.data.length);
    await app.close();
  });

  it('compte les seuls membres actifs, comme le détail', async () => {
    const app = await build();
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/communities' })).body);
    const own = body.data.find((row: Row) => row.id === OWN);

    expect(own.memberCount).toBe(1);
    await app.close();
  });

  it('dit à chaque carte le rôle actif du lecteur, comme le détail', async () => {
    const app = await build();
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/communities' })).body);
    const role = (id: string) => body.data.find((row: Row) => row.id === id)?.currentUserRole;

    expect(role(STILL_PRIVATE)).toBe('member');
    expect(role(OWN)).toBe('admin');
    await app.close();
  });
});

describe('GET /communities/:id/conversations — les salons d’une communauté', () => {
  it('refuse (403) une communauté privée quittée', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: `/communities/${LEFT_PRIVATE}/conversations` });

    expect(res.statusCode).toBe(403);
    expect((app as any).prisma.conversation.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('reste ouverte à un membre actif — le témoin miroir', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: `/communities/${STILL_PRIVATE}/conversations` });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /communities/:id/conversations/:conversationId — rattacher un salon', () => {
  it('refuse (403) un ANCIEN administrateur de la communauté cible, sans rien écrire', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${LEFT_PRIVATE}/conversations/${CONV_FROM_KEPT_SOURCE}`,
    });

    expect(res.statusCode).toBe(403);
    expect((app as any).prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse (403) de détacher un salon d’une communauté source dont je ne suis plus administrateur', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${OWN}/conversations/${CONV_FROM_LEFT_SOURCE}`,
    });

    expect(res.statusCode).toBe(403);
    expect((app as any).prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('déplace un salon quand j’administre activement la cible et la source — le témoin miroir', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${OWN}/conversations/${CONV_FROM_KEPT_SOURCE}`,
    });

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.conversation.update).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
