import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastMessageMutation } from '../broadcastMessageMutation';

type Emitted = { room: string; event: string; payload: any };

function makeManager(
  sink: Emitted[],
  overrides: Partial<{ getIO: any; enqueue: any; emitUnread: any }> = {}
) {
  const enqueue = overrides.enqueue ?? jest.fn(async (_params: any) => {});
  const emitUnread = overrides.emitUnread ?? jest.fn(async (_params: any) => {});
  const getIO =
    overrides.getIO ??
    (() => ({
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          sink.push({ room, event, payload });
        },
      }),
    }));
  return {
    getIO,
    enqueueOfflineMessageMutation: enqueue,
    emitUnreadCountsToRecipients: emitUnread,
  } as any;
}

function makePrisma() {
  return {
    participant: { findMany: jest.fn(async () => [{ userId: 'user-B' }]) },
    message: {
      findFirst: jest.fn(async () => ({
        id: 'msg-latest',
        content: 'latest',
        senderId: 'participant-A',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        metadata: null,
      })),
    },
  } as any;
}

const base = {
  conversationId: 'conv-1',
  actorUserId: 'user-A',
  messageId: 'msg-1',
};

describe('broadcastMessageMutation', () => {
  it('reaches all three audiences: conversation room, list-screen user rooms, offline queue', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const payload = { id: 'msg-1', conversationId: 'conv-1', content: 'edited' };

    await broadcastMessageMutation({
      prisma: makePrisma(),
      manager: makeManager(emitted, { enqueue }),
      ...base,
      eventType: 'edited',
      payload,
    });

    // (1) live room emit
    expect(emitted).toContainEqual({
      room: 'conversation:conv-1',
      event: SERVER_EVENTS.MESSAGE_EDITED,
      payload,
    });
    // (2) conversation-list preview refresh, on the participant's user room
    expect(emitted.some(
      (e) => e.room === 'user:user-B' && e.event === SERVER_EVENTS.CONVERSATION_UPDATED,
    )).toBe(true);
    // (3) offline replay
    expect(enqueue).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      actorUserId: 'user-A',
      eventType: 'edited',
      messageId: 'msg-1',
      payload,
    });
  });

  it('maps a deletion to message:deleted and queues it under the deleted eventType', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const payload = { messageId: 'msg-1', conversationId: 'conv-1' };

    await broadcastMessageMutation({
      prisma: makePrisma(),
      manager: makeManager(emitted, { enqueue }),
      ...base,
      eventType: 'deleted',
      payload,
    });

    expect(emitted).toContainEqual({
      room: 'conversation:conv-1',
      event: SERVER_EVENTS.MESSAGE_DELETED,
      payload,
    });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'deleted' }));
  });

  it('does nothing when no manager is available', async () => {
    const prisma = makePrisma();

    await expect(
      broadcastMessageMutation({
        prisma,
        manager: null,
        ...base,
        eventType: 'edited',
        payload: {},
      }),
    ).resolves.toBeUndefined();

    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  // The mutation is already committed by the time this runs: a broadcast
  // failure must never turn a successful edit/delete into a 500. Each channel
  // is independent, so a failure in one must not cost the caller the others.
  it('still reaches the preview and the offline queue when the room emit throws', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const onError = jest.fn();
    let firstCall = true;
    const getIO = () => ({
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          if (firstCall) {
            firstCall = false;
            throw new Error('room emit exploded');
          }
          emitted.push({ room, event, payload });
        },
      }),
    });

    await broadcastMessageMutation({
      prisma: makePrisma(),
      manager: makeManager(emitted, { getIO, enqueue }),
      ...base,
      eventType: 'edited',
      payload: {},
      onError,
    });

    expect(onError).toHaveBeenCalled();
    expect(emitted.some((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED)).toBe(true);
    expect(enqueue).toHaveBeenCalled();
  });

  it('reports, but does not rethrow, an enqueue that throws synchronously', async () => {
    const emitted: Emitted[] = [];
    const onError = jest.fn();
    const enqueue = jest.fn((_params: any) => {
      throw new Error('no delivery queue wired');
    });

    await expect(
      broadcastMessageMutation({
        prisma: makePrisma(),
        manager: makeManager(emitted, { enqueue }),
        ...base,
        eventType: 'deleted',
        payload: {},
        onError,
      }),
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalled();
    // The live emit happened before the failing channel — it is not lost.
    expect(emitted.some((e) => e.event === SERVER_EVENTS.MESSAGE_DELETED)).toBe(true);
  });

  /**
   * Le témoin au-dessus ne couvre que la moitié SYNCHRONE : un `enqueue` qui
   * `throw` avant de rendre sa promesse, ce que le `try/catch` attrape. Une
   * implémentation `async` qui REJETTE passe à côté — le `try/catch` ne voit
   * rien, la promesse est détachée par `void`, et Node 22
   * (`--unhandled-rejections=throw` par défaut) termine le process.
   *
   * `MessageMutationManager` est une interface STRUCTURELLE : tout ce qui porte
   * la méthode est un manager valide, donc « l'implémentation actuelle avale
   * ses erreurs » n'est pas une garantie que ce fichier possède. Le jumeau
   * `broadcastReactionMutation` la possède, lui, via
   * `Promise.resolve(...).catch(...)` sur l'appel identique — ce témoin est
   * l'exact miroir de cette garantie, du côté des messages.
   */
  it('reports, but does not abandon, an enqueue that rejects asynchronously', async () => {
    const emitted: Emitted[] = [];
    const onError = jest.fn();
    const enqueue = jest.fn(async (_params: any) => {
      throw new Error('redis unreachable');
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      await broadcastMessageMutation({
        prisma: makePrisma(),
        manager: makeManager(emitted, { enqueue }),
        ...base,
        eventType: 'deleted',
        payload: {},
        onError,
      });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalled();
    // Le canal latéral a échoué ; l'émission live reste livrée.
    expect(emitted.some((e) => e.event === SERVER_EVENTS.MESSAGE_DELETED)).toBe(true);
  });
});

/**
 * La QUATRIÈME audience d'une suppression : la pastille de non-lus.
 *
 * Le cycle 89 a câblé le recalcul sur le transport WebSocket
 * (`MessageHandler.handleMessageDelete`), à côté de l'aperçu de liste. Les DEUX
 * transports REST de suppression — `DELETE /messages/:id` (Android) et
 * `DELETE /conversations/:id/messages/:id` (le SDK iOS) — passent tous deux par
 * ce broadcaster partagé, et n'y trouvaient rien : le lecteur voyait le message
 * disparaître pendant que sa pastille continuait de le compter, indéfiniment
 * (la liste web tourne en `staleTime: Infinity`).
 *
 * Le décompte lui-même était déjà juste — `getUnreadCountsForParticipants`
 * filtre `deletedAt: null` — il ne manquait que de le REDEMANDER.
 *
 * L'exclusion porte sur l'AUTEUR (`authorId`), jamais sur l'acteur : un
 * modérateur qui supprime le message d'un autre est lui-même un destinataire à
 * rafraîchir. C'est la règle du § « La pastille de non-lus » de
 * `src/socketio/README.md`, et le contraire de la file hors ligne, qui exclut
 * bien l'acteur.
 *
 * `authorId` est REQUIS par le type sur `eventType: 'deleted'` : un sixième
 * transport de suppression ne peut pas rouvrir la brèche en silence.
 */
describe('broadcastMessageMutation — la pastille de non-lus d\'une suppression', () => {
  it('repousse les non-lus, en excluant l\'AUTEUR et non l\'acteur', async () => {
    const emitted: Emitted[] = [];
    const emitUnread = jest.fn(async (_params: any) => {});

    await broadcastMessageMutation({
      prisma: makePrisma(),
      manager: makeManager(emitted, { emitUnread }),
      ...base,
      eventType: 'deleted',
      authorId: 'participant-author',
      payload: { messageId: 'msg-1', conversationId: 'conv-1' },
    });

    expect(emitUnread).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      senderId: 'participant-author',
    });
  });

  it('ne touche pas la pastille pour une ÉDITION — le compte n\'a pas bougé', async () => {
    const emitted: Emitted[] = [];
    const emitUnread = jest.fn(async (_params: any) => {});

    await broadcastMessageMutation({
      prisma: makePrisma(),
      manager: makeManager(emitted, { emitUnread }),
      ...base,
      eventType: 'edited',
      payload: {},
    });

    expect(emitUnread).not.toHaveBeenCalled();
  });

  it('reste best-effort : une pastille qui échoue ne coûte ni la room, ni la file', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const onError = jest.fn();
    const emitUnread = jest.fn(async (_params: any) => {
      throw new Error('unread service down');
    });

    await expect(
      broadcastMessageMutation({
        prisma: makePrisma(),
        manager: makeManager(emitted, { enqueue, emitUnread, }),
        ...base,
        eventType: 'deleted',
        authorId: 'participant-author',
        payload: { messageId: 'msg-1', conversationId: 'conv-1' },
        onError,
      }),
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalled();
    expect(emitted.some((e) => e.event === SERVER_EVENTS.MESSAGE_DELETED)).toBe(true);
    expect(enqueue).toHaveBeenCalled();
  });

  it('tolère un manager sans la méthode (double de test partiel)', async () => {
    const emitted: Emitted[] = [];
    const manager = makeManager(emitted);
    delete (manager as Record<string, unknown>).emitUnreadCountsToRecipients;

    await expect(
      broadcastMessageMutation({
        prisma: makePrisma(),
        manager,
        ...base,
        eventType: 'deleted',
        authorId: 'participant-author',
        payload: {},
        onError: jest.fn(),
      }),
    ).resolves.toBeUndefined();
  });
});
