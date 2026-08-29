/**
 * Unit tests for message routes (messages.ts)
 * Tests GET/PUT/DELETE /messages/:messageId, translations, status-details,
 * and attachment routes.
 *
 * `POST /messages/:messageId/status` a été RETIRÉE (#4188) : aucun des quatre
 * clients ne l'appelait, son schéma acceptait `status: 'delivered'` qu'aucune
 * branche ne traitait — mesuré avant retrait : **200 au corps VIDE**, la porte
 * acquittait un accusé de livraison qu'elle n'écrivait pas (l'issue annonçait
 * un 500 ; le vrai comportement est pire, un 500 fait réessayer) —, et elle
 * portait la quatrième copie du fan-out d'accusés sans plancher d'historique.
 * La porte vivante est `POST /conversations/:conversationId/mark-as-read`.
 * Son absence est verrouillée par `dead-doors-are-not-mounted.test.ts`.
 *
 * `GET /messages/:messageId/history` a été retirée : aucune donnée
 * d'historique n'existe en base, aucun des quatre clients ne l'appelait, et
 * elle portait une quatrième copie — divergente — de la règle d'admission.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

const mockDeleteAttachment = jest.fn().mockResolvedValue(undefined);
// Les compteurs de conversation : seul le singleton est doublé, la table
// MIME → compteur et la clé de crédit restent les vraies.
const mockOnMessageDeleted = jest.fn(async () => undefined);
const mockOnMessageEdited = jest.fn(async () => undefined);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onMessageDeleted: (...a: any[]) => (mockOnMessageDeleted as any)(...a),
    onMessageEdited: (...a: any[]) => (mockOnMessageEdited as any)(...a),
  },
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    deleteAttachment: (...args: any[]) => mockDeleteAttachment(...args),
  })),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../utils/translation-transformer', () => ({
  transformTranslationsToArray: jest.fn().mockReturnValue([]),
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    READ_STATUS_UPDATED: 'read-status:updated',
    ATTACHMENT_STATUS_UPDATED: 'attachment-status:updated',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

jest.mock('../../../validation/messages-schemas', () => ({
  MessageParamsSchema: {},
  AttachmentParamsSchema: {},
  UpdateMessageBodySchema: {},
  MessageStatusDetailsQuerySchema: {},
  AttachmentStatusBodySchema: {},
}));

const mockMarkMessagesAsRead = jest.fn().mockResolvedValue(undefined);
const mockGetLatestMessageSummary = jest.fn().mockResolvedValue({ readCount: 1 });
const mockGetMessageStatusDetails = jest.fn().mockResolvedValue({
  statuses: [],
  pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
});
const mockGetAttachmentStatusDetails = jest.fn().mockResolvedValue({
  statuses: [],
  pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
});
const mockMarkAudioAsListened = jest.fn().mockResolvedValue(undefined);
const mockMarkVideoAsWatched = jest.fn().mockResolvedValue(undefined);
const mockMarkImageAsViewed = jest.fn().mockResolvedValue(undefined);
const mockMarkAttachmentAsDownloaded = jest.fn().mockResolvedValue(undefined);

const mockRecordMessageLanguageView = jest.fn().mockResolvedValue(undefined);
// `GET /messages/:messageId` délègue désormais son `statusSummary` ici : ses
// colonnes dénormalisées n'ont aucun écrivain et valaient toujours zéro.
const mockGetConversationReadStatuses = jest.fn<any>().mockResolvedValue(new Map());

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: (...args: any[]) => mockMarkMessagesAsRead(...args),
    recordMessageLanguageView: (...args: any[]) => mockRecordMessageLanguageView(...args),
    getLatestMessageSummary: (...args: any[]) => mockGetLatestMessageSummary(...args),
    getMessageStatusDetails: (...args: any[]) => mockGetMessageStatusDetails(...args),
    getConversationReadStatuses: (...args: any[]) => mockGetConversationReadStatuses(...args),
    getAttachmentStatusDetails: (...args: any[]) => mockGetAttachmentStatusDetails(...args),
    markAudioAsListened: (...args: any[]) => mockMarkAudioAsListened(...args),
    markVideoAsWatched: (...args: any[]) => mockMarkVideoAsWatched(...args),
    markImageAsViewed: (...args: any[]) => mockMarkImageAsViewed(...args),
    markAttachmentAsDownloaded: (...args: any[]) => mockMarkAttachmentAsDownloaded(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const ATTACHMENT_ID = '507f1f77bcf86cd799439044';

const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  isAuthenticated: true,
  registeredUser: {
    id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith',
    displayName: 'Alice Smith', avatar: null, role: 'USER',
  },
};

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: PART_ID,
  content: 'Hello!',
  originalLanguage: 'fr',
  messageType: 'text',
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deliveredCount: 1,
  readCount: 0,
  deliveredToAllAt: null,
  readByAllAt: null,
  translations: null,
  sender: { id: PART_ID, userId: USER_ID, displayName: 'alice', avatar: null, type: 'registered', user: { username: 'alice' } },
  conversation: {
    id: CONV_ID,
    createdAt: new Date(),
    lastMessageAt: new Date('2026-07-01T00:00:00Z'),
    participants: [{ userId: USER_ID, role: 'member' }],
  },
  attachments: [],
};

const mockAttachment = {
  id: ATTACHMENT_ID,
  messageId: MSG_ID,
  message: {
    id: MSG_ID,
    conversationId: CONV_ID,
    conversation: {
      // `id` présent : la route écrit les statuts par PARTICIPANT
      // (AttachmentStatusEntry.participantId), jamais par User.id — le
      // sous-select doit donc remonter les deux.
      participants: [{ id: PART_ID, userId: USER_ID }],
    },
  },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    message: {
      findFirst: jest.fn().mockResolvedValue(mockMessage),
      update: jest.fn().mockResolvedValue({ ...mockMessage, isEdited: true }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...mockMessage, isEdited: true }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID }),
      findMany: jest.fn().mockResolvedValue([{ userId: USER_ID }]),
    },
    // Lues par `MessageReadStatusService`, à qui `GET /messages/:messageId`
    // délègue désormais son `statusSummary` : ses colonnes dénormalisées
    // n'ont aucun écrivain et valaient donc toujours zéro.
    conversationReadCursor: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    messageStatusEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userPreference: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    messageAttachment: {
      findFirst: jest.fn().mockResolvedValue(mockAttachment),
    },
    conversation: {
      // `applyMessageRemovalEffects` relit `lastMessageAt` au plus près de son
      // écriture conditionnelle plutôt que de le recevoir joint au message :
      // la garde CAS porte ainsi sur une valeur fraîche, et la route économise
      // la jointure. Le double rend ce que la jointure rendait.
      findUnique: jest.fn().mockResolvedValue({
        lastMessageAt: mockMessage.conversation.lastMessageAt,
        createdAt: mockMessage.conversation.createdAt,
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    trackingLink: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });

  app.decorate('translationService', {
    retranslateMessageAsync: jest.fn().mockResolvedValue(undefined),
  });

  app.decorate('socketIOHandler', { getManager: () => null });

  await messageRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /messages/:messageId ──────────────────────────────────────────────────

describe('GET /messages/:messageId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user not in conversation', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage,
      conversation: { ...mockMessage.conversation, participants: [] },
    });
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with message data', async () => {
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(500);
  });

  it('restitue `location` en champ top-level pour un message géolocalisé', async () => {
    // Lot 1 : le message affiché en entier (bulle complète) doit montrer sa
    // position — sans hoist, l'utilisateur ouvre le message et ne voit rien.
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage,
      metadata: { location: { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null } },
    });
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
  });

  describe('le résumé des accusés se CALCULE', () => {
    it('ne sert plus la colonne morte de la ligne Message', async () => {
      // `mockMessage.deliveredCount` vaut 1 — une valeur que la production ne
      // produit jamais, personne n'écrivant ce champ. Le double la garde
      // précisément pour que sa réapparition trahisse une lecture.
      mockGetConversationReadStatuses.mockResolvedValueOnce(
        new Map([[MSG_ID, { totalMembers: 3, receivedCount: 2, readCount: 1 }]])
      );

      const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Trois valeurs DISTINCTES : une permutation des trois champs — le seul
      // défaut plausible de ce câblage — ne peut pas passer inaperçue.
      expect(body.data.statusSummary.deliveredCount).toBe(2);
      expect(body.data.statusSummary.readCount).toBe(1);
      expect(body.data.statusSummary.recipientCount).toBe(3);
      // Le champ de premier niveau, que les trois clients décodent, dit la
      // même chose que le résumé — et non plus le contenu de la colonne.
      expect(body.data.deliveredCount).toBe(2);
      expect(body.data.deliveredCount).not.toBe(mockMessage.deliveredCount);
    });

    it('interroge le service sur la conversation du message', async () => {
      mockGetConversationReadStatuses.mockResolvedValueOnce(new Map());
      const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
      expect(res.statusCode).toBe(200);
      expect(mockGetConversationReadStatuses).toHaveBeenCalledWith(CONV_ID, [MSG_ID]);
    });

    it('laisse le résumé à zéro pour un message que le service ne décrit pas', async () => {
      mockGetConversationReadStatuses.mockResolvedValueOnce(new Map());
      const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.statusSummary.deliveredCount).toBe(0);
      expect(body.data.statusSummary.readCount).toBe(0);
      expect(body.data.statusSummary.recipientCount).toBe(0);
    });

    it('sert le message même quand le comptage échoue', async () => {
      // Le résumé est un ENRICHISSEMENT : son échec ne doit pas emporter le
      // message, qui est le contenu demandé.
      mockGetConversationReadStatuses.mockRejectedValueOnce(new Error('read statuses down'));

      const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.id).toBe(MSG_ID);
      expect(body.data.statusSummary.deliveredCount).toBe(0);
    });

    // Les DATES du seuil « tous servis » partagent le défaut des compteurs :
    // leurs colonnes n'ont aucun écrivain (`updateMessageComputedStatus` est un
    // no-op assumé). Les servir depuis la ligne, c'était promettre `null` à un
    // client dont le résolveur traite `readByAllAt != nil` comme la PREUVE que
    // tout le monde a lu.
    it('sert deliveredToAllAt / readByAllAt calculés, jamais la colonne', async () => {
      // Deux dates que la production ne produit jamais sur cette colonne : leur
      // réapparition dans la réponse trahirait une lecture de la ligne.
      (app as any).prisma.message.findFirst.mockResolvedValueOnce({
        ...mockMessage,
        deliveredToAllAt: new Date('1999-01-01T00:00:00Z'),
        readByAllAt: new Date('1999-01-02T00:00:00Z'),
      });
      mockGetConversationReadStatuses.mockResolvedValueOnce(
        new Map([[MSG_ID, {
          totalMembers: 2,
          receivedCount: 2,
          readCount: 2,
          deliveredToAllAt: new Date('2026-08-13T10:00:00Z'),
          readByAllAt: new Date('2026-08-13T10:05:00Z'),
        }]])
      );

      const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(new Date(body.data.deliveredToAllAt)).toEqual(new Date('2026-08-13T10:00:00Z'));
      expect(new Date(body.data.readByAllAt)).toEqual(new Date('2026-08-13T10:05:00Z'));
    });

    it('rend null pour les dates du seuil quand le service ne décrit pas le message', async () => {
      (app as any).prisma.message.findFirst.mockResolvedValueOnce({
        ...mockMessage,
        deliveredToAllAt: new Date('1999-01-01T00:00:00Z'),
        readByAllAt: new Date('1999-01-02T00:00:00Z'),
      });
      mockGetConversationReadStatuses.mockResolvedValueOnce(new Map());

      const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.deliveredToAllAt).toBeNull();
      expect(body.data.readByAllAt).toBeNull();
    });

    // `receivedByAllAt` était déclaré (Prisma, deux types partagés, schéma
    // OpenAPI), `select`é et relayé — sans écrivain NI lecteur sur aucune des
    // trois plateformes. Il sort entier ; la réponse ne doit plus le porter.
    it('ne porte plus receivedByAllAt, champ sans écrivain ni lecteur', async () => {
      const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).not.toHaveProperty('receivedByAllAt');
    });
  });
});

// ─── PUT /messages/:messageId ─────────────────────────────────────────────────

describe('PUT /messages/:messageId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when content is empty and no attachments', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage, attachments: [],
    });
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on successful update', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect((app as any).prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: MSG_ID, deletedAt: null },
    }));
  });

  // Ce transport — celui qu'emploie iOS — n'ajustait pas les compteurs :
  // `totalWords`/`totalCharacters` restaient sur les longueurs du texte
  // d'origine, définitivement (aucun recalcul périodique n'existe).
  it('ajuste les compteurs sur l\'écart de longueur', async () => {
    (mockOnMessageEdited as any).mockClear();

    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });

    expect(res.statusCode).toBe(200);
    const calls = (mockOnMessageEdited as any).mock.calls;
    expect(calls).toHaveLength(1);
    const [, conversationId, authorKey, previous, next] = calls[0];
    expect(conversationId).toBe(CONV_ID);
    expect(authorKey).toBe(USER_ID);
    expect(previous).toBe('Hello!');
    expect(next).toBe('Updated content');
  });

  it('returns 404 without broadcasting when the message was deleted between read and write (concurrent delete race)', async () => {
    (app as any).prisma.message.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'X' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── DELETE /messages/:messageId ──────────────────────────────────────────────

describe('DELETE /messages/:messageId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user lacks delete permission', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...mockMessage,
      sender: { ...mockMessage.sender, userId: 'other-user' },
      conversation: {
        ...mockMessage.conversation,
        participants: [{ userId: USER_ID, role: 'member' }],
      },
    });
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful deletion', async () => {
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(500);
  });

  // La suppression se commit d'UN SEUL coup — la propriété, pas la forme.
  //
  // Écrite en deux fois (`translations: null`, puis `deletedAt`), elle laissait
  // la ligne VIVANTE et dépouillée de ses traductions entre les deux. Le prix
  // n'est pas la fenêtre mais son échec : la seconde écriture ratée fige cet
  // état DÉFINITIVEMENT, et `MessageTranslationService` écrit lui-même
  // qu'« aucun chemin ne retente une traduction absente ». L'écriture
  // destructrice committait donc avant celle qui la rend inoffensive.
  //
  // La route d'ÉDITION de ce même fichier porte cet argument depuis le cycle 35
  // (« `translations: null` appartient à CETTE écriture, pas à une seconde plus
  // bas ») ; la famille de SUPPRESSION ne l'avait jamais reçu.
  it('committe la suppression en UNE écriture, traductions comprises', async () => {
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);
    (app as any).prisma.message.update.mockClear();

    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    expect(res.statusCode).toBe(200);
    const writes = (app as any).prisma.message.update.mock.calls;
    // UNE seule écriture : une seconde, quel que soit son contenu, rouvre la
    // fenêtre que celle-ci existe pour supprimer.
    expect(writes).toHaveLength(1);
    expect(writes[0][0].data).toEqual(
      expect.objectContaining({ translations: null, deletedAt: expect.any(Date) })
    );
  });

  // Le corollaire, énoncé comme une INTERDICTION d'état plutôt que comme un
  // compte d'écritures : aucun état committé ne doit porter « vivante ET sans
  // traductions ». Un futur refactor qui repasserait à deux écritures dans
  // l'autre ordre (`deletedAt` d'abord) satisferait encore « une seule écriture
  // porte les deux champs » sur la première — pas celle-ci.
  it('ne committe jamais un état « vivante et sans traductions »', async () => {
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);
    (app as any).prisma.message.update.mockClear();

    await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    const row: Record<string, unknown> = { ...mockMessage };
    const forbidden = (app as any).prisma.message.update.mock.calls.filter((call: any[]) => {
      Object.assign(row, call[0].data);
      return row.translations === null && row.deletedAt == null;
    });
    expect(forbidden).toHaveLength(0);
  });

  // Cette route — celle qu'emploie Android — retirait le message sans jamais
  // rendre son crédit aux compteurs. Le décompte ne vivait que dans la route
  // iOS/web, et le comptage que dans le handler socket : aucune des deux
  // moitiés ne couvrait l'autre.
  it('débite les compteurs de la conversation', async () => {
    (mockOnMessageDeleted as any).mockClear();
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce({
        ...mockMessage,
        attachments: [{ id: 'att-1', mimeType: 'audio/mp4' }],
      })
      .mockResolvedValueOnce(null);

    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    expect(res.statusCode).toBe(200);
    const calls = (mockOnMessageDeleted as any).mock.calls;
    expect(calls).toHaveLength(1);
    const [, conversationId, authorKey, content, tokens, messageType] = calls[0];
    expect(conversationId).toBe(CONV_ID);
    expect(authorKey).toBe(USER_ID);
    expect(content).toBe('Hello!');
    expect(tokens).toEqual(['audio']);
    expect(messageType).toBe('text');
  });

  // La QUATRIÈME audience d'une suppression. Le cycle 89 l'a câblée sur le
  // transport WS ; les deux transports REST — dont celui-ci — laissaient la
  // pastille compter un message que le lecteur voyait pourtant disparaître,
  // indéfiniment (la liste web tourne en `staleTime: Infinity`).
  //
  // L'exclusion porte sur l'AUTEUR (`senderId`, ici `PART_ID`) et jamais sur
  // l'acteur (`USER_ID`) : un modérateur qui retire le message d'un autre est
  // lui-même un destinataire dont la pastille doit bouger. Le type de
  // `broadcastMessageMutation` impose de passer UNE identité ; seul ce test dit
  // LAQUELLE.
  it('repousse la pastille de non-lus, en excluant l\'auteur et non l\'acteur', async () => {
    const emitUnread = jest.fn(async (_params: any) => {});
    (app as any).socketIOHandler.getManager = () => ({
      getIO: () => ({ to: () => ({ emit: () => {} }) }),
      enqueueOfflineMessageMutation: jest.fn(async () => {}),
      emitUnreadCountsToRecipients: emitUnread,
    });

    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);

    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    expect(res.statusCode).toBe(200);
    expect(emitUnread).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      senderId: PART_ID,
    });

    (app as any).socketIOHandler.getManager = () => null;
  });

  it('recomputes lastMessageAt via an optimistic-concurrency updateMany guarded on the pre-delete value', async () => {
    const lastNonDeletedAt = new Date('2026-07-02T00:00:00Z');
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce({ createdAt: lastNonDeletedAt });

    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.conversation.update).not.toHaveBeenCalled();
    expect((app as any).prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: CONV_ID, lastMessageAt: mockMessage.conversation.lastMessageAt },
      data: { lastMessageAt: lastNonDeletedAt },
    });
  });

  it('falls back to conversation.createdAt when every message in the conversation is deleted', async () => {
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);

    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: CONV_ID, lastMessageAt: mockMessage.conversation.lastMessageAt },
      data: { lastMessageAt: mockMessage.conversation.createdAt },
    });
  });
});

// ─── GET /messages/:messageId/translations ────────────────────────────────────

describe('GET /messages/:messageId/translations', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/translations' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user not a participant', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/translations' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with translations', async () => {
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/translations' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /messages/:messageId/status-details ──────────────────────────────────

describe('GET /messages/:messageId/status-details', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when message not found', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/status-details' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with status details', async () => {
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/status-details' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /attachments/:attachmentId/status-details ────────────────────────────

describe('GET /attachments/:attachmentId/status-details', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when attachment not found', async () => {
    (app as any).prisma.messageAttachment.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/attachments/' + ATTACHMENT_ID + '/status-details' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with attachment status details', async () => {
    const res = await app.inject({ method: 'GET', url: '/attachments/' + ATTACHMENT_ID + '/status-details' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /attachments/:attachmentId/status ───────────────────────────────────

describe('POST /attachments/:attachmentId/status', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when attachment not found', async () => {
    (app as any).prisma.messageAttachment.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 for listened action', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', complete: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  // Le bug d'identifiant qui vidait l'onglet « Écouté » pour TOUT LE MONDE
  // (audit 2026-08-18) : la route passait `authContext.userId` (User.id pour
  // un inscrit) là où AttachmentStatusEntry.participantId attend un
  // Participant.id — les lignes écrites étaient orphelines, filtrées en
  // lecture (`if (!participant) return null`), invisibles au cross-device.
  // Même patron que la route mark-read (« participantId, pas userId »).
  it('writes the status under the PARTICIPANT id, never the User id', async () => {
    mockMarkAudioAsListened.mockClear();
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', complete: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMarkAudioAsListened).toHaveBeenCalledTimes(1);
    expect(mockMarkAudioAsListened.mock.calls[0]![0]).toBe(PART_ID);
  });

  it('routes watched/viewed/downloaded under the PARTICIPANT id too', async () => {
    mockMarkVideoAsWatched.mockClear();
    mockMarkImageAsViewed.mockClear();
    mockMarkAttachmentAsDownloaded.mockClear();
    for (const action of ['watched', 'viewed', 'downloaded']) {
      const res = await app.inject({
        method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
        payload: { action },
      });
      expect(res.statusCode).toBe(200);
    }
    expect(mockMarkVideoAsWatched.mock.calls[0]![0]).toBe(PART_ID);
    expect(mockMarkImageAsViewed.mock.calls[0]![0]).toBe(PART_ID);
    expect(mockMarkAttachmentAsDownloaded.mock.calls[0]![0]).toBe(PART_ID);
  });

  it('returns 200 for viewed action', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'viewed' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 200 for downloaded action', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'downloaded' },
    });
    expect(res.statusCode).toBe(200);
  });
});
