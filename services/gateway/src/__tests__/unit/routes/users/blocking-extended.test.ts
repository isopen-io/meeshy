/**
 * Extended tests for blocking.ts — covers the onDuplicate callbacks (lines 97, 182)
 * in blockUser and unblockUser via withMutationLog.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

const mockWithMutationLog = jest.fn<any>();
jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: (...args: any[]) => mockWithMutationLog(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { blockUser, unblockUser } from '../../../../routes/users/blocking';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = '507f1f77bcf86cd799439011';
const TARGET_USER_ID  = '507f1f77bcf86cd799439022';

// ─── Default: withMutationLog calls op() unless overridden ───────────────────

beforeEach(() => {
  mockWithMutationLog.mockImplementation(({ op }: any) => op());
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildBlockApp(opts: {
  // blockUser needs 2 findUnique calls: target then current user
  targetUser?: Record<string, any>;
  currentUser?: Record<string, any>;
} = {}): Promise<FastifyInstance> {
  const targetUser = opts.targetUser ?? { id: TARGET_USER_ID };
  const currentUser = opts.currentUser ?? { id: CURRENT_USER_ID, blockedUserIds: [] };

  const prisma = {
    user: {
      findUnique: jest.fn<any>()
        .mockResolvedValueOnce(targetUser)
        .mockResolvedValueOnce(currentUser),
      update: jest.fn<any>().mockResolvedValue({ blockedUserIds: [TARGET_USER_ID] }),
    },
  } as any;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true, userId: CURRENT_USER_ID,
      registeredUser: { id: CURRENT_USER_ID },
    };
  });
  await blockUser(app);
  await app.ready();
  return app;
}

async function buildUnblockApp(opts: {
  // unblockUser needs only current user (already blocked)
  currentUser?: Record<string, any>;
} = {}): Promise<FastifyInstance> {
  const currentUser = opts.currentUser ?? {
    id: CURRENT_USER_ID,
    blockedUserIds: [TARGET_USER_ID],
  };

  const prisma = {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(currentUser),
      update: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
    },
  } as any;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true, userId: CURRENT_USER_ID,
      registeredUser: { id: CURRENT_USER_ID },
    };
  });
  await unblockUser(app);
  await app.ready();
  return app;
}

// ─── Line 97: blockUser onDuplicate callback ──────────────────────────────────

describe('POST /users/:userId/block — onDuplicate callback (line 97)', () => {
  it('invokes onDuplicate and still returns 200 with message', async () => {
    mockWithMutationLog.mockImplementationOnce(({ onDuplicate }: any) => onDuplicate());
    const app = await buildBlockApp();
    const res = await app.inject({
      method: 'POST', url: `/users/${TARGET_USER_ID}/block`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBe('User blocked');
    await app.close();
  });
});

// ─── Line 182: unblockUser onDuplicate callback ───────────────────────────────

describe('DELETE /users/:userId/block — onDuplicate callback (line 182)', () => {
  it('invokes onDuplicate and still returns 200 with message', async () => {
    mockWithMutationLog.mockImplementationOnce(({ onDuplicate }: any) => onDuplicate());
    const app = await buildUnblockApp();
    const res = await app.inject({
      method: 'DELETE', url: `/users/${TARGET_USER_ID}/block`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBe('User unblocked');
    await app.close();
  });
});
