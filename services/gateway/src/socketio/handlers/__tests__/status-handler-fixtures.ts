/**
 * Fabriques partagées des suites de `StatusHandler`.
 *
 * Extraites de `StatusHandler.test.ts`, déjà hors budget (#4531) : un fichier
 * hors budget ne gagne pas de lignes, on extrait d'abord, on ajoute ensuite.
 */
import { jest } from '@jest/globals';
import type { Socket } from 'socket.io';

import { StatusHandler } from '../StatusHandler';

export const CONV_ID = '507f1f77bcf86cd799439011';
export const USER_ID = '507f1f77bcf86cd799439012';
export const SOCKET_ID = 'socket-abc';

export function makePrisma(overrides: Record<string, any> = {}): any {
  return {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: 'test-conv' }),
      ...(overrides.conversation ?? {}),
    },
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      // Backs `_getBlockedSocketIdsInRoom`'s room-membership lookup — empty by
      // default (no other online participants → no blocking check needed).
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...(overrides.participant ?? {}),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...(overrides.user ?? {}),
    },
  };
}

export function makeSocket(overrides: Record<string, any> = {}): Socket {
  // `socket.to(room)` returns a chainable object exposing both a direct
  // `.emit` (no exclusions) and `.except(socketIds).emit` (blocked viewers
  // excluded) — mirrors the real Socket.IO BroadcastOperator API.
  return {
    id: SOCKET_ID,
    // `leave` : la room est une AUTORISATION MISE EN CACHE, et `typing:start`
    // est le seul site qui repaie la vérification d'appartenance à chaque
    // événement — donc le seul qui puisse la révoquer sans coût (#5947).
    leave: jest.fn<any>().mockResolvedValue(undefined),
    to: jest.fn<any>().mockReturnValue({
      emit: jest.fn(),
      except: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    }),
    emit: jest.fn(),
    ...overrides,
  } as unknown as Socket;
}

export function makeStatusService() {
  return { updateLastSeen: jest.fn() };
}

export function makePrivacyService(shouldShow = true) {
  return {
    shouldShowTypingIndicator: jest.fn<any>().mockResolvedValue(shouldShow),
  };
}

export function makeConnectedUsers(userId = USER_ID, isAnonymous = false) {
  const users = new Map();
  users.set(userId, {
    id: userId,
    socketId: SOCKET_ID,
    isAnonymous,
    language: 'fr',
    resolvedLanguages: ['fr'],
  });
  return users;
}

export const BLOCKED_VIEWER_ID = 'blocked-viewer-id';
export const BLOCKED_SOCKET_ID = 'socket-blocked-viewer';

/**
 * A room where `BLOCKED_VIEWER_ID` is an online co-participant who has
 * blocked (or been blocked by) the typing user `USER_ID`. Mirrors the fixture
 * shape `getBlockedUserIdsAmong` expects: `prisma.user.findMany` simulates the
 * "candidate blocked me" direction (viewer → typer).
 */
export function makeBlockedScenario() {
  const connectedUsers = makeConnectedUsers();
  connectedUsers.set(BLOCKED_VIEWER_ID, {
    id: BLOCKED_VIEWER_ID,
    socketId: BLOCKED_SOCKET_ID,
    isAnonymous: false,
    language: 'en',
    resolvedLanguages: ['en'],
  });
  const userSockets = new Map([[BLOCKED_VIEWER_ID, new Set([BLOCKED_SOCKET_ID])]]);
  const dbUser = { id: USER_ID, username: 'alice', firstName: null, lastName: null, displayName: 'Alice' };
  const prisma = makePrisma({
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(dbUser),
      findMany: jest.fn<any>().mockResolvedValue([{ id: BLOCKED_VIEWER_ID }]),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ userId: BLOCKED_VIEWER_ID }]),
    },
  });
  return { connectedUsers, userSockets, prisma };
}

export function makeHandler({
  prisma = makePrisma(),
  statusService = makeStatusService(),
  privacyPreferencesService = makePrivacyService(),
  connectedUsers = makeConnectedUsers(),
  socketToUser = new Map([[SOCKET_ID, USER_ID]]),
  userSockets = new Map<string, Set<string>>(),
} = {}) {
  return new StatusHandler({
    prisma,
    statusService: statusService as any,
    privacyPreferencesService: privacyPreferencesService as any,
    connectedUsers,
    socketToUser,
    userSockets,
  });
}
