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

// ─── GET /delete-account/confirm ─────────────────────────────────────────────

describe('GET /delete-account/confirm — invalid token', () => {
  it('returns HTML with invalid page when token not found', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'GET', url: `/delete-account/confirm?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('invalide');
    await app.close();
  });
});

describe('GET /delete-account/confirm — valid token', () => {
  it('returns HTML with success page and updates request status to CONFIRMED', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: 'req-1', userId: USER_ID, status: 'PENDING_EMAIL_CONFIRMATION',
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET', url: `/delete-account/confirm?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('confirm');
    expect(prisma.accountDeletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) })
    );
    await app.close();
  });
});

describe('GET /delete-account/confirm — DB error', () => {
  it('returns HTML error page on DB error', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET', url: `/delete-account/confirm?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Erreur');
    await app.close();
  });
});

// ─── GET /delete-account/cancel ──────────────────────────────────────────────

describe('GET /delete-account/cancel — invalid token', () => {
  it('returns HTML with invalid page when token not found', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'GET', url: `/delete-account/cancel?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('invalide');
    await app.close();
  });
});

describe('GET /delete-account/cancel — valid token, inactive user', () => {
  it('cancels deletion and reactivates inactive user', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: 'req-1', userId: USER_ID, status: 'CONFIRMED',
    });
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ isActive: false });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET', url: `/delete-account/cancel?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('annul');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: true, deletedAt: null }) })
    );
    await app.close();
  });
});

describe('GET /delete-account/cancel — valid token, active user', () => {
  it('cancels deletion without calling user.update when user is already active', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: 'req-1', userId: USER_ID, status: 'CONFIRMED',
    });
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ isActive: true });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET', url: `/delete-account/cancel?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /delete-account/cancel — DB error', () => {
  it('returns HTML error page on DB error', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET', url: `/delete-account/cancel?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Erreur');
    await app.close();
  });
});

// ─── GET /delete-account/delete-now ──────────────────────────────────────────

describe('GET /delete-account/delete-now — invalid token', () => {
  it('returns HTML with invalid page when token not found', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'GET', url: `/delete-account/delete-now?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('invalide');
    await app.close();
  });
});

describe('GET /delete-account/delete-now — valid token', () => {
  it('deactivates user and marks request COMPLETED', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockResolvedValue({
      id: 'req-1', userId: USER_ID, status: 'GRACE_PERIOD_EXPIRED',
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET', url: `/delete-account/delete-now?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('supprim');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
    );
    expect(prisma.accountDeletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
    );
    await app.close();
  });
});

describe('GET /delete-account/delete-now — DB error', () => {
  it('returns HTML error page on DB error', async () => {
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET', url: `/delete-account/delete-now?token=${VALID_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Erreur');
    await app.close();
  });
});

// ─── GET /delete-account/delete-now — coupure des sockets (F9 bis) ───────────
// La suppression pose `isActive: false` ; un socket qui resterait ouvert
// continuerait de recevoir les fils temps réel d'un compte qui n'existe plus.
// Même double que `admin-roles.test.ts` (F9) : la room du compte, ses sockets.

type SocketDouble = { emit: jest.Mock<(...args: unknown[]) => void>; disconnect: jest.Mock<(close?: boolean) => void> };

function makeSocketIOHandler(sockets: SocketDouble[], fetchError?: Error) {
  const rooms: string[] = [];
  const io = {
    in: (room: string) => {
      rooms.push(room);
      return {
        fetchSockets: async () => {
          if (fetchError) throw fetchError;
          return sockets;
        },
      };
    },
  };
  return { rooms, handler: { getManager: () => ({ getIO: () => io }) } };
}

function expiredDeletionRequest() {
  return { id: 'req-1', userId: USER_ID, status: 'GRACE_PERIOD_EXPIRED' };
}

describe('GET /delete-account/delete-now — la suppression coupe les sockets du compte (F9 bis)', () => {
  it("émet auth:session-revoked puis ferme chaque socket de la room du compte, APRÈS l'écriture", async () => {
    const order: string[] = [];
    const socket: SocketDouble = {
      emit: jest.fn<(...args: unknown[]) => void>(() => { order.push('emit'); }),
      disconnect: jest.fn<(close?: boolean) => void>((close?: boolean) => { order.push(`disconnect:${close}`); }),
    };
    const { rooms, handler } = makeSocketIOHandler([socket]);
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockResolvedValue(expiredDeletionRequest());
    prisma.user.update = jest.fn<any>(async () => { order.push('written'); return { id: USER_ID }; });
    const { app } = await buildApp({ prisma, socketIOHandler: handler });
    try {
      const res = await app.inject({ method: 'GET', url: `/delete-account/delete-now?token=${VALID_TOKEN}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('supprim');
      expect(rooms).toEqual([ROOMS.user(USER_ID)]);
      expect(socket.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.AUTH_SESSION_REVOKED,
        expect.objectContaining({ code: 'session_revoked', reason: 'logout_all_devices', message: expect.stringContaining('deleted') }),
      );
      expect(order).toEqual(['written', 'emit', 'disconnect:true']);
    } finally {
      await app.close();
    }
  });

  it('un lien invalide ne touche à aucun socket', async () => {
    const socket: SocketDouble = { emit: jest.fn<(...args: unknown[]) => void>(), disconnect: jest.fn<(close?: boolean) => void>() };
    const { rooms, handler } = makeSocketIOHandler([socket]);
    const { app, prisma } = await buildApp({ socketIOHandler: handler });
    try {
      const res = await app.inject({ method: 'GET', url: `/delete-account/delete-now?token=${VALID_TOKEN}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('invalide');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(rooms).toEqual([]);
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.disconnect).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('une coupure qui échoue ne fait pas échouer la suppression : page « supprimé », les deux lignes écrites', async () => {
    const socket: SocketDouble = { emit: jest.fn<(...args: unknown[]) => void>(), disconnect: jest.fn<(close?: boolean) => void>() };
    const { handler } = makeSocketIOHandler([socket], new Error('adapter down'));
    const prisma = makePrisma();
    prisma.accountDeletionRequest.findFirst = jest.fn<any>().mockResolvedValue(expiredDeletionRequest());
    const { app } = await buildApp({ prisma, socketIOHandler: handler });
    try {
      const res = await app.inject({ method: 'GET', url: `/delete-account/delete-now?token=${VALID_TOKEN}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('supprim');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
      );
      expect(prisma.accountDeletionRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
      );
      expect(socket.disconnect).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
