/**
 * @jest-environment node
 *
 * L'effacement des traductions PARTAGÉES (#9899), mesuré au TRANSPORT.
 *
 * Les suites des deux unités d'effets (`messageEditEffects`,
 * `messageRemovalEffects`) prouvent ce que l'unité fait quand on l'appelle.
 * Elles ne disent rien de ce que les routes lui REMETTENT, et c'est là que le
 * défaut vivait : cinq entrées REST écrivent un nouveau contenu ou un
 * `deletedAt`, et chacune compose son propre enregistrement. Une unité
 * irréprochable appelée avec un enregistrement incomplet efface mal — et pour
 * une ÉDITION, « mal » a deux visages opposés :
 *
 * - **trop peu** : l'instant d'édition est perdu, la version que l'édition vient
 *   de périmer survit, lisible pour qui détient la clé ;
 * - **trop** : l'unité ne sait pas quelle version l'édition vient d'écrire, et
 *   efface celle qu'un appareil a partagée entre l'écriture et l'effacement —
 *   la seule que la passerelle sert encore. (Le choix sûr de l'unité devant une
 *   date illisible est d'effacer TOUT, pas de deviner.)
 *
 * Les deux unités d'effets restent les VRAIES ; seuls les effets qui n'ont rien
 * à voir avec la table voisine sont doublés (compteurs, notifications, avis de
 * capture), parce que leur panne ne ferait que brouiller la lecture.
 *
 * ## Le double qui ÉVALUE
 *
 * `sharedTranslationTable` applique le `where` qu'il reçoit : les assertions
 * lisent les lignes qui RESTENT, jamais « `deleteMany` a été appelé ». Une
 * requête trop large (celle qu'un filtre oublié produit) y vide la table des
 * AUTRES messages, et se voit.
 *
 * ## La course que le double rejoue
 *
 * L'écriture d'une édition jette dans la table, au moment où elle commit, la
 * ligne d'un appareil qui a lu le NOUVEL `editedAt` et partage aussitôt sa
 * traduction. La ligne porte la version de source que la route a ÉCRITE —
 * `editedAt.toISOString()`, relu de l'écriture elle-même et non d'une horloge
 * du test. Si un transport confiait à l'effacement un autre instant que celui
 * qu'il a écrit (un second `new Date()`, ou aucun), la ligne partirait avec les
 * périmées, et c'est ce que le témoin « épargne la version qu'elle vient
 * d'écrire » voit.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import {
  ORIGINAL_SOURCE_VERSION,
  sharedOnEditWrite,
  sharedTranslationRow,
  sharedTranslationTable,
  useFakeDateOnly,
  type SharedTranslationRow,
} from '../../helpers/shared-translation-table';

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
    validatedUsernames: [],
    validatedUserIds: [],
    newlyMentionedUserIds: [],
    reconciled: true,
  }),
}));

// L'admission n'est pas le sujet : elle interroge la base pour le rang GLOBAL.
// `messageDeleteAdmission`, lui, reste RÉEL — l'auteur supprime sans aucune
// lecture, et c'est le chemin que ces témoins empruntent.
jest.mock('../../../services/messaging/messageEditAdmission', () => ({
  admitMessageEdit: jest.fn<any>().mockResolvedValue({ admitted: true }),
  isEditRefused: () => false,
  CONVERSATION_CLOSED_EDIT_MESSAGE: 'closed',
}));

// Les effets qui n'ont rien à voir avec la table voisine. Leur panne est
// avalée par chaque unité (best-effort, effet par effet) ; les doubler évite
// seulement que leur bruit se lise comme un signal.
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onMessageEdited: jest.fn<any>().mockResolvedValue(undefined),
    onMessageDeleted: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../services/messaging/reproduceEditedMessageNotifications', () => ({
  ...(jest.requireActual('../../../services/messaging/reproduceEditedMessageNotifications') as object),
  reproduceEditedMessageNotifications: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../services/messaging/retractMessageNotifications', () => ({
  ...(jest.requireActual('../../../services/messaging/retractMessageNotifications') as object),
  retractMessageNotifications: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../services/messaging/captureNoticeRetention', () => ({
  ...(jest.requireActual('../../../services/messaging/captureNoticeRetention') as object),
  boundCaptureNoticesNaming: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { getOrCompute: jest.fn<any>().mockResolvedValue([]) },
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>(async () => '507f1f77bcf86cd799439022'),
}));

jest.mock('../../../socketio/emitMentionCreated', () => ({ emitMentionCreated: jest.fn() }));

jest.mock('../../../socketio/broadcastMessageMutation', () => ({
  broadcastMessageMutation: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: jest.fn(),
    collectContentTrackingLinks: jest.fn<any>().mockResolvedValue([]),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';
import { registerMessagesAdvancedRoutes } from '../../../routes/conversations/messages-advanced';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const PART_ID = '507f1f77bcf86cd799439033';
const MSG_ID = '507f1f77bcf86cd799439044';
const OTHER_MSG_ID = '507f1f77bcf86cd799439055';
const CONV_ID = '507f1f77bcf86cd799439022';

/** La version d'une édition ANTÉRIEURE : périmée elle aussi dès que le texte change encore. */
const PRIOR_EDIT_VERSION = '2026-10-09T08:00:00.000Z';
const EDITED_CONTENT = 'le texte APRÈS';

