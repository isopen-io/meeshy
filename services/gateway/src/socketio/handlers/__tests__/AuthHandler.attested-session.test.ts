/**
 * Audit adversarial #9608, P3 — le socket lit la MÊME adresse que REST, et
 * porte la session que nomme son JWT.
 *
 * 1. `handleManualAuthentication` limitait le débit sur
 *    `socket.handshake.address` — derrière Traefik, l'adresse du proxy, la
 *    même pour tous les clients : un seul seau pour toute la planète.
 *    L'adresse attestée se résout comme `request.ip` de Fastify, sous le même
 *    `trustProxy` borné (`config/trust-proxy.ts`).
 * 2. Le socket n'était étiqueté par sa session (`SOCKET_SESSION_ID`) que si le
 *    client transmettait son jeton de session au handshake. Le `sid` du JWT,
 *    pourtant VÉRIFIÉ quelques lignes plus haut, n'était pas posé : un client
 *    sans ce jeton gardait son socket ouvert après la révocation de sa
 *    session (`disconnectSession` filtre sur l'étiquette).
 *
 * Fichier séparé : `AuthHandler.test.ts` est dans la dette du cliquet de taille.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AuthHandler } from '../AuthHandler';
import { SOCKET_SESSION_ID } from '../../disconnectSession';
import { attestedSocketAddress } from '../../utils/attested-address';
import { resolveTrustProxy } from '../../../config/trust-proxy';
import type { StatusService } from '../../../services/StatusService';

const mockCheckLimit = jest.fn(async (_key: string, _limit: unknown) => true);
jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({ checkLimit: (key: string, limit: unknown) => mockCheckLimit(key, limit) }),
  SOCKET_RATE_LIMITS: { SOCKET_AUTH: { max: 10, windowMs: 60_000 } },
}));

const TRAEFIK = '172.18.0.2';

const socketFrom = (overrides: Record<string, unknown> = {}): Socket => ({
  id: 'socket-1',
  data: {},
  handshake: { auth: {}, headers: {}, address: TRAEFIK },
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
  ...overrides,
} as unknown as Socket);

function handler() {
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ id: 'user-1', systemLanguage: 'fr' })), update: jest.fn(async () => undefined) },
    participant: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    callParticipant: { findMany: jest.fn(async () => []) },
    userSession: { findFirst: jest.fn(async () => ({ id: 'sid-du-jwt' })) },
  } as unknown as PrismaClient;
  const authHandler = new AuthHandler({
    prisma,
    statusService: { updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(), markConnected: jest.fn(), markDisconnected: jest.fn() } as unknown as StatusService,
    maintenanceService: { updateUserOnlineStatus: jest.fn(async () => undefined), updateAnonymousOnlineStatus: jest.fn(async () => undefined) } as never,
    callService: { leaveCall: jest.fn(async () => undefined) } as never,
    connectedUsers: new Map(),
    socketToUser: new Map(),
    userSockets: new Map(),
  });
  return { authHandler, prisma };
}

describe('P3 — le socket porte la session du JWT, et le débit se compte sur l’adresse attestée', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-attested-session';
    process.env.TRUST_PROXY_HOPS = '1';
    mockCheckLimit.mockClear();
    jest.spyOn(jwt, 'verify').mockReturnValue({ userId: 'user-1', sid: 'sid-du-jwt' } as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.TRUST_PROXY_HOPS;
  });

  it('sans jeton de session au handshake, le socket est étiqueté par le `sid` vérifié', async () => {
    const { authHandler } = handler();
    const socket = socketFrom({ handshake: { auth: { token: 'jwt' }, headers: {}, address: TRAEFIK } });

    await authHandler.handleTokenAuthentication(socket);

    expect((socket.data as Record<string, unknown>)[SOCKET_SESSION_ID]).toBe('sid-du-jwt');
  });

  it("deux clients derrière le même Traefik ont deux seaux de débit — ceux de leurs adresses attestées", async () => {
    const { authHandler } = handler();
    const a = socketFrom({ handshake: { auth: {}, headers: { 'x-forwarded-for': '203.0.113.1' }, address: TRAEFIK } });
    const b = socketFrom({ handshake: { auth: {}, headers: { 'x-forwarded-for': '203.0.113.2' }, address: TRAEFIK } });

    await authHandler.handleManualAuthentication(a, { token: 'jwt' });
    await authHandler.handleManualAuthentication(b, { token: 'jwt' });

    expect(mockCheckLimit.mock.calls.map((call) => call[0])).toEqual(['203.0.113.1', '203.0.113.2']);
  });

  it('un client qui préfixe X-Forwarded-For ne choisit pas son seau', async () => {
    const { authHandler } = handler();
    const forge = socketFrom({ handshake: { auth: {}, headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.1' }, address: TRAEFIK } });

    await authHandler.handleManualAuthentication(forge, { token: 'jwt' });

    expect(mockCheckLimit.mock.calls[0]?.[0]).toBe('203.0.113.1');
  });
});

describe('attestedSocketAddress rend exactement ce que Fastify rend pour `request.ip`', () => {
  const cas: Array<[string, string, string | undefined, string]> = [
    ['un maillon de confiance, chaîne forgée à gauche', '1', '6.6.6.6, 203.0.113.9', TRAEFIK],
    ['un maillon, sans en-tête', '1', undefined, TRAEFIK],
    ['deux maillons (CDN devant)', '2', '6.6.6.6, 203.0.113.9, 198.51.100.7', TRAEFIK],
    ['aucun mandataire de confiance', '0', '6.6.6.6', TRAEFIK],
  ];

  it.each(cas)('%s', async (_nom, hops, xff, remote) => {
    const app = Fastify({ logger: false, trustProxy: resolveTrustProxy(hops) });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/ip', remoteAddress: remote, headers: xff ? { 'x-forwarded-for': xff } : {} });
    await app.close();

    const attendu = (res.json() as { ip: string }).ip;
    expect(attestedSocketAddress({ address: remote, headers: xff ? { 'x-forwarded-for': xff } : {} }, resolveTrustProxy(hops))).toBe(attendu);
  });
});
