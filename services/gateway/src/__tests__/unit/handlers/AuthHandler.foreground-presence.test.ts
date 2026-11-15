/**
 * LA PRÉSENCE SUIT LE PREMIER PLAN (#10575).
 *
 * Un onglet caché, ou la coque Android en arrière-plan, garde sa socket et ses
 * pongs : sans cette loi, l'utilisateur restait « en ligne » indéfiniment chez
 * ses amis. `presence:app-state` décide désormais : un utilisateur est PRÉSENT
 * tant qu'une de ses sockets est au premier plan ; quand la dernière passe en
 * arrière-plan, il part hors ligne après une grâce (un `.inactive` iOS, un
 * changement d'onglet bref ne font pas clignoter la pastille), et revient en
 * ligne dès qu'une socket repasse au premier plan.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: (t: string) => `hash:${t}`,
}));

import { AuthHandler } from '../../../socketio/handlers/AuthHandler';
import { PRESENCE_AWAY_GRACE_MS } from '../../../socketio/presence-foreground';

const USER = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const GUEST = 'p-1';

function makeSocket(id: string) {
  return { id, emit: jest.fn<any>(), join: jest.fn<any>(), on: jest.fn<any>(), disconnect: jest.fn<any>(), handshake: { auth: {}, headers: {} } } as any;
}

function makeServices() {
  return {
    statusService: {
      markConnected: jest.fn<any>(),
      markDisconnected: jest.fn<any>(),
      updateLastSeen: jest.fn<any>(),
      noteHeartbeat: jest.fn<any>(),
    },
    maintenanceService: {
      updateUserOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
      updateAnonymousOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    },
    callService: { leaveCall: jest.fn<any>().mockResolvedValue(undefined) },
  };
}

function makePrisma() {
  return {
    user: { findUnique: jest.fn<any>().mockResolvedValue(null), update: jest.fn<any>().mockResolvedValue(undefined) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    callParticipant: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

/** Un utilisateur connecté par les sockets nommées, toutes au premier plan. */
function connected(socketIds: readonly string[], { key = USER, isAnonymous = false } = {}) {
  const services = makeServices();
  const connectedUsers = new Map([[key, { id: key, socketId: socketIds[0], isAnonymous, language: 'fr', resolvedLanguages: ['fr'] }]]);
  const socketToUser = new Map(socketIds.map((id) => [id, key] as const));
  const userSockets = new Map([[key, new Set(socketIds)]]);
  const handler = new AuthHandler({ prisma: makePrisma(), ...services, connectedUsers, socketToUser, userSockets } as any);
  const sockets = Object.fromEntries(socketIds.map((id) => [id, makeSocket(id)]));
  return { handler, services, sockets, userSockets };
}

const offlineCalls = (services: ReturnType<typeof makeServices>) =>
  services.maintenanceService.updateUserOnlineStatus.mock.calls.filter((call) => call[1] === false);
const onlineCalls = (services: ReturnType<typeof makeServices>) =>
  services.maintenanceService.updateUserOnlineStatus.mock.calls.filter((call) => call[1] === true);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('presence:app-state — la dernière socket en arrière-plan', () => {
  it('part hors ligne APRÈS la grâce, jamais avant', async () => {
    const { handler, services, sockets } = connected(['s1']);

    await handler.handleAppState(sockets.s1, { foreground: false });
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS - 1);
    expect(offlineCalls(services)).toEqual([]);

    await jest.advanceTimersByTimeAsync(1);
    expect(offlineCalls(services)).toEqual([[USER, false, true]]);
    expect(handler.isPresent(USER)).toBe(false);
  });

  it('un retour au premier plan pendant la grâce n’annonce rien — ni départ, ni retour', async () => {
    const { handler, services, sockets } = connected(['s1']);

    await handler.handleAppState(sockets.s1, { foreground: false });
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS / 2);
    await handler.handleAppState(sockets.s1, { foreground: true });
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS);

    expect(services.maintenanceService.updateUserOnlineStatus).not.toHaveBeenCalled();
    expect(handler.isPresent(USER)).toBe(true);
  });

  it('un retour après la grâce repasse en ligne et le diffuse', async () => {
    const { handler, services, sockets } = connected(['s1']);
    await handler.handleAppState(sockets.s1, { foreground: false });
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS);

    await handler.handleAppState(sockets.s1, { foreground: true });

    expect(onlineCalls(services)).toEqual([[USER, true, true]]);
    expect(handler.isPresent(USER)).toBe(true);
  });

  it('un autre appareil au premier plan garde l’utilisateur en ligne', async () => {
    const { handler, services, sockets } = connected(['s1', 's2']);

    await handler.handleAppState(sockets.s1, { foreground: false });
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS * 2);

    expect(offlineCalls(services)).toEqual([]);
    expect(handler.isPresent(USER)).toBe(true);
  });

  it('un invité sans compte part hors ligne par sa propre porte', async () => {
    const { handler, services, sockets } = connected(['sa'], { key: GUEST, isAnonymous: true });

    await handler.handleAppState(sockets.sa, { foreground: false });
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS);

    expect(services.maintenanceService.updateAnonymousOnlineStatus).toHaveBeenCalledWith(GUEST, false, true);
  });

  it('une charge sans booléen ne change rien — une socket muette reste au premier plan', async () => {
    const { handler, services, sockets } = connected(['s1']);

    await handler.handleAppState(sockets.s1, {});
    await handler.handleAppState(sockets.s1, undefined);
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS);

    expect(services.maintenanceService.updateUserOnlineStatus).not.toHaveBeenCalled();
    expect(handler.isPresent(USER)).toBe(true);
  });
});

