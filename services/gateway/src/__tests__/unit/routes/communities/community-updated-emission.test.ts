/**
 * `PUT /communities/:id` diffuse `community:updated` (#18435) — et RIEN quand
 * l'écriture n'a pas lieu. Le témoin traverse la vraie route, le vrai
 * `broadcastToUser` et la vraie porte d'émission : il assert sur le COUPLE
 * (événement, charge) reçu par chaque room.
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
const UPDATED_AT = new Date('2026-11-14T11:00:00Z');

type Emitted = { readonly room: string; readonly event: string; readonly payload: unknown };

const stored = { name: 'Ancien nom', description: null as string | null, isPrivate: false };

function makePrisma() {
  const live = { ...stored };
  const members = [
    { communityId: COMMUNITY_ID, userId: CREATOR, isActive: true },
    { communityId: COMMUNITY_ID, userId: MEMBER, isActive: true },
    { communityId: COMMUNITY_ID, userId: FORMER, isActive: false },
  ];
  const row = () => ({
    id: COMMUNITY_ID, identifier: 'mshy_club', name: live.name, description: live.description,
    avatar: null, banner: null, isPrivate: live.isPrivate, isActive: true, createdBy: CREATOR, updatedAt: UPDATED_AT,
  });
  return {
    community: {
      findFirst: jest.fn(async (args: { select: Record<string, boolean> }) => {
        const full = row();
        return Object.fromEntries(Object.entries(full).filter(([key]) => args.select[key] === true));
      }),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async (args: { data: { name?: string; isPrivate?: boolean } }) => {
        if (args.data.name !== undefined) live.name = args.data.name;
        if (args.data.isPrivate !== undefined) live.isPrivate = args.data.isPrivate;
        return { ...row(), creator: { id: CREATOR, username: 'alice', displayName: 'Alice', avatar: null }, _count: { members: 2, Conversation: 0 } };
      }),
    },
    communityMember: {
      findMany: jest.fn(async (args: { where: { communityId: string; isActive?: boolean } }) =>
        members
          .filter((m) => m.communityId === args.where.communityId && (args.where.isActive === undefined || m.isActive === args.where.isActive))
          .map((m) => ({ userId: m.userId }))),
    },
    conversation: { findMany: jest.fn(async () => []) },
    messageAttachment: { findFirst: jest.fn(async () => null) },
    user: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
  };
}

async function buildApp(viewer: string) {
  const emitted: Emitted[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); return true; } }) };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma() as never);
  app.decorate('socketIOHandler', { io } as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = { isAuthenticated: true, userId: viewer, registeredUser: { id: viewer } };
  });
  await app.register(communityRoutes);
  await app.ready();
  return { app, emitted };
}

const settle = () => new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));

describe('PUT /communities/:id — community:updated (#18435)', () => {
  it('le créateur renomme : chaque membre actif et le créateur reçoivent la nouvelle identité', async () => {
    const { app, emitted } = await buildApp(CREATOR);
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'Nouveau nom' } });
    await settle();

    expect(res.statusCode).toBe(200);
    const updates = emitted.filter((e) => e.event === 'community:updated');
    expect(updates.map((e) => e.room).sort()).toEqual([`user:${CREATOR}`, `user:${MEMBER}`].sort());
    expect(updates[0]?.payload).toEqual({
      communityId: COMMUNITY_ID, identifier: 'mshy_club', name: 'Nouveau nom', description: null,
      avatar: null, banner: null, isPrivate: false, memberCount: 2, updatedAt: '2026-11-14T11:00:00.000Z',
    });
    await app.close();
  });

  it("la bascule en privée l'annonce aussi", async () => {
    const { app, emitted } = await buildApp(CREATOR);
    await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { isPrivate: true } });
    await settle();

    const updates = emitted.filter((e) => e.event === 'community:updated');
    expect(updates.length).toBe(2);
    expect(updates.every((e) => (e.payload as { isPrivate: boolean }).isPrivate)).toBe(true);
    await app.close();
  });

  it("un membre qui n'est pas créateur : 403, rien n'est diffusé", async () => {
    const { app, emitted } = await buildApp(MEMBER);
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { name: 'Pirate' } });
    await settle();

    expect(res.statusCode).toBe(403);
    expect(emitted).toEqual([]);
    await app.close();
  });

  it("une image qui n'est pas au créateur : 400, rien n'est diffusé", async () => {
    const { app, emitted } = await buildApp(CREATOR);
    const res = await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY_ID}`, payload: { avatar: 'https://evil.example/x.png' } });
    await settle();

    expect(res.statusCode).toBe(400);
    expect(emitted).toEqual([]);
    await app.close();
  });
});
