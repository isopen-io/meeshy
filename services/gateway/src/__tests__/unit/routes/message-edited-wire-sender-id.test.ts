/**
 * @jest-environment node
 *
 * `message:edited` a TROIS producteurs. DEUX sont gouvernés, le troisième ne
 * l'est pas — et c'est le seul qui sert un `senderId` que les clients ne
 * peuvent pas reconnaître.
 *
 * Le contrat partagé déclare `message:edited` comme un `SocketIOMessage`, dont
 * `senderId` est un `User.id` : c'est ce que les clients comparent à leur
 * propre identité pour savoir si une bulle est la LEUR.
 * `resolveWireSenderId` (`socketio/messageEditedPayload.ts`) énonce la règle
 * une fois — `sender.userId ?? sender.user.id ?? message.senderId`, ce dernier
 * repli ne servant que l'expéditeur ANONYME, qui n'a pas d'autre identité — et
 * `buildMessageEditedCore` l'applique.
 *
 * - `MessageHandler.handleMessageEdit` (socket) l'appelle ;
 * - `MeeshySocketIOManager.broadcastMessageEdited` (résumés d'appel) l'appelle ;
 * - les TROIS entrées REST étalaient la ligne Prisma BRUTE
 *   (`payload: { ...updatedMessage }`), donc `Message.senderId` — un
 *   `Participant.id`, jamais un `User.id`.
 *
 * **La cause est structurelle, pas un oubli.** `broadcastMessageMutation`
 * déclare `payload: Record<string, unknown>` et émet à travers un
 * `PreviewEmitIO` dont la signature est `emit(event: string, payload:
 * unknown)`. Le cliquet de `messageEditedPayload.ts` — qui dérive du contrat
 * la liste des champs REQUIS et refuse de compiler si le noyau en perd un —
 * n'a donc AUCUNE prise sur ce transport-là. Il servait le contrat par
 * ACCIDENT : l'étalement d'un `include` large apportait les sept clés, avec la
 * mauvaise VALEUR dans l'une d'elles.
 *
 * REST n'est pas un chemin secondaire : `PUT /messages/:messageId` est le
 * transport d'édition du client iOS, `PATCH /messages/:messageId` celui du
 * client Android (`OutboxFlushWorker`, lane `EDIT_MESSAGE`).
 *
 * Coût, relevé sur les TROIS clients plutôt que supposé :
 *
 * - **web, mode de lecture Focal** — le seul chemin VIVANT.
 *   `handleMessageEdited` fusionne la charge reçue dans la ligne en cache
 *   (`{ ...m, ...message }`, `use-socket-cache-sync.ts`), donc le `senderId`
 *   du cache est ÉCRASÉ par le `Participant.id` ; `FocalRow` (monté par
 *   `FocalThread`) calcule `const isMe = message.senderId === currentUser.id`.
 *   Une bulle à soi bascule en bulle d'autrui — alignement, couleur,
 *   affordances — à la seconde où son auteur l'édite. La bulle CLASSIQUE y
 *   échappe : `BubbleMessage` passe par `getSenderUserId(message.sender)`,
 *   qui lit le porteur et non la colonne.
 * - **iOS** : indemne, et c'est vérifié — `markEdited` n'écrit jamais
 *   `senderId` (cycle 102).
 * - **Android** : indemne — `ChatViewModel` traite `messageEdited` comme un
 *   simple signal et relit la liste par REST.
 *
 * Autrement dit : un chemin vivant, et un contrat que trois producteurs sur
 * quatre honorent déjà (les deux socket, plus la LISTE REST, qui résout la
 * même règle à la main en `messages.ts:1076`). Ce lot ne répare pas seulement
 * le chemin vivant — il retire la possibilité que le quatrième diverge, ce
 * qu'aucun témoin ne pouvait voir tant que la charge était un sac de clés.
 * La même charge partant dans la file de livraison hors ligne
 * (`enqueueOfflineMessageMutation`), le rejeu à la reconnexion reposait le
 * même mauvais identifiant.
 *
 * Les affirmations sont SÉPARÉES parce que la séparation EST le diagnostic :
 * chaque transport tombe pour lui-même, et le témoin d'ADDITIVITÉ dit si le
 * correctif a coûté quelque chose à ce que la charge portait déjà.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  messageValidationHook: jest.fn<any>(async () => {}),
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({ deleteAttachment: jest.fn() })),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({ deleteAttachment: jest.fn() })),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
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

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/messaging/messageLinks', () => ({
  reconcileEditedLinks: jest.fn<any>(async (params: any) => ({
    processedContent: params.content,
    trackingLinks: [],
    reconciled: true,
  })),
  mergeTrackingLinksIntoMetadata: () => null,
}));

jest.mock('../../../services/messaging/messageMentions', () => ({
  reconcileEditedMentions: jest.fn<any>().mockResolvedValue({
    validatedUsernames: ['alice'],
    validatedUserIds: [],
    newlyMentionedUserIds: [],
    reconciled: true,
  }),
}));

// `admitMessageEdit` interroge la base pour le rang GLOBAL et l'appartenance ;
// l'admission n'est pas le sujet de ce fichier. `admitEditedContent`, lui, est
// PUR et reste réel — c'est lui qui décide ce que la charge porte comme texte.
jest.mock('../../../services/messaging/messageEditAdmission', () => ({
  admitMessageEdit: jest.fn<any>().mockResolvedValue({ admitted: true }),
  isEditRefused: () => false,
  CONVERSATION_CLOSED_EDIT_MESSAGE: 'closed',
}));

jest.mock('../../../services/messaging/messageEditEffects', () => ({
  applyMessageEditEffects: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { getOrCompute: jest.fn<any>().mockResolvedValue([]) },
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>(async () => '507f1f77bcf86cd799439022'),
}));

jest.mock('../../../socketio/emitMentionCreated', () => ({ emitMentionCreated: jest.fn() }));

const mockBroadcastMessageMutation = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../socketio/broadcastMessageMutation', () => ({
  broadcastMessageMutation: (...args: any[]) => mockBroadcastMessageMutation(...args),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: jest.fn(),
    collectContentTrackingLinks: jest.fn<any>().mockResolvedValue([]),
  })),
}));

// `transformTranslationsToArray` reste RÉEL : c'est lui qui rend la forme de
// `translations` observable dans la charge, et le témoin d'additivité en dépend.

// ─── Import after mocks ───────────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';
import { registerMessagesAdvancedRoutes } from '../../../routes/conversations/messages-advanced';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const PART_ID = '507f1f77bcf86cd799439033';
const MSG_ID = '507f1f77bcf86cd799439044';
const CONV_ID = '507f1f77bcf86cd799439022';

const authContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  isAuthenticated: true,
  isAnonymous: false,
  participantId: PART_ID,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

type SenderShape = { readonly userId: string | null; readonly user: unknown };

/**
 * L'INSCRIT : `Participant.id` et `User.id` sont deux valeurs distinctes, et
 * c'est exactement ce que le défaut confond. Un fixture où elles coïncident ne
 * peut RIEN attester.
 */
