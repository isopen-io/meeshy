/**
 * #16557 — UNE loi de lecture sur les trois portes de la traduction demandée.
 *
 * `POST /translate-blocking`, `POST /translate` et `translation:request` rendent
 * le CONTENU d'un message désigné par son identifiant. Chacune recomposait sa
 * propre garde : la première ne filtrait pas `isActive` et rendait le clair d'un
 * message rappelé, la deuxième ne regardait pas `deletedAt`, la troisième
 * oubliait le lien échu, la vue unique ouverte et la flamme finie.
 *
 * Aucune loi n'est doublée ici : la base est celle du favori, une base en mémoire
 * qui ÉVALUE les `where`, et `messageReadAccess.ts` tourne pour de vrai. Un
 * témoin tombe donc quand la REQUÊTE cesse de garder, pas seulement quand la
 * route cesse d'appeler. Le même tableau de cas passe par les trois portes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import {
  ANONYMOUS,
  CONV_B,
  MSG_1,
  REGISTERED,
  USER_ID,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  type Store,
} from './me/starred-messages-harness';
import { translationRoutes as blockingRoutes } from '../../../routes/translation';
import { translationRoutes as nonBlockingRoutes } from '../../../routes/translation-non-blocking';
import { MeeshySocketIOManager } from '../../../socketio/MeeshySocketIOManager';

type Row = Record<string, unknown>;

const READER_ROW = '68b000000000000000000011';
const AUTHOR_ROW = '68b0000000000000000000e1';
const GUEST_ROW = ANONYMOUS.participantId;
const LINK = '68b0000000000000000000e9';
const UNKNOWN_MESSAGE = '68b0000000000000000001ff';

const CLEAR_TEXT = 'mon code d’accès est 1234';
const CACHED_TRANSLATION = 'my access code is 1234';
const ECHOED_TEXT = 'un texte choisi par l’appelant';

const LONG_AGO = new Date('2026-09-20T09:00:00.000Z');
const AFTER_THE_MESSAGE = new Date('2026-09-20T11:00:00.000Z');
const EPHEMERAL_BIT = 1 << 0;
const VIEW_ONCE_BIT = 1 << 2;

const liveMessage = (overrides: Row = {}): Row =>
  messageRow({ senderId: AUTHOR_ROW, content: CLEAR_TEXT, encryptionMode: null, replyToId: null, ephemeralDuration: null, viewOnceBurnedAt: null, conversation: { encryptionMode: null }, ...overrides });

const reader = (overrides: Row = {}): Row => participantRow({ id: READER_ROW, ...overrides });
const guest = (overrides: Row = {}): Row => participantRow({ id: GUEST_ROW, userId: null, user: null, ...overrides });

/**
 * Une ligne `Message` porte sa conversation et ses participants, comme le rendait
 * l'`include` que `POST /translate-blocking` jugeait : sans eux, cette porte
 * tomberait en 500 sur le code fautif, et ses témoins passeraient pour de
 * mauvaises raisons.
 */
const storeWith = (overrides: Partial<Store> = {}): Store => {
  const store = makeStore({ messages: [liveMessage()], participants: [reader()], ...overrides });
  const withParticipants = (row: Row): Row => ({
    ...row,
    conversation: { ...(row.conversation as Row), participants: store.participants },
  });
  return { ...store, messages: store.messages.map(withParticipants) };
};

type Identity = 'registered' | 'anonymous';

type Scenario = {
  readonly store: Store;
  readonly identity?: Identity;
  readonly messageId?: string;
  readonly text?: string;
  readonly breakRead?: (prisma: ReturnType<typeof makePrisma>) => void;
  readonly cachedTranslation?: (store: Store) => Promise<Row | null>;
};

type Outcome = {
  /** Un accès au contenu a été accordé : réponse 200, ou `message:translation`. */
  readonly served: boolean;
  /** Une retraduction est repartie vers le traducteur. */
  readonly retranslated: boolean;
  /** Ce que la porte a laissé sortir, à plat. */
  readonly wire: string;
  /** La forme du refus — sa comparaison dit s'il reste un oracle. */
  readonly refusal: string;
};

function translationServiceFor(scenario: Scenario) {
  return {
    handleNewMessage: jest.fn<any>().mockResolvedValue({ messageId: scenario.messageId ?? MSG_1, status: 'retranslation_queued' }),
    getTranslation: jest.fn<any>().mockImplementation(async () =>
      scenario.cachedTranslation
        ? scenario.cachedTranslation(scenario.store)
        : { translatedText: CACHED_TRANSLATION, sourceLanguage: 'en', targetLanguage: 'fr', confidenceScore: 0.9, modelType: 'basic' },
    ),
  };
}

