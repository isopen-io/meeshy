/**
 * Le CONTRAT DE CORPS de la route d'envoi par lien de partage.
 *
 * Elle était deux jusqu'au #4188 ; `POST /links/:identifier/messages/auth` a
 * été retirée (porte morte sur les quatre clients, participant SYNTHÉTIQUE sur
 * le fil global `meeshy`). Le contrat ci-dessous vaut désormais pour la seule
 * survivante, qui portait le défaut à l'identique.
 *
 * `sendMessageSchema` promet « contenu OU pièces jointes » — son `.refine`
 * admet explicitement un corps SANS `content` dès qu'`attachments` est non
 * vide, et la description OpenAPI de la route répète la promesse
 * (« Message content or attachments are required »).
 *
 * Cette route n'a jamais lu `body.attachments`. Le champ est validé,
 * puis abandonné : ni `prisma.message.create`, ni la diffusion, ni la
 * notification ne le mentionnent. La branche que le `refine` ouvre ne mène donc
 * à aucune fonctionnalité — elle mène à `trackingLinkService.processMessageLinks`,
 * dont le paramètre est typé `content: string` et qui appelle `content.match()`
 * sans garde (`TrackingLinkService.ts`). Le gateway compilant en
 * `strict: false`, rien n'a signalé qu'un `string | undefined` y entrait.
 *
 * Ces suites tiennent la seule invariante qui vaille ici : **un corps que le
 * schéma ACCEPTE ne doit jamais produire un 500.** Ou la route sert les pièces
 * jointes, ou le schéma cesse de les promettre — mais elle ne peut pas les
 * valider puis tomber dessus.
 *
 * Le schéma réel est employé tel quel (aucun `parse` simulé) : c'est lui qui est
 * en cause, et le simuler rendrait la suite aveugle au défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token) => 'hashed-' + token),
}));

/**
 * Double FIDÈLE de `TrackingLinkService.processMessageLinks`.
 *
 * Il reproduit la seule chose qui compte ici : la méthode réelle déclare
 * `content: string` et fait `content.match(urlRegex)` dès sa quatrième ligne,
 * sans garde de nullité. Un double permissif (`mockResolvedValue(...)`)
 * accepterait `undefined` sans broncher et cacherait exactement le défaut que
 * cette suite existe pour voir.
 */
const mockProcessMessageLinks = jest.fn(async ({ content }: any) => {
  const matches = content.match(/(https?:\/\/[^\s]+)/gi);
  return { processedContent: content, trackingLinks: matches ? [] : [] };
});
const mockUpdateTrackingLinks = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processMessageLinks: (...args: any[]) => (mockProcessMessageLinks as any)(...args),
    updateTrackingLinksMessageId: (...args: any[]) => mockUpdateTrackingLinks(...args),
  })),
}));

const mockAuthMiddleware = jest.fn<any>();
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  // Le module réel est ÉTALÉ d'abord — PROLONGER, jamais REMPLACER
  // (`services/gateway/CLAUDE.md` § « Un double PARTIEL d'un module perd en
  // silence tout ce que le module GAGNE »). Une usine qui n'énumère que les
  // schémas dont CE fichier a besoin rend `undefined` tous les autres : le
  // jour où un module VOISIN en compose un au chargement — ce que fait
  // `api-schemas-attachments.ts`, réexporté par le barillet `types/index.ts` —
  // la suite entière cesse de se charger, sur un `TypeError` sans rapport avec
  // ce qu'elle teste. Les surcharges ci-dessous restent PRIORITAIRES : elles
  // sont posées après l'étalement.
  ...(jest.requireActual('@meeshy/shared/types/api-schemas') as object),
  errorResponseSchema: { type: 'object', properties: {} },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { LINK_MESSAGE_NEW: 'link:message-new' },
  ROOMS: { conversation: (id: string) => `conversation:${id}` },
}));

// `routes/links/types` n'est PAS simulé : le schéma réel est le sujet du test.

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMessageRoutes } from '../../../../routes/links/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const IDENTIFIER = 'mshy_link_abc123';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const SESSION_TOKEN = 'anon_session_token';
const MSG_ID = '507f1f77bcf86cd799439044';
const CID = 'cid_550e8400-e29b-41d4-a716-446655440000';

