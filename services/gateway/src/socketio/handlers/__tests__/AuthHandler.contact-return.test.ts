/**
 * « X était sur Meeshy récemment » (#8285) — le DÉCLENCHEUR.
 *
 * Devenir actif, c'est ouvrir sa première socket authentifiée : l'annonce est
 * programmée à cette transition 0→1 d'un compte inscrit, jamais pour une
 * socket supplémentaire du même compte, jamais pour un participant anonyme.
 * Le verrou de 3 h et le reste des règles vivent dans l'annonce elle-même.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const scheduled: string[] = [];
jest.mock('../../../services/notifications/contact-recently-active', () => ({
  scheduleContactRecentlyActiveAnnouncement: (_prisma: unknown, userId: string) => {
    scheduled.push(userId);
  },
}));

import { AuthHandler } from '../AuthHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { StatusService } from '../../../services/StatusService';
import type { MaintenanceService } from '../../../services/MaintenanceService';
import type { CallService } from '../../../services/CallService';
import jwt from 'jsonwebtoken';

const socketNamed = (id: string, auth: Record<string, string>): Socket =>
  ({ id, handshake: { auth, headers: {} }, emit: jest.fn(), join: jest.fn(), leave: jest.fn(), on: jest.fn(), disconnect: jest.fn() }) as unknown as Socket;

function handler() {
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        id: 'user-123', systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      })),
      update: jest.fn(async () => undefined),
    },
    participant: {
      findFirst: jest.fn(async () => ({ id: 'anon-1', displayName: 'Anonyme', language: 'fr', conversationId: 'conv-1' })),
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    callParticipant: { findMany: jest.fn(async () => []) },
  } as unknown as PrismaClient;
  return new AuthHandler({
    prisma,
    statusService: { updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(), markConnected: jest.fn(), markDisconnected: jest.fn() } as unknown as StatusService,
    maintenanceService: {
      updateUserOnlineStatus: jest.fn(async () => undefined),
      updateAnonymousOnlineStatus: jest.fn(async () => undefined),
    } as unknown as MaintenanceService,
    callService: { leaveCall: jest.fn(async () => undefined) } as unknown as CallService,
    connectedUsers: new Map(),
    socketToUser: new Map(),
    userSockets: new Map(),
  });
}

beforeEach(() => {
  scheduled.length = 0;
  process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
  jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-123' } as never);
});

afterEach(() => jest.restoreAllMocks());

describe('l’annonce de retour part à la première socket authentifiée', () => {
  it('un compte qui devient actif programme UNE annonce', async () => {
    const auth = handler();

    await auth.handleTokenAuthentication(socketNamed('s-a', { token: 'jwt' }));

    expect(scheduled).toEqual(['user-123']);
  });

  it('un second appareil du même compte n’en programme pas une seconde', async () => {
    const auth = handler();

    await auth.handleTokenAuthentication(socketNamed('s-a', { token: 'jwt' }));
    await auth.handleTokenAuthentication(socketNamed('s-b', { token: 'jwt' }));

    expect(scheduled).toEqual(['user-123']);
  });

  it('un participant anonyme n’annonce rien', async () => {
    const auth = handler();

    await auth.handleTokenAuthentication(socketNamed('s-anon', { sessionToken: 'anon-session' }));

    expect(scheduled).toEqual([]);
  });
});
