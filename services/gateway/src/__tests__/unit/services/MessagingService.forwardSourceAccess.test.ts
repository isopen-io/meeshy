/**
 * ON NE TRANSFÈRE QUE CE QU'ON A LE DROIT DE LIRE (#9579).
 *
 * `forwardedFromId` est une RÉFÉRENCE PAR IDENTIFIANT : l'envoi désigne un
 * message, et le serveur en tire des pièces jointes (copiées), puis un aperçu
 * de provenance (servi par le fil). L'admission du transfert lisait la
 * PROTECTION de la source — jamais le DROIT de l'expéditeur à la lire.
 *
 * Ces témoins passent par l'API publique du service, `handleMessage`, le site
 * où convergent les trois transports d'envoi (REST, socket texte, socket
 * pièces jointes) : aucun des trois ne lit la source avant lui. Ils assertent
 * sur l'EFFET — la ligne écrite, les pièces copiées, ce que le fil sert
 * ensuite — jamais sur le seul statut.
 *
 * La base est une base EN MÉMOIRE qui ÉVALUE les `where` (harnais du favori de
 * message) : un témoin de garde tombe quand la REQUÊTE cesse de garder, pas
 * seulement quand le service cesse d'appeler.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { MessageRequest } from '@meeshy/shared/types';

const mockHandleNewMessage = jest.fn();
const mockUpdateOnNewMessage = jest.fn();
const mockProcessExplicitLinksInContent = jest.fn(
  async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })
);

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({ handleNewMessage: mockHandleNewMessage }))
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: mockUpdateOnNewMessage }
}));

jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: { onNewMessage: jest.fn(async () => undefined) }
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: jest.fn(async () => null),
    createTrackingLink: jest.fn(async () => ({ token: 'abc123' })),
    processExplicitLinksInContent: mockProcessExplicitLinksInContent,
    collectContentTrackingLinks: jest.fn(async () => [])
  }))
}));

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn(() => []),
    extractMentionsWithParticipants: jest.fn(() => []),
    resolveUsernames: jest.fn(async () => new Map()),
    validateMentionPermissions: jest.fn(async () => ({ isValid: true, validUserIds: [], invalidUsernames: [], errors: [] })),
    createMentions: jest.fn(async () => undefined)
  }))
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: jest.fn(async () => undefined),
    getUnreadCount: jest.fn(async () => 0)
  }))
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { MessagingService } from '../../../services/MessagingService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resetParticipantLookupCache } from '../../../utils/participant-lookup-cache';
import { enrichForwardedMessagesForList } from '../../../routes/conversations/messages-list-query';
import {
  CONV_A,
  CONV_B,
  CONV_DIRECT,
  MSG_1,
  OTHER_USER_ID,
  USER_ID,
  matchesWhere,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  type Store,
} from '../routes/me/starred-messages-harness';

type Row = Record<string, unknown>;

/** La base du favori, plus les accusés par lecteur (décomptes, ouvertures). */
type Scenario = Store & { statusEntries?: Row[] };

/** La conversation où le message SOURCE vit, et celle où l'expéditeur ÉCRIT. */
const SOURCE_CONVERSATION = CONV_A;
const TARGET_CONVERSATION = CONV_B;
const SOURCE_MESSAGE = MSG_1;
const UNKNOWN_MESSAGE = '68b0000000000000000001ff';

const SENDER_IN_TARGET = '68b000000000000000000021';
const GUEST_IN_TARGET = '68b0000000000000000000f1';
const EXPIRED_LINK = '68b0000000000000000000e9';

const SOURCE_SECRET = 'TEXTE-DE-LA-SOURCE';
const SOURCE_FILE = 'https://cdn.example/piece-de-la-source.jpg';
const OWN_TEXT = 'Le texte que l’expéditeur envoie lui-même';

const AFTER_THE_SOURCE = new Date('2026-09-20T11:00:00.000Z');

/** La ligne de l'expéditeur DANS la conversation de la source — la clé de ses accusés. */
const SENDER_IN_SOURCE = '68b000000000000000000011';
const EPHEMERAL_BIT = 1 << 0;
const VIEW_ONCE_BIT = 1 << 2;
const AFTER_READ_BIT = 1 << 3;

