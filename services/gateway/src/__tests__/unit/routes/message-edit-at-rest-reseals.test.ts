/**
 * @jest-environment node
 *
 * Décision porteur du 2026-11-01 — un message d'une conversation `server` /
 * `hybrid` se MODIFIE par les trois entrées REST (iOS `PUT /messages/:id`,
 * web `PUT /conversations/:id/messages/:id`, Android `PATCH /messages/:id`),
 * et le texte modifié se range SCELLÉ comme un message neuf : `content: ''`,
 * le chiffré et ses métadonnées à côté. Le clair modifié ne touche jamais
 * `content`, ni aucune autre colonne écrite ; il part en clair vers les
 * clients (réponse et `message:edited`), sans chiffré sur le fil, comme la
 * lecture sert un message neuf.
 *
 * Modèle de menace : une copie de la base sans l'environnement de la passerelle
 * ne livre aucun des deux textes. Ce n'est pas du bout en bout.
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

const mockReconcileEditedLinks = jest.fn<any>(async (params: any) => ({
  processedContent: params.content,
  trackingLinks: [],
  reconciled: true,
}));
jest.mock('../../../services/messaging/messageLinks', () => ({
  ...jest.requireActual<typeof import('../../../services/messaging/messageLinks')>('../../../services/messaging/messageLinks'),
  reconcileEditedLinks: (...args: any[]) => mockReconcileEditedLinks(...args),
}));

jest.mock('../../../services/messaging/messageMentions', () => ({
  reconcileEditedMentions: jest.fn<any>().mockResolvedValue({
    validatedUsernames: ['alice'],
    validatedUserIds: [],
    newlyMentionedUserIds: [],
    reconciled: true,
  }),
}));

// L'admission n'est pas le sujet de ce fichier (elle a ses témoins, dont
// `e2eeEditRefusal.test.ts`, qui prouve qu'elle admet `server`/`hybrid`).
jest.mock('../../../services/messaging/messageEditAdmission', () => ({
  ...jest.requireActual<typeof import('../../../services/messaging/messageEditAdmission')>('../../../services/messaging/messageEditAdmission'),
  admitMessageEdit: jest.fn<any>().mockResolvedValue({ admitted: true, asModerator: false, windowBypassed: false }),
  isEditRefused: () => false,
  CONVERSATION_CLOSED_EDIT_MESSAGE: 'closed',
}));

const mockApplyMessageEditEffects = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/messaging/messageEditEffects', () => ({
  applyMessageEditEffects: (...args: any[]) => mockApplyMessageEditEffects(...args),
}));

// Le coffre de la passerelle, doublé AU PLUS PRÈS : sceller rend un chiffré
// qui ne contient pas le clair, ouvrir le relit. `sealMode` simule la clé
// maîtresse absente.
const encode = (text: string): string => Buffer.from(`sealed:${text}`, 'utf8').toString('base64');
const decode = (ciphertext: string): string => Buffer.from(ciphertext, 'base64').toString('utf8').replace(/^sealed:/, '');
const vault = { masterKeyAvailable: true };
const mockSealAtRest = jest.fn<any>(async (params: any) => {
  if (!vault.masterKeyAvailable) {
    const { ServerAtRestUnavailableError } = jest.requireActual<typeof import('../../../services/messaging/serverAtRest')>('../../../services/messaging/serverAtRest');
    throw new ServerAtRestUnavailableError('missing');
  }
  return {
    ciphertext: encode(params.plaintext),
    metadata: { protocol: 'aes-256-gcm', keyId: params.preferredKeyId ?? 'key-conv', iv: 'aXY=', authTag: 'dGFn', aad: 'conversation:v1' },
  };
});
jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: async () => ({
    sealAtRest: (params: any) => mockSealAtRest(params),
    openAtRest: async (envelope: any) => decode(envelope.ciphertext),
  }),
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

const USER_ID = '507f1f77bcf86cd799439011';
const PART_ID = '507f1f77bcf86cd799439033';
const MSG_ID = '507f1f77bcf86cd799439044';
const CONV_ID = '507f1f77bcf86cd799439022';
const BEFORE = 'le code est 4471';
const AFTER = 'le code est 9902 https://exemple.org/secret';

const authContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  isAuthenticated: true,
  isAnonymous: false,
  participantId: PART_ID,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

function buildPrisma() {
  const row: Record<string, unknown> = {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    content: '',
    isEncrypted: true,
    encryptionMode: 'server',
    encryptedContent: encode(BEFORE),
    encryptionMetadata: { mode: 'server', keyId: 'key-conv', iv: 'aXY=', authTag: 'dGFn', aad: 'conversation:v1' },
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date(),
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    translations: null,
    metadata: { trackingLinks: [{ url: 'https://ancien.example', token: 'tok' }] },
    validatedMentions: [],
    isViewOnce: false,
    effectFlags: 0,
  };
  const sender = { id: PART_ID, userId: USER_ID, displayName: 'alice', avatar: null, role: 'USER', user: { username: 'alice' } };
  const apply = (data: Record<string, unknown>) => Object.assign(row, data);
  return {
    message: {
      findFirst: jest.fn<any>(async () => ({
        ...row,
        sender,
        attachments: [],
        conversation: { id: CONV_ID, isActive: true, closedAt: null, type: 'group', encryptionMode: 'server', serverEncryptionKeyId: 'key-conv', participants: [{ userId: USER_ID }] },
      })),
      updateMany: jest.fn<any>(async ({ data }: any) => { apply(data); return { count: 1 }; }),
      update: jest.fn<any>(async ({ data }: any) => { apply(data); return { ...row, sender, replyTo: null }; }),
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

async function buildApp() {
  mockAuthMiddleware.mockImplementation(async (req: any) => { req.authContext = authContext; });
  const prisma = buildPrisma();
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } } });
  app.decorate('prisma', prisma);
  const translationService: any = { retranslateMessageAsync: jest.fn<any>().mockResolvedValue(undefined) };
  app.decorate('translationService', translationService);
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io, enqueueOfflineMessageMutation: jest.fn<any>() }) });
  app.decorate('mentionService', { createMentions: jest.fn() });
  app.decorate('notificationService', { createMentionNotificationsBatch: jest.fn() });
  await messageRoutes(app);
  registerMessagesAdvancedRoutes(app, prisma, async (req: any) => { req.authContext = authContext; });
  await app.ready();
  return { app, prisma, translationService };
}

const editedPayload = () => {
  const call = mockBroadcastMessageMutation.mock.calls.map((c) => c[0] as any).find((p) => p.eventType === 'edited');
  if (!call) throw new Error('aucun broadcast `edited` capturé');
  return call as { payload: Record<string, unknown>; atRest: boolean };
};

const writtenData = (prisma: any): Record<string, unknown> => {
  const call = prisma.message.update.mock.calls[0]?.[0] ?? prisma.message.updateMany.mock.calls[0]?.[0];
  if (!call) throw new Error('aucune écriture capturée');
  return call.data;
};

const TRANSPORTS = [
  { name: 'PUT /messages/:messageId (iOS)', inject: (app: FastifyInstance) => app.inject({ method: 'PUT', url: `/messages/${MSG_ID}`, payload: { content: AFTER } }) },
  { name: 'PUT /conversations/:id/messages/:messageId (web)', inject: (app: FastifyInstance) => app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MSG_ID}`, payload: { content: AFTER } }) },
  { name: 'PATCH /messages/:messageId (Android)', inject: (app: FastifyInstance) => app.inject({ method: 'PATCH', url: `/messages/${MSG_ID}`, payload: { content: AFTER } }) },
] as const;

describe('édition au repos — le texte modifié se rescelle sur les trois entrées REST', () => {
  beforeEach(() => {
    mockBroadcastMessageMutation.mockClear();
    mockReconcileEditedLinks.mockClear();
    mockApplyMessageEditEffects.mockClear();
    mockSealAtRest.mockClear();
    vault.masterKeyAvailable = true;
  });

  for (const transport of TRANSPORTS) {
    describe(transport.name, () => {
      it('écrit content vide et le chiffré du texte modifié, jamais le clair', async () => {
        const { app, prisma } = await buildApp();

        const res = await transport.inject(app);

        expect(res.statusCode).toBe(200);
        const data = writtenData(prisma);
        expect(data).toMatchObject({ content: '', isEncrypted: true, encryptionMode: 'server', encryptedContent: encode(AFTER) });
        expect(data.encryptionMetadata).toMatchObject({ keyId: 'key-conv', canTranslate: true });
        expect(JSON.stringify(data)).not.toContain('le code est');
        expect(mockSealAtRest).toHaveBeenCalledWith(expect.objectContaining({ plaintext: AFTER, conversationId: CONV_ID, preferredKeyId: 'key-conv' }));
        await app.close();
      });

      it('aucune adresse suivie : ni réécriture de lien, ni carte trackingLinks rangée en clair', async () => {
        const { app, prisma } = await buildApp();

        await transport.inject(app);

        expect(mockReconcileEditedLinks).not.toHaveBeenCalled();
        expect(JSON.stringify(writtenData(prisma).metadata ?? null)).not.toContain('trackingLinks');
        await app.close();
      });

      it('sert le texte modifié EN CLAIR, sans chiffré sur le fil ni dans la réponse', async () => {
        const { app } = await buildApp();

        const res = await transport.inject(app);

        const { payload, atRest } = editedPayload();
        expect(payload).toMatchObject({ content: AFTER, isEncrypted: false });
        expect(payload.encryptedContent ?? null).toBeNull();
        expect(payload.encryptionMetadata ?? null).toBeNull();
        expect(atRest).toBe(true);
        const body = JSON.parse(res.body);
        expect(body.data.content).toBe(AFTER);
        expect(JSON.stringify(body)).not.toContain(encode(AFTER));
        await app.close();
      });

      it('les effets durables comptent l’écart du texte d’AVANT ouvert au texte modifié', async () => {
        const { app } = await buildApp();

        await transport.inject(app);

        expect(mockApplyMessageEditEffects).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ previousContent: BEFORE, content: AFTER }));
        await app.close();
      });

      it('la retraduction est demandée : elle relit le clair par la passerelle (`translatableTextOf`)', async () => {
        const { app, translationService } = await buildApp();

        await transport.inject(app);

        expect(translationService.retranslateMessageAsync).toHaveBeenCalledWith(MSG_ID, expect.objectContaining({ id: MSG_ID }));
        await app.close();
      });

      it('sans clé maîtresse : 503 SERVER_AT_REST_UNAVAILABLE, rien d’écrit, rien de diffusé', async () => {
        vault.masterKeyAvailable = false;
        const { app, prisma } = await buildApp();

        const res = await transport.inject(app);

        expect(res.statusCode).toBe(503);
        expect(JSON.parse(res.body)).toMatchObject({ success: false, code: 'SERVER_AT_REST_UNAVAILABLE' });
        expect(prisma.message.update).not.toHaveBeenCalled();
        expect(prisma.message.updateMany).not.toHaveBeenCalled();
        expect(mockBroadcastMessageMutation).not.toHaveBeenCalled();
        await app.close();
      });
    });
  }
});