function databaseFor(scenario: Scenario) {
  const prisma = makePrisma(scenario.store);
  scenario.breakRead?.(prisma);
  return prisma;
}

function restDoor(url: string, register: (app: never) => Promise<void>) {
  return async (scenario: Scenario): Promise<Outcome> => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    const translationService = translationServiceFor(scenario);
    const authContext = scenario.identity === 'anonymous' ? ANONYMOUS : REGISTERED;
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const carried = request as unknown as Row;
      carried.authContext = authContext;
      carried.user = { userId: authContext.userId, isAnonymous: authContext.isAnonymous };
    });
    app.decorate('prisma', databaseFor(scenario) as never);
    app.decorate('translationService', translationService as never);
    app.decorate('messagingService', {} as never);
    await register(app as never);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url,
      payload: {
        message_id: scenario.messageId ?? MSG_1,
        target_language: 'fr',
        ...(scenario.text ? { text: scenario.text } : {}),
      },
    });
    await app.close();

    return {
      served: response.statusCode === 200,
      retranslated: translationService.handleNewMessage.mock.calls.length > 0,
      wire: response.body,
      refusal: `${response.statusCode} ${response.body}`,
    };
  };
}

async function socketDoor(scenario: Scenario): Promise<Outcome> {
  const manager = Object.create(MeeshySocketIOManager.prototype) as Record<string, unknown>;
  const socket = { id: 'sock-1', emit: jest.fn() };
  const translationService = translationServiceFor(scenario);
  const anonymous = scenario.identity === 'anonymous';
  const connectedId = anonymous ? GUEST_ROW : USER_ID;

  manager.prisma = databaseFor(scenario);
  manager.socketToUser = new Map([['sock-1', connectedId]]);
  manager.connectedUsers = new Map([
    [connectedId, { id: connectedId, isAnonymous: anonymous, participantId: anonymous ? GUEST_ROW : undefined }],
  ]);
  manager.stats = { translations_sent: 0, errors: 0 };
  manager.translationService = translationService;
  manager.translationRequestEngagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };

  await (manager as unknown as { _handleTranslationRequest: (s: unknown, d: unknown) => Promise<void> })
    ._handleTranslationRequest(socket, { messageId: scenario.messageId ?? MSG_1, targetLanguage: 'fr' });

  const emitted = socket.emit.mock.calls as Array<[string, unknown]>;
  const retranslated = translationService.handleNewMessage.mock.calls.length > 0;
  return {
    served: retranslated || emitted.some(([event]) => event === SERVER_EVENTS.MESSAGE_TRANSLATION),
    retranslated,
    wire: JSON.stringify(emitted),
    refusal: JSON.stringify(emitted),
  };
}

const DOORS = [
  ['POST /translate-blocking', restDoor('/translate-blocking', (app) => blockingRoutes(app))],
  ['POST /translate', restDoor('/translate', (app) => nonBlockingRoutes(app, {}))],
  ['translation:request', socketDoor],
] as const;