/** L'horloge du test : fixée, et déplacée par l'écriture d'une édition (voir `sharedOnEditWrite`). */
const CLOCK_START = new Date('2026-10-10T12:00:00.000Z');

const authContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  isAuthenticated: true,
  isAnonymous: false,
  participantId: PART_ID,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

// ─── Le monde : une ligne de message et la table des traductions partagées ───

/**
 * Trois lignes de départ : celle de la version d'ORIGINE, celle d'une édition
 * antérieure — toutes deux sur le message sous test, dans deux langues — et
 * celle d'un AUTRE message, que rien de ce qui touche le premier ne doit
 * emporter.
 */
function seed(): { rows: readonly SharedTranslationRow[]; other: SharedTranslationRow } {
  const other = sharedTranslationRow({ messageId: OTHER_MSG_ID, sourceVersion: ORIGINAL_SOURCE_VERSION });
  return {
    other,
    rows: [
      sharedTranslationRow({ messageId: MSG_ID, sourceVersion: ORIGINAL_SOURCE_VERSION, targetLanguage: 'fr' }),
      sharedTranslationRow({ messageId: MSG_ID, sourceVersion: PRIOR_EDIT_VERSION, targetLanguage: 'es' }),
      other,
    ],
  };
}

function buildWorld(rows: readonly SharedTranslationRow[]) {
  const table = sharedTranslationTable(rows);

  const row: Record<string, unknown> = {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    content: 'le texte AVANT',
    originalLanguage: 'en',
    messageType: 'text',
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
    userId: USER_ID,
    displayName: 'alice',
    avatar: null,
    role: 'USER',
    user: { username: 'alice' },
  };

  /** L'écriture d'une édition est suivie du partage d'un appareil qui lit son NOUVEL instant. */
  const race = sharedOnEditWrite(table, { messageId: MSG_ID });

  const write = (data: Record<string, unknown>) => {
    Object.assign(row, data);
    race.onWrite(data);
  };

  const alive = () =>
    row.deletedAt
      ? null
      : {
          ...row,
          sender,
          attachments: [],
          conversation: { id: CONV_ID, isActive: true, closedAt: null, participants: [{ userId: USER_ID }] },
        };

  const prisma = {
    message: {
      findFirst: jest.fn<any>(async () => alive()),
      updateMany: jest.fn<any>(async ({ data }: any) => {
        write(data);
        return { count: 1 };
      }),
      update: jest.fn<any>(async ({ data }: any) => {
        write(data);
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
    sharedTranslation: table.delegate,
  } as any;

  return { prisma, table, row, writtenEditedAt: race.writtenEditedAt };
}

type World = ReturnType<typeof buildWorld>;

async function buildApp(world: World): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = authContext;
  });

  const app: FastifyInstance = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });

  app.decorate('prisma', world.prisma);
  app.decorate('translationService', {
    retranslateMessageAsync: jest.fn<any>().mockResolvedValue(undefined),
  });
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  app.decorate('socketIOHandler', {
    getManager: () => ({ getIO: () => io, enqueueOfflineMessageMutation: jest.fn<any>() }),
  });
  app.decorate('mentionService', { createMentions: jest.fn() });
  app.decorate('notificationService', { createMentionNotificationsBatch: jest.fn() });

  await messageRoutes(app);
  const passThroughAuth = async (req: any) => {
    req.authContext = authContext;
  };
  registerMessagesAdvancedRoutes(app, world.prisma, passThroughAuth);
  await app.ready();
  return app;
}

