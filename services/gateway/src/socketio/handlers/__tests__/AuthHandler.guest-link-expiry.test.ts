/**
 * #10437 — un invité dont le lien de partage a EXPIRÉ perd sa room socket.
 *
 * Avant : la porte `SHARE_LINK_EXPIRED` vivait route par route, en REST. Le
 * socket de l'invité restait dans `ROOMS.conversation(...)` et recevait chaque
 * `message:new` ; à la reconnexion, `_authenticateAnonymousUser` (la porte
 * invitée — c'est elle, et non `_joinUserConversations`, qui joint la room
 * d'un invité) le remettait dans la room sans regarder le lien.
 *
 * Désormais :
 * - à la connexion (et à la reconnexion), un lien échu refuse la session :
 *   `error { code: SHARE_LINK_EXPIRED }`, déconnexion, aucune room ;
 * - une session DÉJÀ connectée est sortie À L'ÉCHÉANCE par un minuteur armé à
 *   l'authentification (même patron que l'expiration du JWT,
 *   `scheduleTokenExpiry`), qui RELIT le lien quand il sonne : un lien
 *   prolongé entre-temps réarme, un lien échu coupe le socket.
 *
 * Le double de Prisma JUGE chaque `where` contre des documents.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import { hashSessionToken } from '../../../utils/session-token';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const TOKEN = 'anon-session-expiry';
const LINK_ID = '507f1f77bcf86cd799439033';
const CONV_ID = '507f1f77bcf86cd799439022';
const GUEST_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-13T10:00:00Z');
const HOUR = 60 * 60 * 1000;

type World = {
  participants: MongoDocument[];
  links: MongoDocument[];
  linkReadFails: boolean;
  participantReadFails?: boolean;
  /** #10457 — la base répond à ce nombre de lectures (toutes tables), puis lève. */
  readsBeforeFailure?: number;
};

function guestRow(): MongoDocument {
  return {
    id: GUEST_ID,
    conversationId: CONV_ID,
    type: 'anonymous',
    sessionTokenHash: hashSessionToken(TOKEN),
    isActive: true,
    displayName: 'Invité',
    language: 'fr',
    shareLinkId: LINK_ID,
    anonymousSession: { shareLinkId: LINK_ID },
  };
}

/**
 * #10449 — un AUTRE invité, vivant, entré par le même lien dans la même
 * conversation. Il garde la relecture honnête : une relecture qui ne
 * chercherait qu'« une participation vivante » sans l'`id` de CET invité le
 * trouverait, et garderait le retiré connecté.
 */
function otherGuestRow(): MongoDocument {
  return {
    ...guestRow(),
    id: '507f1f77bcf86cd799439044',
    sessionTokenHash: hashSessionToken('anon-session-other'),
    displayName: 'Autre invité',
  };
}

function buildHandler(world: World) {
  let reads = 0;
  const failOnceExhausted = () => {
    reads += 1;
    if (world.readsBeforeFailure !== undefined && reads > world.readsBeforeFailure) throw new Error('mongo down');
  };
  const prisma = {
    participant: {
      findFirst: jest.fn(async ({ where }: { where: MongoDocument }) => {
        failOnceExhausted();
        if (world.participantReadFails) throw new Error('mongo down');
        return world.participants.find((row) => matchesMongoWhere(row, where)) ?? null;
      }),
      findMany: jest.fn(async () => []),
    },
    conversationShareLink: {
      findUnique: jest.fn(async ({ where }: { where: MongoDocument }) => {
        failOnceExhausted();
        if (world.linkReadFails) throw new Error('mongo down');
        return world.links.find((row) => matchesMongoWhere(row, where)) ?? null;
      }),
    },
    callParticipant: { findMany: jest.fn(async () => []) },
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
  });
  return { handler, connectedUsers };
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
    disconnected: false,
    disconnect: jest.fn((_close?: boolean) => {
      socket.disconnected = true;
      disconnectListeners.forEach((listener) => listener());
    }),
  };
  return socket;
}

