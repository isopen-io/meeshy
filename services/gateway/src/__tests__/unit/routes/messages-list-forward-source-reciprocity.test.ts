/**
 * `GET /conversations/:id/messages` — la SOURCE d'un transfert ne doit QUITTER
 * le serveur que si son auteur ET son lecteur l'autorisent.
 *
 * Directive produit (2026-08-23) : « si on permet d'afficher le nom des
 * transferts, toute personne qui l'a permis aussi verra mes noms de transfert.
 * Si on ne permet pas, je ne verrai pas le nom d'auteur des transferts et
 * personne ne verra les miens non plus ! La nomination des groupes publics doit
 * suivre aussi. »
 *
 * Ces témoins assertent l'ABSENCE, pas une marque. Un serveur qui enverrait le
 * nom en laissant le client décider de ne pas l'afficher n'aurait rien protégé :
 * le nom aurait transité, et n'importe quel client modifié — ou un simple
 * inspecteur réseau — le lirait. La règle OMET la donnée de la réponse.
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

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn().mockResolvedValue(new Map()),
  }),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';

/** Celui qui a TRANSFÉRÉ le message — c'est SA préférence qui gate ses sources. */
const FORWARDER_USER_ID = '507f1f77bcf86cd799439022';
const FORWARDER_PARTICIPANT_ID = '507f1f77bcf86cd799439023';

/** Celui qui LIT la conversation. */
const READER_USER_ID = '507f1f77bcf86cd799439031';
const READER_PARTICIPANT_ID = '507f1f77bcf86cd799439032';

const MESSAGE_ID = '507f1f77bcf86cd799439041';
const ORIGIN_MESSAGE_ID = '507f1f77bcf86cd799439042';
const ORIGIN_CONV_ID = '507f1f77bcf86cd799439043';
const ORIGIN_SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const ORIGIN_SENDER_USER_ID = '507f1f77bcf86cd799439045';

const CREATED_AT = new Date('2026-08-01T10:00:00.000Z');

const OTHER_FORWARDER_USER_ID = '507f1f77bcf86cd799439051';
const OTHER_FORWARDER_PARTICIPANT_ID = '507f1f77bcf86cd799439052';
const CONV_ONLY_MESSAGE_ID = '507f1f77bcf86cd799439053';

type Options = {
  /** Les `User.id` dont `showForwardSource` vaut `false` en base. */
  readonly optedOut?: readonly string[];
  /** Le lecteur authentifié. */
  readonly readerUserId?: string;
  /** L'auteur du transfert n'a pas de compte (invité de lien partagé). */
  readonly anonymousForwarder?: boolean;
  /**
   * Ajoute un SECOND message qui ne nomme QUE sa conversation source
   * (`forwardedFromConversationId` sans `forwardedFromId`), transféré par un
   * autre auteur. L'enrichissement des conversations n'est atteint que si un
   * message de la page porte un `forwardedFromId` — c'est ce qui rend la page
   * MIXTE nécessaire pour exercer ce cas.
   */
  readonly withConversationOnlyMessage?: boolean;
};

