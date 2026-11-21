/**
 * `DELETE /communities/:id` diffuse `community:deleted` (#19590) — et RIEN
 * quand la suppression n'a pas lieu. Le témoin traverse la vraie route, le vrai
 * `broadcastToUser` et la vraie porte d'émission : il assert sur le COUPLE
 * (événement, charge) reçu par chaque room. Le faux Prisma EFFACE vraiment les
 * appartenances dans la transaction : une audience lue après l'écriture
 * serait vide.
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

const CREATOR = '6650b0000000000000000001';
const MEMBER = '6650b0000000000000000002';
const FORMER = '6650b0000000000000000003';
const COMMUNITY_ID = '6650b0000000000000000010';

type Emitted = { readonly room: string; readonly event: string; readonly payload: unknown };

function makePrisma(options: { readonly communityActive?: boolean } = {}) {
  const state = {
    communityActive: options.communityActive ?? true,
    members: [
      { communityId: COMMUNITY_ID, userId: CREATOR, isActive: true },
      { communityId: COMMUNITY_ID, userId: MEMBER, isActive: true },
      { communityId: COMMUNITY_ID, userId: FORMER, isActive: false },
    ],
    deleted: false,
  };
  const row = () => ({ id: COMMUNITY_ID, isActive: state.communityActive, createdBy: CREATOR, name: 'ne part jamais' });
  return {
    state,
    community: {
      findFirst: jest.fn(async (args: { where: { id: string; isActive?: boolean }; select: Record<string, boolean> }) => {
        const full = row();
        if (state.deleted || args.where.id !== COMMUNITY_ID) return null;
        if (args.where.isActive !== undefined && full.isActive !== args.where.isActive) return null;
        return Object.fromEntries(Object.entries(full).filter(([key]) => args.select[key] === true));
      }),
      delete: jest.fn(async () => { state.deleted = true; return row(); }),
    },
    communityMember: {
      findMany: jest.fn(async (args: { where: { communityId: string; isActive?: boolean } }) =>
        state.members
          .filter((m) => m.communityId === args.where.communityId && (args.where.isActive === undefined || m.isActive === args.where.isActive))
          .map((m) => ({ userId: m.userId }))),
      deleteMany: jest.fn(async () => { const count = state.members.length; state.members = []; return { count }; }),
    },
    conversation: { updateMany: jest.fn(async () => ({ count: 0 })), findMany: jest.fn(async () => []) },
    userCommunityPreferences: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    conversationShare: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (operations: ReadonlyArray<Promise<unknown>>) => Promise.all(operations)),
  };
}

async function buildApp(viewer: string, options: { readonly communityActive?: boolean } = {}) {
  const emitted: Emitted[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); return true; } }) };
  const prisma = makePrisma(options);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', { io } as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = { isAuthenticated: true, userId: viewer, registeredUser: { id: viewer } };
  });
  await app.register(communityRoutes);
  await app.ready();
  return { app, emitted, prisma };
}

const settle = () => new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));

describe('DELETE /communities/:id — community:deleted (#19590)', () => {
  it('le créateur supprime : chaque membre actif et le créateur apprennent la disparition, lue AVANT l’effacement', async () => {
    const { app, emitted, prisma } = await buildApp(CREATOR);
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    await settle();

    expect(res.statusCode).toBe(200);
    expect(prisma.state.deleted).toBe(true);
    const deletions = emitted.filter((e) => e.event === 'community:deleted');
    expect(deletions.map((e) => e.room).sort()).toEqual([`user:${CREATOR}`, `user:${MEMBER}`].sort());
    const payload = deletions[0]?.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['at', 'communityId', 'reason']);
    expect(payload).toMatchObject({ communityId: COMMUNITY_ID, reason: 'deleted' });
    expect(typeof payload.at).toBe('string');
    await app.close();
  });

  it("un membre qui n'est pas créateur : 403, rien n'est effacé ni diffusé", async () => {
    const { app, emitted, prisma } = await buildApp(MEMBER);
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    await settle();

    expect(res.statusCode).toBe(403);
    expect(prisma.state.deleted).toBe(false);
    expect(emitted).toEqual([]);
    await app.close();
  });

  it("une communauté déjà désactivée par l'équipe : 404, rien n'est diffusé", async () => {
    const { app, emitted } = await buildApp(CREATOR, { communityActive: false });
    const res = await app.inject({ method: 'DELETE', url: `/communities/${COMMUNITY_ID}` });
    await settle();

    expect(res.statusCode).toBe(404);
    expect(emitted).toEqual([]);
    await app.close();
  });
});
