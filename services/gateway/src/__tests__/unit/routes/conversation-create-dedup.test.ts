/**
 * conversation-create-dedup.test.ts
 *
 * Idempotence de POST /conversations pour les DM directes : une conversation
 * `direct` entre deux users est UNIQUE. Le flux « Nouvelle conversation →
 * Créer » renvoyait une NOUVELLE conversation à chaque appel (2 DM identiques
 * atabeth↔jcnm observées en prod le 2026-07-03 pendant les tests d'appel) —
 * la route doit rouvrir l'existante au lieu d'en créer une deuxième.
 * Groupes/public/global : jamais dédupliqués (plusieurs groupes avec les
 * mêmes membres sont légitimes).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CREATOR_ID = '507f1f77bcf86cd799439001';
const OTHER_ID = '507f1f77bcf86cd799439002';
const EXISTING_DM_ID = '507f1f77bcf86cd7994390bb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

type PrismaOpts = {
  existingDirect: boolean;
};

function makeExistingDm() {
  return {
    id: EXISTING_DM_ID,
    identifier: 'mshy_existing-dm',
    type: 'direct',
    title: null,
    createdAt: new Date('2026-07-01T10:00:00Z'),
    participants: [
      { userId: CREATOR_ID, isActive: true, user: { id: CREATOR_ID, username: 'creator', displayName: 'Creator', avatar: null, banner: null } },
      { userId: OTHER_ID, isActive: true, user: { id: OTHER_ID, username: 'other', displayName: 'Other', avatar: null, banner: null } },
    ],
  };
}

function createMockPrisma(opts: PrismaOpts) {
  const conversationCreate = jest.fn(async () => ({
    id: '507f1f77bcf86cd7994390aa',
    identifier: 'mshy_new',
    type: 'direct',
    title: null,
    createdAt: new Date(),
    participants: [],
  }));
  // Two distinct findFirst callers on this route: the identifier-uniqueness
  // check (where.identifier) must keep returning null; the direct-dedup
  // lookup (where.type === 'direct') returns the existing DM when opted in.
  const conversationFindFirst = jest.fn(async (args: any) => {
    if (args?.where?.type === 'direct' && opts.existingDirect) return makeExistingDm();
    return null;
  });

  const prisma = {
    conversation: {
      findFirst: conversationFindFirst,
      create: conversationCreate,
    },
    user: {
      findMany: jest.fn(async () => [
        { id: CREATOR_ID, displayName: 'Creator', username: 'creator' },
        { id: OTHER_ID, displayName: 'Other', username: 'other' },
      ]),
      findFirst: jest.fn(async () => null), // no block
    },
    participant: { findFirst: jest.fn(async () => null) },
    notification: { create: jest.fn(async () => ({})) },
  } as unknown as PrismaClient;

  return { prisma, conversationCreate, conversationFindFirst };
}

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: CREATOR_ID,
      registeredUser: { id: CREATOR_ID },
      hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../../routes/conversations/core');
  registerCoreRoutes(app, prisma, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

describe('POST /conversations — direct-DM idempotence', () => {
  it('returns the EXISTING direct DM (200) instead of creating a duplicate', async () => {
    const { prisma, conversationCreate } = createMockPrisma({ existingDirect: true });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: 'Bearer x' },
      payload: { type: 'direct', participantIds: [OTHER_ID] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(EXISTING_DM_ID);
    expect(conversationCreate).not.toHaveBeenCalled();

    await app.close();
  });

  it('creates the direct DM when none exists between the two users', async () => {
    const { prisma, conversationCreate } = createMockPrisma({ existingDirect: false });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: 'Bearer x' },
      payload: { type: 'direct', participantIds: [OTHER_ID] },
    });

    expect(res.statusCode).toBe(201);
    expect(conversationCreate).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('never dedupes GROUP conversations (same members twice is legitimate)', async () => {
    const { prisma, conversationCreate, conversationFindFirst } = createMockPrisma({ existingDirect: true });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: 'Bearer x' },
      payload: { type: 'group', title: 'Team', participantIds: [OTHER_ID] },
    });

    expect(res.statusCode).toBe(201);
    expect(conversationCreate).toHaveBeenCalledTimes(1);
    const dedupCalls = conversationFindFirst.mock.calls.filter((c: any[]) => c[0]?.where?.type === 'direct');
    expect(dedupCalls.length).toBe(0);

    await app.close();
  });
});
