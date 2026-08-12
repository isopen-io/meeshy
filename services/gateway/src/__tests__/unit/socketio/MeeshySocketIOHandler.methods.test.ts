/**
 * Unit tests for MeeshySocketIOHandler — methods other than broadcastMessage.
 * Covers: getManager, getConnectedUsers (no manager, with manager, error).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../socketio/MeeshySocketIOManager', () => ({
  MeeshySocketIOManager: jest.fn(),
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { MeeshySocketIOHandler } from '../../../socketio/MeeshySocketIOHandler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHandler(managerOverrides: Record<string, any> = {}) {
  const handler = new MeeshySocketIOHandler({} as any, 'secret', {} as any);
  const manager = {
    sendToUser: jest.fn<any>().mockReturnValue(true),
    getConnectedUsers: jest.fn<any>().mockReturnValue(['u-1', 'u-2']),
    broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
    ...managerOverrides,
  };
  // Inject manager via setupSocketIO shortcut: set private field directly
  (handler as any).socketIOManager = manager;
  return { handler, manager };
}

function makeHandlerNoManager() {
  return new MeeshySocketIOHandler({} as any, 'secret', {} as any);
}

// ─── getManager ───────────────────────────────────────────────────────────────

describe('getManager', () => {
  it('returns null when setup has not been called', () => {
    const handler = makeHandlerNoManager();
    expect(handler.getManager()).toBeNull();
  });

  it('returns the manager after it has been set', () => {
    const { handler, manager } = makeHandler();
    expect(handler.getManager()).toBe(manager);
  });
});

// `sendNotificationToUser` — TÉMOINS RETIRÉS (2026-08-12).
//
// Ils testaient une méthode qui n'existe NULLE PART : `MeeshySocketIOHandler`
// expose `setupSocketIO`, `getManager`, `broadcastMessage` et
// `getConnectedUsers`, et `sendNotificationToUser` n'apparaissait dans tout le
// dépôt que dans ce fichier — aucune implémentation, aucun appelant. Le fichier
// vient d'une branche de tests de JUIN fusionnée en août avec « prefer theirs
// for conflicts » : ces 4 témoins figeaient une API imaginée, jamais livrée.
// L'implémenter pour les satisfaire aurait créé de la surface morte — on retire
// donc les témoins, pas le produit.

// ─── getConnectedUsers ────────────────────────────────────────────────────────

describe('getConnectedUsers', () => {
  it('returns an empty array when the manager is not initialized', () => {
    const handler = makeHandlerNoManager();
    expect(handler.getConnectedUsers()).toEqual([]);
  });

  it('returns the user list from the manager', () => {
    const { handler } = makeHandler();
    expect(handler.getConnectedUsers()).toEqual(['u-1', 'u-2']);
  });

  it('returns an empty array when the manager throws', () => {
    const { handler } = makeHandler({
      getConnectedUsers: jest.fn<any>().mockImplementation(() => { throw new Error('boom'); }),
    });
    expect(handler.getConnectedUsers()).toEqual([]);
  });
});