/** `handleMessage` lit l'horloge du mur : les échéances se datent par rapport à elle. */
const fromNow = (seconds: number): Date => new Date(Date.now() + seconds * 1000);

const flameSource = (overrides: Row = {}): Row =>
  sourceMessage({ effectFlags: EPHEMERAL_BIT, ephemeralDuration: 30, expiresAt: fromNow(7 * 24 * 3600), ...overrides });
const afterReadSource = (): Row => flameSource({ effectFlags: EPHEMERAL_BIT | AFTER_READ_BIT, ephemeralDuration: null });
const viewOnceSource = (): Row => sourceMessage({ isViewOnce: true, effectFlags: VIEW_ONCE_BIT });

const withEntries = (store: Store, statusEntries: Row[]): Scenario => ({ ...store, statusEntries });
const countdown = (deadline: Date): Row => ({ messageId: SOURCE_MESSAGE, participantId: SENDER_IN_SOURCE, ephemeralExpiresAt: deadline });

const sourceMessage = (overrides: Row = {}): Row =>
  messageRow({
    content: SOURCE_SECRET,
    ephemeralDuration: null,
    viewOnceBurnedAt: null,
    attachments: [{ id: '68b0000000000000000000c1', mimeType: 'image/jpeg', fileUrl: SOURCE_FILE, thumbnailUrl: null, isViewOnce: false, isBlurred: false, effectFlags: 0 }],
    _count: { attachments: 1 },
    ...overrides,
  });

const senderInTarget = (overrides: Row = {}): Row =>
  participantRow({ id: SENDER_IN_TARGET, conversationId: TARGET_CONVERSATION, ...overrides });

/** L'expéditeur LIT la source : participant actif de SA conversation, rien de masqué. */
const readableStore = (overrides: Partial<Store> = {}): Store =>
  makeStore({
    messages: [sourceMessage()],
    participants: [senderInTarget(), participantRow()],
    conversations: [
      { id: SOURCE_CONVERSATION, title: 'Conversation de la source', identifier: 'mshy_source', type: 'group', avatar: null },
      { id: CONV_DIRECT, title: 'Une tierce conversation', identifier: 'mshy_tierce', type: 'group', avatar: null },
    ],
    ...overrides,
  });

/**
 * Chaque façon de NE PAS pouvoir lire la source. Toutes doivent rendre la même
 * chose qu'un identifiant qui ne désigne rien.
 */
const UNREADABLE: ReadonlyArray<readonly [string, () => Scenario, string?]> = [
  ['n’a jamais participé à la conversation de la source', () => readableStore({ participants: [senderInTarget()] })],
  ['a QUITTÉ la conversation de la source', () => readableStore({ participants: [senderInTarget(), participantRow({ isActive: false })] })],
  ['en est BANNI, sa ligne restée active', () => readableStore({ participants: [senderInTarget(), participantRow({ bannedAt: new Date('2026-09-10T00:00:00.000Z') })] })],
  ['n’a pas l’historique : la source précède son plancher', () => readableStore({ participants: [senderInTarget(), participantRow({ historyVisibleFrom: AFTER_THE_SOURCE })] })],
  ['a retiré la source de SA vue', () => readableStore({ deletions: [{ userId: USER_ID, messageId: SOURCE_MESSAGE }] })],
  ['a vidé son historique après la source', () => readableStore({ prefs: [{ userId: USER_ID, conversationId: SOURCE_CONVERSATION, clearHistoryBefore: AFTER_THE_SOURCE }] })],
  ['désigne une source supprimée pour tous', () => readableStore({ messages: [sourceMessage({ deletedAt: new Date('2026-09-20T10:30:00.000Z') })] })],
  [
    'est entré par un lien de partage ÉCHU',
    () => readableStore({
      participants: [senderInTarget(), participantRow({ shareLinkId: EXPIRED_LINK })],
      shareLinks: [{ id: EXPIRED_LINK, allowViewHistory: true, expiresAt: new Date('2026-01-01T00:00:00.000Z') }],
    }),
  ],
  [
    'est un invité ANONYME d’une autre conversation',
    () => readableStore({
      participants: [
        participantRow({ id: GUEST_IN_TARGET, conversationId: TARGET_CONVERSATION, userId: null, user: null }),
        participantRow({ userId: OTHER_USER_ID }),
      ],
    }),
    GUEST_IN_TARGET,
  ],
  // Le contenu a disparu POUR LUI : il lit la conversation, plus ce message.
  ['a vu son décompte finir sur cette flamme', () => withEntries(readableStore({ messages: [flameSource()] }), [countdown(fromNow(-1))])],
  ['a déjà consommé cette flamme après lecture', () => withEntries(readableStore({ messages: [afterReadSource()] }), [countdown(fromNow(-5))])],
  [
    'a déjà ouvert cette vue unique',
    () => withEntries(readableStore({ messages: [viewOnceSource()] }), [{ messageId: SOURCE_MESSAGE, participantId: SENDER_IN_SOURCE, viewedOnceAt: fromNow(-60) }]),
  ],
  // La NATURE d'une source ne se dit pas à qui ne la lit pas.
  ['n’y a jamais participé, et la source est à vue unique', () => readableStore({ messages: [viewOnceSource()], participants: [senderInTarget()] })],
  ['n’y a jamais participé, et la source est une flamme après lecture', () => readableStore({ messages: [afterReadSource()], participants: [senderInTarget()] })],
];