/** Une route, exercée par son vrai chemin, sur un monde et une application neufs. */
async function run(
  inject: (app: FastifyInstance) => ReturnType<FastifyInstance['inject']>,
  options: { readonly erasureFails?: boolean } = {}
) {
  const { rows, other } = seed();
  const world = buildWorld(rows);
  if (options.erasureFails) world.table.deleteMany.mockRejectedValue(new Error('mongo: connexion perdue'));
  const app = await buildApp(world);
  try {
    const res = await inject(app);
    return { res, world, other };
  } finally {
    await app.close();
  }
}

// ─── Les transports ───────────────────────────────────────────────────────────

const EDIT_TRANSPORTS = [
  {
    name: "PUT /messages/:messageId — le transport d'édition du client iOS",
    inject: (app: FastifyInstance) =>
      app.inject({ method: 'PUT', url: `/messages/${MSG_ID}`, payload: { content: EDITED_CONTENT } }),
  },
  {
    name: 'PUT /conversations/:id/messages/:messageId — la forme conversation-scopée',
    inject: (app: FastifyInstance) =>
      app.inject({
        method: 'PUT',
        url: `/conversations/${CONV_ID}/messages/${MSG_ID}`,
        payload: { content: EDITED_CONTENT },
      }),
  },
  {
    name: "PATCH /messages/:messageId — le transport d'édition du client Android",
    inject: (app: FastifyInstance) =>
      app.inject({ method: 'PATCH', url: `/messages/${MSG_ID}`, payload: { content: EDITED_CONTENT } }),
  },
] as const;

const DELETE_TRANSPORTS = [
  {
    name: 'DELETE /messages/:messageId — le transport de suppression du client Android',
    inject: (app: FastifyInstance) => app.inject({ method: 'DELETE', url: `/messages/${MSG_ID}` }),
  },
  {
    name: 'DELETE /conversations/:id/messages/:messageId — le transport iOS et web',
    inject: (app: FastifyInstance) =>
      app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MSG_ID}` }),
  },
] as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

// SEULE la date est factice : Fastify, `inject` et les doubles asynchrones
// gardent leurs vrais minuteurs et leurs vraies micro-tâches.
beforeEach(() => {
  useFakeDateOnly(CLOCK_START);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('traductions partagées — une ÉDITION REST périme les versions d\'avant, jamais celle qu\'elle écrit', () => {
  for (const transport of EDIT_TRANSPORTS) {
    describe(transport.name, () => {
      it("efface les traductions partagées des versions que l'édition périme", async () => {
        const { res, world } = await run(transport.inject);

        expect(res.statusCode).toBe(200);
        const written = world.writtenEditedAt().toISOString();
        const stale = world.table.remainingVersionsOf(MSG_ID).filter((version) => version !== written);
        expect(stale).toEqual([]);
      });

      it("épargne la version qu'elle vient d'écrire — celle qu'un appareil a pu partager dans l'intervalle", async () => {
        const { world } = await run(transport.inject);

        expect(world.table.remainingVersionsOf(MSG_ID)).toEqual([world.writtenEditedAt().toISOString()]);
      });

      it("ne touche pas aux traductions partagées d'un AUTRE message", async () => {
        const { world, other } = await run(transport.inject);

        expect(world.table.remainingIds()).toContain(other.id);
      });

      it("réussit quand l'effacement échoue : le texte neuf est écrit, la réponse reste 200", async () => {
        const { res, world } = await run(transport.inject, { erasureFails: true });

        expect(world.table.deleteMany).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(world.row.content).toBe(EDITED_CONTENT);
      });
    });
  }
});

describe('traductions partagées — une SUPPRESSION REST les efface toutes', () => {
  for (const transport of DELETE_TRANSPORTS) {
    describe(transport.name, () => {
      it('efface les traductions partagées du message supprimé — toutes versions, toutes langues', async () => {
        const { res, world } = await run(transport.inject);

        expect(res.statusCode).toBe(200);
        expect(world.table.remainingVersionsOf(MSG_ID)).toEqual([]);
      });

      it("ne touche pas aux traductions partagées d'un AUTRE message", async () => {
        const { world, other } = await run(transport.inject);

        expect(world.table.remainingIds()).toEqual([other.id]);
      });

      it("réussit quand l'effacement échoue : le message est supprimé, la réponse reste 200", async () => {
        const { res, world } = await run(transport.inject, { erasureFails: true });

        expect(world.table.deleteMany).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(world.row.deletedAt).toBeInstanceOf(Date);
      });
    });
  }
});
