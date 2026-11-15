/**
 * `POST /links/:identifier/messages` — les MENTIONS d'un message par lien.
 *
 * Découpé de `links-messages.test.ts` (1288 lignes, dette gelée à 1253) par
 * RESPONSABILITÉ. L'échafaudage partagé, ses doubles et `buildApp` vivent dans
 * `links-messages.harness.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';

// ─── Mocks — hissés au sommet de CE module, donc déclarés ici ────────────────

jest.mock('../../../utils/logger', () => require('./links-messages.harness').loggerModule());
jest.mock('../../../utils/session-token', () => require('./links-messages.harness').sessionTokenModule());
jest.mock('../../../services/TrackingLinkService', () =>
  require('./links-messages.harness').trackingLinkServiceModule()
);
jest.mock('../../../middleware/auth', () => require('./links-messages.harness').authModule());
jest.mock('@meeshy/shared/types/api-schemas', () => require('./links-messages.harness').apiSchemasModule());
jest.mock('@meeshy/shared/types/socketio-events', () =>
  require('./links-messages.harness').socketioEventsModule()
);
jest.mock('../../../services/ConversationStatsService', () =>
  require('./links-messages.harness').conversationStatsModule()
);
jest.mock('../../../routes/links/types', () =>
  require('./links-messages.harness').linkTypesModule(
    jest.requireActual('../../../routes/links/types') as Record<string, unknown>
  )
);

// ─── Import après les mocks ──────────────────────────────────────────────────

import {
  MSHY_ID,
  CONV_ID,
  MSG_ID,
  PEER_USER_ID,
  mockMessage,
  makePrisma,
  makeMentionResolver,
  makeNotificationService,
  makeSocketIOHandler,
  buildApp,
  flushPostSaveEffects,
  VALID_BODY,
  ANON_HEADERS,
} from './links-messages.harness';

// ═══════════════════════════════════════════════════════════════════════════════
// Mentions — `Message.validatedMentions`, lignes `Mention`, notification dédiée
//
// Les deux routes de lien contournent `MessagingService.handleMessage`, donc
// `MessageProcessor` en entier — et `processMentionsInDB` vivait sous DEUX
// niveaux de `private` à l'intérieur. Un `@alice` envoyé par lien ne produisait
// AUCUNE ligne `Mention` (absent de l'inbox `/mentions`), AUCUN
// `validatedMentions` (le web surligne depuis ce champ : le texte restait brut,
// à vie) et AUCUNE notification de mention — le mentionné ne recevait que la
// notification « message régulier », muette pour qui a coché « mentions
// seulement » ou mis la conversation en sourdine.
// ═══════════════════════════════════════════════════════════════════════════════

const MENTION_MESSAGE = { ...mockMessage, content: 'salut @bob' };

function makeMentionPrisma() {
  const prisma = makePrisma();
  prisma.message.create = jest.fn<any>().mockResolvedValue(MENTION_MESSAGE);
  return prisma;
}

describe('POST /links/:id/messages — anonymous: mentions', () => {
  let app: FastifyInstance;
  let prisma: any;
  let mentionService: ReturnType<typeof makeMentionResolver>;
  let notificationService: ReturnType<typeof makeNotificationService>;
  let body: any;

  beforeAll(async () => {
    prisma = makeMentionPrisma();
    mentionService = makeMentionResolver();
    notificationService = makeNotificationService();
    app = await buildApp({
      prisma, mentionService, notificationService,
      socketIOHandler: makeSocketIOHandler(true),
    });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    body = res.json();
    await flushPostSaveEffects();
  });
  afterAll(async () => { await app.close(); });

  it('creates the Mention rows the /mentions inbox reads', () => {
    expect(mentionService.createMentions).toHaveBeenCalledWith(MSG_ID, [PEER_USER_ID]);
  });

  it('persists the validated usernames on the message', () => {
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: MSG_ID },
      data: { validatedMentions: ['bob'] },
    });
  });

  // Le schéma de réponse 201 ne laisse passer que ce qu'il NOMME : un champ
  // ajouté au payload sans l'être au schéma est tronqué sans erreur ni log.
  it('serves the validated mentions back to the author', () => {
    expect(body.data.message.validatedMentions).toEqual(['bob']);
  });

  // La validation compare l'expéditeur aux `Participant.userId` des membres,
  // donc à des `User.id`. Un participant de lien ANONYME n'en possède aucun :
  // `null` dit qu'il n'est aucun des mentionnés. Lui passer son `Participant.id`
  // comparait deux espaces disjoints — une inégalité toujours vraie, donc une
  // règle d'auto-mention qui ne se déclenchait jamais.
  it('validates the mention against the conversation, with no user identity for an anonymous sender', () => {
    expect(mentionService.validateMentionPermissions).toHaveBeenCalledWith(
      CONV_ID, [PEER_USER_ID], null
    );
  });

  // Une mention perce la sourdine ; la notification régulière, non. Le
  // mentionné doit donc quitter l'éventail régulier pour le lot dédié.
  it('notifies the mentioned recipient as a mention, not as a regular message', () => {
    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledWith(
      [PEER_USER_ID],
      expect.objectContaining({ conversationId: CONV_ID, messageId: MSG_ID }),
      [PEER_USER_ID]
    );
    expect(notificationService.createMessageNotification).not.toHaveBeenCalled();
  });
});

describe('POST /links/:id/messages — anonymous: a message without @ costs nothing', () => {
  let app: FastifyInstance;
  let prisma: any;
  let mentionService: ReturnType<typeof makeMentionResolver>;

  beforeAll(async () => {
    prisma = makePrisma();
    mentionService = makeMentionResolver();
    app = await buildApp({ prisma, mentionService, socketIOHandler: makeSocketIOHandler(true) });
    await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
  });
  afterAll(async () => { await app.close(); });

  it('skips every mention query when the content carries no @', () => {
    expect(mentionService.extractMentionsWithParticipants).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});

describe('POST /links/:id/messages — anonymous: no mention service wired', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      prisma: makeMentionPrisma(), mentionService: null,
      socketIOHandler: makeSocketIOHandler(true),
    });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 201, with an empty mention set', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
    expect(res.statusCode).toBe(201);
    expect(res.json().data.message.validatedMentions).toEqual([]);
  });
});

describe('POST /links/:id/messages — anonymous: mention failures never reach the sender', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      prisma: makeMentionPrisma(),
      mentionService: makeMentionResolver({
        resolveUsernames: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
      }),
      socketIOHandler: makeSocketIOHandler(true),
    });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 201 when mention resolution throws', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
    expect(res.statusCode).toBe(201);
    expect(res.json().data.message.validatedMentions).toEqual([]);
  });
});