describe('le battement d’une socket en arrière-plan ne rafraîchit plus la présence', () => {
  it('ni le pong Engine.IO ni le heartbeat applicatif d’une socket cachée ne notent d’activité', async () => {
    const { handler, services, sockets } = connected(['s1', 's2']);
    await handler.handleAppState(sockets.s1, { foreground: false });

    handler.handleEnginePong(sockets.s1);
    await handler.handleHeartbeat(sockets.s1);
    expect(services.statusService.noteHeartbeat).not.toHaveBeenCalled();

    handler.handleEnginePong(sockets.s2);
    expect(services.statusService.noteHeartbeat).toHaveBeenCalledWith(USER, false);
  });
});

describe('les déconnexions et la présence au premier plan', () => {
  it('quand l’appareil au premier plan se déconnecte et qu’il ne reste qu’un onglet caché, l’utilisateur part hors ligne après la grâce', async () => {
    const { handler, services, sockets } = connected(['front', 'hidden']);
    await handler.handleAppState(sockets.hidden, { foreground: false });

    await handler.handleDisconnection(sockets.front);
    expect(offlineCalls(services)).toEqual([]);
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS);

    expect(offlineCalls(services)).toEqual([[USER, false, true]]);
  });

  it('la déconnexion de la dernière socket annule la grâce en cours : un seul départ annoncé', async () => {
    const { handler, services, sockets } = connected(['s1']);
    await handler.handleAppState(sockets.s1, { foreground: false });

    await handler.handleDisconnection(sockets.s1);
    await jest.advanceTimersByTimeAsync(PRESENCE_AWAY_GRACE_MS * 2);

    expect(offlineCalls(services)).toEqual([[USER, false, true]]);
    expect(handler.isPresent(USER)).toBe(false);
  });

  it('une socket oubliée ne laisse aucune trace : un nouvel appareil sous le même id repart au premier plan', async () => {
    const { handler, sockets, userSockets } = connected(['s1']);
    await handler.handleAppState(sockets.s1, { foreground: false });
    await handler.handleDisconnection(sockets.s1);

    userSockets.set(USER, new Set(['s1']));

    expect(handler.isPresent(USER)).toBe(true);
  });
});

describe('un arrière-plan déclaré AVANT l’enregistrement de la socket', () => {
  // L'authentification n'est pas attendue par le manager : iOS (`.connect`) et
  // Android (`connected.collect`) rejouent leur état pendant qu'elle court. Un
  // `{ foreground: false }` arrivé là ne doit pas être perdu — le cas nominal
  // passe par le vrai chemin JWT (`AuthHandler.test.ts`).
  it('une socket qui tombe avant de s’enregistrer ne laisse aucune trace', async () => {
    const { handler, userSockets } = connected(['s1']);
    const early = makeSocket('s2');

    await handler.handleAppState(early, { foreground: false });
    await handler.handleDisconnection(early);
    userSockets.set(USER, new Set(['s2']));

    expect(handler.isPresent(USER)).toBe(true);
  });
});

