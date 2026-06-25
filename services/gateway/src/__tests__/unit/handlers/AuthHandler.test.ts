/**
 * Unit tests for socketio/handlers/AuthHandler.
 * Covers: handleManualAuthentication (schema invalid, no userId/sessionToken,
 * sessionToken-only anon, userId found+registered, userId not found, error),
 * handleTokenAuthentication (no-token timeout path, anon path, JWT path, error),
 * handleDisconnection (unknown socket, remaining sockets, last socket registered
 * user + anon, call cleanup), handleHeartbeat (unknown socket, registered, anon).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: (t: string) => `hash:${t}`,
}));

jest.mock('jsonwebtoken', () => ({
  default: { verify: jest.fn() },
  verify: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  resolveUserLanguagesOrdered: jest.fn().mockReturnValue(['en']),
}));

import jwt from 'jsonwebtoken';
import { validateSocketEvent } from '../../../middleware/validation';
import { AuthHandler } from '../../../socketio/handlers/AuthHandler';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ─── Factories ─────────────────────────────────────────────────────────────────

function makeSocket(id = 'sock-1') {
  return {
    id,
    emit: jest.fn<any>(),
    join: jest.fn<any>(),
    on: jest.fn<any>(),
    disconnect: jest.fn<any>(),
    handshake: {
      auth: {},
      headers: {},
    },
  } as any;
}

function makeUser(id = 'u-1') {
  return { id, systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null };
}

function makeParticipant(id = 'p-1', conversationId = 'conv-1') {
  return { id, displayName: 'Anon', language: 'fr', conversationId };
}

function makePrisma(opts: {
  user?: any;
  participant?: any;
  callParticipants?: any[];
} = {}) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(opts.user ?? null),
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.participant ?? null),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue(opts.callParticipants ?? []),
    },
  } as any;
}

function makeServices() {
  return {
    statusService: {
      markConnected: jest.fn<any>(),
      markDisconnected: jest.fn<any>(),
      updateLastSeen: jest.fn<any>(),
    },
    maintenanceService: {
      updateUserOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
      updateAnonymousOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    },
    callService: {
      leaveCall: jest.fn<any>().mockResolvedValue(undefined),
    },
  };
}

function makeHandler(prisma: any, services = makeServices()) {
  return new AuthHandler({
    prisma,
    statusService: services.statusService,
    maintenanceService: services.maintenanceService,
    callService: services.callService,
    connectedUsers: new Map(),
    socketToUser: new Map(),
    userSockets: new Map(),
  });
}

// ─── handleManualAuthentication ───────────────────────────────────────────────

describe('handleManualAuthentication', () => {
  beforeEach(() => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: true,
      data: { userId: 'u-1', sessionToken: undefined, language: undefined },
    });
  });

  it('emits ERROR when schema validation fails', async () => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: false,
      error: 'bad schema',
    });
    const socket = makeSocket();
    const handler = makeHandler(makePrisma());
    await handler.handleManualAuthentication(socket, {});
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'bad schema' }));
  });

  it('emits ERROR when neither userId nor sessionToken is present', async () => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: true,
      data: { userId: undefined, sessionToken: undefined },
    });
    const socket = makeSocket();
    const handler = makeHandler(makePrisma());
    await handler.handleManualAuthentication(socket, {});
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'userId or sessionToken required' }));
  });

  it('delegates to anonymous auth when only sessionToken is provided', async () => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: true,
      data: { sessionToken: 'tok-123', userId: undefined },
    });
    const prisma = makePrisma({ participant: makeParticipant() });
    const socket = makeSocket();
    const handler = makeHandler(prisma);
    await handler.handleManualAuthentication(socket, { sessionToken: 'tok-123' });
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.AUTHENTICATED, expect.objectContaining({ success: true }));
  });

  it('emits AUTHENTICATED after registering a valid userId', async () => {
    const user = makeUser();
    const prisma = makePrisma({ user });
    const socket = makeSocket();
    const services = makeServices();
    const handler = makeHandler(prisma, services);
    await handler.handleManualAuthentication(socket, { userId: user.id });
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.AUTHENTICATED, expect.objectContaining({ success: true }));
    expect(services.statusService.markConnected).toHaveBeenCalledWith(user.id, false);
  });

  it('emits ERROR when userId is not found in prisma', async () => {
    const prisma = makePrisma({ user: null });
    const socket = makeSocket();
    const handler = makeHandler(prisma);
    await handler.handleManualAuthentication(socket, { userId: 'u-unknown' });
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'User not found' }));
  });

  it('calls emitPresenceSnapshot when registered and callback is provided', async () => {
    const user = makeUser();
    const prisma = makePrisma({ user });
    const socket = makeSocket();
    const presenceSnapshot = jest.fn<any>().mockResolvedValue(undefined);
    const handler = new AuthHandler({
      prisma,
      ...makeServices(),
      connectedUsers: new Map(),
      socketToUser: new Map(),
      userSockets: new Map(),
      emitPresenceSnapshot: presenceSnapshot,
    });
    await handler.handleManualAuthentication(socket, { userId: user.id });
    await new Promise(r => setTimeout(r, 0)); // flush promises
    expect(presenceSnapshot).toHaveBeenCalledWith(socket, user.id, false);
  });

  it('emits ERROR when an unexpected exception is thrown', async () => {
    const prisma = makePrisma();
    (prisma.user.findUnique as jest.MockedFunction<any>).mockRejectedValue(new Error('db crash'));
    const socket = makeSocket();
    const handler = makeHandler(prisma);
    await handler.handleManualAuthentication(socket, { userId: 'u-1' });
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'Authentication failed' }));
  });
});

// ─── handleTokenAuthentication ────────────────────────────────────────────────

describe('handleTokenAuthentication', () => {
  it('schedules disconnect timeout when no token is present', async () => {
    jest.useFakeTimers();
    const socket = makeSocket();
    const handler = makeHandler(makePrisma());
    await handler.handleTokenAuthentication(socket);
    expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    jest.useRealTimers();
  });

  it('authenticates anonymous user when only sessionToken is in handshake', async () => {
    const socket = makeSocket();
    socket.handshake.auth.sessionToken = 'anon-tok';
    const prisma = makePrisma({ participant: makeParticipant() });
    const handler = makeHandler(prisma);
    await handler.handleTokenAuthentication(socket);
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.AUTHENTICATED, expect.objectContaining({ success: true }));
  });

  it('authenticates via JWT when Bearer token is in handshake', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const socket = makeSocket();
    socket.handshake.auth.token = 'Bearer my.jwt.token';
    const user = makeUser();
    const prisma = makePrisma({ user });
    (jwt.verify as jest.MockedFunction<any>).mockReturnValue({ userId: user.id });
    const handler = makeHandler(prisma);
    await handler.handleTokenAuthentication(socket);
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.AUTHENTICATED, expect.objectContaining({ success: true }));
    delete process.env.JWT_SECRET;
  });

  it('emits ERROR on jwt.verify failure', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const socket = makeSocket();
    socket.handshake.auth.token = 'Bearer bad.token';
    (jwt.verify as jest.MockedFunction<any>).mockImplementation(() => { throw new Error('invalid token'); });
    const handler = makeHandler(makePrisma());
    await handler.handleTokenAuthentication(socket);
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'Authentication failed' }));
    delete process.env.JWT_SECRET;
  });
});

// ─── handleDisconnection ──────────────────────────────────────────────────────

describe('handleDisconnection', () => {
  it('is a no-op when the socket is not tracked', async () => {
    const socket = makeSocket();
    const handler = makeHandler(makePrisma());
    await expect(handler.handleDisconnection(socket)).resolves.toBeUndefined();
  });

  it('updates connectedUser socketId when other sockets remain for the user', async () => {
    const socket1 = makeSocket('sock-a');
    const socket2 = makeSocket('sock-b');
    const user = makeUser();
    const prisma = makePrisma();
    const connectedUsers = new Map([['u-1', { id: user.id, socketId: 'sock-a', isAnonymous: false, language: 'en', resolvedLanguages: ['en'] }]]);
    const socketToUser = new Map([['sock-a', 'u-1'], ['sock-b', 'u-1']]);
    const userSockets = new Map([['u-1', new Set(['sock-a', 'sock-b'])]]);
    const handler = new AuthHandler({
      prisma,
      ...makeServices(),
      connectedUsers,
      socketToUser,
      userSockets,
    });
    await handler.handleDisconnection(socket1);
    // sock-b remains, user should still be in connectedUsers
    expect(connectedUsers.has('u-1')).toBe(true);
  });

  it('marks user disconnected and updates online status for last socket', async () => {
    const socket = makeSocket('sock-1');
    const services = makeServices();
    const prisma = makePrisma({ callParticipants: [] });
    const connectedUsers = new Map([['u-1', { id: 'u-1', socketId: 'sock-1', isAnonymous: false, language: 'en', resolvedLanguages: ['en'] }]]);
    const socketToUser = new Map([['sock-1', 'u-1']]);
    const userSockets = new Map([['u-1', new Set(['sock-1'])]]);
    const handler = new AuthHandler({
      prisma,
      ...services,
      connectedUsers,
      socketToUser,
      userSockets,
    });
    await handler.handleDisconnection(socket);
    expect(services.statusService.markDisconnected).toHaveBeenCalledWith('u-1', false);
    expect(services.maintenanceService.updateUserOnlineStatus).toHaveBeenCalledWith('u-1', false, true);
  });

  it('calls callService.leaveCall for each active call participation', async () => {
    const socket = makeSocket('sock-1');
    const services = makeServices();
    const callParticipants = [
      { callSessionId: 'call-1', participantId: 'cp-1' },
      { callSessionId: 'call-2', participantId: 'cp-2' },
    ];
    const prisma = makePrisma({ callParticipants });
    const connectedUsers = new Map([['u-1', { id: 'u-1', socketId: 'sock-1', isAnonymous: false, language: 'en', resolvedLanguages: ['en'] }]]);
    const socketToUser = new Map([['sock-1', 'u-1']]);
    const userSockets = new Map([['u-1', new Set(['sock-1'])]]);
    const handler = new AuthHandler({
      prisma,
      ...services,
      connectedUsers,
      socketToUser,
      userSockets,
    });
    await handler.handleDisconnection(socket);
    expect(services.callService.leaveCall).toHaveBeenCalledTimes(2);
  });

  it('updates anonymous online status on disconnect', async () => {
    const socket = makeSocket('sock-a');
    const services = makeServices();
    const prisma = makePrisma({ callParticipants: [] });
    const connectedUsers = new Map([['p-1', { id: 'p-1', socketId: 'sock-a', isAnonymous: true, language: 'en', resolvedLanguages: [] }]]);
    const socketToUser = new Map([['sock-a', 'p-1']]);
    const userSockets = new Map([['p-1', new Set(['sock-a'])]]);
    const handler = new AuthHandler({
      prisma,
      ...services,
      connectedUsers,
      socketToUser,
      userSockets,
    });
    await handler.handleDisconnection(socket);
    expect(services.maintenanceService.updateAnonymousOnlineStatus).toHaveBeenCalledWith('p-1', false, true);
  });
});

// ─── handleHeartbeat ──────────────────────────────────────────────────────────

describe('handleHeartbeat', () => {
  it('is a no-op when socket is not tracked', async () => {
    const socket = makeSocket();
    const handler = makeHandler(makePrisma());
    await expect(handler.handleHeartbeat(socket)).resolves.toBeUndefined();
  });

  it('calls statusService.updateLastSeen for a registered user', async () => {
    const socket = makeSocket('sock-1');
    const services = makeServices();
    const prisma = makePrisma({ user: makeUser() });
    const connectedUsers = new Map([['u-1', { id: 'u-1', socketId: 'sock-1', isAnonymous: false, language: 'en', resolvedLanguages: ['en'] }]]);
    const socketToUser = new Map([['sock-1', 'u-1']]);
    const handler = new AuthHandler({
      prisma,
      ...services,
      connectedUsers,
      socketToUser,
      userSockets: new Map(),
    });
    await handler.handleHeartbeat(socket);
    expect(services.statusService.updateLastSeen).toHaveBeenCalledWith('u-1', false);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('calls statusService.updateLastSeen for an anonymous user (no prisma update)', async () => {
    const socket = makeSocket('sock-a');
    const services = makeServices();
    const prisma = makePrisma();
    const connectedUsers = new Map([['p-1', { id: 'p-1', socketId: 'sock-a', isAnonymous: true, language: 'en', resolvedLanguages: [] }]]);
    const socketToUser = new Map([['sock-a', 'p-1']]);
    const handler = new AuthHandler({
      prisma,
      ...services,
      connectedUsers,
      socketToUser,
      userSockets: new Map(),
    });
    await handler.handleHeartbeat(socket);
    expect(services.statusService.updateLastSeen).toHaveBeenCalledWith('p-1', true);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