const expiredError = (socket: ReturnType<typeof guestSocket>) =>
  socket.emit.mock.calls.filter(([event, data]) => event === 'error' && (data as { code?: string })?.code === 'SHARE_LINK_EXPIRED');

const joinedConversationRoom = (socket: ReturnType<typeof guestSocket>) =>
  socket.join.mock.calls.some(([room]) => room === `conversation:${CONV_ID}`);

describe('AuthHandler — un lien de partage expiré sort l’invité de sa room (#10437)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refuse à la (re)connexion la session d’un invité dont le lien a expiré : aucune room, socket coupé', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() - HOUR) }], linkReadFails: false };
    const { handler, connectedUsers } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(expiredError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
    expect(connectedUsers.size).toBe(0);
  });

  it('refuse la session quand le lien est illisible — fail-closed', async () => {
    const world: World = { participants: [guestRow()], links: [], linkReadFails: true };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
  });

  it('admet un invité au lien vivant, puis le coupe À L’ÉCHÉANCE du lien', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    expect(joinedConversationRoom(socket)).toBe(true);
    expect(socket.disconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(HOUR - 1000);
    expect(socket.disconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2000);
    expect(expiredError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('relit le lien à l’échéance : un lien PROLONGÉ entre-temps réarme au lieu de couper', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.links[0] = { id: LINK_ID, expiresAt: new Date(NOW.getTime() + 3 * HOUR) };

    await jest.advanceTimersByTimeAsync(2 * HOUR);
    expect(socket.disconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2 * HOUR);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('un lien sans échéance ne coupe jamais', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    await jest.advanceTimersByTimeAsync(2 * 24 * HOUR);

    expect(joinedConversationRoom(socket)).toBe(true);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('désarme le minuteur quand le socket part avant l’échéance', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    socket.disconnect();
    socket.disconnect.mockClear();

    await jest.advanceTimersByTimeAsync(2 * HOUR);
    expect(expiredError(socket)).toHaveLength(0);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

/**
 * #10440 — l'audit adversarial de #10437 : le minuteur ne relisait le lien
 * qu'à l'échéance lue à la CONNEXION. Un lien écourté gardait l'invité dans la
 * room jusqu'à l'ancienne date ; un lien sans échéance auquel l'hôte en posait
 * une n'armait jamais rien. Le minuteur relit désormais le lien au plus tard
 * toutes les 5 minutes, échéance ou non. Et il n'est plus armé sur un socket
 * déjà parti (fuite : son `disconnect` ne sonnera plus), ni EMPILÉ par une
 * ré-authentification du même socket.
 */
describe('AuthHandler — le minuteur du lien d’un invité relit le lien et ne fuit pas (#10440)', () => {
  const MINUTE = 60 * 1000;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('un lien ÉCOURTÉ après la connexion coupe l’invité à la nouvelle échéance, à 5 minutes près', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + 3 * HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.links[0] = { id: LINK_ID, expiresAt: new Date(NOW.getTime() + 10 * MINUTE) };

    await jest.advanceTimersByTimeAsync(9 * MINUTE);
    expect(socket.disconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(6 * MINUTE);
    expect(expiredError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('un lien SANS échéance à la connexion, échu ensuite, coupe l’invité dans les 5 minutes', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.links[0] = { id: LINK_ID, expiresAt: new Date(NOW.getTime() - MINUTE) };

    await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
    expect(expiredError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('une ré-authentification du MÊME socket remplace le minuteur au lieu d’en empiler un second', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    const armedOnce = jest.getTimerCount();
    await handler.handleTokenAuthentication(socket as never);

    expect(armedOnce).toBe(1);
    expect(jest.getTimerCount()).toBe(armedOnce);
  });

  it('un lien ILLISIBLE à la relecture coupe le socket SANS dire « lien expiré » : un accroc de la base ne coûte pas sa session à l’invité', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.linkReadFails = true;

    await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
    expect(expiredError(socket)).toHaveLength(0);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('n’arme rien sur un socket parti pendant l’authentification', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();
    socket.join.mockImplementation(async () => { socket.disconnected = true; });

    await handler.handleTokenAuthentication(socket as never);

    expect(jest.getTimerCount()).toBe(0);
  });
});

/**
 * #10443 — l'audit adversarial de #10440 : la relecture ne lisait que le LIEN.
 * La route admin `/maintenance/cleanup` désactive les invités d'un lien expiré
 * sans couper leurs sockets (pas de vivant câblé), puis SUPPRIME le lien ; la
 * relecture lisait alors un lien introuvable comme « ouvert » et réarmait sans
 * fin. Même trou quand `fetchSockets` n'atteint pas l'instance qui tient le
 * socket. La relecture lit désormais AUSSI la participation : désactivée ou
 * bannie (`PARTICIPATION_VIVANTE`), elle coupe le socket avec le code de
 * l'accès retiré (`GUEST_ACCESS_REVOKED`), celui du 410 REST. Une base
 * illisible coupe toujours SANS code de fin. Et la cadence porte une gigue de
 * ±20 % : des sockets reconnectés ensemble ne relisent plus ensemble.
 */
describe('AuthHandler — la relecture d’un invité vérifie aussi sa participation (#10443)', () => {
  const MINUTE = 60 * 1000;

  const revokedError = (socket: ReturnType<typeof guestSocket>) =>
    socket.emit.mock.calls.filter(([event, data]) => event === 'error' && (data as { code?: string })?.code === 'GUEST_ACCESS_REVOKED');

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('une participation DÉSACTIVÉE après la connexion coupe le socket avec GUEST_ACCESS_REVOKED', async () => {
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.participants[0] = { ...guestRow(), isActive: false };

    await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
    expect(revokedError(socket)).toHaveLength(1);
    expect(expiredError(socket)).toHaveLength(0);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('une participation BANNIE (encore active) coupe le socket avec GUEST_ACCESS_REVOKED', async () => {
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.participants[0] = { ...guestRow(), bannedAt: new Date(NOW.getTime() + MINUTE) };

    await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
    expect(revokedError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('un lien SUPPRIMÉ dont l’invité a été désactivé (nettoyage admin) n’est plus lu comme ouvert', async () => {
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() + HOUR) }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.participants[0] = { ...guestRow(), isActive: false };
    world.links = [];

    await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
    expect(revokedError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('un lien échu ET une participation désactivée disent « lien expiré », la cause première', async () => {
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.participants[0] = { ...guestRow(), isActive: false };
    world.links[0] = { id: LINK_ID, expiresAt: new Date(NOW.getTime() - MINUTE) };

    await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
    expect(expiredError(socket)).toHaveLength(1);
    expect(revokedError(socket)).toHaveLength(0);
  });

  it('une participation ILLISIBLE à la relecture coupe le socket SANS code de fin d’accès', async () => {
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.participantReadFails = true;

    await jest.advanceTimersByTimeAsync(6 * MINUTE + 1000);
    expect(revokedError(socket)).toHaveLength(0);
    expect(expiredError(socket)).toHaveLength(0);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('une participation vivante et un lien ouvert réarment sans couper', async () => {
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    await jest.advanceTimersByTimeAsync(60 * MINUTE);

    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('refuse à la (re)connexion la session d’un invité BANNI encore actif, avec GUEST_ACCESS_REVOKED (#10449)', async () => {
    const world: World = { participants: [{ ...guestRow(), bannedAt: new Date(NOW.getTime() - HOUR) }, otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler, connectedUsers } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(revokedError(socket)).toHaveLength(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
    expect(connectedUsers.size).toBe(0);
  });

  it('refuse à la (re)connexion la session d’un invité DÉSACTIVÉ, avec GUEST_ACCESS_REVOKED : le code du 410 REST (#10449)', async () => {
    const world: World = { participants: [{ ...guestRow(), isActive: false }, otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler, connectedUsers } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(revokedError(socket)).toHaveLength(1);
    expect(expiredError(socket)).toHaveLength(0);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
    expect(connectedUsers.size).toBe(0);
  });

  it('un jeton sans AUCUNE ligne garde la réponse d’avant : erreur sans code, rien n’est confirmé (#10449)', async () => {
    const world: World = { participants: [otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler, connectedUsers } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(revokedError(socket)).toHaveLength(0);
    const errors = socket.emit.mock.calls.filter(([event]) => event === 'error');
    expect(errors).toEqual([['error', { message: 'Anonymous session not found' }]]);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(connectedUsers.size).toBe(0);
  });

  it('la cadence de relecture porte une gigue de ±20 % : au plus tôt à 4 minutes', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.participants[0] = { ...guestRow(), isActive: false };

    await jest.advanceTimersByTimeAsync(4 * MINUTE - 1000);
    expect(socket.disconnect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('la cadence de relecture porte une gigue de ±20 % : au plus tard à 6 minutes', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);
    world.participants[0] = { ...guestRow(), isActive: false };

    await jest.advanceTimersByTimeAsync(5 * MINUTE + 30 * 1000);
    expect(socket.disconnect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(31 * 1000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});

/**
 * #10457 — la connexion socket suit l'ordre unique des causes (`guestAccessEnd`),
 * celui de la relecture et du REST : le lien expiré d'abord, puis la
 * participation morte. Et la SECONDE lecture de la connexion (quelle qu'elle
 * soit) qui échoue coupe sans code de fin d'accès, comme la première.
 */
describe('AuthHandler — la connexion d’un invité donne la même cause que les autres portes (#10457)', () => {
  const codes = (socket: ReturnType<typeof guestSocket>) =>
    socket.emit.mock.calls
      .filter(([event]) => event === 'error')
      .map(([, data]) => (data as { code?: string })?.code)
      .filter((code): code is string => typeof code === 'string');

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lien échu ET participation désactivée à la connexion ⇒ SHARE_LINK_EXPIRED, la cause première', async () => {
    const world: World = {
      participants: [{ ...guestRow(), isActive: false }, otherGuestRow()],
      links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() - HOUR) }],
      linkReadFails: false,
    };
    const { handler, connectedUsers } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(codes(socket)).toEqual(['SHARE_LINK_EXPIRED']);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
    expect(connectedUsers.size).toBe(0);
  });

  it('lien échu ET participation bannie à la connexion ⇒ SHARE_LINK_EXPIRED', async () => {
    const world: World = {
      participants: [{ ...guestRow(), bannedAt: new Date(NOW.getTime() - HOUR) }, otherGuestRow()],
      links: [{ id: LINK_ID, expiresAt: new Date(NOW.getTime() - HOUR) }],
      linkReadFails: false,
    };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(codes(socket)).toEqual(['SHARE_LINK_EXPIRED']);
  });

  it('la SECONDE lecture de la connexion échoue (participation désactivée) ⇒ coupure SANS code, aucune room', async () => {
    const world: World = {
      participants: [{ ...guestRow(), isActive: false }, otherGuestRow()],
      links: [{ id: LINK_ID }],
      linkReadFails: false,
      readsBeforeFailure: 1,
    };
    const { handler, connectedUsers } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(codes(socket)).toEqual([]);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
    expect(connectedUsers.size).toBe(0);
  });

  it('la SECONDE lecture de la connexion échoue (participation vivante) ⇒ coupure SANS code, aucune room', async () => {
    const world: World = { participants: [guestRow(), otherGuestRow()], links: [{ id: LINK_ID }], linkReadFails: false, readsBeforeFailure: 1 };
    const { handler, connectedUsers } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(codes(socket)).toEqual([]);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
    expect(connectedUsers.size).toBe(0);
  });

  it('la PREMIÈRE lecture de la connexion échoue ⇒ coupure SANS code', async () => {
    const world: World = { participants: [guestRow()], links: [{ id: LINK_ID }], linkReadFails: false, readsBeforeFailure: 0 };
    const { handler } = buildHandler(world);
    const socket = guestSocket();

    await handler.handleTokenAuthentication(socket as never);

    expect(codes(socket)).toEqual([]);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(joinedConversationRoom(socket)).toBe(false);
  });
});
