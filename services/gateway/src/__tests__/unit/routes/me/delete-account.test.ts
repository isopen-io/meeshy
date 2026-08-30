/**
 * Unit tests for routes/me/delete-account.ts
 * Tests DELETE /delete-account, GET /delete-account/confirm, cancel, and delete-now.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

const mockSendAccountDeletionConfirmEmail = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendAccountDeletionConfirmEmail: mockSendAccountDeletionConfirmEmail,
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { deleteAccountRoutes } from '../../../../routes/me/delete-account';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'usr-delete-test-001';
const VALID_PHRASE = 'SUPPRIMER MON COMPTE';
const VALID_TOKEN = 'valid-token-abc123';
const TOKEN_HASH_PLACEHOLDER = 'some-hash';

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    accountDeletionRequest: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>().mockResolvedValue({ id: 'req-1', userId: USER_ID }),
      update: jest.fn<any>().mockResolvedValue({ id: 'req-1', userId: USER_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        email: 'alice@example.com',
        displayName: 'Alice',
        firstName: 'Alice',
        systemLanguage: 'fr',
      }),
      update: jest.fn<any>().mockResolvedValue({ id: USER_ID }),
    },
    $transaction: jest.fn<any>().mockResolvedValue([]),
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
  socketIOHandler?: unknown;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma(), socketIOHandler } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', prisma);
  if (socketIOHandler) app.decorate('socketIOHandler', socketIOHandler as never);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = auth === 'authenticated'
      ? { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } }
      : { isAuthenticated: false, registeredUser: null };
  });

  await app.register(deleteAccountRoutes);
  await app.ready();
  return { app, prisma };
}

// ─── DELETE /delete-account ───────────────────────────────────────────────────

describe('DELETE /delete-account — authentication', () => {
  it('returns 401 when not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'DELETE', url: '/delete-account',
      payload: { confirmationPhrase: VALID_PHRASE },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /delete-account — invalid confirmation phrase', () => {
  it('returns 400 when phrase is wrong', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'DELETE', url: '/delete-account',
      payload: { confirmationPhrase: 'wrong phrase' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('DELETE /delete-account — already pending', () => {
  it('returns 409 when an active deletion request exists', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: 'req-existing', userId: USER_ID, status: 'PENDING_EMAIL_CONFIRMATION',
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE', url: '/delete-account',
      payload: { confirmationPhrase: VALID_PHRASE },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().success).toBe(false);
    await app.close();
  });
});

describe('DELETE /delete-account — success (new request)', () => {
  it('returns 200, creates deletion request, and sends email', async () => {
    mockSendAccountDeletionConfirmEmail.mockClear();
    const { app, prisma } = await buildApp();
    const res = await app.inject({
      method: 'DELETE', url: '/delete-account',
      payload: { confirmationPhrase: VALID_PHRASE },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(prisma.accountDeletionRequest.create).toHaveBeenCalled();
    expect(mockSendAccountDeletionConfirmEmail).toHaveBeenCalled();
    await app.close();
  });

  it('creates request even when user has no email', async () => {
    mockSendAccountDeletionConfirmEmail.mockClear();
    const prisma = makePrisma();
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({
      email: null, displayName: null, firstName: null, systemLanguage: 'fr',
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE', url: '/delete-account',
      payload: { confirmationPhrase: VALID_PHRASE },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSendAccountDeletionConfirmEmail).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('DELETE /delete-account — expired requests cleanup', () => {
  it('cleans up expired requests via $transaction before creating new one', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockResolvedValue(null);
    prisma.accountDeletionRequest.count = jest.fn<any>().mockResolvedValue(1);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE', url: '/delete-account',
      payload: { confirmationPhrase: VALID_PHRASE },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
    await app.close();
  });
});

describe('DELETE /delete-account — DB error', () => {
  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'DELETE', url: '/delete-account',
      payload: { confirmationPhrase: VALID_PHRASE },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── Les trois GET ont cessé de muter (#4183) ────────────────────────────────
//
// Les blocs qui vivaient ici asseyaient le comportement FAUTIF : « GET
// /delete-account/confirm met la demande à CONFIRMED », « delete-now désactive
// le compte ». C'était une mutation destructrice déclenchée par une requête
// que n'importe quel pré-chargeur de lien émet — antivirus de messagerie, Safe
// Links, prefetch du navigateur. Ces témoins la certifiaient.
//
// Les trois portes sont désormais des redirections INERTES vers la page qui
// dit la conséquence, et l'effet vit derrière un `POST` :
//   · l'inertie             → `account-deletion-get-is-inert.test.ts`
//   · les effets et le TTL  → `account-deletion-resolve.test.ts`