const mockShareLink = {
  id: '507f1f77bcf86cd799439011',
  linkId: IDENTIFIER,
  conversationId: CONV_ID,
  isActive: true,
  expiresAt: null,
  allowAnonymousMessages: true,
  conversation: { id: CONV_ID, identifier: 'some-conv', title: 'Test', type: 'group' },
};

const mockAnonParticipant = {
  id: PART_ID,
  conversationId: CONV_ID,
  type: 'anonymous',
  displayName: 'anon',
  language: 'fr',
  sessionTokenHash: 'hashed-' + SESSION_TOKEN,
  isActive: true,
  permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
  anonymousSession: { shareLinkId: '507f1f77bcf86cd799439011' },
};

const mockParticipantShareLink = {
  id: '507f1f77bcf86cd799439011',
  conversationId: CONV_ID,
  isActive: true,
  allowAnonymousMessages: true,
  expiresAt: null,
};

const mockMessage = {
  id: MSG_ID,
  content: 'Hello!',
  originalLanguage: 'fr',
  messageType: 'text',
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  sender: {
    id: PART_ID, userId: null, displayName: 'anon', avatar: null,
    type: 'anonymous', language: 'fr', user: null,
  },
};

const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: {
    id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith',
    displayName: 'Alice Smith', avatar: null, role: 'USER',
  },
};

const ANON_HEADERS = { 'x-session-token': SESSION_TOKEN };

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockImplementation(async (opts: any) =>
        opts?.where?.id === mockAnonParticipant.anonymousSession.shareLinkId
          ? mockParticipantShareLink
          : mockShareLink
      ),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockAnonParticipant),
      findUnique: jest.fn<any>().mockResolvedValue({ role: 'member', user: { role: 'USER' } }),
    },
    message: {
      create: jest.fn<any>().mockResolvedValue(mockMessage),
    },
  });
  app.decorate('socketIOHandler', { getManager: () => null });
  await registerMessageRoutes(app);
  await app.ready();
  return app;
}

// ─── Suites ───────────────────────────────────────────────────────────────────

describe('POST /links/:identifier/messages — le corps que le schéma accepte', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('ne rend JAMAIS 500 sur un corps pièces-jointes-sans-contenu', async () => {
    // Le `.refine` de `sendMessageSchema` admet ce corps. La route n'a aucun
    // support de pièce jointe : elle passe `content: undefined` au processeur
    // de liens, typé `string`. C'est le défaut — un 500 déclenché par une
    // entrée que le validateur vient d'approuver, depuis un invité ANONYME.
    const res = await app.inject({
      method: 'POST', url: `/links/${IDENTIFIER}/messages`,
      headers: ANON_HEADERS,
      payload: { clientMessageId: CID, attachments: ['attachment-id-1'] },
    });
    expect(res.statusCode).not.toBe(500);
  });

  it('refuse explicitement le corps pièces-jointes-sans-contenu (400)', async () => {
    // Ces routes ne servent pas les pièces jointes. Le refus est la seule
    // réponse honnête : accepter puis abandonner le champ ferait croire à
    // l'envoi d'une pièce jointe qui n'a jamais existé.
    const res = await app.inject({
      method: 'POST', url: `/links/${IDENTIFIER}/messages`,
      headers: ANON_HEADERS,
      payload: { clientMessageId: CID, attachments: ['attachment-id-1'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('n’écrit aucun message quand le corps est refusé', async () => {
    const create = (app as any).prisma.message.create;
    create.mockClear();
    await app.inject({
      method: 'POST', url: `/links/${IDENTIFIER}/messages`,
      headers: ANON_HEADERS,
      payload: { clientMessageId: CID, attachments: ['attachment-id-1'] },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('accepte toujours un corps avec contenu (non-régression)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${IDENTIFIER}/messages`,
      headers: ANON_HEADERS,
      payload: { content: 'Hello!', clientMessageId: CID },
    });
    expect(res.statusCode).toBe(201);
  });

  it('refuse toujours un corps entièrement vide (non-régression)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${IDENTIFIER}/messages`,
      headers: ANON_HEADERS,
      payload: { clientMessageId: CID },
    });
    expect(res.statusCode).toBe(400);
  });
});