const REGISTERED_SENDER: SenderShape = { userId: USER_ID, user: { username: 'alice' } };

/** L'ANONYME : aucune ligne `User`, donc le `Participant.id` EST son identité. */
const ANONYMOUS_SENDER: SenderShape = { userId: null, user: null };

// ─── Fake Prisma ──────────────────────────────────────────────────────────────

function buildPrisma(senderShape: SenderShape) {
  const row: Record<string, unknown> = {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    content: 'le texte AVANT',
    originalLanguage: 'en',
    messageType: 'image',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    translations: null,
    metadata: null,
    validatedMentions: [],
  };

  const sender = {
    id: PART_ID,
    userId: senderShape.userId,
    displayName: 'alice',
    avatar: null,
    role: 'USER',
    user: senderShape.user,
  };

  const apply = (data: Record<string, unknown>) => Object.assign(row, data);

  return {
    message: {
      findFirst: jest.fn<any>(async () => ({
        ...row,
        sender,
        attachments: [],
        conversation: {
          id: CONV_ID,
          isActive: true,
          closedAt: null,
          participants: [{ userId: USER_ID }],
        },
      })),
      updateMany: jest.fn<any>(async ({ data }: any) => {
        apply(data);
        return { count: 1 };
      }),
      update: jest.fn<any>(async ({ data }: any) => {
        apply(data);
        return { ...row, sender };
      }),
      findUniqueOrThrow: jest.fn<any>(async () => ({ ...row, sender })),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID }),
      findMany: jest.fn<any>().mockResolvedValue([{ id: PART_ID, userId: USER_ID }]),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ role: 'USER' }) },
    messageAttachment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    trackingLink: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  } as any;
}

