/**
 * #9204 — `DELETE /communities/:id` par son créateur rendait 500.
 *
 * Sur MongoDB, Prisma ÉMULE les actions référentielles côté client. Une relation
 * REQUISE sans `onDelete` vaut `Restrict` : tant qu'une ligne enfant pointe la
 * communauté, `community.delete` lève P2014. Le créateur étant inscrit membre
 * ADMIN à la création, toute suppression échouait. Ce témoin rejoue cette
 * émulation à partir du schéma RÉEL (lu sur disque), pour qu'une relation
 * ajoutée demain sans action de suppression rougisse ici plutôt qu'en staging.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { registerSettingsRoutes } from '../../../routes/communities/settings';

const CREATOR_ID = '507f1f77bcf86cd799439011';
const MEMBER_ID = '507f1f77bcf86cd799439033';
const COMMUNITY_ID = '507f1f77bcf86cd799439044';
const OTHER_COMMUNITY_ID = '507f1f77bcf86cd799439055';

type ReferentialAction = 'Restrict' | 'Cascade' | 'SetNull';
type CommunityRelation = { model: string; field: string; action: ReferentialAction };
type Row = Record<string, unknown> & { id: string };

const SCHEMA_PATH = join(__dirname, '../../../../../../packages/shared/prisma/schema.prisma');

function communityRelationsFromSchema(): readonly CommunityRelation[] {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  return models.flatMap(([, model, body]) =>
    [...body.matchAll(/^\s*\w+\s+Community(\??)\s+@relation\(([^)]*)\)/gm)].map(([, optional, args]) => {
      const field = /fields:\s*\[(\w+)\]/.exec(args)?.[1] ?? '';
      const declared = /onDelete:\s*(\w+)/.exec(args)?.[1];
      const action: ReferentialAction =
        declared === 'Cascade' ? 'Cascade'
          : declared === 'SetNull' ? 'SetNull'
            : declared === undefined && optional === '?' ? 'SetNull'
              : 'Restrict';
      return { model, field, action };
    }),
  );
}

const accessorOf = (model: string): string => model.charAt(0).toLowerCase() + model.slice(1);

const matches = (row: Row, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([key, value]) => row[key] === value);

function makeEmulatedPrisma(seed: Record<string, Row[]>) {
  const relations = communityRelationsFromSchema();
  const tables = new Map<string, Row[]>(
    relations.map(({ model }) => [accessorOf(model), [...(seed[accessorOf(model)] ?? [])]]),
  );
  const communities: Row[] = [...(seed.community ?? [])];

  const tableClient = (name: string) => ({
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const rows = tables.get(name) ?? [];
      const hit = rows.filter((row) => matches(row, where));
      tables.set(name, rows.map((row) => (matches(row, where) ? { ...row, ...data } : row)));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const rows = tables.get(name) ?? [];
      tables.set(name, rows.filter((row) => !matches(row, where)));
      return { count: rows.length - (tables.get(name) ?? []).length };
    }),
  });

  const deleteCommunity = jest.fn(async ({ where }: { where: { id: string } }) => {
    const blocking = relations.find(({ model, field, action }) =>
      action === 'Restrict' && (tables.get(accessorOf(model)) ?? []).some((row) => row[field] === where.id));
    if (blocking) {
      throw Object.assign(
        new Error(`The change you are trying to make would violate the required relation between the \`${blocking.model}\` and \`Community\` models.`),
        { code: 'P2014' },
      );
    }
    relations.forEach(({ model, field, action }) => {
      const name = accessorOf(model);
      const rows = tables.get(name) ?? [];
      tables.set(name, action === 'Cascade'
        ? rows.filter((row) => row[field] !== where.id)
        : rows.map((row) => (row[field] === where.id ? { ...row, [field]: null } : row)));
    });
    const index = communities.findIndex((row) => row.id === where.id);
    const [removed] = communities.splice(index, 1);
    return removed;
  });

  const client: Record<string, unknown> = {
    community: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        communities.find((row) => row.id === where.id) ?? null),
      delete: deleteCommunity,
    },
    ...Object.fromEntries([...tables.keys()].map((name) => [name, tableClient(name)])),
  };
  client.$transaction = jest.fn(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(client) : Promise.all(arg as Promise<unknown>[]));

  return { client, rows: (name: string) => tables.get(name) ?? [], communities: () => communities };
}

const seedWith = (extra: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  community: [
    { id: COMMUNITY_ID, createdBy: CREATOR_ID },
    { id: OTHER_COMMUNITY_ID, createdBy: MEMBER_ID },
  ],
  communityMember: [
    { id: 'm1', communityId: COMMUNITY_ID, userId: CREATOR_ID, role: 'admin' },
    { id: 'm2', communityId: COMMUNITY_ID, userId: MEMBER_ID, role: 'member' },
    { id: 'm3', communityId: OTHER_COMMUNITY_ID, userId: MEMBER_ID, role: 'admin' },
  ],
  userCommunityPreferences: [
    { id: 'p1', communityId: COMMUNITY_ID, userId: MEMBER_ID },
    { id: 'p2', communityId: OTHER_COMMUNITY_ID, userId: MEMBER_ID },
  ],
  ...extra,
});

async function buildApp(prisma: unknown, userId = CREATOR_ID): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId, registeredUser: { id: userId, role: 'USER' } };
  });
  app.decorate('prisma', prisma as any);
  await app.register(registerSettingsRoutes);
  await app.ready();
  return app;
}

describe('DELETE /communities/:id — le créateur supprime sa communauté (#9204)', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => { await app?.close(); app = undefined; });

  it('le schéma déclare au moins une relation REQUISE vers Community sans cascade — la cause du 500', () => {
    const restricting = communityRelationsFromSchema().filter(({ action }) => action === 'Restrict');
    expect(restricting.map(({ model }) => model)).toContain('CommunityMember');
  });

  it('rend 200 sans channel, et ne laisse ni membre ni préférence de cette communauté', async () => {
    const prisma = makeEmulatedPrisma(seedWith());
    app = await buildApp(prisma.client);

    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { message: 'Community deleted successfully' } });
    expect(prisma.communities().map(({ id }) => id)).toEqual([OTHER_COMMUNITY_ID]);
    expect(prisma.rows('communityMember').map(({ id }) => id)).toEqual(['m3']);
    expect(prisma.rows('userCommunityPreferences').map(({ id }) => id)).toEqual(['p2']);
  });

  it('rend 200 avec un channel, et le channel survit DÉTACHÉ de la communauté', async () => {
    const prisma = makeEmulatedPrisma(seedWith({
      conversation: [
        { id: 'c1', communityId: COMMUNITY_ID, title: 'Itinéraires' },
        { id: 'c2', communityId: OTHER_COMMUNITY_ID, title: 'Ailleurs' },
      ],
      conversationShare: [
        { id: 's1', communityId: COMMUNITY_ID, conversationId: 'c9' },
      ],
    }));
    app = await buildApp(prisma.client);

    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });

    expect(res.statusCode).toBe(200);
    expect(prisma.rows('conversation')).toEqual([
      { id: 'c1', communityId: null, title: 'Itinéraires' },
      { id: 'c2', communityId: OTHER_COMMUNITY_ID, title: 'Ailleurs' },
    ]);
    expect(prisma.rows('conversationShare')).toEqual([]);
  });

  it('un membre qui n’est pas le créateur reçoit 403 et rien ne bouge', async () => {
    const prisma = makeEmulatedPrisma(seedWith());
    app = await buildApp(prisma.client, MEMBER_ID);

    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });

    expect(res.statusCode).toBe(403);
    expect(prisma.rows('communityMember')).toHaveLength(3);
    expect(prisma.rows('userCommunityPreferences')).toHaveLength(2);
  });
});
