/**
 * `GET /messages/:messageId` — la présence de l'expéditeur passe-t-elle un gate ?
 *
 * Le `select` de cette route charge `isOnline` sur DEUX porteurs : la ligne
 * `Participant` (`sender.isOnline`) et le `User` qu'elle référence
 * (`sender.user.isOnline`). Rien ne les filtrait.
 *
 * Et elle atteignait le fil. Le balayage `{ type: 'object' }` avait classé ce
 * site parmi les « non-fuites accidentelles » — à tort : le schéma de cette
 * route décrit le MESSAGE (id, content, sender…) quand `sendSuccess` répond
 * `{ success, data }`. Aucune de ses déclarations ne matche l'objet réel, et
 * `data` traverse ENTIER par l'`additionalProperties: true` du bloc. Vérifié en
 * isolant le compilateur, et confirmé par le ROUGE : sur le code d'avant, le
 * témoin d'identité passait déjà — seuls les témoins de GATE tombent.
 *
 * La leçon du site : **un `{ type: 'object' }` nu ne vide que si le schéma qui
 * le porte décrit vraiment la charge utile.** Quand l'enveloppe ne correspond
 * pas, la déclaration est inerte — et le balayage produit un faux positif sur
 * la forme, qui cachait ici un VRAI défaut de fond.
 *
 * Régime : `resolvePrefsOnly`. L'appelant doit être un participant ACTIF de la
 * conversation (403 sinon) — contexte d'accès garanti des deux côtés, seules
 * les préférences s'appliquent. Et `onMissingEntry: 'reveal'`, parce qu'une
 * entrée absente y est NORMALE : un expéditeur anonyme n'a pas de `userId`,
 * donc pas de préférences, et reste visible.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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

const mockResolvePrefsOnly = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolvePrefsOnly: (...args: any[]) => mockResolvePrefsOnly(...args),
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

const VISIBLE = { showOnline: true, showLastSeenTimestamp: true };
const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

type SenderShape = {
  id: string;
  userId: string | null;
  displayName: string;
  avatar: string | null;
  isOnline: boolean;
  type: string;
  user: { id: string; username: string; avatar: string | null; isOnline: boolean } | null;
};

const registeredSender = (): SenderShape => ({
  id: SENDER_PARTICIPANT_ID,
  userId: SENDER_USER_ID,
  displayName: 'Emetteur',
  avatar: null,
  isOnline: true,
  type: 'user',
  user: { id: SENDER_USER_ID, username: 'emetteur', avatar: null, isOnline: true },
});

const anonymousSender = (): SenderShape => ({
  id: SENDER_PARTICIPANT_ID,
  userId: null,
  displayName: 'Invité',
  avatar: null,
  isOnline: true,
  type: 'anonymous',
  user: null,
});

async function buildApp(sender: SenderShape): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: READER_USER_ID,
      hasFullAccess: true,
      registeredUser: { id: READER_USER_ID, role: 'USER' },
    };
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONV_ID,
        senderId: SENDER_PARTICIPANT_ID,
        content: 'bonjour',
        originalLanguage: 'fr',
        messageType: 'text',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
        translations: null,
        metadata: null,
        sender,
        // L'appelant EST participant actif — sans quoi la route rend 403.
        conversation: { participants: [{ userId: READER_USER_ID, role: 'member' }] },
        attachments: [],
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any);

  await app.register(messageRoutes);
  await app.ready();
  return app;
}

async function fetchSender(sender: SenderShape) {
  const app = await buildApp(sender);
  const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}` });
  await app.close();
  return res.json().data?.sender;
}

beforeEach(() => {
  mockResolvePrefsOnly.mockReset();
  mockResolvePrefsOnly.mockResolvedValue(new Map());
});

// ─────────────────────────────────────────────────────────────────────────────

// Ce bloc ne garde pas une correction — il fige un CONSTAT, et c'est délibéré.
// Le balayage `{ type: 'object' }` avait signalé `sender` comme vidé ; il ne
// l'était pas, parce que le schéma de cette route décrit le message quand
// `sendSuccess` répond `{ success, data }` : rien n'y matche, et `data` traverse
// par `additionalProperties: true`. Ce témoin est ce qui rendrait visible une
// future « correction » du schéma qui, elle, tronquerait pour de bon.
describe('GET /messages/:messageId — l’expéditeur traverse le sérialiseur', () => {
  it('sert l’expéditeur entier (le schéma ne le gouverne pas)', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[SENDER_USER_ID, VISIBLE]]));

    const sender = await fetchSender(registeredSender());

    expect(sender).toMatchObject({
      id: SENDER_PARTICIPANT_ID,
      userId: SENDER_USER_ID,
      displayName: 'Emetteur',
      type: 'user',
    });
    expect(sender.user).toMatchObject({ id: SENDER_USER_ID, username: 'emetteur' });
  });
});

describe('GET /messages/:messageId — gate de présence de l’expéditeur', () => {
  it('masque les DEUX porteurs quand l’expéditeur a coupé sa présence', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[SENDER_USER_ID, HIDDEN]]));

    const sender = await fetchSender(registeredSender());

    expect(sender.isOnline).toBe(false);
    expect(sender.user.isOnline).toBe(false);
  });

  it('conserve la présence que les préférences autorisent', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[SENDER_USER_ID, VISIBLE]]));

    const sender = await fetchSender(registeredSender());

    expect(sender.isOnline).toBe(true);
    expect(sender.user.isOnline).toBe(true);
  });

  it('résout sous le régime prefs-only, sur le `User.id` de l’expéditeur', async () => {
    await fetchSender(registeredSender());

    expect(mockResolvePrefsOnly).toHaveBeenCalledWith([SENDER_USER_ID]);
  });

  // Le défaut d'une carte absente s'INVERSE entre les deux régimes : sous
  // prefs-only un id manquant est normal (pas de compte, donc pas de
  // préférences) et vaut MONTRABLE, là où le critère strict masquerait.
  it('laisse un expéditeur anonyme visible, et n’ouvre aucune résolution', async () => {
    const sender = await fetchSender(anonymousSender());

    expect(sender.isOnline).toBe(true);
    expect(mockResolvePrefsOnly).not.toHaveBeenCalled();
  });
});
