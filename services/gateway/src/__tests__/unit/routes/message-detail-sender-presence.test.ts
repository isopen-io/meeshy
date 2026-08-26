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
 * `data` traverse ENTIER par l'`additionalProperties: true` du bloc.
 *
 * La leçon du site : **un `{ type: 'object' }` nu ne vide que si le schéma qui
 * le porte décrit vraiment la charge utile.** Quand l'enveloppe ne correspond
 * pas, la déclaration est inerte — et le balayage produit un faux positif sur
 * la forme, qui cachait ici un VRAI défaut de fond.
 *
 * Régime : critère STRICT (`resolveForTargets`), directive produit du
 * 2026-08-25 — « lorsqu'on n'est pas ami, je veux supprimer ma présence en
 * ligne […] et personne ne doit savoir ma dernière connexion si on n'est pas
 * ami. Admin et supérieur peuvent constamment avoir l'état de présence. »
 * Être co-participant ACTIF de la conversation (le 403 gardé plus haut dans le
 * handler) donne accès au MESSAGE, jamais à la présence de son auteur — ce
 * n'est plus, depuis cette directive, un critère d'autorisation de présence.
 * Un expéditeur ANONYME (`userId` absent) n'a pas de ligne `User` à résoudre
 * via `resolveForTargets` (indexée par `User.id`) : masqué par défaut, sauf
 * pour un viewer ADMIN/BIGBOSS — l'entitlement de la directive est
 * inconditionnel, il ne dépend pas de l'existence d'une relation.
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
  isRegisteredUser: (ctx: any) => ctx?.type === 'user',
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

async function buildApp(sender: SenderShape, viewerRole: string = 'USER'): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: READER_USER_ID,
      hasFullAccess: true,
      registeredUser: { id: READER_USER_ID, role: viewerRole },
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
        // L'appelant EST participant actif — sans quoi la route rend 403. La
        // co-participation reste le critère d'ACCÈS AU MESSAGE ; ce n'est plus
        // un critère de présence depuis la directive du 2026-08-25.
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

async function fetchSender(sender: SenderShape, viewerRole: string = 'USER') {
  const app = await buildApp(sender, viewerRole);
  const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}` });
  await app.close();
  return res.json().data?.sender;
}

beforeEach(() => {
  mockResolveForTargets.mockReset();
  mockResolveForTargets.mockResolvedValue(new Map());
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
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, VISIBLE]]));

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

describe('GET /messages/:messageId — gate de présence de l’expéditeur (critère strict)', () => {
  it('USER non ami (co-participant seul) ⇒ masqué sur les DEUX porteurs', async () => {
    // Le mock répond exactement ce que `PresenceVisibilityService.resolveForTargets`
    // rendrait pour un viewer USER qui n'est ni l'expéditeur ni son ami : HIDDEN.
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, HIDDEN]]));

    const sender = await fetchSender(registeredSender(), 'USER');

    expect(sender.isOnline).toBe(false);
    expect(sender.user.isOnline).toBe(false);
  });

  it('ADMIN non ami ⇒ visible (entitlement inconditionnel de la directive)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, VISIBLE]]));

    const sender = await fetchSender(registeredSender(), 'ADMIN');

    expect(sender.isOnline).toBe(true);
    expect(sender.user.isOnline).toBe(true);
  });

  it('ami accepté ⇒ visible sous les préférences de l’expéditeur', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, VISIBLE]]));

    const sender = await fetchSender(registeredSender(), 'USER');

    expect(sender.isOnline).toBe(true);
    expect(sender.user.isOnline).toBe(true);
  });

  it('résout sous le critère strict, avec le viewer et le `User.id` de l’expéditeur', async () => {
    await fetchSender(registeredSender(), 'USER');

    expect(mockResolveForTargets).toHaveBeenCalledWith(
      { userId: READER_USER_ID, role: 'USER' },
      [SENDER_USER_ID],
    );
  });

  // Le défaut d'une carte absente est désormais UNIFORME : sous le critère
  // strict, une entrée manquante masque — jamais l'inverse du régime
  // prefs-only retiré. Un expéditeur anonyme n'a pas de `User.id` à résoudre,
  // donc pas d'entrée : masqué pour un viewer non privilégié, et
  // `resolveForTargets` n'est même pas appelé (rien à résoudre).
  it('expéditeur anonyme + viewer USER ⇒ masqué, sans résolution ouverte', async () => {
    const sender = await fetchSender(anonymousSender(), 'USER');

    expect(sender.isOnline).toBe(false);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });

  // Contrepartie de la directive : « les utilisateurs avec le rôle ADMIN et
  // supérieur peuvent CONSTAMMENT avoir l'état de présence » — y compris
  // quand la cible est un participant anonyme sans ligne `User` à résoudre.
  it('expéditeur anonyme + viewer ADMIN ⇒ visible', async () => {
    const sender = await fetchSender(anonymousSender(), 'ADMIN');

    expect(sender.isOnline).toBe(true);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });

  // Le bypass EN LIGNE de ce site (expéditeur sans `User.id`, donc hors de
  // portée de `resolveForTargets`) suit `isGlobalAdmin`, jamais
  // `isGlobalModerator` : un MODERATOR n'est « ni un ami ni un administrateur »
  // (loi partagée). Ce témoin rougit si le site rétrograde vers l'ancien
  // bypass modérateur — le seul rang où les deux prédicats divergent.
  it('expéditeur anonyme + viewer MODERATOR ⇒ masqué, comme un utilisateur ordinaire', async () => {
    const sender = await fetchSender(anonymousSender(), 'MODERATOR');

    expect(sender.isOnline).toBe(false);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});

// Revue adversariale 2026-08-26 (F2, constat 2). Le repli « entrée absente »
// était RÉÉCRIT en ligne (`FULL_PRESENCE_VISIBILITY` + `isGlobalAdmin`) et ne
// couvrait que l'expéditeur ANONYME : un expéditeur INSCRIT dont le résolveur
// ne rendait pas d'entrée (anomalie) tombait sur `undefined`, donc HIDDEN même
// pour un ADMIN. Le site passe désormais par `presenceFor` (`presence-gate`),
// UN repli pour toutes les portes : une entrée absente — anonyme ou inscrit
// non résolu — reçoit la MÊME réponse, révélée à ADMIN/BIGBOSS, masquée sinon.
describe('GET /messages/:messageId — entrée ABSENTE pour un expéditeur INSCRIT (repli partagé)', () => {
  it('viewer ADMIN ⇒ visible sur les DEUX porteurs (la loi partagée révèle l’inconnu à ADMIN+)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());

    const sender = await fetchSender(registeredSender(), 'ADMIN');

    expect(sender.isOnline).toBe(true);
    expect(sender.user.isOnline).toBe(true);
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: READER_USER_ID, role: 'ADMIN' }, [SENDER_USER_ID]);
  });

  it('viewer USER ⇒ masqué sur les DEUX porteurs (une porte refuse ce qu’elle ne sait pas)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());

    const sender = await fetchSender(registeredSender(), 'USER');

    expect(sender.isOnline).toBe(false);
    expect(sender.user.isOnline).toBe(false);
  });
});