let lastPrisma: any;

async function buildApp(senderShape: SenderShape = REGISTERED_SENDER) {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = authContext;
  });

  const prisma = buildPrisma(senderShape);
  lastPrisma = prisma;
  // Les options AJV de la PRODUCTION (`server.ts`), copiées et non composées :
  // c'est `useDefaults` — actif par défaut chez Fastify et jamais désactivé
  // ici — qui décide si un `default` de schéma de requête est une
  // documentation ou une écriture.
  const app: FastifyInstance = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });

  app.decorate('prisma', prisma);
  const translationService: any = {
    retranslateMessageAsync: jest.fn<any>().mockResolvedValue(undefined),
  };
  app.decorate('translationService', translationService);
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  app.decorate('socketIOHandler', {
    getManager: () => ({ getIO: () => io, enqueueOfflineMessageMutation: jest.fn<any>() }),
  });
  app.decorate('mentionService', { createMentions: jest.fn() });
  app.decorate('notificationService', { createMentionNotificationsBatch: jest.fn() });

  await messageRoutes(app);
  // Les deux gardes d'auth doivent être ASYNCHRONES : un `jest.fn()` nu rend
  // `undefined` sans appeler le `next` que Fastify lui passe, et la requête
  // pend indéfiniment au lieu d'échouer.
  const passThroughAuth = async (req: any) => {
    req.authContext = authContext;
  };
  registerMessagesAdvancedRoutes(app, prisma, translationService, passThroughAuth, passThroughAuth);
  await app.ready();
  return app;
}

/** La charge que le transport confie à `broadcastMessageMutation`. */
const editedPayload = () => {
  const call = mockBroadcastMessageMutation.mock.calls
    .map((c) => c[0] as any)
    .find((p) => p.eventType === 'edited');
  if (!call) throw new Error('aucun broadcast `edited` capturé');
  return call.payload as Record<string, unknown>;
};

