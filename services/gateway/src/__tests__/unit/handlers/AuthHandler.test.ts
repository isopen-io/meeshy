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

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: (t: string) => `hash:${t}`,
}));

// `TokenExpiredError` doit exister sur le mock : le handler distingue le jeton
// EXPIRÉ (auth:token-expired + déconnexion, le client sait qu'il doit
// rafraîchir) du jeton invalide, via `error instanceof jwt.TokenExpiredError`.
// Sans la classe, ce `instanceof` lève — et l'échec observé n'est plus celui
// qu'on mesure.
class MockTokenExpiredError extends Error {}
jest.mock('jsonwebtoken', () => ({
  default: { verify: jest.fn(), TokenExpiredError: MockTokenExpiredError },
  verify: jest.fn(),
  TokenExpiredError: MockTokenExpiredError,
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
import { CallAlreadyEndedError } from '../../../services/CallService';
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
      noteHeartbeat: jest.fn<any>(),
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
  // Le handler authentifie par JWT (`token`) ou par jeton de session anonyme,
  // JAMAIS par un `userId` revendiqué : un identifiant nu n'est pas un
  // credential, et l'accepter authentifierait n'importe qui comme n'importe
  // qui. Ce bloc décrivait cette API-là — elle n'existe pas.
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    (jwt.verify as jest.MockedFunction<any>).mockReturnValue({ userId: 'u-1' });
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: true,
      data: { token: 'my.jwt.token', sessionToken: undefined, language: undefined },
    });
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
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

  it('emits ERROR when neither token nor sessionToken is present', async () => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: true,
      data: { token: undefined, sessionToken: undefined },
    });
    const socket = makeSocket();
    const handler = makeHandler(makePrisma());
    await handler.handleManualAuthentication(socket, {});
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, expect.objectContaining({ message: 'token or sessionToken required' }));
  });

  it('delegates to anonymous auth when only sessionToken is provided', async () => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: true,
      data: { sessionToken: 'tok-123', token: undefined },
    });
    const prisma = makePrisma({ participant: makeParticipant() });
    const socket = makeSocket();
    const handler = makeHandler(prisma);
    await handler.handleManualAuthentication(socket, { sessionToken: 'tok-123' });
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.AUTHENTICATED, expect.objectContaining({ success: true }));
  });

  it('emits AUTHENTICATED after verifying the JWT and loading its user', async () => {
    const user = makeUser();
    const prisma = makePrisma({ user });
    const socket = makeSocket();
    const services = makeServices();
    const handler = makeHandler(prisma, services);
    await handler.handleManualAuthentication(socket, { token: 'my.jwt.token' });
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.AUTHENTICATED, expect.objectContaining({ success: true }));
    expect(services.statusService.markConnected).toHaveBeenCalledWith(user.id, false);
  });

  it('emits ERROR when the JWT names a user prisma does not have', async () => {
    const prisma = makePrisma({ user: null });
    const socket = makeSocket();
    const handler = makeHandler(prisma);
    await handler.handleManualAuthentication(socket, { token: 'my.jwt.token' });
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
    await handler.handleManualAuthentication(socket, { token: 'my.jwt.token' });
    await new Promise(r => setTimeout(r, 0)); // flush promises
    expect(presenceSnapshot).toHaveBeenCalledWith(socket, user.id, false);
  });

  it('emits ERROR when an unexpected exception is thrown', async () => {
    const prisma = makePrisma();
    (prisma.user.findUnique as jest.MockedFunction<any>).mockRejectedValue(new Error('db crash'));
    const socket = makeSocket();
    const handler = makeHandler(prisma);
    await handler.handleManualAuthentication(socket, { token: 'my.jwt.token' });
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

  // L'auto-leave immédiat est réservé aux INVITÉS : un utilisateur enregistré a
  // droit à la grâce de reconnexion (ADR-6), portée par le handler de
  // déconnexion d'appel, et le sortir ici lui couperait l'appel à la moindre
  // bascule réseau. Ce test le demandait pour un compte enregistré.
  it('calls callService.leaveCall for each active call participation of an ANONYMOUS guest', async () => {
    const socket = makeSocket('sock-1');
    const services = makeServices();
    const callParticipants = [
      { callSessionId: 'call-1', participantId: 'cp-1', callSession: { id: 'call-1' } },
      { callSessionId: 'call-2', participantId: 'cp-2', callSession: { id: 'call-2' } },
    ];
    const prisma = makePrisma({ callParticipants });
    const connectedUsers = new Map([['p-1', { id: 'p-1', socketId: 'sock-1', isAnonymous: true, language: 'en', resolvedLanguages: [] }]]);
    const socketToUser = new Map([['sock-1', 'p-1']]);
    const userSockets = new Map([['p-1', new Set(['sock-1'])]]);
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

  // Vague 182 (#4202/Vague 181 follow-up) — leaveCall() throws
  // CallAlreadyEndedError when this leave lost the race to a concurrent
  // terminal write, not when it genuinely failed: the call is already
  // correctly closed by whichever path won. The loop must absorb it via
  // `absorbAlreadyEndedCallLeave` instead of falling into the generic
  // `forceCleanupCallParticipant` fallback, which would force-end an
  // already-ended call a second time.
  it('absorbs CallAlreadyEndedError as a no-op instead of force-cleaning up an already-ended call', async () => {
    const socket = makeSocket('sock-1');
    const services = makeServices();
    (services.callService.leaveCall as jest.MockedFunction<any>)
      .mockRejectedValue(new CallAlreadyEndedError('completed'));
    const callParticipants = [
      { callSessionId: 'call-1', participantId: 'cp-1', callSession: { id: 'call-1' } },
    ];
    const prisma = makePrisma({ callParticipants });
    const connectedUsers = new Map([['p-1', { id: 'p-1', socketId: 'sock-1', isAnonymous: true, language: 'en', resolvedLanguages: [] }]]);
    const socketToUser = new Map([['sock-1', 'p-1']]);
    const userSockets = new Map([['p-1', new Set(['sock-1'])]]);
    const forceCleanupCallParticipant = jest.fn<any>().mockResolvedValue(undefined);
    const absorbAlreadyEndedCallLeave = jest.fn<any>().mockResolvedValue(undefined);
    const handler = new AuthHandler({
      prisma,
      ...services,
      connectedUsers,
      socketToUser,
      userSockets,
      forceCleanupCallParticipant,
      absorbAlreadyEndedCallLeave,
    });
    await handler.handleDisconnection(socket);
    expect(absorbAlreadyEndedCallLeave).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'call-1', error: expect.any(CallAlreadyEndedError) })
    );
    expect(forceCleanupCallParticipant).not.toHaveBeenCalled();
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

  // Un battement n'écrit PAS la base : `noteHeartbeat` est throttlé à 60 s dans
  // StatusService, précisément pour qu'une socket passivement connectée garde
  // `lastActiveAt` fraîche sans une écriture Prisma par battement. Ce test
  // exigeait l'inverse (`prisma.user.update` à chaque fois).
  it('note le battement pour un utilisateur enregistré, sans écrire la base', async () => {
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
    expect(services.statusService.noteHeartbeat).toHaveBeenCalledWith('u-1', false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('note le battement pour un invité anonyme, sans écrire la base', async () => {
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
    expect(services.statusService.noteHeartbeat).toHaveBeenCalledWith('p-1', true);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
