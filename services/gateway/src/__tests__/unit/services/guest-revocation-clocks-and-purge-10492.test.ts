/**
 * #10492 — deux réserves de l'audit de #10470 (révocation DIFFÉRÉE des invités
 * d'un gros lien, marque `ConversationShareLink.guestRevocationPendingAt`).
 *
 * R4 — la marque est datée par l'instance qui ferme, `Participant.joinedAt`
 * par celle qui admet. Sous dérive d'horloges, un invité entré AVANT la
 * fermeture peut porter une date d'entrée postérieure à la marque : une marge
 * (`GUEST_ADMISSION_CLOCK_MARGIN_MS`) le tient pour entré avant, à la garde
 * commune comme à la révocation d'un lien rouvert.
 *
 * R5 — une purge qui supprime la ligne du lien emportait la marque et laissait
 * ses invités actifs. La purge ferme et marque, révoque, PUIS supprime ; un
 * invité dont le lien n'existe plus est refusé à chaque porte ; le balayage
 * horaire relève ceux qui restent.
 *
 * Les doubles de Prisma JUGENT chaque `where` sur un monde en mémoire que les
 * écritures modifient : c'est l'état final qui parle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../utils/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
  logError: jest.fn(),
}));

import { guestAccessEnd, GUEST_ADMISSION_CLOCK_MARGIN_MS } from '../../../services/guestAccessEnd';
import { runPendingGuestRevocation } from '../../../socketio/closeShareLinkRevokingGuests';
import { deleteShareLinksRevokingGuests } from '../../../socketio/deleteShareLinksRevokingGuests';
import { ExpiredShareLinksCleanupService, MISSING_SHARE_LINKS_BREAKER } from '../../../services/ExpiredShareLinksCleanupService';
import {
  resolveAnonymousUploadIdentity,
  GuestUploadAccessRevokedError,
  type AnonymousUploadIdentityPrisma,
} from '../../../services/attachments/AnonymousUploadIdentity';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { AuthHandler } from '../../../socketio/handlers/AuthHandler';
import type { StatusService } from '../../../services/StatusService';
import { hashSessionToken } from '../../../utils/session-token';

const TOKEN = 'jeton-invite-10492';
const LINK_ID = '507f1f77bcf86cd799439033';
const OTHER_LINK_ID = '507f1f77bcf86cd799439044';
const GONE_LINK_ID = '507f1f77bcf86cd799439055';
const CONV_ID = '507f1f77bcf86cd799439022';
const OWNER_ID = '507f1f77bcf86cd799439066';
const NOW = new Date('2026-10-13T10:00:00Z');
const CLOSED_AT = new Date('2026-10-13T09:30:00Z');
const MINUTE = 60 * 1000;
const after = (ms: number) => new Date(CLOSED_AT.getTime() + ms);

const live = { isActive: true, bannedAt: null };

type World = { participants: MongoDocument[]; links: MongoDocument[] };
type Args = { where?: MongoDocument; data?: MongoDocument; select?: unknown };

let guestSeq = 0;
function guest(overrides: MongoDocument = {}): MongoDocument {
  guestSeq += 1;
  return {
    id: `507f1f77bcf86cd7994391${String(guestSeq).padStart(2, '0')}`,
    conversationId: CONV_ID,
    type: 'anonymous',
    sessionTokenHash: `hash-${guestSeq}`,
    displayName: `Invité ${guestSeq}`,
    avatar: null,
    role: 'member',
    language: 'fr',
    permissions: null,
    isActive: true,
    bannedAt: null,
    isOnline: false,
    lastActiveAt: NOW,
    nickname: null,
    joinedAt: after(-30 * MINUTE),
    shareLinkId: LINK_ID,
    anonymousSession: { shareLinkId: LINK_ID, profile: { username: 'invite' } },
    ...overrides,
  };
}

const tokenGuest = (overrides: MongoDocument = {}) => guest({ sessionTokenHash: hashSessionToken(TOKEN), ...overrides });

function link(overrides: MongoDocument = {}): MongoDocument {
  return { id: LINK_ID, createdBy: OWNER_ID, isActive: true, expiresAt: null, guestRevocationPendingAt: null, ...overrides };
}

function prismaOf(world: World, faults: { participantWrites?: Error; linkReads?: Error } = {}) {
  const matching = (rows: MongoDocument[], where?: MongoDocument) => rows.filter((row) => matchesMongoWhere(row, where));
  const write = (rows: MongoDocument[], args: Args) => {
    const touched = matching(rows, args.where);
    touched.forEach((row) => Object.assign(row, args.data));
    return { count: touched.length };
  };
  return {
    user: { findUnique: jest.fn(async (_args: Args) => null) },
    userSession: { findFirst: jest.fn(async (_args: Args) => null), update: jest.fn(async (_args: Args) => ({})) },
    participant: {
      findFirst: jest.fn(async (args: Args) => matching(world.participants, args.where)[0] ?? null),
      findMany: jest.fn(async (args: Args) => matching(world.participants, args.where)),
      count: jest.fn(async (args: Args) => matching(world.participants, args.where).length),
      groupBy: jest.fn(async (args: Args) =>
        [...new Set(matching(world.participants, args.where).map((row) => row['shareLinkId']))].map((shareLinkId) => ({ shareLinkId }))
      ),
      update: jest.fn(async (_args: Args) => ({})),
      updateMany: jest.fn(async (args: Args) => {
        if (faults.participantWrites) throw faults.participantWrites;
        return write(world.participants, args);
      }),
    },
    conversationShareLink: {
      findUnique: jest.fn(async (args: Args) => {
        if (faults.linkReads) throw faults.linkReads;
        return matching(world.links, args.where)[0] ?? null;
      }),
      findFirst: jest.fn(async (args: Args) => matching(world.links, args.where)[0] ?? null),
      findMany: jest.fn(async (args: Args) => {
        if (faults.linkReads) throw faults.linkReads;
        return matching(world.links, args.where);
      }),
      count: jest.fn(async (args?: Args) => matching(world.links, args?.where).length),
      update: jest.fn(async (args: Args) => write(world.links, args)),
      updateMany: jest.fn(async (args: Args) => write(world.links, args)),
      deleteMany: jest.fn(async (args: Args) => {
        const removed = matching(world.links, args.where);
        world.links.splice(0, world.links.length, ...world.links.filter((row) => !removed.includes(row)));
        return { count: removed.length };
      }),
    },
    callParticipant: { findMany: jest.fn(async (_args: Args) => []) },
  };
}

const asPrisma = (double: ReturnType<typeof prismaOf>) => double as unknown as PrismaClient;
const activeGuestsOf = (world: World, shareLinkId: string) =>
  world.participants.filter((row) => row['shareLinkId'] === shareLinkId && row['isActive'] === true);

describe('R4 — la marge d’horloge de la garde commune (guestAccessEnd)', () => {
  const pending = { linkExpiresAt: null, linkIsActive: true, linkRevocationPendingAt: CLOSED_AT, now: NOW };

  it('la marge se compte en secondes', () => {
    expect(GUEST_ADMISSION_CLOCK_MARGIN_MS).toBeGreaterThanOrEqual(5_000);
    expect(GUEST_ADMISSION_CLOCK_MARGIN_MS).toBeLessThanOrEqual(60_000);
  });

  it('un invité daté 3 s APRÈS la marque (instance en avance) est tenu pour entré avant ⇒ « accès retiré »', () => {
    expect(guestAccessEnd({ ...pending, participation: { ...live, joinedAt: after(3_000) } })).toBe('revoked');
  });

  it('la borne de la marge est comprise', () => {
    expect(guestAccessEnd({ ...pending, participation: { ...live, joinedAt: after(GUEST_ADMISSION_CLOCK_MARGIN_MS) } })).toBe('revoked');
  });

  it('au-delà de la marge, un invité entré après une réouverture garde son accès', () => {
    expect(guestAccessEnd({ ...pending, participation: { ...live, joinedAt: after(GUEST_ADMISSION_CLOCK_MARGIN_MS + 1) } })).toBeNull();
  });
});

describe('R4 — la marge d’horloge de la révocation différée d’un lien ROUVERT', () => {
  it('retire l’invité daté dans la marge, garde celui entré après elle, et lève la marque', async () => {
    const skewed = guest({ joinedAt: after(3_000) });
    const newcomer = guest({ joinedAt: after(GUEST_ADMISSION_CLOCK_MARGIN_MS + 1) });
    const world: World = { participants: [skewed, newcomer], links: [link({ guestRevocationPendingAt: CLOSED_AT })] };

    const done = await runPendingGuestRevocation({
      prisma: asPrisma(prismaOf(world)), io: null, manager: null, shareLinkId: LINK_ID, pendingSince: CLOSED_AT,
    });

    expect(done).toBe(true);
    expect(skewed['isActive']).toBe(false);
    expect(newcomer['isActive']).toBe(true);
    expect(world.links[0]['guestRevocationPendingAt']).toBeNull();
  });
});

describe('R5 — un invité dont le lien n’existe plus est refusé à chaque porte', () => {
  it('guestAccessEnd : lien introuvable ⇒ « accès retiré », lien non lu ⇒ rien n’est décidé', () => {
    expect(guestAccessEnd({ linkExpiresAt: null, linkMissing: true, participation: live, now: NOW })).toBe('revoked');
    expect(guestAccessEnd({ linkExpiresAt: null, linkMissing: false, participation: live, now: NOW })).toBeNull();
    expect(guestAccessEnd({ linkExpiresAt: null, participation: live, now: NOW })).toBeNull();
  });

  it('REST : 410 GUEST_ACCESS_REVOKED', async () => {
    const world: World = { participants: [tokenGuest({ shareLinkId: GONE_LINK_ID, anonymousSession: { shareLinkId: GONE_LINK_ID } })], links: [] };
    const app = Fastify({ logger: false });
    app.get(
      '/sonde',
      { preValidation: [createUnifiedAuthMiddleware(prismaOf(world) as never, { requireAuth: true, allowAnonymous: true })] },
      async (_request, reply) => reply.send({ ok: true })
    );
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/sonde', headers: { 'x-session-token': TOKEN } });
    await app.close();

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ success: false, error: 'GUEST_ACCESS_REVOKED' });
  });

  it('REST : un invité sans lien (ni colonne, ni session) n’est pas concerné', async () => {
    const world: World = { participants: [tokenGuest({ shareLinkId: null, anonymousSession: { profile: { username: 'invite' } } })], links: [] };
    const app = Fastify({ logger: false });
    app.get(
      '/sonde',
      { preValidation: [createUnifiedAuthMiddleware(prismaOf(world) as never, { requireAuth: true, allowAnonymous: true })] },
      async (_request, reply) => reply.send({ ok: true })
    );
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/sonde', headers: { 'x-session-token': TOKEN } });
    await app.close();

    expect(res.statusCode).toBe(200);
  });

  it('téléversement : aucune identité servie, et la cause est l’accès retiré', async () => {
    const world: World = { participants: [tokenGuest({ shareLinkId: GONE_LINK_ID })], links: [] };

    await expect(
      resolveAnonymousUploadIdentity(prismaOf(world) as unknown as AnonymousUploadIdentityPrisma, TOKEN)
    ).rejects.toBeInstanceOf(GuestUploadAccessRevokedError);
  });

  it('téléversement : un invité désactivé lit la même cause, un jeton inconnu aucune identité', async () => {
    const world: World = { participants: [tokenGuest({ isActive: false })], links: [link()] };
    const double = prismaOf(world) as unknown as AnonymousUploadIdentityPrisma;

    await expect(resolveAnonymousUploadIdentity(double, TOKEN)).rejects.toBeInstanceOf(GuestUploadAccessRevokedError);
    await expect(resolveAnonymousUploadIdentity(double, 'jeton-inconnu')).resolves.toBeNull();
  });

  describe('socket', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: NOW });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const handlerOf = (world: World) => new AuthHandler({
      prisma: asPrisma(prismaOf(world)),
      statusService: { updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(), markConnected: jest.fn(), markDisconnected: jest.fn() } as unknown as StatusService,
      maintenanceService: { updateUserOnlineStatus: jest.fn(async () => undefined), updateAnonymousOnlineStatus: jest.fn(async () => undefined) } as never,
      callService: { leaveCall: jest.fn(async () => undefined) } as never,
      connectedUsers: new Map() as never,
      socketToUser: new Map(),
      userSockets: new Map(),
    });

    function guestSocket() {
      const disconnectListeners: Array<() => void> = [];
      const socket = {
        id: 'socket-guest',
        handshake: { auth: { sessionToken: TOKEN }, headers: {} },
        emit: jest.fn((_event: string, _data?: unknown) => true),
        join: jest.fn(async (_room: string) => undefined),
        leave: jest.fn((_room: string) => undefined),
        on: jest.fn((event: string, listener: () => void) => {
          if (event === 'disconnect') disconnectListeners.push(listener);
        }),
        off: jest.fn((_event: string, _listener: () => void) => undefined),
        disconnected: false,
        disconnect: jest.fn((_close?: boolean) => {
          socket.disconnected = true;
          disconnectListeners.forEach((listener) => listener());
        }),
      };
      return socket;
    }

    const revokedErrors = (socket: ReturnType<typeof guestSocket>) =>
      socket.emit.mock.calls.filter(([event, data]) => event === 'error' && (data as { code?: string } | undefined)?.code === 'GUEST_ACCESS_REVOKED');
    const joinedRoom = (socket: ReturnType<typeof guestSocket>) =>
      socket.join.mock.calls.some(([room]) => room === `conversation:${CONV_ID}`);

    it('à la connexion : aucune room, socket coupé', async () => {
      const socket = guestSocket();

      await handlerOf({ participants: [tokenGuest({ shareLinkId: GONE_LINK_ID })], links: [] }).handleTokenAuthentication(socket as never);

      expect(revokedErrors(socket)).toHaveLength(1);
      expect(joinedRoom(socket)).toBe(false);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('déjà connecté : coupé à la relecture du minuteur quand la ligne du lien disparaît', async () => {
      const world: World = { participants: [tokenGuest()], links: [link()] };
      const socket = guestSocket();

      await handlerOf(world).handleTokenAuthentication(socket as never);
      expect(joinedRoom(socket)).toBe(true);
      world.links.splice(0, 1);

      await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
      expect(revokedErrors(socket)).toHaveLength(1);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });
});

describe('R5 — supprimer des liens révoque d’abord leurs invités (deleteShareLinksRevokingGuests)', () => {
  const purge = (double: ReturnType<typeof prismaOf>) =>
    deleteShareLinksRevokingGuests({ prisma: asPrisma(double), io: null, manager: null, where: { createdBy: OWNER_ID }, now: () => NOW });

  it('un lien MARQUÉ purgé ne laisse aucun invité actif, et sa ligne part', async () => {
    const world: World = {
      participants: [guest(), guest({ joinedAt: after(5 * MINUTE) }), guest({ shareLinkId: OTHER_LINK_ID, anonymousSession: { shareLinkId: OTHER_LINK_ID } })],
      links: [link({ isActive: false, guestRevocationPendingAt: CLOSED_AT }), link({ id: OTHER_LINK_ID, createdBy: 'quelqu-un-d-autre' })],
    };

    const result = await purge(prismaOf(world));

    expect(result).toEqual({ count: 1 });
    expect(activeGuestsOf(world, LINK_ID)).toHaveLength(0);
    expect(world.links.map((row) => row['id'])).toEqual([OTHER_LINK_ID]);
    expect(activeGuestsOf(world, OTHER_LINK_ID)).toHaveLength(1);
  });

  it('un lien encore OUVERT est fermé et marqué AVANT la première écriture sur ses invités', async () => {
    const world: World = { participants: [guest()], links: [link()] };
    const double = prismaOf(world);
    const linkStateAtFirstGuestWrite: MongoDocument[] = [];
    const write = double.participant.updateMany.getMockImplementation()!;
    double.participant.updateMany.mockImplementation(async (args: Args) => {
      linkStateAtFirstGuestWrite.push({ ...world.links[0] });
      return write(args);
    });

    await purge(double);

    expect(linkStateAtFirstGuestWrite[0]).toMatchObject({ isActive: false, guestRevocationPendingAt: NOW });
    expect(activeGuestsOf(world, LINK_ID)).toHaveLength(0);
    expect(world.links).toHaveLength(0);
  });

  it('une révocation qui échoue PROPAGE et garde la ligne, fermée et marquée pour le balayage', async () => {
    const world: World = { participants: [guest()], links: [link()] };

    await expect(purge(prismaOf(world, { participantWrites: new Error('mongo down') }))).rejects.toThrow('mongo down');

    expect(world.links).toHaveLength(1);
    expect(world.links[0]).toMatchObject({ isActive: false, guestRevocationPendingAt: NOW });
  });

  it('l’échec d’un lien ne retient pas la suppression des autres', async () => {
    const world: World = {
      participants: [guest({ shareLinkId: OTHER_LINK_ID, anonymousSession: { shareLinkId: OTHER_LINK_ID } })],
      links: [link(), link({ id: OTHER_LINK_ID })],
    };

    await expect(purge(prismaOf(world, { participantWrites: new Error('mongo down') }))).rejects.toThrow('mongo down');

    expect(world.links.map((row) => row['id'])).toEqual([OTHER_LINK_ID]);
  });

  it('sans lien à supprimer, rien n’est écrit', async () => {
    const world: World = { participants: [guest()], links: [link({ createdBy: 'quelqu-un-d-autre' })] };
    const double = prismaOf(world);

    expect(await purge(double)).toEqual({ count: 0 });
    expect(double.conversationShareLink.updateMany).not.toHaveBeenCalled();
    expect(activeGuestsOf(world, LINK_ID)).toHaveLength(1);
  });
});

describe('R5 — le balayage horaire relève les invités actifs dont le lien n’existe plus', () => {
  const sweep = (double: ReturnType<typeof prismaOf>) =>
    new ExpiredShareLinksCleanupService(asPrisma(double), { now: () => NOW }).cleanup();

  it('révoque les invités d’un lien disparu et laisse ceux d’un lien vivant', async () => {
    const orphan = guest({ shareLinkId: GONE_LINK_ID, anonymousSession: { shareLinkId: GONE_LINK_ID } });
    const member = guest();
    const world: World = { participants: [orphan, member], links: [link()] };

    await sweep(prismaOf(world));

    expect(orphan['isActive']).toBe(false);
    expect(member['isActive']).toBe(true);
  });

  it('relève aussi l’invité dont SEULE la session embarquée désigne le lien disparu', async () => {
    const embeddedOnly = guest({ shareLinkId: null, anonymousSession: { shareLinkId: GONE_LINK_ID } });
    const embeddedLive = guest({ shareLinkId: null, anonymousSession: { shareLinkId: LINK_ID } });
    const world: World = { participants: [embeddedOnly, embeddedLive], links: [link()] };

    await sweep(prismaOf(world));

    expect(embeddedOnly['isActive']).toBe(false);
    expect(embeddedLive['isActive']).toBe(true);
  });

  it('ne relève jamais un INSCRIT entré par un lien disparu', async () => {
    const member = guest({ type: 'user', userId: OWNER_ID, shareLinkId: GONE_LINK_ID, anonymousSession: null });
    const world: World = { participants: [member, guest()], links: [link()] };

    await sweep(prismaOf(world));

    expect(member['isActive']).toBe(true);
  });

  describe('le disjoncteur — une absence massive ne révoque personne', () => {
    const goneLinkId = (n: number) => `507f1f77bcf86cd7994392${String(n).padStart(2, '0')}`;
    const orphansOf = (count: number) =>
      Array.from({ length: count }, (_unused, n) => guest({ shareLinkId: goneLinkId(n), anonymousSession: { shareLinkId: goneLinkId(n) } }));
    const stillActive = (rows: MongoDocument[]) => rows.filter((row) => row['isActive'] === true).length;

    it('la collection des liens est vide alors que des invités en portent', async () => {
      const orphans = orphansOf(1);

      await sweep(prismaOf({ participants: orphans, links: [] }));

      expect(stillActive(orphans)).toBe(1);
    });

    it('plus de liens absents que le plafond absolu', async () => {
      const orphans = orphansOf(MISSING_SHARE_LINKS_BREAKER.maxMissing + 1);
      const members = Array.from({ length: 60 }, (_unused, n) => guest({ shareLinkId: goneLinkId(n + 40) }));
      const links = members.map((member) => link({ id: member['shareLinkId'] }));

      await sweep(prismaOf({ participants: [...orphans, ...members], links }));

      expect(stillActive(orphans)).toBe(orphans.length);
    });

    it('plus de la moitié des liens tenus sont absents', async () => {
      const orphans = orphansOf(6);
      const world: World = { participants: [...orphans, guest()], links: [link()] };

      await sweep(prismaOf(world));

      expect(stillActive(orphans)).toBe(6);
    });

    it('une poignée de liens absents reste relevée, même s’ils sont tous ceux que des invités tiennent', async () => {
      const orphans = orphansOf(MISSING_SHARE_LINKS_BREAKER.alwaysAllowed);
      const world: World = { participants: orphans, links: [link({ id: OTHER_LINK_ID })] };

      await sweep(prismaOf(world));

      expect(stillActive(orphans)).toBe(0);
    });
  });

  it('tourne : des liens disparus dont la révocation échoue n’affament pas les suivants', async () => {
    const [stuckA, stuckB, reachable] = [1, 2, 3].map((n) => {
      const id = `507f1f77bcf86cd7994393${String(n).padStart(2, '0')}`;
      return guest({ shareLinkId: id, anonymousSession: { shareLinkId: id } });
    });
    const world: World = { participants: [stuckA, stuckB, reachable], links: [link({ id: OTHER_LINK_ID })] };
    const double = prismaOf(world);
    const write = double.participant.updateMany.getMockImplementation()!;
    double.participant.updateMany.mockImplementation(async (args: Args) => {
      if (args.where?.['id'] !== reachable['id']) throw new Error('mongo down');
      return write(args);
    });
    const service = new ExpiredShareLinksCleanupService(asPrisma(double), { now: () => NOW, batchSize: 2 });

    await service.cleanup();
    expect(reachable['isActive']).toBe(true);

    await service.cleanup();
    expect(reachable['isActive']).toBe(false);
  });

  it('ne révoque personne quand la lecture des liens échoue', async () => {
    const orphan = guest({ shareLinkId: GONE_LINK_ID });
    const world: World = { participants: [orphan], links: [] };

    await sweep(prismaOf(world, { linkReads: new Error('mongo down') }));

    expect(orphan['isActive']).toBe(true);
  });

  it('ne se fie pas à une liste de liens incomplète : chaque lien absent est relu seul avant toute révocation', async () => {
    const member = guest();
    const world: World = { participants: [member], links: [link()] };
    const double = prismaOf(world);
    double.conversationShareLink.findMany.mockImplementation(async (_args: Args) => []);

    await sweep(double);

    expect(member['isActive']).toBe(true);
  });
});