// Les TROIS entrées REST, exercées par leur vraie route.
const TRANSPORTS = [
  {
    name: 'PUT /messages/:messageId — le transport d\'édition du client iOS',
    inject: (app: FastifyInstance) =>
      app.inject({ method: 'PUT', url: `/messages/${MSG_ID}`, payload: { content: 'le texte APRÈS' } }),
  },
  {
    name: 'PUT /conversations/:id/messages/:messageId — la forme conversation-scopée',
    inject: (app: FastifyInstance) =>
      app.inject({
        method: 'PUT',
        url: `/conversations/${CONV_ID}/messages/${MSG_ID}`,
        payload: { content: 'le texte APRÈS' },
      }),
  },
  {
    name: 'PATCH /messages/:messageId — le transport d\'édition du client Android',
    inject: (app: FastifyInstance) =>
      app.inject({ method: 'PATCH', url: `/messages/${MSG_ID}`, payload: { content: 'le texte APRÈS' } }),
  },
] as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('`message:edited` — le `senderId` du fil est un `User.id`, sur les TROIS entrées REST', () => {
  beforeEach(() => {
    mockBroadcastMessageMutation.mockClear();
  });

  for (const transport of TRANSPORTS) {
    describe(transport.name, () => {
      it('diffuse le `User.id` de l\'expéditeur, jamais le `Participant.id` de la colonne', async () => {
        const app = await buildApp();

        const res = await transport.inject(app);
        expect(res.statusCode).toBe(200);

        expect(editedPayload().senderId).toBe(USER_ID);
        await app.close();
      });

      it('replie sur le `Participant.id` pour un expéditeur ANONYME, qui n\'a pas d\'autre identité', async () => {
        const app = await buildApp(ANONYMOUS_SENDER);

        await transport.inject(app);

        expect(editedPayload().senderId).toBe(PART_ID);
        await app.close();
      });

      it('ne perd RIEN de ce que la charge portait déjà', async () => {
        const app = await buildApp();

        await transport.inject(app);

        const payload = editedPayload();
        expect(payload.id).toBe(MSG_ID);
        expect(payload.conversationId).toBe(CONV_ID);
        expect(payload.content).toBe('le texte APRÈS');
        expect(payload.originalLanguage).toBe('en');
        // La colonne porte `'image'` : le noyau ne réétiquette pas un type que
        // la ligne affirme (cf. cycle 102, `deriveMessageTypeForAttachments`).
        expect(payload.messageType).toBe('image');
        expect(payload.createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
        expect(payload.isEdited).toBe(true);
        // Le contenu neuf périme ses traductions à l'écriture : `[]`, jamais la
        // carte Mongo, et jamais celles du texte d'avant.
        expect(payload.translations).toEqual([]);
        expect(payload.sender).toMatchObject({ id: PART_ID, displayName: 'alice' });
        await app.close();
      });
    });
  }
});

/**
 * Le second défaut, découvert en ouvrant la charge du transport ci-dessus.
 *
 * `PUT /conversations/:id/messages/:messageId` est la SEULE des quatre entrées
 * d'édition à réécrire `originalLanguage`, et son gestionnaire porte la garde
 * qui convient : `claimedLanguage === undefined ? undefined : normalise(...)`,
 * accompagnée du commentaire qui l'explique — « l'omettre veut dire "je
 * n'affirme rien sur la langue", pas "c'est du français" ».
 *
 * La garde ne pouvait pas se déclencher. Son schéma de requête déclarait
 * `originalLanguage: { type: 'string', default: 'fr' }`, et Fastify active
 * `useDefaults` d'AJV : **un `default` dans un schéma de REQUÊTE est une
 * écriture dans `request.body`, pas une documentation.** Le champ arrivait
 * donc toujours renseigné, et jamais `undefined`.
 *
 * C'est la famille « une garde conditionnée à ce qu'elle garde est un no-op »
 * (cf. `services/gateway/CLAUDE.md`), avec la variante qui la rend invisible :
 * ce n'est pas le gestionnaire qui est faux, c'est la couche AU-DESSUS de lui
 * qui rend sa précondition inatteignable. Le code se lit juste, le commentaire
 * dit vrai, et la règle ne s'applique jamais.
 *
 * **Piège armé, pas panne, et la distinction est MESURÉE.** Un message édité
 * par cette route sans revendication de langue est réétiqueté FRANÇAIS — en
 * base, et comme langue SOURCE de la retraduction, qui rend alors un texte
 * anglais comme du français dans toutes les langues du Prisme. Mais aucun
 * client ne déclenche le défaut aujourd'hui : le web passe `originalLanguage`
 * en paramètre REQUIS de `handleEditMessage`, iOS édite par
 * `PUT /messages/:messageId` et Android par `PATCH /messages/:messageId` —
 * deux routes qui ne portent pas ce champ. Le premier appelant qui omettra la
 * clé le déclenchera, en lisant une garde qui a l'air de le couvrir.
 *
 * C'est exactement la situation de la règle du cycle 84 : on ne laisse pas un
 * piège armé au motif que personne n'a encore marché dessus.
 */
describe('PUT /conversations/:id/messages/:messageId — une omission n\'affirme pas « français »', () => {
  beforeEach(() => {
    mockBroadcastMessageMutation.mockClear();
  });

  const editWith = (app: FastifyInstance, body: Record<string, unknown>) =>
    app.inject({
      method: 'PUT',
      url: `/conversations/${CONV_ID}/messages/${MSG_ID}`,
      payload: { content: 'le texte APRÈS', ...body },
    });

  const writtenData = () => {
    const call = lastPrisma.message.update.mock.calls[0]?.[0];
    if (!call) throw new Error('aucune écriture capturée');
    return call.data as Record<string, unknown>;
  };

  it('n\'écrit PAS `originalLanguage` quand le corps n\'en revendique aucune', async () => {
    const app = await buildApp();

    const res = await editWith(app, {});

    expect(res.statusCode).toBe(200);
    expect(writtenData()).not.toHaveProperty('originalLanguage');
    await app.close();
  });

  it('laisse donc la langue STOCKÉE intacte sur le fil — `en` reste `en`', async () => {
    const app = await buildApp();

    await editWith(app, {});

    expect(editedPayload().originalLanguage).toBe('en');
    await app.close();
  });

  it('écrit la langue REVENDIQUÉE quand le corps en porte une, canonicalisée', async () => {
    const app = await buildApp();

    await editWith(app, { originalLanguage: 'es-ES' });

    expect(writtenData().originalLanguage).toBe('es');
    expect(editedPayload().originalLanguage).toBe('es');
    await app.close();
  });
});
