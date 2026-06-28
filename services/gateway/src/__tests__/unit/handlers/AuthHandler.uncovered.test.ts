/**
 * Coverage for AuthHandler uncovered paths:
 * - handleTokenAuthentication: TokenExpiredError, generic error
 * - _authenticateJWTUser: user not found
 * - _authenticateAnonymousUser: participant not found
 * - handleManualAuthentication: schema failure, anonymous path, presence snapshot
 * - handleHeartbeat: all paths (completely uncovered)
 * - _joinUserConversations: conversation rooms joined, anonymous branch
 * - handleDisconnection: active call debug log path
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { AuthHandler } from '../../../socketio/handlers/AuthHandler';
import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

// ── Factory helpers ───────────────────────────────────────────────────────────

const makeSocket = (overrides: Record<string, unknown> = {}): Socket => ({
  id: 'socket-test-1',
  handshake: { auth: {}, headers: {} },
  emit: jest.fn<any>(),
  join: jest.fn<any>(),
  leave: jest.fn<any>(),
  on: jest.fn<any>(),
  disconnect: jest.fn<any>(),
  ...overrides,
} as unknown as Socket);

const USER_ID = '507f1f77bcf86cd799439011';
const PARTICIPANT_ID = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';

const makePrisma = () => ({
  user: {
    findUnique: jest.fn<any>().mockResolvedValue({
      id: USER_ID,
      systemLanguage: 'en',
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: null,
    }),
    update: jest.fn<any>().mockResolvedValue({}),
  },
  participant: {
    findFirst: jest.fn<any>().mockResolvedValue({
      id: PARTICIPANT_ID,
      displayName: 'Anon',
      language: 'fr',
      conversationId: CONV_ID,
    }),
    findMany: jest.fn<any>().mockResolvedValue([]),
  },
  callParticipant: {
    findMany: jest.fn<any>().mockResolvedValue([]),
  },
} as any);

const makeServices = () => ({
  statusService: {
    markConnected: jest.fn<any>(),
    markDisconnected: jest.fn<any>(),
    updateLastSeen: jest.fn<any>(),
  } as any,
  maintenanceService: {
    updateUserOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    updateAnonymousOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
  } as any,
  callService: {
    leaveCall: jest.fn<any>().mockResolvedValue(undefined),
  } as any,
});

const makeHandler = (
  prisma: any,
  services: ReturnType<typeof makeServices>,
  extra: {
    connectedUsers?: Map<string, any>;
    socketToUser?: Map<string, string>;
    userSockets?: Map<string, Set<string>>;
    emitPresenceSnapshot?: any;
  } = {}
) => {
  const connectedUsers = extra.connectedUsers ?? new Map();
  const socketToUser = extra.socketToUser ?? new Map();
  const userSockets = extra.userSockets ?? new Map();
  return new AuthHandler({
    prisma,
    ...services,
    connectedUsers,
    socketToUser,
    userSockets,
    emitPresenceSnapshot: extra.emitPresenceSnapshot,
  });
};

// ── handleTokenAuthentication — error paths ───────────────────────────────────

describe('AuthHandler — handleTokenAuthentication error paths', () => {
  const JWT_SECRET = 'test-secret';

  beforeEach(() => { process.env.JWT_SECRET = JWT_SECRET; });
  afterEach(() => { jest.restoreAllMocks(); });

  it('emits auth:token-expired and disconnects when jwt.verify throws TokenExpiredError', async () => {
    const socket = makeSocket({ handshake: { auth: { token: 'expired-jwt' }, headers: {} } });
    const prisma = makePrisma();
    const services = makeServices();
    const handler = makeHandler(prisma, services);

    const expiredError = new jwt.TokenExpiredError('jwt expired', new Date());
    jest.spyOn(jwt, 'verify').mockImplementation(() => { throw expiredError; });

    await handler.handleTokenAuthentication(socket);

    expect(socket.emit).toHaveBeenCalledWith('auth:token-expired', expect.objectContaining({ code: 'token_expired' }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('emits generic error and disconnects when jwt.verify throws an unknown error', async () => {
    const socket = makeSocket({ handshake: { auth: { token: 'bad-jwt' }, headers: {} } });
    const prisma = makePrisma();
    const services = makeServices();
    const handler = makeHandler(prisma, services);

    jest.spyOn(jwt, 'verify').mockImplementation(() => { throw new Error('invalid signature'); });

    await handler.handleTokenAuthentication(socket);

    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Authentication failed' }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});

// ── _authenticateJWTUser — user not found ────────────────────────────────────

describe('AuthHandler — _authenticateJWTUser user not found', () => {
  const JWT_SECRET = 'test-secret';

  beforeEach(() => { process.env.JWT_SECRET = JWT_SECRET; });
  afterEach(() => { jest.restoreAllMocks(); });

  it('emits error and disconnects when user is not in DB after JWT decode', async () => {
    const socket = makeSocket({ handshake: { auth: { token: 'valid-jwt' }, headers: {} } });
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const services = makeServices();
    const handler = makeHandler(prisma, services);

    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: USER_ID } as any);

    await handler.handleTokenAuthentication(socket);

    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'User not found' }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});

// ── _authenticateAnonymousUser — participant not found ────────────────────────

describe('AuthHandler — _authenticateAnonymousUser participant not found', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('emits error and disconnects when participant is not found', async () => {
    const socket = makeSocket({ handshake: { auth: { sessionToken: 'anon-token-xyz' }, headers: {} } });
    const prisma = makePrisma();
    prisma.participant.findFirst.mockResolvedValue(null);
    const services = makeServices();
    const handler = makeHandler(prisma, services);

    await handler.handleTokenAuthentication(socket);

    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Anonymous session not found' }));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});

// ── handleManualAuthentication ────────────────────────────────────────────────

describe('AuthHandler — handleManualAuthentication', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('emits error when schema validation fails (wrong type for userId)', async () => {
    const socket = makeSocket();
    const prisma = makePrisma();
    const services = makeServices();
    const handler = makeHandler(prisma, services);

    // Pass a number for userId to trigger Zod schema failure
    await handler.handleManualAuthentication(socket, { userId: 123 as any });

    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('Validation') }));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('routes to anonymous auth when sessionToken provided without userId', async () => {
    const socket = makeSocket();
    const prisma = makePrisma();
    const services = makeServices();
    const handler = makeHandler(prisma, services);

    await handler.handleManualAuthentication(socket, { sessionToken: 'anon-session-abc' });

    expect(prisma.participant.findFirst).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({ success: true }));
  });

  it('calls emitPresenceSnapshot callback after successful manual auth', async () => {
    const socket = makeSocket();
    const prisma = makePrisma();
    const services = makeServices();
    const snapshotFn = jest.fn<any>().mockResolvedValue(undefined);
    const handler = makeHandler(prisma, services, { emitPresenceSnapshot: snapshotFn });

    await handler.handleManualAuthentication(socket, { userId: USER_ID });

    expect(snapshotFn).toHaveBeenCalledWith(socket, USER_ID, false);
  });

  it('calls emitPresenceSnapshot even when it rejects (fire-and-forget swallowed)', async () => {
    const socket = makeSocket();
    const prisma = makePrisma();
    const services = makeServices();
    const snapshotFn = jest.fn<any>().mockRejectedValue(new Error('snapshot failed'));
    const handler = makeHandler(prisma, services, { emitPresenceSnapshot: snapshotFn });

    // Should not throw even if snapshot fails
    await expect(
      handler.handleManualAuthentication(socket, { userId: USER_ID })
    ).resolves.not.toThrow();
    expect(snapshotFn).toHaveBeenCalled();
  });
});

// ── JWT auth + emitPresenceSnapshot ──────────────────────────────────────────

describe('AuthHandler — JWT auth emitPresenceSnapshot', () => {
  const JWT_SECRET = 'test-secret';

  beforeEach(() => { process.env.JWT_SECRET = JWT_SECRET; });
  afterEach(() => { jest.restoreAllMocks(); });

  it('calls emitPresenceSnapshot after successful JWT token auth', async () => {
    const socket = makeSocket({ handshake: { auth: { token: 'valid-jwt' }, headers: {} } });
    const prisma = makePrisma();
    const services = makeServices();
    const snapshotFn = jest.fn<any>().mockResolvedValue(undefined);
    const handler = makeHandler(prisma, services, { emitPresenceSnapshot: snapshotFn });

    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: USER_ID } as any);

    await handler.handleTokenAuthentication(socket);

    expect(snapshotFn).toHaveBeenCalledWith(socket, USER_ID, false);
  });
});

// ── Anonymous auth + emitPresenceSnapshot ────────────────────────────────────

describe('AuthHandler — anonymous auth emitPresenceSnapshot', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('calls emitPresenceSnapshot after successful anonymous token auth', async () => {
    const socket = makeSocket({ handshake: { auth: { sessionToken: 'anon-tok' }, headers: {} } });
    const prisma = makePrisma();
    const services = makeServices();
    const snapshotFn = jest.fn<any>().mockResolvedValue(undefined);
    const handler = makeHandler(prisma, services, { emitPresenceSnapshot: snapshotFn });

    await handler.handleTokenAuthentication(socket);

    expect(snapshotFn).toHaveBeenCalledWith(socket, PARTICIPANT_ID, true);
  });
});

// ── handleHeartbeat ───────────────────────────────────────────────────────────

describe('AuthHandler — handleHeartbeat', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('returns early without doing anything when socket is not registered', async () => {
    const socket = makeSocket({ id: 'unregistered-socket' });
    const prisma = makePrisma();
    const services = makeServices();
    const handler = makeHandler(prisma, services);

    await handler.handleHeartbeat(socket);

    expect(services.statusService.updateLastSeen).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns early when socket is registered but user not in connectedUsers', async () => {
    const socketToUser = new Map([['socket-hb-1', USER_ID]]);
    const connectedUsers = new Map(); // empty — no user entry
    const socket = makeSocket({ id: 'socket-hb-1' });
    const prisma = makePrisma();
    const services = makeServices();
    const handler = makeHandler(prisma, services, { socketToUser, connectedUsers });

    await handler.handleHeartbeat(socket);

    expect(services.statusService.updateLastSeen).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updates lastActiveAt for registered (non-anonymous) user', async () => {
    const socketToUser = new Map([['socket-hb-2', USER_ID]]);
    const connectedUsers = new Map([[USER_ID, { id: USER_ID, socketId: 'socket-hb-2', isAnonymous: false, language: 'en' }]]);
    const socket = makeSocket({ id: 'socket-hb-2' });
    const prisma = makePrisma();
    const services = makeServices();
    const handler = makeHandler(prisma, services, { socketToUser, connectedUsers });

    await handler.handleHeartbeat(socket);

    expect(services.statusService.updateLastSeen).toHaveBeenCalledWith(USER_ID, false);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: USER_ID },
      data: expect.objectContaining({ lastActiveAt: expect.any(Date) }),
    }));
  });

  it('does NOT update lastActiveAt for anonymous user', async () => {
    const socketToUser = new Map([['socket-hb-3', PARTICIPANT_ID]]);
    const connectedUsers = new Map([[PARTICIPANT_ID, { id: PARTICIPANT_ID, socketId: 'socket-hb-3', isAnonymous: true, language: 'fr' }]]);
    const socket = makeSocket({ id: 'socket-hb-3' });
    const prisma = makePrisma();
    const services = makeServices();
    const handler = makeHandler(prisma, services, { socketToUser, connectedUsers });

    await handler.handleHeartbeat(socket);

    expect(services.statusService.updateLastSeen).toHaveBeenCalledWith(PARTICIPANT_ID, true);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('swallows DB errors during heartbeat (best-effort update)', async () => {
    const socketToUser = new Map([['socket-hb-4', USER_ID]]);
    const connectedUsers = new Map([[USER_ID, { id: USER_ID, socketId: 'socket-hb-4', isAnonymous: false, language: 'en' }]]);
    const socket = makeSocket({ id: 'socket-hb-4' });
    const prisma = makePrisma();
    prisma.user.update.mockRejectedValue(new Error('DB connection lost'));
    const services = makeServices();
    const handler = makeHandler(prisma, services, { socketToUser, connectedUsers });

    await expect(handler.handleHeartbeat(socket)).resolves.not.toThrow();
  });
});

// ── _joinUserConversations ────────────────────────────────────────────────────

describe('AuthHandler — _joinUserConversations via handleManualAuthentication', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('joins socket to conversation rooms for each participant conversation', async () => {
    const socket = makeSocket();
    const prisma = makePrisma();
    prisma.participant.findMany.mockResolvedValue([
      { conversationId: 'conv-aaa' },
      { conversationId: 'conv-bbb' },
    ]);
    const services = makeServices();
    const handler = makeHandler(prisma, services);

    await handler.handleManualAuthentication(socket, { userId: USER_ID });

    // Both conversations should have been joined
    expect(socket.join).toHaveBeenCalledWith(expect.stringContaining('conv-aaa'));
    expect(socket.join).toHaveBeenCalledWith(expect.stringContaining('conv-bbb'));
  });
});

// ── handleDisconnection — active call debug log ───────────────────────────────

describe('AuthHandler — handleDisconnection with active calls (debug log path)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('logs debug info and leaves calls when user has active participations', async () => {
    const socket = makeSocket({ id: 'socket-dc-1' });
    const socketToUser = new Map([['socket-dc-1', USER_ID]]);
    const connectedUsers = new Map([[USER_ID, { id: USER_ID, socketId: 'socket-dc-1', isAnonymous: false, language: 'en' }]]);
    const userSockets = new Map([[USER_ID, new Set(['socket-dc-1'])]]);

    const prisma = makePrisma();
    prisma.callParticipant.findMany.mockResolvedValue([
      { callSessionId: 'call-session-1', participantId: 'part-1', callSession: {} },
      { callSessionId: 'call-session-2', participantId: 'part-2', callSession: {} },
    ]);
    const services = makeServices();
    const handler = makeHandler(prisma, services, { connectedUsers, socketToUser, userSockets });

    await handler.handleDisconnection(socket);

    // callService.leaveCall should be called for each active participation
    expect(services.callService.leaveCall).toHaveBeenCalledTimes(2);
    expect(services.callService.leaveCall).toHaveBeenCalledWith(expect.objectContaining({ callId: 'call-session-1' }));
    expect(services.callService.leaveCall).toHaveBeenCalledWith(expect.objectContaining({ callId: 'call-session-2' }));
    // User cleaned up
    expect(connectedUsers.has(USER_ID)).toBe(false);
  });
});