describe('MessagingService.handleMessage — on ne transfère que ce qu’on a le droit de lire (#9579)', () => {
  let service: MessagingService;
  let mockPrisma: any;

  const mount = (store: Scenario) => {
    const db = makePrisma(store);
    mockPrisma.messageStatusEntry = {
      findMany: async (args: { where?: Row }) => (store.statusEntries ?? []).filter((entry) => matchesWhere(entry, args.where)),
    };
    mockPrisma.participant.count = async (args: { where?: Row }) =>
      store.participants.filter((p) => matchesWhere(p, args.where)).length;
    mockPrisma.message.findUnique.mockImplementation(db.message.findUnique);
    mockPrisma.message.findMany.mockImplementation(db.message.findMany);
    mockPrisma.participant.findFirst.mockImplementation(db.participant.findFirst);
    mockPrisma.participant.findUnique.mockImplementation(
      async (args: { where: { id: string } }) => store.participants.find((p) => p.id === args.where.id) ?? null
    );
    mockPrisma.conversation.findMany.mockImplementation(db.conversation.findMany);
    mockPrisma.conversationShareLink = db.conversationShareLink;
    mockPrisma.userConversationPreferences = db.userConversationPreferences;
    mockPrisma.userMessageDeletion = db.userMessageDeletion;
    // Les pièces de la SOURCE : c'est cette lecture-là qu'une copie de
    // transfert ouvre, et aucune autre.
    mockPrisma.messageAttachment.findMany.mockImplementation(async (args: { where?: { messageId?: string } }) =>
      args?.where?.messageId === SOURCE_MESSAGE
        ? [{ id: '68b0000000000000000000c1', messageId: SOURCE_MESSAGE, mimeType: 'image/jpeg', filePath: '/p/source.jpg', fileUrl: SOURCE_FILE, fileName: 'source.jpg', originalName: 'source.jpg', fileSize: 10 }]
        : []
    );
  };

  const written = (): Row | undefined => mockPrisma.message.create.mock.calls[0]?.[0]?.data;

  const copiedFromSource = (): boolean =>
    mockPrisma.messageAttachment.create.mock.calls.length > 0 ||
    mockPrisma.messageAttachment.findMany.mock.calls.some(
      ([args]: [{ where?: { messageId?: string } }]) => args?.where?.messageId === SOURCE_MESSAGE
    );

  /**
   * Ce que le fil servirait de la ligne ÉCRITE à un lecteur de la conversation
   * cible : la vraie fonction d'enrichissement de la liste, sur la même base.
   */
  const servedByThread = async (store: Store): Promise<Row> => {
    const data = written() ?? {};
    const row: Row = {
      id: '68b0000000000000000001aa',
      forwardedFromId: data.forwardedFromId ?? null,
      forwardedFromConversationId: data.forwardedFromConversationId ?? null,
      sender: { userId: USER_ID },
      attachments: [],
    };
    await enrichForwardedMessagesForList(makePrisma(store) as unknown as PrismaClient, OTHER_USER_ID, [row as never]);
    return row;
  };

  const send = (request: Partial<MessageRequest> & Row, senderParticipantId = SENDER_IN_TARGET) =>
    service.handleMessage(
      { conversationId: TARGET_CONVERSATION, content: OWN_TEXT, ...request } as MessageRequest,
      senderParticipantId
    );

  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockUpdateOnNewMessage.mockResolvedValue({ messageCount: 10, participantCount: 2 });

    mockPrisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: TARGET_CONVERSATION, type: 'private' }),
        findFirst: jest.fn().mockResolvedValue({ id: TARGET_CONVERSATION, identifier: 'mshy_cible', type: 'private' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: TARGET_CONVERSATION, lastMessageAt: new Date() })
      },
      participant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([])
      },
      message: {
        create: jest.fn().mockImplementation(async (args: { data: Row }) => ({
          id: '68b0000000000000000001aa',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
          sender: { id: SENDER_IN_TARGET, displayName: 'Expéditeur', avatar: null, type: 'user', userId: USER_ID },
          attachments: [],
          replyTo: null
        })),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null)
      },
      trackingLink: { updateMany: jest.fn() },
      messageAttachment: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: '68b0000000000000000000c9' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    service = new MessagingService(
      mockPrisma as unknown as PrismaClient,
      { handleNewMessage: mockHandleNewMessage } as never,
      { createMentionNotification: jest.fn(), createMentionNotificationsBatch: jest.fn().mockResolvedValue(0) } as never
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('le chemin nominal — transférer un message qu’on lit — est inchangé', () => {
    it('garde la provenance et recopie les pièces de la source', async () => {
      const store = readableStore();
      mount(store);

      const response = await send({ forwardedFromId: SOURCE_MESSAGE, forwardedFromConversationId: SOURCE_CONVERSATION });

      expect(response.success).toBe(true);
      expect(written()?.forwardedFromId).toBe(SOURCE_MESSAGE);
      expect(written()?.forwardedFromConversationId).toBe(SOURCE_CONVERSATION);
      expect(mockPrisma.messageAttachment.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.messageAttachment.create.mock.calls[0][0].data).toMatchObject({
        forwardedFromAttachmentId: '68b0000000000000000000c1',
        isForwarded: true,
      });

      const served = await servedByThread(store);
      expect(served.forwardedFrom).toMatchObject({ id: SOURCE_MESSAGE, content: SOURCE_SECRET });
      expect(served.forwardedFromConversation).toMatchObject({ id: SOURCE_CONVERSATION });
    });

    it('transfère une flamme dont son décompte court encore : la durée de la source borne la copie', async () => {
      mount(withEntries(readableStore({ messages: [flameSource()] }), [countdown(fromNow(3600))]));

      const response = await send({ forwardedFromId: SOURCE_MESSAGE, ephemeralDuration: 86_400 } as Row);

      expect(response.success).toBe(true);
      expect(written()?.forwardedFromId).toBe(SOURCE_MESSAGE);
      expect(written()?.ephemeralDuration).toBe(30);
    });

    it('transfère un média sans texte : les pièces de la source font le corps', async () => {
      mount(readableStore());

      const response = await send({ content: '', forwardedFromId: SOURCE_MESSAGE });

      expect(response.success).toBe(true);
      expect(written()?.forwardedFromId).toBe(SOURCE_MESSAGE);
      expect(mockPrisma.messageAttachment.create).toHaveBeenCalledTimes(1);
    });
  });

  describe.each(UNREADABLE)('l’expéditeur %s', (_label, storeOf, senderParticipantId) => {
    it('avec son propre texte : message ORDINAIRE — ni pièce copiée, ni provenance, ni rien que le fil serve de la source', async () => {
      const store = storeOf();
      mount(store);

      const response = await send(
        { forwardedFromId: SOURCE_MESSAGE, forwardedFromConversationId: SOURCE_CONVERSATION },
        senderParticipantId
      );

      expect(response.success).toBe(true);
      expect(written()?.content).toBe(OWN_TEXT);
      expect(written()?.forwardedFromId ?? null).toBeNull();
      expect(written()?.forwardedFromConversationId ?? null).toBeNull();
      expect(copiedFromSource()).toBe(false);

      const served = await servedByThread(store);
      expect(served.forwardedFrom ?? null).toBeNull();
      expect(served.forwardedFromConversation ?? null).toBeNull();
      expect(JSON.stringify(served)).not.toContain(SOURCE_SECRET);
      expect(JSON.stringify(served)).not.toContain(SOURCE_FILE);
    });

    it('avec ses propres pièces jointes (transport socket pièces jointes) : rien de la source non plus', async () => {
      mount(storeOf());

      const response = await send(
        { content: '', attachmentIds: ['68b0000000000000000000d7'], forwardedFromId: SOURCE_MESSAGE },
        senderParticipantId
      );

      expect(response.success).toBe(true);
      expect(written()?.forwardedFromId ?? null).toBeNull();
      expect(copiedFromSource()).toBe(false);
    });

    it('sans corps propre : refus, sans rien écrire', async () => {
      mount(storeOf());

      const response = await send({ content: '', forwardedFromId: SOURCE_MESSAGE }, senderParticipantId);

      expect(response.success).toBe(false);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(copiedFromSource()).toBe(false);
    });

    it('reçoit EXACTEMENT la réponse d’une source qui n’existe pas', async () => {
      mount(storeOf());
      const refused = await send({ content: '', forwardedFromId: SOURCE_MESSAGE }, senderParticipantId);
      const degraded = await send({ forwardedFromId: SOURCE_MESSAGE }, senderParticipantId);
      const degradedRow = written();

      jest.clearAllMocks();
      resetParticipantLookupCache();
      mount(storeOf());
      const refusedUnknown = await send({ content: '', forwardedFromId: UNKNOWN_MESSAGE }, senderParticipantId);
      const degradedUnknown = await send({ forwardedFromId: UNKNOWN_MESSAGE }, senderParticipantId);

      expect(refused).toEqual(refusedUnknown);
      expect(degraded.success).toBe(degradedUnknown.success);
      expect(degraded.message).toBe(degradedUnknown.message);
      expect(degradedRow).toEqual(written());
    });
  });

  describe('une lecture d’accès qui ÉCHOUE ferme', () => {
    it.each([
      ['la participation de l’expéditeur', () => mockPrisma.participant.findFirst.mockRejectedValue(new Error('mongo down'))],
      ['le lien de partage de l’expéditeur', () => { mockPrisma.conversationShareLink.findUnique = jest.fn().mockRejectedValue(new Error('mongo down')); }],
    ])('%s illisible : rien de la source ne sort', async (_label, breakRead) => {
      mount(readableStore({
        participants: [senderInTarget(), participantRow({ shareLinkId: EXPIRED_LINK })],
        shareLinks: [{ id: EXPIRED_LINK, allowViewHistory: true, expiresAt: null }],
      }));
      breakRead();

      const degraded = await send({ forwardedFromId: SOURCE_MESSAGE });
      expect(degraded.success).toBe(true);
      expect(written()?.forwardedFromId ?? null).toBeNull();
      expect(copiedFromSource()).toBe(false);

      mockPrisma.message.create.mockClear();
      const refused = await send({ content: '', forwardedFromId: SOURCE_MESSAGE });
      expect(refused.success).toBe(false);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('la conversation de provenance est un FAIT lu sur la source, jamais une déclaration', () => {
    it('retire une conversation qui n’est pas celle de la source', async () => {
      const store = readableStore();
      mount(store);

      const response = await send({ forwardedFromId: SOURCE_MESSAGE, forwardedFromConversationId: CONV_DIRECT });

      expect(response.success).toBe(true);
      expect(written()?.forwardedFromId).toBe(SOURCE_MESSAGE);
      expect(written()?.forwardedFromConversationId ?? null).toBeNull();
      const served = await servedByThread(store);
      expect(served.forwardedFromConversation ?? null).toBeNull();
      expect(JSON.stringify(served)).not.toContain('Une tierce conversation');
      expect(JSON.stringify(served)).not.toContain('mshy_tierce');
    });

    it('retire une conversation nommée SANS message source', async () => {
      mount(readableStore());

      const response = await send({ forwardedFromConversationId: CONV_DIRECT });

      expect(response.success).toBe(true);
      expect(written()?.forwardedFromConversationId ?? null).toBeNull();
    });
  });
});