async function buildApp({
  optedOut = [],
  readerUserId = READER_USER_ID,
  anonymousForwarder = false,
  withConversationOnlyMessage = false,
}: Options): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const participants = [
    { id: FORWARDER_PARTICIPANT_ID, userId: FORWARDER_USER_ID, isActive: true },
    { id: OTHER_FORWARDER_PARTICIPANT_ID, userId: OTHER_FORWARDER_USER_ID, isActive: true },
    { id: READER_PARTICIPANT_ID, userId: READER_USER_ID, isActive: true },
  ];

  const carrier = {
    id: MESSAGE_ID,
    conversationId: CONV_ID,
    senderId: FORWARDER_PARTICIPANT_ID,
    content: 'regarde',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    isEdited: false,
    deletedAt: null,
    validatedMentions: [],
    attachments: [],
    deliveredCount: 0,
    readCount: 0,
    deliveredToAllAt: null,
    readByAllAt: null,
    forwardedFromId: ORIGIN_MESSAGE_ID,
    forwardedFromConversationId: ORIGIN_CONV_ID,
    sender: anonymousForwarder
      ? { id: FORWARDER_PARTICIPANT_ID, userId: null, displayName: 'Invite', type: 'anonymous', user: null }
      : {
          id: FORWARDER_PARTICIPANT_ID,
          userId: FORWARDER_USER_ID,
          displayName: 'Transfereur',
          user: { id: FORWARDER_USER_ID, username: 'transfereur' },
        },
  };

  /** Ne nomme QUE sa conversation source — aucun `forwardedFromId`. */
  const conversationOnlyCarrier = {
    ...carrier,
    id: CONV_ONLY_MESSAGE_ID,
    senderId: OTHER_FORWARDER_PARTICIPANT_ID,
    forwardedFromId: null,
    forwardedFromConversationId: ORIGIN_CONV_ID,
    sender: {
      id: OTHER_FORWARDER_PARTICIPANT_ID,
      userId: OTHER_FORWARDER_USER_ID,
      displayName: 'Autre Transfereur',
      user: { id: OTHER_FORWARDER_USER_ID, username: 'autre' },
    },
  };

  const page = withConversationOnlyMessage ? [carrier, conversationOnlyCarrier] : [carrier];

  const origin = {
    id: ORIGIN_MESSAGE_ID,
    content: "Message d'origine",
    senderId: ORIGIN_SENDER_PARTICIPANT_ID,
    conversationId: ORIGIN_CONV_ID,
    messageType: 'text',
    createdAt: CREATED_AT,
    metadata: null,
    sender: {
      id: ORIGIN_SENDER_PARTICIPANT_ID,
      userId: ORIGIN_SENDER_USER_ID,
      displayName: 'Auteur Origine',
      avatar: null,
      user: { username: 'auteur_origine' },
    },
    attachments: [],
  };

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(participants[1]),
      findMany: jest.fn().mockResolvedValue(participants),
    },
    message: {
      count: jest.fn().mockResolvedValue(page.length),
      // Deux appels distincts : la PAGE, puis l'enrichissement des transferts.
      findMany: jest.fn((args: any) =>
        Promise.resolve(args?.where?.id?.in ? [origin] : page)
      ),
    },
    conversation: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: ORIGIN_CONV_ID,
          title: 'Groupe Public Source',
          identifier: 'mshy_source',
          type: 'public',
          avatar: null,
        },
      ]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      }),
    },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn().mockResolvedValue([]) },
    messageStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    // Seul le document JSON est écrit par l'application (cf. privacy-storage).
    userPreferences: {
      findMany: jest.fn((args: any) =>
        Promise.resolve(
          (args?.where?.userId?.in ?? [])
            .filter((id: string) => optedOut.includes(id))
            .map((userId: string) => ({ userId, privacy: { showForwardSource: false } }))
        )
      ),
    },
    userPreference: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const optionalAuth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: readerUserId,
      registeredUser: { id: readerUserId, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

async function fetchPage(options: Options): Promise<Array<Record<string, unknown>>> {
  const app = await buildApp(options);
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    expect(res.statusCode).toBe(200);
    return res.json().data;
  } finally {
    await app.close();
  }
}

