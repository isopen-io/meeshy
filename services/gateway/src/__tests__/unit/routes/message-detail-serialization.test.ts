/**
 * `GET /messages/:messageId` — ce que le SÉRIALISEUR laisse passer, et sous
 * quelle FORME.
 *
 * Cette route portait la dernière ligne de `FROZEN_INVENTORY`, et la seule de
 * la **forme 3** de la taxonomie : un schéma qui décrit le MESSAGE (`id`,
 * `content`, `sender`…) quand `sendSuccess` répond `{ success, data }`. Aucune
 * de ses déclarations ne matchait, `success`/`data` n'étaient pas déclarés, et
 * l'`additionalProperties: true` du bloc laissait la charge utile traverser
 * ENTIÈRE et non gouvernée. Le balayage la signalait donc en faux positif —
 * `sender: { type: 'object' }` n'y vidait rien.
 *
 * Aligner ce schéma était « un lot en soi » parce que déclarer partiellement ce
 * qui passait entier TRONQUE. Les clés servies ont été relevées mécaniquement
 * depuis le `select` et les surcharges du handler, puis passées au sérialiseur.
 * La mesure a fait apparaître les DEUX défauts que l'enveloppe inerte cachait,
 * et que ces témoins gardent :
 *
 * 1. **`translations` était servi en CARTE Mongo** (`{ en: {text, …} }`) là où
 *    le contrat déclare un TABLEAU `{targetLanguage, translatedContent, …}` —
 *    la forme que produit `transformTranslationsToArray`, que les DEUX autres
 *    transports du même fichier appliquaient déjà. Conséquence sur le chemin
 *    PUSH : l'extension de notification appelle cette route et dépose le blob
 *    dans l'App Group ; `NSEPendingMessageConsumer` le décode en `APIMessage`,
 *    où `translations` se décode avec un `try` NON tolérant. Une carte y fait
 *    échouer le décodage du message ENTIER, le consommateur SUPPRIME le
 *    fichier, et le démarrage à froid depuis une notification se retrouve sans
 *    son message — pour tout message portant au moins une traduction.
 *
 * 2. **`encryptionMode` n'était pas déclaré par `messageSchema`**, sur la foi
 *    d'un commentaire (« only on Conversation ») que `schema.prisma`
 *    contredit. Le défaut ne vivait pas que sur cette route : la LISTE de
 *    messages le charge aussi et le servait par un `items: messageSchema` qui
 *    le retirait.
 *
 * Ces témoins montent le VRAI module de route et traversent le VRAI
 * sérialiseur (`app.inject()`), et ils assertent sur les VALEURS servies —
 * jamais sur `statusCode`, qui était vert pendant toute la vie des deux
 * défauts.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
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
  MessageStatusBodySchema: {},
  MessageStatusDetailsQuerySchema: {},
  AttachmentStatusBodySchema: {},
}));

const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const READER_USER_ID = '507f1f77bcf86cd799439022';
const SENDER_USER_ID = '507f1f77bcf86cd799439055';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439056';
const MESSAGE_ID = '507f1f77bcf86cd799439024';

/**
 * La ligne que rend RÉELLEMENT `prisma.message.findFirst` sous le `select` de
 * cette route — `translations` compris, qui est une CARTE (`schema.prisma` :
 * « Traductions du message - map: langue -> données »), jamais un tableau.
 *
 * C'est la question qui départage un témoin d'une fiction : non pas « à quoi
 * ressemble cette réponse ? » mais « que rend la requête, et que passe le
 * gestionnaire à `sendSuccess` ? ».
 */
