/**
 * Unit tests for AuthHandler.handleHeartbeat.
 *
 * A connected socket that pings (with no other activity) must refresh
 * lastActiveAt through StatusService.noteHeartbeat (throttled to at most one
 * write per 60s) so a passive-connected user stays 'online' under the 5min
 * anti-stale guard of the 1/3/5 presence rule — and the handler must NOT
 * issue a per-beat unthrottled Prisma write.
 */

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
  },
}));

import { AuthHandler } from '../../../socketio/handlers/AuthHandler';
import type { AuthHandlerDependencies } from '../../../socketio/handlers/AuthHandler';

const SOCKET_ID = 'socket-hb';
const USER_ID = 'user-hb';

function makeSocket() {
  return { id: SOCKET_ID, emit: jest.fn() } as any;
}

function makeDeps(overrides: Partial<{
  socketToUser: Map<string, string>;
  connectedUsers: Map<string, { isAnonymous: boolean }>;
}> = {}) {
  const prisma = {
    user: { update: jest.fn().mockResolvedValue(undefined) },
    participant: { update: jest.fn().mockResolvedValue(undefined) },
  };
  const statusService = { noteHeartbeat: jest.fn() };
  const deps = {
    prisma,
    statusService,
    maintenanceService: {},
    callService: {},
    connectedUsers: overrides.connectedUsers ?? new Map([[USER_ID, { isAnonymous: false }]]),
    socketToUser: overrides.socketToUser ?? new Map([[SOCKET_ID, USER_ID]]),
    userSockets: new Map<string, Set<string>>(),
  };
  return { deps: deps as unknown as AuthHandlerDependencies, prisma, statusService };
}

describe('AuthHandler.handleHeartbeat', () => {
  it('acks the heartbeat and refreshes presence via the throttled StatusService path', async () => {
    const { deps, prisma, statusService } = makeDeps();
    const handler = new AuthHandler(deps);
    const socket = makeSocket();

    await handler.handleHeartbeat(socket, { clientTime: Date.now() - 12 });

    expect(socket.emit).toHaveBeenCalledWith('heartbeat:ack', {
      serverTime: expect.any(String),
      latencyHintMs: expect.any(Number),
    });
    expect(statusService.noteHeartbeat).toHaveBeenCalledWith(USER_ID, false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('passes the anonymous flag through to noteHeartbeat', async () => {
    const { deps, statusService } = makeDeps({
      connectedUsers: new Map([[USER_ID, { isAnonymous: true }]]),
    });
    const handler = new AuthHandler(deps);

    await handler.handleHeartbeat(makeSocket());

    expect(statusService.noteHeartbeat).toHaveBeenCalledWith(USER_ID, true);
  });

  it('ignores heartbeats from unauthenticated sockets (no ack, no refresh)', async () => {
    const { deps, statusService } = makeDeps({ socketToUser: new Map() });
    const handler = new AuthHandler(deps);
    const socket = makeSocket();

    await handler.handleHeartbeat(socket);

    expect(socket.emit).not.toHaveBeenCalled();
    expect(statusService.noteHeartbeat).not.toHaveBeenCalled();
  });

  it('omits latencyHintMs when the client sends no clientTime', async () => {
    const { deps } = makeDeps();
    const handler = new AuthHandler(deps);
    const socket = makeSocket();

    await handler.handleHeartbeat(socket);

    expect(socket.emit).toHaveBeenCalledWith('heartbeat:ack', {
      serverTime: expect.any(String),
      latencyHintMs: undefined,
    });
  });
});