const fetchMessage = async (options: Options): Promise<Record<string, unknown>> =>
  (await fetchPage(options))[0];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/messages — réciprocité de la source des transferts', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    clearPrivacyPreferencesCache();
  });

  it("sert la source quand AUCUNE préférence n'est enregistrée — le défaut est TRUE et la prod ne migre pas", async () => {
    const message = await fetchMessage({});

    expect(message.forwardedFrom).toBeDefined();
    expect((message.forwardedFrom as any).sender.displayName).toBe('Auteur Origine');
    expect((message.forwardedFromConversation as any).title).toBe('Groupe Public Source');
  });

  it("ne livre PAS le nom quand l'AUTEUR du transfert a désactivé, même si le lecteur autorise", async () => {
    const message = await fetchMessage({ optedOut: [FORWARDER_USER_ID] });

    expect(message.forwardedFrom ?? null).toBeNull();
    expect(message.forwardedFromConversation ?? null).toBeNull();
  });

  it('ne livre PAS le nom quand le LECTEUR a désactivé, même si l\'auteur autorise — qui se cache ne voit pas', async () => {
    const message = await fetchMessage({ optedOut: [READER_USER_ID] });

    expect(message.forwardedFrom ?? null).toBeNull();
    expect(message.forwardedFromConversation ?? null).toBeNull();
  });

  it('ne livre PAS le nom quand les deux ont désactivé', async () => {
    const message = await fetchMessage({ optedOut: [FORWARDER_USER_ID, READER_USER_ID] });

    expect(message.forwardedFrom ?? null).toBeNull();
    expect(message.forwardedFromConversation ?? null).toBeNull();
  });

  it("masque le NOM DU GROUPE PUBLIC aussi — « la nomination des groupes publics doit suivre »", async () => {
    const message = await fetchMessage({ optedOut: [FORWARDER_USER_ID] });

    expect(JSON.stringify(message)).not.toContain('Groupe Public Source');
    expect(JSON.stringify(message)).not.toContain('mshy_source');
  });

  it("ne livre AUCUN nom d'auteur d'origine, ni handle, quand la règle masque", async () => {
    const message = await fetchMessage({ optedOut: [READER_USER_ID] });

    expect(JSON.stringify(message)).not.toContain('Auteur Origine');
    expect(JSON.stringify(message)).not.toContain('auteur_origine');
  });

  it('conserve les identifiants de transfert — le badge générique « Transféré » doit survivre', async () => {
    const message = await fetchMessage({ optedOut: [FORWARDER_USER_ID] });

    expect(message.forwardedFromId).toBe(ORIGIN_MESSAGE_ID);
    expect(message.forwardedFromConversationId).toBe(ORIGIN_CONV_ID);
  });

  it("masque quand le LECTEUR a désactivé, même si l'auteur du transfert est ANONYME", async () => {
    // Un invité de lien partagé n'a pas de compte, donc pas de réglage : il est
    // servi par le défaut, qui AUTORISE. Cela ne doit pas relever le refus du
    // lecteur — sinon il suffirait qu'un anonyme transfère pour contourner.
    const message = await fetchMessage({ optedOut: [READER_USER_ID], anonymousForwarder: true });

    expect(message.forwardedFrom ?? null).toBeNull();
    expect(message.forwardedFromConversation ?? null).toBeNull();
  });

  it("masque le nom de groupe d'un message qui ne nomme QUE sa conversation source", async () => {
    // Ce message n'a pas de `forwardedFromId` : son auteur n'entrait pas dans
    // la liste des volontés à confronter, et son nom de groupe partait quand
    // même — alors que c'est précisément la portée que la directive ajoute.
    const page = await fetchPage({
      optedOut: [OTHER_FORWARDER_USER_ID],
      withConversationOnlyMessage: true,
    });

    const convOnly = page.find((m) => m.id === CONV_ONLY_MESSAGE_ID);
    expect(convOnly).toBeDefined();
    expect(convOnly!.forwardedFromConversation ?? null).toBeNull();

    // Et le message voisin, dont l'auteur autorise, garde la sienne.
    expect(page.find((m) => m.id === MESSAGE_ID)!.forwardedFromConversation).toBeDefined();
  });

  it("laisse l'auteur du transfert relire SA propre source : se cacher n'est pas s'aveugler", async () => {
    const message = await fetchMessage({
      optedOut: [FORWARDER_USER_ID],
      readerUserId: FORWARDER_USER_ID,
    });

    expect(message.forwardedFrom).toBeDefined();
    expect((message.forwardedFromConversation as any).title).toBe('Groupe Public Source');
  });
});
