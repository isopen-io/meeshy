/**
 * `PUT` / `DELETE /conversations/:id/messages/:messageId/pin`.
 *
 * Épingler et dépingler sont le même geste, sur le même objet, depuis la même
 * route. Seul l'un des deux localisait le message DANS la conversation : le
 * dépinglage écrivait `where: { id: messageId }`, sans jamais vérifier que le
 * message appartient à la conversation dont l'appelant est membre.
 *
 * Ce que ça donne : un membre actif de n'importe quelle conversation peut
 * dépingler un message de N'IMPORTE QUELLE autre, s'il en connaît l'id — ce que
 * tout ancien membre a en cache. La diffusion `message:unpinned` part alors vers
 * la conversation de la ROUTE, jamais vers celle du message : les clients de la
 * conversation touchée gardent l'épingle affichée jusqu'au prochain chargement
 * complet.
 *
 * Tous les siblings de ce fichier (pin, consume, edit, delete) localisent
 * d'abord le message par `{ id, conversationId }`. Le dépinglage était le seul
 * à ne pas le faire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
// Seul `canAccessConversation` est doublé. `resolveCallerParticipant` reste RÉEL
// et interroge le double Prisma de ce fichier : un mock de module complet le
// rendrait `undefined`, et surtout il masquerait la règle d'identité qu'il porte.
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const OTHER_CONV_ID = '507f1f77bcf86cd7994390ff';
const USER_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

// ─── Fabrique d'application ───────────────────────────────────────────────────

/**
 * `findFirst` répond comme le ferait Prisma : la ligne n'est rendue que si le
 * `conversationId` demandé est bien celui du message. C'est exactement la
 * discrimination que la route de dépinglage ne faisait pas.
 *
 * `deletedAt` est modélisé de la même façon, et pour la même raison : un
 * `where: { deletedAt: null }` ne rend PAS une ligne supprimée. Sans cette
 * seconde discrimination, le double rendrait un message tombstone à une route
 * qui croit avoir demandé un message vivant.
 */
