/**
 * Tests — GET /api/v1/sync (SyncEngine A3.1, collection pilote `messages`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';

// createUnifiedAuthMiddleware est mocké pour injecter un authContext.
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: FastifyRequest) => {
    (req as unknown as { authContext: { userId: string } }).authContext = { userId: USER_ID };
  },
}));

import { syncRoutes } from '../../../routes/sync';

type PrismaStub = {
  participant: { findMany: jest.Mock };
  message: { findMany: jest.Mock };
  userEventSeq: { findUnique: jest.Mock };
};

function makePrisma(over: Partial<Record<string, unknown>> = {}): PrismaStub {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ conversationId: 'c1' }]),
    },
    message: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    userEventSeq: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    ...over,
  } as PrismaStub;
}

async function buildApp(prisma: PrismaStub): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

describe('GET /sync — validation', () => {
  it('400 when `since` is missing', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: '/sync?collections=messages' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('400 when `collections` is missing', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('400 on an unsupported collection', async () => {
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=posts` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /sync — messages collection', () => {
  it('splits added (createdAt > since) vs modified (createdAt <= since), sorted updatedAt ASC', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      // first call = changed (non-deleted)
      .mockResolvedValueOnce([
        { id: 'm-old', conversationId: 'c1', senderId: 'u', content: 'edited',
          createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-07-02T00:00:00Z') },
        { id: 'm-new', conversationId: 'c1', senderId: 'u', content: 'fresh',
          createdAt: new Date('2026-07-02T10:00:00Z'), updatedAt: new Date('2026-07-02T10:00:00Z') },
      ])
      // second call = deleted tombstones
      .mockResolvedValueOnce([]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    expect(res.statusCode).toBe(200);
    const msgs = res.json().data.collections.messages;
    expect(msgs.added.map((m: { id: string }) => m.id)).toEqual(['m-new']);
    expect(msgs.modified.map((m: { id: string }) => m.id)).toEqual(['m-old']);
    await app.close();
  });

  it('returns deleted tombstones from the second query', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'm-del', conversationId: 'c1', deletedAt: new Date('2026-07-02T00:00:00Z') },
      ]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    expect(res.json().data.collections.messages.deleted).toHaveLength(1);
    expect(res.json().data.collections.messages.deleted[0].id).toBe('m-del');
    await app.close();
  });

  it('RLS: a user in no conversations gets empty collections and never queries messages', async () => {
    const prisma = makePrisma({ participant: { findMany: jest.fn<any>().mockResolvedValue([]) } });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.collections.messages.added).toEqual([]);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('scopes the participant lookup to `scope` when provided', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&scope=cX` });
    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ conversationId: 'cX' }) }),
    );
    await app.close();
  });
});

describe('GET /sync — gap detection (A1 reuse)', () => {
  it('hasGap=true and skips the message query when the client seq is far behind', async () => {
    const prisma = makePrisma({
      userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue({ lastSeq: BigInt(50_000) }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&seq=100` });
    const data = res.json().data;
    expect(data.hasGap).toBe(true);
    expect(data.gapAction).toBe('full_resync_required');
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('hasGap=false when the client seq is recent', async () => {
    const prisma = makePrisma({
      userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue({ lastSeq: BigInt(105) }) },
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages&seq=100` });
    expect(res.json().data.hasGap).toBe(false);
    await app.close();
  });
});

describe('GET /sync — ETag / 304', () => {
  it('returns an ETag + Cache-Control no-store, and 304 on a matching If-None-Match', async () => {
    const app = await buildApp(makePrisma());
    const first = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
    expect(first.headers['cache-control']).toBe('no-store');
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    // The ETag is stable (userId + checkpointSeq + collectionsHash, NOT the
    // wall-clock checkpoint), so an unchanged dataset must 304.
    const second = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=messages`,
      headers: { 'if-none-match': etag },
    });
    expect(second.statusCode).toBe(304);
    await app.close();
  });
});