const messageRow = () => ({
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  senderId: SENDER_PARTICIPANT_ID,
  content: 'bonjour',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  forwardedFromId: null,
  forwardedFromConversationId: null,
  expiresAt: null,
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  pinnedAt: null,
  effectFlags: 0,
  pinnedBy: null,
  validatedMentions: ['bob'],
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-01T10:00:00.000Z'),
  reactionSummary: { '❤️': 2 },
  reactionCount: 2,
  encryptedContent: 'Y2lwaGVy',
  encryptionMetadata: { iv: 'aXY=', keyVersion: 3 },
  isEncrypted: true,
  encryptionMode: 'e2ee',
  // La CARTE Mongo, telle quelle.
  translations: {
    en: {
      text: 'hello',
      translationModel: 'basic',
      confidenceScore: 0.93,
      createdAt: '2026-08-01T10:05:00.000Z',
    },
  },
  metadata: {
    location: { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel' },
    sticker: { emoji: '🔥', animation: 'pulse' },
  },
  sender: {
    id: SENDER_PARTICIPANT_ID,
    userId: SENDER_USER_ID,
    displayName: 'Emetteur',
    avatar: null,
    isOnline: true,
    type: 'user',
    user: { id: SENDER_USER_ID, username: 'emetteur', avatar: null, isOnline: true },
  },
  // L'appelant EST participant actif — sans quoi la route rend 403.
  conversation: { participants: [{ userId: READER_USER_ID, role: 'member' }] },
  attachments: [],
});

async function fetchDetail(): Promise<any> {
  mockResolveForTargets.mockReset();
  mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, { showOnline: true, showLastSeenTimestamp: true }]]));

  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: READER_USER_ID,
      hasFullAccess: true,
      registeredUser: { id: READER_USER_ID, role: 'USER' },
    };
  });

  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(messageRow()),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any);

  await app.register(messageRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}` });
  await app.close();
  return JSON.parse(res.body);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /messages/:messageId — l'enveloppe réelle", () => {
  it('sert le message À PLAT sous `data`, jamais sous `data.message`', async () => {
    const body = await fetchDetail();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MESSAGE_ID);
    expect(body.data.content).toBe('bonjour');
    // L'enveloppe fantôme du cycle 88 bis ne doit pas pouvoir revenir en silence.
    expect(body.data).not.toHaveProperty('message');
  });

  /**
   * La mesure du lot — « 42 clés entrent, 42 sortent » — est une AFFIRMATION,
   * et une affirmation se vérifie. Ce témoin la rend auto-portante plutôt que
   * de la laisser en prose dans un journal : il compare le jeu de clés SERVI
   * au jeu de clés que le handler compose, calculé depuis la ligne Prisme
   * elle-même. Toute déclaration retirée du schéma le fait tomber en NOMMANT
   * ce qui a été perdu.
   */
  it('sert exactement le jeu de clés que le handler compose — aucune de moins', async () => {
    const body = await fetchDetail();

    const composed = new Set([
      ...Object.keys(messageRow()),
      // Les surcharges que le handler ajoute APRÈS le `select`.
      'deliveredCount', 'readCount', 'recipientCount',
      'deliveredToAllAt', 'readByAllAt', 'statusSummary',
      // Hissé depuis `metadata.location` par `hoistLocationOnto`.
      'location',
      // Hissé depuis `metadata.sticker` par `hoistStickerOnto` (#4823).
      'sticker',
    ]);
    const served = new Set(Object.keys(body.data));

    expect([...composed].filter((k) => !served.has(k))).toEqual([]);
  });

  it('ne perd aucune des colonnes que le `select` charge', async () => {
    const body = await fetchDetail();

    // Les colonnes que l'enveloppe inerte laissait passer et qu'une déclaration
    // partielle aurait tronquées.
    expect(body.data.messageSource).toBe('user');
    expect(body.data.originalLanguage).toBe('fr');
    expect(body.data.validatedMentions).toEqual(['bob']);
    expect(body.data.reactionSummary).toEqual({ '❤️': 2 });
    expect(body.data.reactionCount).toBe(2);
    expect(body.data.encryptedContent).toBe('Y2lwaGVy');
    expect(body.data.encryptionMetadata).toEqual({ iv: 'aXY=', keyVersion: 3 });
    expect(body.data.viewOnceCount).toBe(0);
    expect(body.data.effectFlags).toBe(0);
  });

  it('conserve `metadata`, forme libre, et le `location` que le handler HISSE', async () => {
    const body = await fetchDetail();

    // `additionalProperties: true` sur `metadata` — sans lui, fast-json-stringify
    // en strippe le contenu en silence.
    expect(body.data.metadata.location.name).toBe('Tour Eiffel');
    expect(body.data.location).toMatchObject({ latitude: 48.8584, longitude: 2.2945 });
  });

  it('conserve le `sticker` que le handler HISSE depuis `metadata.sticker` (#4823)', async () => {
    const body = await fetchDetail();

    expect(body.data.sticker).toEqual({ emoji: '🔥', animation: 'pulse' });
  });

  it('conserve les compteurs de livraison, à plat ET groupés', async () => {
    const body = await fetchDetail();

    expect(body.data).toMatchObject({ deliveredCount: 0, readCount: 0, recipientCount: 0 });
    expect(body.data.statusSummary).toEqual({ deliveredCount: 0, readCount: 0, recipientCount: 0 });
  });

  it("conserve la ligne d'appartenance de l'APPELANT, chargée pour le contrôle d'accès", async () => {
    const body = await fetchDetail();

    expect(body.data.conversation.participants).toEqual([{ userId: READER_USER_ID, role: 'member' }]);
  });
});

describe('GET /messages/:messageId — `translations` a la forme du CONTRAT', () => {
  /**
   * ROUGE avant ce lot : le handler étalait `...message`, donc `translations`
   * partait en CARTE. Le nouveau schéma la déclare en tableau — une carte n'y
   * survit pas — et le handler applique désormais le même
   * `transformTranslationsToArray` que ses deux siblings du même fichier.
   */
  it('sert un TABLEAU, jamais la carte Mongo', async () => {
    const body = await fetchDetail();

    expect(Array.isArray(body.data.translations)).toBe(true);
    expect(body.data.translations).toHaveLength(1);
  });

  it('sert la forme que produit `transformTranslationsToArray`', async () => {
    const body = await fetchDetail();

    const [translation] = body.data.translations;
    // `targetLanguage`/`translatedContent` — et non les clés `text`/`langue` de
    // la carte stockée. C'est cette forme que décode `APITextTranslation`.
    expect(translation).toMatchObject({
      id: `${MESSAGE_ID}-en`,
      messageId: MESSAGE_ID,
      targetLanguage: 'en',
      translatedContent: 'hello',
      translationModel: 'basic',
    });
    expect(translation).not.toHaveProperty('text');
  });
});

describe('GET /messages/:messageId — enveloppe E2EE', () => {
  /**
   * ROUGE avant ce lot : `messageSchema` ne déclarait pas `encryptionMode`, sur
   * la foi d'un commentaire que `schema.prisma` contredit. Le client recevait
   * `isEncrypted: true` et le chiffré, sans savoir sous quel régime déchiffrer.
   */
  it('sert `encryptionMode` avec le chiffré, pas seulement `isEncrypted`', async () => {
    const body = await fetchDetail();

    expect(body.data.isEncrypted).toBe(true);
    expect(body.data.encryptionMode).toBe('e2ee');
  });
});

describe("GET /messages/:messageId — l'expéditeur reste entier et gaté", () => {
  it("sert le participant ET son `user` imbriqué, que `userMinimalSchema` seul aurait tronqué", async () => {
    const body = await fetchDetail();

    expect(body.data.sender).toMatchObject({
      id: SENDER_PARTICIPANT_ID,
      userId: SENDER_USER_ID,
      displayName: 'Emetteur',
      type: 'user',
    });
    expect(body.data.sender.user).toMatchObject({ id: SENDER_USER_ID, username: 'emetteur' });
  });
});