function buildPrisma(message: { id: string; conversationId: string; deletedAt?: Date | null } | null) {
  const update = jest.fn(async (args: any) => {
    const matches =
      message !== null &&
      args.where.id === message.id &&
      (args.where.conversationId === undefined || args.where.conversationId === message.conversationId);
    if (!matches) {
      const notFound: any = new Error('An operation failed because it depends on one or more records that were required but not found.');
      notFound.code = 'P2025';
      throw notFound;
    }
    return { ...message, ...args.data };
  });

  return {
    update,
    prisma: {
      message: {
        findFirst: jest.fn(async (args: any) => {
          if (!message) return null;
          if (args.where.id !== message.id) return null;
          if (args.where.conversationId !== undefined && args.where.conversationId !== message.conversationId) return null;
          if (args.where.deletedAt === null && (message.deletedAt ?? null) !== null) return null;
          return message;
        }),
        update,
      },
      participant: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any,
  };
}

/**
 * `emitThrows` modélise ce que fait socket.io quand l'adaptateur ou l'encodeur
 * est en défaut : `io.to(room).emit(...)` LÈVE. Le dépôt l'écrit lui-même dans
 * `emitWithSeq`, et c'est la seule façon de voir ce que la diffusion de
 * l'épingle emportait avec elle quand elle n'était pas gardée.
 *
 * `enqueueRejects` modélise l'autre moitié : une mise en file qui REJETTE.
 * Détachée sans `.catch`, elle ne remonte à personne — la promesse est
 * abandonnée, donc l'appelant résout de toute façon — et son seul effet
 * observable est l'arrêt du process sous Node 22 (leçon 230). C'est pourquoi
 * son témoin écoute `unhandledRejection` plutôt que le retour de la route.
 */
function buildSocket(opts: { emitThrows?: boolean; enqueueRejects?: boolean } = {}) {
  const emit = jest.fn((_event: string, _payload: unknown) => {
    if (opts.emitThrows) throw new Error('adapter down');
    return undefined;
  });
  const to = jest.fn((_room: string) => ({ emit }));
  const enqueueOfflineMessageMutation = jest.fn((_params: unknown) =>
    opts.enqueueRejects ? Promise.reject(new Error('redis down')) : Promise.resolve(undefined)
  );
  return {
    emit,
    to,
    enqueueOfflineMessageMutation,
    handler: {
      getManager: () => ({
        getIO: () => ({ to }),
        enqueueOfflineMessageMutation,
      }),
    },
  };
}

async function buildApp(
  message: { id: string; conversationId: string; deletedAt?: Date | null } | null,
  socketOpts: { emitThrows?: boolean; enqueueRejects?: boolean } = {}
) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const socket = buildSocket(socketOpts);
  (app as any).socketIOHandler = socket.handler;
  (app as any).notificationService = null;

  const { prisma, update } = buildPrisma(message);

  const auth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, auth, auth);
  await app.ready();
  return { app, prisma, update, socket };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /conversations/:id/messages/:messageId/pin', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('dépingle un message qui appartient bien à la conversation', async () => {
    const { app, update, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(200);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toMatchObject({ data: { pinnedAt: null, pinnedBy: null } });
      expect(socket.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(socket.emit).toHaveBeenCalledWith('message:unpinned', expect.objectContaining({ messageId: MESSAGE_ID }));
    } finally {
      await app.close();
    }
  });

  it("n'écrit rien quand le message appartient à une AUTRE conversation", async () => {
    const { app, update, socket } = await buildApp({ id: MESSAGE_ID, conversationId: OTHER_CONV_ID });
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(404);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("ne diffuse rien vers la conversation de la route quand le message est ailleurs", async () => {
    const { app, socket } = await buildApp({ id: MESSAGE_ID, conversationId: OTHER_CONV_ID });
    try {
      await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.enqueueOfflineMessageMutation).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rend 404, et non 500, pour un identifiant de message inconnu', async () => {
    const { app } = await buildApp(null);
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('refuse un non-membre avant toute écriture', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const { app, update } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(403);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

describe('PUT /conversations/:id/messages/:messageId/pin', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('épingle un message de la conversation et le diffuse', async () => {
    const { app, update, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      const res = await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.pinnedBy).toBe(USER_ID);
      expect(update).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenCalledWith('message:pinned', expect.objectContaining({ messageId: MESSAGE_ID }));
    } finally {
      await app.close();
    }
  });

  // Confidentialité de la présence (2026-08-25) : une charge de ROOM n'est pas
  // servie par destinataire, donc aucune présence réelle ne doit y voyager. Les
  // deux charges d'épingle ne portent ni expéditeur ni `isOnline`/`lastActiveAt`
  // — l'égalité STRICTE en est le témoin : ajouter un champ ici rougit.
  it('la charge `message:pinned` diffusée à la room ne porte que l’épingle — ni expéditeur ni présence', async () => {
    const { app, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(socket.emit).toHaveBeenCalledWith('message:pinned', {
        messageId: MESSAGE_ID,
        conversationId: CONV_ID,
        pinnedAt: expect.any(String),
        pinnedBy: USER_ID,
      });
    } finally {
      await app.close();
    }
  });

  it('la charge `message:unpinned` diffusée à la room ne porte que l’identité du message', async () => {
    const { app, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(socket.emit).toHaveBeenCalledWith('message:unpinned', { messageId: MESSAGE_ID, conversationId: CONV_ID });
    } finally {
      await app.close();
    }
  });

  it("n'épingle pas un message d'une AUTRE conversation", async () => {
    const { app, update } = await buildApp({ id: MESSAGE_ID, conversationId: OTHER_CONV_ID });
    try {
      const res = await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(404);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

/**
 * Un message supprimé pour tout le monde n'est plus un objet épinglable.
 *
 * Toutes les LECTURES de ce fichier le disent déjà : la liste des messages
 * (`deletedAt: null`), la liste des messages épinglés cent lignes plus bas
 * (`{ pinnedAt: { not: null }, deletedAt: null }`), la recherche. Les deux
 * ÉCRITURES de l'épingle étaient les seules à ne pas le dire — elles
 * localisaient le message par `{ id, conversationId }` seuls.
 *
 * Ce que ça donne : `PUT .../pin` sur un message supprimé répond 200, écrit
 * `pinnedAt`/`pinnedBy` sur un tombstone, et diffuse `message:pinned` dans la
 * room ET dans la file de rattrapage hors-ligne — un événement qui nomme un
 * message que tous les clients ont déjà retiré. Le web applique alors les
 * métadonnées d'épingle à sa copie en cache (`handleMessagePinned`), iOS à sa
 * persistance locale (`updatePinned`), et RIEN ne les détrompe ensuite : la
 * liste des épinglés filtre le message, donc aucun rechargement ne corrige
 * l'état ; et l'identité de dédup de la file étant `(messageId, 'pinned')`,
 * l'entrée fantôme survit à chaque reconnexion jusqu'au TTL.
 */
describe('épingler / dépingler un message supprimé', () => {
  const DELETED = { id: MESSAGE_ID, conversationId: CONV_ID, deletedAt: new Date('2026-08-01T10:00:00.000Z') };

  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("PUT rend 404 et n'écrit rien sur un message supprimé", async () => {
    const { app, update } = await buildApp(DELETED);
    try {
      const res = await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(404);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('PUT ne diffuse ni ne met en file une épingle sur un message supprimé', async () => {
    const { app, socket } = await buildApp(DELETED);
    try {
      await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.enqueueOfflineMessageMutation).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("DELETE rend 404 et n'écrit rien sur un message supprimé", async () => {
    const { app, update } = await buildApp(DELETED);
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(404);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('DELETE ne diffuse ni ne met en file un dépinglage sur un message supprimé', async () => {
    const { app, socket } = await buildApp(DELETED);
    try {
      await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.enqueueOfflineMessageMutation).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("laisse passer un message vivant — la garde ne ferme que la porte des supprimés", async () => {
    const { app, update, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID, deletedAt: null });
    try {
      const res = await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(200);
      expect(update).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenCalledWith('message:pinned', expect.objectContaining({ messageId: MESSAGE_ID }));
    } finally {
      await app.close();
    }
  });
});

/**
 * L'épingle passe par `broadcastMessageMutation` — le site UNIQUE de la famille
 * des mutations de message (cycle 130).
 *
 * Elle re-codait à la main deux des trois audiences de ce helper, et y perdait
 * les deux gardes que le helper porte :
 *
 *  1. **l'émission de room n'était pas gardée.** `io.to(room).emit(...)` LÈVE
 *     quand l'adaptateur ou l'encodeur est en défaut. L'épingle étant DÉJÀ
 *     commise en base à ce moment-là, la levée remontait au `catch` de la route,
 *     qui répondait 500 pour une écriture réussie — et, la levée ayant sauté la
 *     suite, la mise en file hors-ligne n'avait jamais lieu. Un incident
 *     COSMÉTIQUE emportait la seule garantie DURABLE du chemin, ce qui est
 *     exactement l'inversion que le cycle 116 a corrigée sur les deux
 *     producteurs de `message:new` ;
 *  2. **la mise en file était détachée sans `.catch`** — la forme que la
 *     leçon 230 interdit, et dont le seul effet observable est l'arrêt du
 *     process sous le `--unhandled-rejections=throw` par défaut de Node 22.
 *
 * Le second ne peut pas s'attester par le retour de la route : la promesse est
 * abandonnée, donc la route résout `200` que la garde soit là ou non. Le seul
 * témoin qui distingue les deux est le verdict du RUNTIME — d'où l'écoute de
 * `unhandledRejection` et le passage par la phase « check » (`setImmediate`),
 * moment où Node tranche.
 */
async function captureUnhandledRejections(body: () => Promise<void>): Promise<unknown[]> {
  const captured: unknown[] = [];
  const onUnhandled = (reason: unknown) => { captured.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    await body();
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return captured;
}

describe('la diffusion de l’épingle est un canal LATÉRAL — elle ne décide ni du statut ni du rejeu', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('PUT rend 200 quand l’émission de room LÈVE — l’épingle est déjà commise', async () => {
    const { app, update } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID }, { emitThrows: true });
    try {
      const res = await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(200);
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('PUT met TOUJOURS en file pour les absents, même quand l’émission de room LÈVE', async () => {
    const { app, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID }, { emitThrows: true });
    try {
      await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(socket.enqueueOfflineMessageMutation).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'pinned', messageId: MESSAGE_ID, conversationId: CONV_ID })
      );
    } finally {
      await app.close();
    }
  });

  it('DELETE rend 200 et met en file même quand l’émission de room LÈVE', async () => {
    const { app, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID }, { emitThrows: true });
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(200);
      expect(socket.enqueueOfflineMessageMutation).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'unpinned', messageId: MESSAGE_ID })
      );
    } finally {
      await app.close();
    }
  });

  it('une mise en file qui REJETTE ne laisse aucun rejet sans écouteur — PUT', async () => {
    const { app } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID }, { enqueueRejects: true });
    try {
      const unhandled = await captureUnhandledRejections(async () => {
        const res = await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
        expect(res.statusCode).toBe(200);
      });
      expect(unhandled).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('une mise en file qui REJETTE ne laisse aucun rejet sans écouteur — DELETE', async () => {
    const { app } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID }, { enqueueRejects: true });
    try {
      const unhandled = await captureUnhandledRejections(async () => {
        const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
        expect(res.statusCode).toBe(200);
      });
      expect(unhandled).toEqual([]);
    } finally {
      await app.close();
    }
  });

  /**
   * L'épingle ne DÉPLACE pas la liste des conversations — ni son aperçu, ni son
   * ordre, ni son compteur —, donc `broadcastMessageMutation` ne lui demande pas
   * la passe d'aperçu. C'est le TYPE qui la dispense (`prisma` n'existe que sur
   * `edited` et `deleted`), et ce témoin garde l'arbitrage de coût qui va avec :
   * un `findUnique` de conversation par épinglage, pour zéro delta observable.
   */
  it('n’ouvre aucune passe d’aperçu de conversation', async () => {
    const { app, prisma } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect((prisma as any).conversation?.findUnique).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
