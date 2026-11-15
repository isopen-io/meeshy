/**
 * #10429 — UN MESSAGE QUI DISPARAÎT NE SORT PAS PAR LA RECHERCHE.
 *
 * `GET /conversations/:id/messages/search` rend un message par son CONTENU :
 * une vue unique ou une flamme (à durée, après lecture, déclarée par la seule
 * échéance) y voyageait en clair jusqu'à l'appareil, et le seul fait qu'elle
 * RÉPONDE à la requête disait un mot de son texte. La loi de sortie
 * (`contentExitLawOfSource`, message ET pièces jointes, fermée par défaut) en
 * décide : seul un contenu ordinaire paraît — iOS l'applique déjà côté client
 * (#9619, `GlobalSearchViewModel.appearsInSearch`).
 *
 * Le prisma de test PROJETTE chaque ligne par le `select` reçu : une colonne que
 * la route ne demande pas n'arrive pas, comme en base.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

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

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
const READER = '507f1f77bcf86cd799439133';
const AUTHOR = '507f1f77bcf86cd799439144';
const { EPHEMERAL, EPHEMERAL_AFTER_READ, VIEW_ONCE, BLURRED } = MESSAGE_EFFECT_FLAGS;

const sender = { id: AUTHOR, userId: 'u-author', displayName: 'Ada', avatar: null, type: 'member', user: null };

type Row = Record<string, unknown>;

const piece = (over: Row = {}): Row => ({ id: 'att', isViewOnce: false, isBlurred: false, effectFlags: 0, fileUrl: 'https://cdn/x.jpg', ...over });

const messageRow = (id: string, over: Row = {}): Row => ({
  id,
  conversationId: CONV_ID,
  senderId: AUTHOR,
  content: `bonjour ${id}`,
  originalLanguage: 'fr',
  messageType: 'text',
  isBlurred: false,
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  deletedAt: null,
  createdAt: new Date(Date.now() - 60_000),
  translations: null,
  metadata: null,
  replyToId: null,
  attachments: [],
  sender,
  ...over,
});

const projected = (row: Row, select: Record<string, unknown> | undefined): Row => {
  if (!select) return row;
  return Object.fromEntries(
    Object.entries(select).flatMap(([key, wanted]) => {
      if (!(key in row)) return [];
      const value = row[key];
      const nested = (wanted as { select?: Record<string, unknown> })?.select;
      if (nested && Array.isArray(value)) return [[key, value.map((item) => projected(item as Row, nested))]];
      if (nested && value && typeof value === 'object') return [[key, projected(value as Row, nested)]];
      return [[key, value]];
    }),
  );
};

type Ancestry = { readonly rows: Row[]; readonly readerDeadlines: Record<string, Date> };

function buildApp(contentRows: Row[], translationRows: Row[] = [], ancestry: Ancestry = { rows: [], readerDeadlines: {} }): FastifyInstance {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: READER, userId: USER_ID, isActive: true }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn(async ({ where, select }: { where: Record<string, any>; select?: Record<string, unknown> }) => {
        const pageIds: string[] | undefined = where?.conversationId ? where?.id?.in : undefined;
        if (pageIds) return [...contentRows, ...translationRows].filter((row) => pageIds.includes(String(row.id))).map((row) => projected(row, select));
        if (where?.id?.in) return ancestry.rows.filter((row) => where.id.in.includes(row.id));
        const rows = JSON.stringify(where ?? {}).includes('"NOT"') ? translationRows : contentRows;
        return rows.map((row) => projected(row, select));
      }),
    },
    messageStatusEntry: {
      findMany: jest.fn(async ({ where }: { where: Record<string, any> }) =>
        Object.entries(ancestry.readerDeadlines)
          .filter(([messageId]) => where?.messageId?.in?.includes(messageId))
          .map(([messageId, ephemeralExpiresAt]) => ({ messageId, participantId: READER, ephemeralExpiresAt })),
      ),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      }),
    },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
    postComment: { findMany: jest.fn().mockResolvedValue([]) },
    post: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const authMiddleware = async (req: any) => {
    req.authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, authMiddleware, authMiddleware);
  return app;
}

const DEDICATED = `/conversations/${CONV_ID}/messages/search?q=bonjour`;
const COLLECTION_VIEW = `/conversations/${CONV_ID}/messages?view=search&q=bonjour`;

const search = async (
  contentRows: Row[],
  translationRows: Row[] = [],
  ancestry?: Ancestry,
  url: string = DEDICATED,
): Promise<Array<Record<string, unknown>>> => {
  const app = buildApp(contentRows, translationRows, ancestry);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    return res.json().data as Array<Record<string, unknown>>;
  } finally {
    await app.close();
  }
};

const idsFound = async (contentRows: Row[], translationRows: Row[] = []): Promise<string[]> =>
  (await search(contentRows, translationRows)).map((m) => String(m.id));

const ORDINAIRE = '507f1f77bcf86cd799439301';
const SUSPECT = '507f1f77bcf86cd799439302';
const inTheFuture = () => new Date(Date.now() + 24 * 3600_000);

describe('la recherche ne rend jamais un message qui disparaît (#10429)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('un message ordinaire est trouvé', async () => {
    expect(await idsFound([messageRow(ORDINAIRE)])).toEqual([ORDINAIRE]);
  });

  it('un message à vue unique n’est pas trouvé', async () => {
    expect(await idsFound([messageRow(ORDINAIRE), messageRow(SUSPECT, { isViewOnce: true })])).toEqual([ORDINAIRE]);
  });

  it('un message dont le bit VUE UNIQUE est posé n’est pas trouvé', async () => {
    expect(await idsFound([messageRow(ORDINAIRE), messageRow(SUSPECT, { effectFlags: VIEW_ONCE })])).toEqual([ORDINAIRE]);
  });

  it('une flamme à durée encore vivante n’est pas trouvée', async () => {
    const flame = messageRow(SUSPECT, { effectFlags: EPHEMERAL, ephemeralDuration: 3600, expiresAt: inTheFuture() });
    expect(await idsFound([messageRow(ORDINAIRE), flame])).toEqual([ORDINAIRE]);
  });

  it('une flamme après lecture pas encore ouverte n’est pas trouvée', async () => {
    const flame = messageRow(SUSPECT, { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ, expiresAt: inTheFuture() });
    expect(await idsFound([messageRow(ORDINAIRE), flame])).toEqual([ORDINAIRE]);
  });

  it('un message déclaré éphémère par sa seule échéance n’est pas trouvé', async () => {
    expect(await idsFound([messageRow(ORDINAIRE), messageRow(SUSPECT, { expiresAt: inTheFuture() })])).toEqual([ORDINAIRE]);
  });

  it('un message dont une pièce jointe est à vue unique n’est pas trouvé', async () => {
    const row = messageRow(SUSPECT, { attachments: [piece(), piece({ isViewOnce: true })] });
    expect(await idsFound([messageRow(ORDINAIRE), row])).toEqual([ORDINAIRE]);
  });

  it('un message dont une pièce jointe porte le bit VUE UNIQUE n’est pas trouvé', async () => {
    const row = messageRow(SUSPECT, { attachments: [piece({ effectFlags: VIEW_ONCE })] });
    expect(await idsFound([messageRow(ORDINAIRE), row])).toEqual([ORDINAIRE]);
  });

  it('un message dont une pièce jointe porte une flamme n’est pas trouvé', async () => {
    const row = messageRow(SUSPECT, { attachments: [piece({ effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ })] });
    expect(await idsFound([messageRow(ORDINAIRE), row])).toEqual([ORDINAIRE]);
  });

  it('le volet des TRADUCTIONS écarte aussi un message qui disparaît', async () => {
    const translated = (id: string, over: Row = {}) =>
      messageRow(id, { content: 'hello', translations: { fr: { text: 'bonjour à toi' } }, ...over });
    expect(await idsFound([], [translated(ORDINAIRE), translated(SUSPECT, { isViewOnce: true })])).toEqual([ORDINAIRE]);
  });

  it('une réponse qui meurt avec la flamme qu’elle cite n’est pas trouvée, même dans la grâce', async () => {
    const FLAMME = '507f1f77bcf86cd799439303';
    const flamme = messageRow(FLAMME, { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000) });
    const reponse = messageRow(SUSPECT, { replyToId: FLAMME });
    const ancestry = { rows: [flamme], readerDeadlines: { [FLAMME]: new Date(Date.now() - 10 * 60_000) } };
    expect((await search([messageRow(ORDINAIRE), reponse], [], ancestry)).map((m) => m.id)).toEqual([ORDINAIRE]);
  });

  it('le flou n’est pas une disparition : un message flouté reste trouvable, avec ses drapeaux', async () => {
    const data = await search([messageRow(ORDINAIRE, { isBlurred: true, effectFlags: BLURRED, attachments: [piece({ isBlurred: true })] })]);
    expect(data.map((m) => m.id)).toEqual([ORDINAIRE]);
    expect(data[0].isBlurred).toBe(true);
  });

  it('la projection lue pour la loi ne part pas dans la réponse', async () => {
    const [found] = await search([messageRow(ORDINAIRE, { attachments: [piece()] })]);
    expect(found).not.toHaveProperty('attachments');
  });
});

describe('la vue de recherche de la collection applique la même loi (#10429)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  const viewIds = async (contentRows: Row[], translationRows: Row[] = [], ancestry?: Ancestry): Promise<string[]> =>
    (await search(contentRows, translationRows, ancestry, COLLECTION_VIEW)).map((m) => String(m.id));

  it('un message ordinaire est trouvé', async () => {
    expect(await viewIds([messageRow(ORDINAIRE)])).toEqual([ORDINAIRE]);
  });

  it('une vue unique, une flamme et une pièce jointe à vue unique ne sont pas trouvées', async () => {
    const rows = [
      messageRow(ORDINAIRE),
      messageRow('507f1f77bcf86cd799439311', { isViewOnce: true }),
      messageRow('507f1f77bcf86cd799439312', { effectFlags: EPHEMERAL, ephemeralDuration: 60, expiresAt: inTheFuture() }),
      messageRow('507f1f77bcf86cd799439313', { attachments: [piece({ isViewOnce: true })] }),
    ];
    expect(await viewIds(rows)).toEqual([ORDINAIRE]);
  });

  it('le volet des TRADUCTIONS écarte aussi un message qui disparaît', async () => {
    const translated = (id: string, over: Row = {}) =>
      messageRow(id, { content: 'hello', translations: { fr: { text: 'bonjour à toi' } }, ...over });
    expect(await viewIds([], [translated(ORDINAIRE), translated(SUSPECT, { effectFlags: VIEW_ONCE })])).toEqual([ORDINAIRE]);
  });

  it('une réponse qui meurt avec la flamme qu’elle cite n’est pas trouvée, même dans la grâce', async () => {
    const FLAMME = '507f1f77bcf86cd799439303';
    const flamme = messageRow(FLAMME, { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000) });
    const ancestry = { rows: [flamme], readerDeadlines: { [FLAMME]: new Date(Date.now() - 10 * 60_000) } };
    expect(await viewIds([messageRow(ORDINAIRE), messageRow(SUSPECT, { replyToId: FLAMME })], [], ancestry)).toEqual([ORDINAIRE]);
  });
});