const REFUSED: ReadonlyArray<readonly [string, () => Scenario]> = [
  ['un message RAPPELÉ', () => ({ store: storeWith({ messages: [liveMessage({ deletedAt: AFTER_THE_MESSAGE })] }) })],
  ['un EX-MEMBRE, dont la ligne reste en base', () => ({ store: storeWith({ participants: [reader({ isActive: false })] }) })],
  ['un membre banni, sa ligne restée active', () => ({ store: storeWith({ participants: [reader({ bannedAt: LONG_AGO })] }) })],
  ['un NON-MEMBRE', () => ({ store: storeWith({ participants: [reader({ conversationId: CONV_B })] }) })],
  ['un lecteur SOUS le plancher d’historique', () => ({ store: storeWith({ participants: [reader({ historyVisibleFrom: AFTER_THE_MESSAGE })] }) })],
  [
    'un plancher ILLISIBLE',
    () => ({
      store: storeWith({ participants: [reader({ shareLinkId: LINK })], shareLinks: [{ id: LINK, allowViewHistory: true, expiresAt: null }] }),
      breakRead: (prisma) => {
        prisma.conversationShareLink.findUnique = async () => {
          throw new Error('mongo down');
        };
      },
    }),
  ],
  [
    'un lecteur entré par un lien ÉCHU',
    () => ({
      store: storeWith({
        participants: [reader({ shareLinkId: LINK })],
        shareLinks: [{ id: LINK, allowViewHistory: true, expiresAt: new Date('2026-01-01T00:00:00.000Z') }],
      }),
    }),
  ],
  ['un message retiré de sa vue', () => ({ store: storeWith({ deletions: [{ userId: USER_ID, messageId: MSG_1 }] }) })],
  [
    'un masquage personnel ILLISIBLE',
    () => ({
      store: storeWith(),
      breakRead: (prisma) => {
        prisma.userMessageDeletion.findMany = async () => {
          throw new Error('mongo down');
        };
      },
    }),
  ],
  [
    'une VUE UNIQUE déjà ouverte par ce lecteur',
    () => ({
      store: storeWith({
        messages: [liveMessage({ isViewOnce: true, effectFlags: VIEW_ONCE_BIT })],
        statusEntries: [{ messageId: MSG_1, participantId: READER_ROW, viewedOnceAt: LONG_AGO }],
      }),
    }),
  ],
  ['une vue unique dont le contenu est brûlé', () => ({ store: storeWith({ messages: [liveMessage({ isViewOnce: true, effectFlags: VIEW_ONCE_BIT, viewOnceBurnedAt: LONG_AGO })] }) })],
  [
    'une FLAMME finie pour ce lecteur',
    () => ({
      store: storeWith({
        messages: [liveMessage({ effectFlags: EPHEMERAL_BIT, ephemeralDuration: 30, expiresAt: new Date('2099-01-01T00:00:00.000Z') })],
        statusEntries: [{ messageId: MSG_1, participantId: READER_ROW, ephemeralExpiresAt: LONG_AGO }],
      }),
    }),
  ],
  ['un identifiant qui ne désigne rien', () => ({ store: storeWith(), messageId: UNKNOWN_MESSAGE })],
  ['un ANONYME dont la ligne est éteinte', () => ({ identity: 'anonymous', store: storeWith({ participants: [guest({ isActive: false })] }) })],
  ['un ANONYME d’une autre conversation', () => ({ identity: 'anonymous', store: storeWith({ participants: [guest({ conversationId: CONV_B })] }) })],
  ['un ANONYME banni', () => ({ identity: 'anonymous', store: storeWith({ participants: [guest({ bannedAt: LONG_AGO })] }) })],
  ['un ANONYME sous le plancher', () => ({ identity: 'anonymous', store: storeWith({ participants: [guest({ historyVisibleFrom: AFTER_THE_MESSAGE })] }) })],
  [
    'un ANONYME face à un message rappelé',
    () => ({ identity: 'anonymous', store: storeWith({ participants: [guest()], messages: [liveMessage({ deletedAt: AFTER_THE_MESSAGE })] }) }),
  ],
];

const SERVED: ReadonlyArray<readonly [string, () => Scenario]> = [
  ['un membre actif', () => ({ store: storeWith() })],
  ['l’auteur du message', () => ({ store: storeWith({ messages: [liveMessage({ senderId: READER_ROW })] }) })],
  ['un membre arrivé après le message avec un droit d’historique', () => ({ store: storeWith({ participants: [reader({ joinedAt: AFTER_THE_MESSAGE })] }) })],
  ['un ANONYME actif de la conversation', () => ({ identity: 'anonymous', store: storeWith({ participants: [guest()] }) })],
  ['une vue unique que ce lecteur n’a pas ouverte', () => ({ store: storeWith({ messages: [liveMessage({ isViewOnce: true, effectFlags: VIEW_ONCE_BIT })] }) })],
  [
    'une flamme dont le décompte n’est pas fini',
    () => ({
      store: storeWith({
        messages: [liveMessage({ effectFlags: EPHEMERAL_BIT, ephemeralDuration: 30, expiresAt: new Date('2099-01-01T00:00:00.000Z') })],
        statusEntries: [{ messageId: MSG_1, participantId: READER_ROW, ephemeralExpiresAt: new Date('2099-01-01T00:00:00.000Z') }],
      }),
    }),
  ],
];

