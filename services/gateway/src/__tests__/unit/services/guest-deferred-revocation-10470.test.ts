/**
 * #10470 (R1) — fermer un GROS lien diffère l'éviction de ses invités
 * (`closeShareLinkRevokingGuests`). Entre la fermeture et l'éviction, et une
 * heure ou plus si la révocation échoue, un invité DÉJÀ entré gardait lecture,
 * écriture et socket. La marque `guestRevocationPendingAt`, posée dans
 * l'écriture même qui ferme le lien, est désormais lue par la garde commune
 * (`guestAccessEnd`) : un invité entré AVANT la marque est « révoqué » dès la
 * fermeture, en REST, à la connexion socket et à la relecture du minuteur. Un
 * invité entré APRÈS (lien rouvert) est accepté.
 *
 * Les doubles de Prisma JUGENT chaque `where` et PROJETTENT chaque `select` :
 * une porte qui ne lit pas la marque ou `joinedAt` ne les reçoit pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../utils/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }), warn: jest.fn() },
  logError: jest.fn(),
}));

import { guestAccessEnd } from '../../../services/guestAccessEnd';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { AuthHandler } from '../../../socketio/handlers/AuthHandler';
import type { StatusService } from '../../../services/StatusService';
import { hashSessionToken } from '../../../utils/session-token';

const TOKEN = 'jeton-invite-10470';
const LINK_ID = '507f1f77bcf86cd799439033';
const CONV_ID = '507f1f77bcf86cd799439022';
const GUEST_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-13T10:00:00Z');
const CLOSED_AT = new Date('2026-10-13T09:30:00Z');
const BEFORE = new Date('2026-10-13T09:00:00Z');
const AFTER = new Date('2026-10-13T09:45:00Z');
const MINUTE = 60 * 1000;

const live = { isActive: true, bannedAt: null };

function project(row: MongoDocument | null | undefined, select: unknown): MongoDocument | null {
  if (!row) return null;
  if (!select || typeof select !== 'object') return row;
  return Object.fromEntries(
    Object.entries(select as Record<string, unknown>)
      .filter(([key, wanted]) => wanted && key in row)
      .map(([key, wanted]) => {
        const nested = (wanted as { select?: unknown }).select;
        return [key, nested ? project(row[key] as MongoDocument, nested) : row[key]];
      })
  );
}

function guestRow(joinedAt: Date): MongoDocument {
  return {
    id: GUEST_ID,
    conversationId: CONV_ID,
    type: 'anonymous',
    sessionTokenHash: hashSessionToken(TOKEN),
    displayName: 'Invité',
    avatar: null,
    role: 'member',
    language: 'fr',
    permissions: null,
    isActive: true,
    bannedAt: null,
    isOnline: false,
    lastActiveAt: NOW,
    nickname: null,
    joinedAt,
    shareLinkId: LINK_ID,
    anonymousSession: { shareLinkId: LINK_ID, profile: { username: 'invite' } },
  };
}

type World = { participants: MongoDocument[]; links: MongoDocument[] };

function prismaOf(world: World) {
  return {
    user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userSession: { findFirst: jest.fn<any>().mockResolvedValue(null), update: jest.fn<any>() },
    participant: {
      findFirst: jest.fn<any>(async ({ where, select }: { where: MongoDocument; select?: unknown }) =>
        project(world.participants.find((row) => matchesMongoWhere(row, where)), select)
      ),
      findMany: jest.fn<any>(async () => []),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    conversationShareLink: {
      findUnique: jest.fn<any>(async ({ where, select }: { where: MongoDocument; select?: unknown }) =>
        project(world.links.find((row) => matchesMongoWhere(row, where)), select)
      ),
    },
    callParticipant: { findMany: jest.fn<any>(async () => []) },
  };
}

const closedLink = (): MongoDocument => ({ id: LINK_ID, isActive: false, expiresAt: null, guestRevocationPendingAt: CLOSED_AT });

describe('guestAccessEnd — une révocation en attente retire l’accès aux invités entrés avant elle (#10470)', () => {
  it('entré avant la marque ⇒ « accès retiré »', () => {
    expect(guestAccessEnd({
      linkExpiresAt: null, linkRevocationPendingAt: CLOSED_AT, participation: { ...live, joinedAt: BEFORE }, now: NOW,
    })).toBe('revoked');
  });

  it('entré à l’instant même de la marque ⇒ « accès retiré »', () => {
    expect(guestAccessEnd({
      linkExpiresAt: null, linkRevocationPendingAt: CLOSED_AT, participation: { ...live, joinedAt: CLOSED_AT }, now: NOW,
    })).toBe('revoked');
  });

  it('entré après la marque (lien rouvert) ⇒ accès ouvert', () => {
    expect(guestAccessEnd({
      linkExpiresAt: null, linkRevocationPendingAt: CLOSED_AT, participation: { ...live, joinedAt: AFTER }, now: NOW,
    })).toBeNull();
  });

  it('marque posée mais date d’entrée inconnue ⇒ « accès retiré » (fail-closed)', () => {
    expect(guestAccessEnd({
      linkExpiresAt: null, linkRevocationPendingAt: CLOSED_AT, participation: live, now: NOW,
    })).toBe('revoked');
  });

  it('audit 1 — un invité réservé avant la fermeture mais créé après la marque est refusé tant que le lien reste fermé', () => {
    expect(guestAccessEnd({
      linkExpiresAt: null, linkIsActive: false, linkRevocationPendingAt: CLOSED_AT, participation: { ...live, joinedAt: AFTER }, now: NOW,
    })).toBe('revoked');
  });

  it('audit 1 — un lien fermé sans marque refuse aussi ; un lien introuvable ne décide rien', () => {
    expect(guestAccessEnd({ linkExpiresAt: null, linkIsActive: false, participation: { ...live, joinedAt: AFTER }, now: NOW })).toBe('revoked');
    expect(guestAccessEnd({ linkExpiresAt: null, linkIsActive: null, participation: { ...live, joinedAt: AFTER }, now: NOW })).toBeNull();
  });

  it('le lien expiré reste la cause première', () => {
    expect(guestAccessEnd({
      linkExpiresAt: BEFORE, linkRevocationPendingAt: CLOSED_AT, participation: { ...live, joinedAt: BEFORE }, now: NOW,
    })).toBe('link-expired');
  });
});

describe('REST — la résolution de session lit la marque (#10470)', () => {
  async function call(world: World) {
    const app = Fastify({ logger: false });
    app.get(
      '/sonde',
      { preValidation: [createUnifiedAuthMiddleware(prismaOf(world) as never, { requireAuth: true, allowAnonymous: true })] },
      async (_request, reply) => reply.send({ ok: true })
    );
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/sonde', headers: { 'x-session-token': TOKEN } });
    await app.close();
    return res;
  }

  it('un invité entré avant la fermeture d’un gros lien est refusé en 410 GUEST_ACCESS_REVOKED dès la fermeture', async () => {
    const res = await call({ participants: [guestRow(BEFORE)], links: [closedLink()] });

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ success: false, error: 'GUEST_ACCESS_REVOKED' });
  });

  it('un invité entré après la réouverture est accepté', async () => {
    const res = await call({ participants: [guestRow(AFTER)], links: [{ ...closedLink(), isActive: true }] });

    expect(res.statusCode).toBe(200);
  });

  it('audit 1 — un invité créé après la marque d’un lien encore FERMÉ est refusé', async () => {
    const res = await call({ participants: [guestRow(AFTER)], links: [closedLink()] });

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ error: 'GUEST_ACCESS_REVOKED' });
  });
});

describe('Socket — la connexion et le minuteur lisent la marque (#10470)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function handlerOf(world: World) {
    return new AuthHandler({
      prisma: prismaOf(world) as unknown as PrismaClient,
      statusService: { updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(), markConnected: jest.fn(), markDisconnected: jest.fn() } as unknown as StatusService,
      maintenanceService: { updateUserOnlineStatus: jest.fn(async () => undefined), updateAnonymousOnlineStatus: jest.fn(async () => undefined) } as never,
      callService: { leaveCall: jest.fn(async () => undefined) } as never,
      connectedUsers: new Map() as never,
      socketToUser: new Map(),
      userSockets: new Map(),
    });
  }

  function guestSocket() {
    const disconnectListeners: Array<() => void> = [];
    const socket = {
      id: 'socket-guest',
      handshake: { auth: { sessionToken: TOKEN }, headers: {} },
      emit: jest.fn(),
      join: jest.fn(async (_room: string) => undefined),
      leave: jest.fn(),
      on: jest.fn((event: string, listener: () => void) => {
        if (event === 'disconnect') disconnectListeners.push(listener);
      }),
      off: jest.fn(),
      disconnected: false,
      disconnect: jest.fn((_close?: boolean) => {
        socket.disconnected = true;
        disconnectListeners.forEach((listener) => listener());
      }),
    };
    return socket;
  }

  const revokedError = (socket: ReturnType<typeof guestSocket>) =>
    socket.emit.mock.calls.filter(([event, data]) => event === 'error' && (data as { code?: string })?.code === 'GUEST_ACCESS_REVOKED');
  const joinedRoom = (socket: ReturnType<typeof guestSocket>) =>
    socket.join.mock.calls.some(([room]) => room === `conversation:${CONV_ID}`);

  it('à la connexion, un invité entré avant la fermeture est refusé : aucune room, socket coupé', async () => {
    const socket = guestSocket();

    await handlerOf({ participants: [guestRow(BEFORE)], links: [closedLink()] }).handleTokenAuthentication(socket as never);

    expect(revokedError(socket)).toHaveLength(1);
    expect(joinedRoom(socket)).toBe(false);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('un invité entré après la réouverture est admis', async () => {
    const socket = guestSocket();

    await handlerOf({ participants: [guestRow(AFTER)], links: [{ ...closedLink(), isActive: true }] }).handleTokenAuthentication(socket as never);

    expect(joinedRoom(socket)).toBe(true);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('un invité déjà connecté est coupé à la relecture du minuteur quand la marque est posée', async () => {
    const world: World = { participants: [guestRow(BEFORE)], links: [{ id: LINK_ID, isActive: true, expiresAt: null }] };
    const socket = guestSocket();

    await handlerOf(world).handleTokenAuthentication(socket as never);
    expect(joinedRoom(socket)).toBe(true);
    world.links[0] = closedLink();

    await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
    expect(revokedError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});
