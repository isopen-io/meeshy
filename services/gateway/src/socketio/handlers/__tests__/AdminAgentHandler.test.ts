import { describe, it, expect, beforeEach } from '@jest/globals';
import { AdminAgentHandler } from '../AdminAgentHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

const createMockSocket = (): Socket => ({
  id: 'socket-123',
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
} as unknown as Socket);

const createMockPrisma = (role: string | null): PrismaClient => ({
  user: {
    findUnique: jest.fn().mockResolvedValue(role ? { role } : null),
  },
} as unknown as PrismaClient);

describe('AdminAgentHandler', () => {
  let socket: Socket;
  let socketToUser: Map<string, string>;

  beforeEach(() => {
    socket = createMockSocket();
    socketToUser = new Map([['socket-123', 'user-1']]);
  });

  it('joins the admin:agent room and acks success for an ADMIN user', async () => {
    const handler = new AdminAgentHandler({ prisma: createMockPrisma('ADMIN'), socketToUser });
    const callback = jest.fn();

    await handler.handleSubscribe(socket, callback);

    expect(socket.join).toHaveBeenCalledWith(ROOMS.adminAgent());
    expect(callback).toHaveBeenCalledWith({ success: true });
  });

  it('joins the admin:agent room for a BIGBOSS user', async () => {
    const handler = new AdminAgentHandler({ prisma: createMockPrisma('BIGBOSS'), socketToUser });

    await handler.handleSubscribe(socket);

    expect(socket.join).toHaveBeenCalledWith(ROOMS.adminAgent());
  });

  it('refuses a USER role without joining', async () => {
    const handler = new AdminAgentHandler({ prisma: createMockPrisma('USER'), socketToUser });
    const callback = jest.fn();

    await handler.handleSubscribe(socket, callback);

    expect(socket.join).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Forbidden' });
  });

  it('refuses an unauthenticated socket (no user mapping)', async () => {
    socketToUser.delete('socket-123');
    const handler = new AdminAgentHandler({ prisma: createMockPrisma('ADMIN'), socketToUser });
    const callback = jest.fn();

    await handler.handleSubscribe(socket, callback);

    expect(socket.join).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Not authenticated' });
  });

  it('refuses when the user lookup fails (anonymous session token)', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockRejectedValue(new Error('invalid ObjectId')) },
    } as unknown as PrismaClient;
    const handler = new AdminAgentHandler({ prisma, socketToUser });
    const callback = jest.fn();

    await handler.handleSubscribe(socket, callback);

    expect(socket.join).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Forbidden' });
  });

  it('leaves the room on unsubscribe', () => {
    const handler = new AdminAgentHandler({ prisma: createMockPrisma('ADMIN'), socketToUser });
    const callback = jest.fn();

    handler.handleUnsubscribe(socket, callback);

    expect(socket.leave).toHaveBeenCalledWith(ROOMS.adminAgent());
    expect(callback).toHaveBeenCalledWith({ success: true });
  });
});