describe.each(DOORS)('%s — la loi de lecture (#16557)', (_door, ask) => {
  it.each(REFUSED)('refuse %s, sans rien retraduire ni rien rendre', async (_label, scenarioOf) => {
    const outcome = await ask(scenarioOf());

    expect(outcome.served).toBe(false);
    expect(outcome.retranslated).toBe(false);
    expect(outcome.wire).not.toContain(CLEAR_TEXT);
    expect(outcome.wire).not.toContain(CACHED_TRANSLATION);
  });

  it.each(SERVED)('sert encore %s', async (_label, scenarioOf) => {
    const outcome = await ask(scenarioOf());

    expect(outcome.served).toBe(true);
  });

  it('ne dit pas si le message existe, s’il est rappelé, ou si l’on n’en est pas', async () => {
    const stranger = await ask({ store: storeWith({ participants: [reader({ conversationId: CONV_B })] }) });
    const recalled = await ask({ store: storeWith({ messages: [liveMessage({ deletedAt: AFTER_THE_MESSAGE })] }) });
    const unknown = await ask({ store: storeWith(), messageId: UNKNOWN_MESSAGE });

    expect(recalled.refusal).toBe(stranger.refusal);
    expect(unknown.refusal).toBe(stranger.refusal);
  });

  it('ne dit pas à un étranger le régime de chiffrement d’une conversation', async () => {
    const stranger = await ask({ store: storeWith({ participants: [reader({ conversationId: CONV_B })] }) });
    const encrypted = await ask({
      store: storeWith({
        participants: [reader({ conversationId: CONV_B })],
        messages: [liveMessage({ isEncrypted: true, encryptionMode: 'e2ee', conversation: { encryptionMode: 'e2ee' } })],
      }),
    });

    expect(encrypted.refusal).toBe(stranger.refusal);
  });
});

describe.each(DOORS.slice(0, 2))('%s — le texte du corps ne contourne rien (#16557)', (_door, ask) => {
  it('refuse un message rappelé même quand le corps fournit le texte', async () => {
    const outcome = await ask({ store: storeWith({ messages: [liveMessage({ deletedAt: AFTER_THE_MESSAGE })] }), text: ECHOED_TEXT });

    expect(outcome.served).toBe(false);
    expect(outcome.retranslated).toBe(false);
    expect(outcome.wire).not.toContain(CACHED_TRANSLATION);
  });

  it('refuse un ex-membre même quand le corps fournit le texte', async () => {
    const outcome = await ask({ store: storeWith({ participants: [reader({ isActive: false })] }), text: ECHOED_TEXT });

    expect(outcome.served).toBe(false);
    expect(outcome.retranslated).toBe(false);
  });
});

describe('POST /translate-blocking — ce qui se juge encore après l’attente (#16557)', () => {
  const ask = DOORS[0][1];

  it('ne rend ni la traduction ni le repli quand le message est rappelé PENDANT l’attente', async () => {
    const outcome = await ask({
      store: storeWith(),
      cachedTranslation: async (store) => {
        store.messages[0].deletedAt = AFTER_THE_MESSAGE;
        return { translatedText: CACHED_TRANSLATION, sourceLanguage: 'en', targetLanguage: 'fr', confidenceScore: 0.9, modelType: 'basic' };
      },
    });

    expect(outcome.served).toBe(false);
    expect(outcome.wire).not.toContain(CACHED_TRANSLATION);
    expect(outcome.wire).not.toContain(CLEAR_TEXT);
  });

  it('sert à un lecteur légitime la traduction de LA LIGNE, jamais un texte qu’il affirme', async () => {
    const store = storeWith({ messages: [liveMessage({ originalLanguage: 'fr' })] });

    const outcome = await ask({ store, text: ECHOED_TEXT });

    expect(outcome.served).toBe(true);
    expect(JSON.parse(outcome.wire).data.translated_text).toBe(CLEAR_TEXT);
  });
});

describe('translation:request — une identité incomplète ne s’ouvre aucune porte (#16557)', () => {
  it('ne cherche pas de ligne pour un anonyme sans `participantId`', async () => {
    const prisma = makePrisma(storeWith({ participants: [guest()] }));
    const participantRead = jest.spyOn(prisma.participant, 'findFirst');
    const manager = Object.create(MeeshySocketIOManager.prototype) as Record<string, unknown>;
    const socket = { id: 'sock-1', emit: jest.fn() };
    const service = translationServiceFor({ store: storeWith() });
    manager.prisma = prisma;
    manager.socketToUser = new Map([['sock-1', GUEST_ROW]]);
    manager.connectedUsers = new Map([[GUEST_ROW, { id: GUEST_ROW, isAnonymous: true, participantId: undefined }]]);
    manager.stats = { translations_sent: 0, errors: 0 };
    manager.translationService = service;

    await (manager as unknown as { _handleTranslationRequest: (s: unknown, d: unknown) => Promise<void> })
      ._handleTranslationRequest(socket, { messageId: MSG_1, targetLanguage: 'fr' });

    expect(participantRead).not.toHaveBeenCalled();
    expect(service.getTranslation).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, { message: 'Access denied' });
  });
});

