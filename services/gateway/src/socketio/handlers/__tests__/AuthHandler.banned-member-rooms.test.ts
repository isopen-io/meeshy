/**
 * #7389 — un bannissement écrit `isActive: false`, mais une restauration de
 * compte rallume la ligne sans regarder `bannedAt` : à la connexion socket,
 * l'inscrit banni ne rejoint pas la room de la conversation. Jugé sur des
 * DOCUMENTS : la colonne est ABSENTE chez le membre jamais banni, qui doit
 * rester admis.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import { LIVE_SID, liveSession } from '../../../services/auth/__tests__/live-session-double';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import jwt from 'jsonwebtoken';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const createMockSocket = (overrides: Record<string, unknown> = {}): Socket => ({
  id: 'socket-123',
  handshake: { auth: {}, headers: {} },
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
  ...overrides
} as unknown as Socket);

const createMockPrisma = (): PrismaClient => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined)
  },
  participant: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([])
  },
  userSession: { findFirst: jest.fn(async () => liveSession()) },
  callParticipant: {
    findMany: jest.fn().mockResolvedValue([])
  }
} as unknown as PrismaClient);

describe('AuthHandler — la room d’un inscrit banni (#7389)', () => {
  let authHandler: AuthHandler;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';

    mockPrisma = createMockPrisma();
    const mockStatusService = {
      updateLastSeen: jest.fn(),
      noteHeartbeat: jest.fn(),
      markConnected: jest.fn(),
      markDisconnected: jest.fn()
    } as unknown as StatusService;
    const mockMaintenanceService = {
      updateUserOnlineStatus: jest.fn().mockResolvedValue(undefined),
      updateAnonymousOnlineStatus: jest.fn().mockResolvedValue(undefined)
    };
    const mockCallService = { leaveCall: jest.fn().mockResolvedValue(undefined) };

    authHandler = new AuthHandler({
      prisma: mockPrisma,
      statusService: mockStatusService,
      maintenanceService: mockMaintenanceService as any,
      callService: mockCallService as any,
      connectedUsers: new Map(),
      socketToUser: new Map(),
      userSockets: new Map()
    });

    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: LIVE_SID, userId: 'aaaaaaaaaaaaaaaaaaaa0123' } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ne rejoint pas la room d'une conversation dont l'inscrit est banni, même ligne rallumée", async () => {
    const rows: MongoDocument[] = [
      { conversationId: 'conv-banni', userId: 'aaaaaaaaaaaaaaaaaaaa0123', isActive: true, bannedAt: new Date('2026-09-01') },
      { conversationId: 'conv-membre', userId: 'aaaaaaaaaaaaaaaaaaaa0123', isActive: true },
      { conversationId: 'conv-debanni', userId: 'aaaaaaaaaaaaaaaaaaaa0123', isActive: true, bannedAt: null },
    ];
    const mockSocket = createMockSocket({ handshake: { auth: { token: 'valid-jwt-token' } } });
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
      id: 'aaaaaaaaaaaaaaaaaaaa0123', systemLanguage: 'en',
      regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
    } as any);
    jest.spyOn((mockPrisma as any).participant, 'findMany').mockImplementation(
      async (args: any) => rows.filter((row) => matchesMongoWhere(row, args.where)).map(({ conversationId }) => ({ conversationId })),
    );

    await authHandler.handleTokenAuthentication(mockSocket);

    expect(mockSocket.join).toHaveBeenCalledWith('conversation:conv-membre');
    expect(mockSocket.join).toHaveBeenCalledWith('conversation:conv-debanni');
    expect(mockSocket.join).not.toHaveBeenCalledWith('conversation:conv-banni');
  });
});
