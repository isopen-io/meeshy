/**
 * Le canal ÉPHÉMÈRE ne commande pas les canaux DURABLES.
 *
 * `createNotification` écrit la ligne, puis ouvre trois canaux de sortie dans
 * cet ordre : l'emit Socket.IO temps réel, le push APNs/FCM, l'e-mail immédiat
 * des notifications prioritaires. Les deux derniers sont chacun enveloppés dans
 * leur propre `try { } catch { }` « non-blocking » — le premier ne l'était pas.
 *
 * Un `await emitWithSeq(...)` nu, posé AVANT eux dans le même `try` que la
 * création, faisait donc porter au canal le plus fragile le sort des deux
 * seuls canaux qui atteignent un utilisateur absent. Et la panne qui le déclenche
 * est précisément celle où le push compte le plus : quand la couche socket
 * (adaptateur Redis, encodeur) est en défaut, tout le monde est hors ligne.
 *
 * Quatre conséquences, toutes portées par les témoins ci-dessous :
 *   1. le push ne part pas — alors que le commentaire de la ligne suivante dit
 *      « Send push notification (always) » ;
 *   2. l'e-mail immédiat des notifications `high` ne part pas — ce qui inclut
 *      les alertes de SÉCURITÉ (nouvelle connexion, mot de passe changé) ;
 *   3. `create()` rend `null`, donc l'appelant croit à un échec, alors que la
 *      ligne EXISTE en base : elle apparaîtra non lue à la prochaine lecture,
 *      avec `delivery.pushSent:false` à vie ;
 *   4. `emitCountsUpdate` est sauté, donc la pastille ne bouge pas.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '',
  },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) =>
      input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''
    ),
    sanitizeURL: jest.fn((input: string) => input || null),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    post: { findFirst: jest.fn().mockResolvedValue({ authorId: 'post-author', visibility: 'PUBLIC', visibilityUserIds: [] }) },
    userPreferences: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
    },
    postMedia: {
      findFirst: jest.fn(),
    },
    userConversationPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
    PostVisibility: {
      PUBLIC: 'PUBLIC', PRIVATE: 'PRIVATE', FRIENDS: 'FRIENDS',
      ONLY: 'ONLY', EXCEPT: 'EXCEPT', COMMUNITY: 'COMMUNITY',
    },
  };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

// L'e-mail immédiat des notifications `high` passe par un verrou de throttle
// (`setnx`) résolu en import dynamique. Autorisé ici : c'est l'envoi qu'on
// observe, pas le throttle.
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    setnx: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  securityLogger: {
    logViolation: jest.fn(),
    logAttempt: jest.fn(),
    logSuccess: jest.fn(),
  },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const RECIPIENT_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439012';
const CONVERSATION_ID = '507f1f77bcf86cd799439013';
const MESSAGE_ID = '507f1f77bcf86cd799439014';

const ADAPTER_DOWN = new Error('socket.io adapter unavailable');

function makeNotif() {
  return {
    id: 'notif-isolation-1',
    userId: RECIPIENT_ID,
    type: 'new_message',
    isRead: false,
    createdAt: new Date(),
    content: '',
    priority: 'normal',
    actor: null,
    context: {},
    metadata: {},
    delivery: { emailSent: false, pushSent: false },
  };
}

/**
 * Recense les rejets de promesse laissés SANS écouteur pendant `body`.
 *
 * Jumeau du helper de `MeeshySocketIOManager.test.ts` : une promesse détachée
 * ne se prouve pas par le retour de son appelant, seul le verdict du runtime
 * distingue « gardée » de « abandonnée ». D'où l'écoute de `unhandledRejection`
 * et le passage par la phase « check » (`setImmediate`), où Node tranche.
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

describe('NotificationService — un emit socket en panne ne commande pas les canaux durables', () => {
  let service: NotificationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let sendToUser: jest.Mock;
  let emit: jest.Mock;

  /** `io` dont l'emit LÈVE — l'adaptateur Redis tombé, l'encodeur qui refuse. */
  function installFailingSocketIO() {
    emit = jest.fn(() => { throw ADAPTER_DOWN; });
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit } as never, new Map());
  }

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma as never);

    sendToUser = jest.fn().mockResolvedValue(undefined);
    service.setPushNotificationService({ sendToUser } as never);

    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);
    (prisma.notification.create as jest.Mock).mockResolvedValue(makeNotif());
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue({ delivery: {} });
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
      title: 'Alice Martin',
      type: 'direct',
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      username: 'alice',
      displayName: 'Alice Martin',
      avatar: null,
      email: 'alice@example.test',
      systemLanguage: 'fr',
    });
  });

  const sendOne = () => service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_ID,
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    messagePreview: 'Salut, comment ça va ?',
  });

  it('le push part quand même — le canal durable ne dépend pas de l\'éphémère', async () => {
    installFailingSocketIO();

    await sendOne();

    expect(emit).toHaveBeenCalled();
    expect(sendToUser).toHaveBeenCalledTimes(1);
  });

  it('la notification est RENDUE, pas rendue `null` : la ligne existe en base', async () => {
    installFailingSocketIO();

    const created = await sendOne();

    // `null` fait croire l'appelant à un échec de création alors que la ligne
    // est écrite : il ne retentera pas, et rien ne rattrapera la livraison.
    expect(created).not.toBeNull();
    expect(created?.id).toBe('notif-isolation-1');
  });

  it('l\'e-mail immédiat d\'une alerte de sécurité part malgré la panne socket', async () => {
    installFailingSocketIO();
    const sendSecurityAlertEmail = jest.fn().mockResolvedValue(undefined);
    service.setEmailService({ sendSecurityAlertEmail } as never);
    // Hors ligne : `fetchSockets` vide est ce qui autorise l'e-mail immédiat.
    service.setSocketIO({
      to: jest.fn().mockReturnThis(),
      emit,
      in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }),
    } as never, new Map());

    await service.createPasswordChangedNotification({ recipientUserId: RECIPIENT_ID });

    expect(sendSecurityAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('ne laisse AUCUN rejet de promesse sans écouteur', async () => {
    installFailingSocketIO();

    const unhandled = await captureUnhandledRejections(async () => {
      await sendOne();
    });

    // `emitWithSeq` détache une chaîne de nettoyage par `void next.finally(…)`.
    // `.finally` ADOPTE le rejet de `next` : la promesse dérivée rejette sans
    // écouteur, même quand l'appelant garde `next`. Le process n'en meurt pas
    // (`server.ts` installe un `unhandledRejection` qui ne quitte pas), mais
    // chaque occurrence écrit dans `logs/gateway-crashes.log` par un
    // `appendFileSync` — de l'I/O SYNCHRONE sur la boucle d'événements.
    expect(unhandled).toEqual([]);
  });

  // ─── Le même défaut, en fan-out : un destinataire en panne emportait les
  //     suivants ────────────────────────────────────────────────────────────
  //
  // `announceNotificationsRetracted` et son jumeau `…Reproduced` bouclent sur
  // les destinataires d'un rappel de message. L'emit y était nu DANS la boucle :
  // une levée sur le premier sortait de la méthode, donc les destinataires
  // suivants n'étaient jamais annoncés — et le recalcul de badge posé APRÈS la
  // boucle, dont le commentaire de la méthode dit qu'il « compte », ne partait
  // pour personne.

  const deletedIdsEmitted = () => emit.mock.calls
    .filter(([name]) => name === 'notification:deleted')
    .map(([, payload]) => (payload as { notificationId: string }).notificationId);

  it('un rappel annonce TOUS ses destinataires même si le premier emit lève', async () => {
    installFailingSocketIO();

    // `pushSent: false` : ce témoin observe l'ISOLATION des emits socket, pas
    // le push de révocation.
    await service.announceNotificationsRetracted([
      { id: 'n1', userId: 'u1', pushSent: false },
      { id: 'n2', userId: 'u2', pushSent: false },
      { id: 'n3', userId: 'u3', pushSent: false },
    ]);

    expect(deletedIdsEmitted()).toEqual(['n1', 'n2', 'n3']);
  });

  it('la reproduction d\'une notification réécrite n\'abandonne pas la boucle', async () => {
    installFailingSocketIO();
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue({
      ...makeNotif(),
      id: 'reproduced',
      title: 'Titre réécrit',
      subtitle: null,
    });

    await service.announceNotificationsReproduced([
      { id: 'n1', userId: 'u1' },
      { id: 'n2', userId: 'u2' },
    ]);

    expect(deletedIdsEmitted()).toEqual(['n1', 'n2']);
  });

  it('quand l\'emit RÉUSSIT, rien ne change : le push part, la notification est rendue', async () => {
    const okEmit = jest.fn();
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: okEmit } as never, new Map());

    const created = await sendOne();

    expect(okEmit).toHaveBeenCalled();
    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(created).not.toBeNull();
  });
});
