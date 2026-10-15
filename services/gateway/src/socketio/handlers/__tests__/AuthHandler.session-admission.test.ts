/**
 * #10493 — la connexion socket applique la loi du REST : un jeton n'ouvre un
 * canal temps réel que si la session qu'il NOMME vit encore
 * (`sessionAdmissionRefusal`, `services/auth/session-admission.ts`).
 *
 * Avant ce lot, un jeton SANS `sid` était admis. Le seul encore émis était
 * celui du lien « ce n'était pas moi » de l'e-mail d'alerte : qui lisait
 * l'e-mail ouvrait un socket complet au nom de l'utilisateur pendant 24 heures.
 *
 * Les jetons sont de VRAIS JWT signés : aucun double de `jwt.verify`.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AuthHandler } from '../AuthHandler';
import type { StatusService } from '../../../services/StatusService';
import { signRevokeAllLinkToken } from '../../../services/auth/revoke-all-link-token';

const SECRET = 'test-secret-socket-session-admission-0123456789';
const USER_ID = '507f1f77bcf86cd799439011';
const SID = '507f1f77bcf86cd799439022';
const NOW = new Date('2026-10-13T10:00:00.000Z');

type Session = { id: string; isValid: boolean; expiresAt: Date } | null;

function harness(session: Session | Error) {
  const findFirst = jest.fn(async (_query: unknown) => {
    if (session instanceof Error) throw session;
    return session;
  });
  const findUnique = jest.fn(async () => ({ id: USER_ID, systemLanguage: 'fr', isActive: true }));
  const prisma = {
    user: { findUnique, update: jest.fn(async () => undefined) },
    participant: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    callParticipant: { findMany: jest.fn(async () => []) },
    userSession: { findFirst, update: jest.fn(async () => undefined), updateMany: jest.fn(async () => ({ count: 0 })) },
  } as unknown as PrismaClient;

  const connectedUsers = new Map<string, unknown>();
  const handler = new AuthHandler({
    prisma,
    statusService: { updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(), markConnected: jest.fn(), markDisconnected: jest.fn() } as unknown as StatusService,
    maintenanceService: { updateUserOnlineStatus: jest.fn(async () => undefined), updateAnonymousOnlineStatus: jest.fn(async () => undefined) } as never,
    callService: { leaveCall: jest.fn(async () => undefined) } as never,
    connectedUsers: connectedUsers as never,
    socketToUser: new Map(),
    userSockets: new Map(),
    now: () => NOW,
  });
  return { handler, connectedUsers, findFirst, findUnique };
}

function socketWith(token: string): Socket {
  return {
    id: 'socket-10493',
    handshake: { auth: { token }, headers: {} },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as Socket;
}

const sessionToken = (claims: Record<string, unknown> = { sid: SID }) =>
  jwt.sign({ userId: USER_ID, username: 'alice', role: 'USER', ...claims }, SECRET, { expiresIn: '24h' });

const live = () => ({ id: SID, isValid: true, expiresAt: new Date(NOW.getTime() + 3_600_000) });

function expectRefused(socket: Socket, connectedUsers: Map<string, unknown>) {
  expect(socket.emit).toHaveBeenCalledWith('auth:session-revoked', expect.objectContaining({ code: 'session_revoked' }));
  expect(socket.emit).not.toHaveBeenCalledWith('authenticated', expect.anything());
  expect(socket.disconnect).toHaveBeenCalledWith(true);
  expect(connectedUsers.size).toBe(0);
}

describe('AuthHandler — la session nommée par le jeton doit vivre, comme au REST (#10493)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('admet un jeton dont la session nommée est valide et non échue', async () => {
    const { handler, connectedUsers, findFirst } = harness(live());
    const socket = socketWith(sessionToken());

    await handler.handleTokenAuthentication(socket);

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: SID, userId: USER_ID } }));
    expect(socket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({ success: true }));
    expect(connectedUsers.size).toBe(1);
  });

  it('refuse un jeton SANS `sid`, sans même lire le compte', async () => {
    const { handler, connectedUsers, findUnique } = harness(live());
    const socket = socketWith(sessionToken({}));

    await handler.handleTokenAuthentication(socket);

    expectRefused(socket, connectedUsers);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('refuse un `sid` inconnu', async () => {
    const { handler, connectedUsers } = harness(null);
    const socket = socketWith(sessionToken());

    await handler.handleTokenAuthentication(socket);

    expectRefused(socket, connectedUsers);
  });

  it('refuse un `sid` révoqué', async () => {
    const { handler, connectedUsers } = harness({ ...live(), isValid: false });
    const socket = socketWith(sessionToken());

    await handler.handleTokenAuthentication(socket);

    expectRefused(socket, connectedUsers);
  });

  it('refuse un `sid` échu', async () => {
    const { handler, connectedUsers } = harness({ ...live(), expiresAt: new Date(NOW.getTime() - 1) });
    const socket = socketWith(sessionToken());

    await handler.handleTokenAuthentication(socket);

    expectRefused(socket, connectedUsers);
  });

  it("refuse l'ANCIEN jeton du lien « ce n'était pas moi », signé avec JWT_SECRET", async () => {
    const { handler, connectedUsers } = harness(live());
    const legacy = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, SECRET, { expiresIn: '24h' });
    const socket = socketWith(legacy);

    await handler.handleTokenAuthentication(socket);

    expectRefused(socket, connectedUsers);
  });

  it('refuse le NOUVEAU jeton du lien : sa signature ne se vérifie pas avec JWT_SECRET', async () => {
    const { handler, connectedUsers } = harness(live());
    const socket = socketWith(signRevokeAllLinkToken({ userId: USER_ID, jwtSecret: SECRET }));

    await handler.handleTokenAuthentication(socket);

    expect(socket.emit).not.toHaveBeenCalledWith('authenticated', expect.anything());
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
  });

  it('une lecture de session qui LÈVE ferme le socket sans annoncer une révocation', async () => {
    const { handler, connectedUsers } = harness(new Error('mongo indisponible'));
    const socket = socketWith(sessionToken());

    await handler.handleTokenAuthentication(socket);

    expect(socket.emit).not.toHaveBeenCalledWith('auth:session-revoked', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('authenticated', expect.anything());
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
  });
});
