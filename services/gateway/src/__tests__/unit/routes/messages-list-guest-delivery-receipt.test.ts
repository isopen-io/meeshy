/**
 * `GET /conversations/:id/messages` — **l'accusé de LIVRAISON d'un invité de
 * lien partagé** (#17077).
 *
 * Le rattrapage REST posait `markMessagesAsReceived` sous un
 * `!authRequest.authContext.isAnonymous`. Ce gate ne protégeait RIEN :
 * `currentParticipantId` est résolu correctement pour les DEUX identités vingt
 * lignes plus haut (`isAnonymousUser ? authContext.participantId :
 * currentParticipant?.id`), et `markMessagesAsReceived` prend un
 * `Participant.id`, pas un `User.id`. Il retirait simplement la population des
 * invités de lien d'un des trois transports du même fait, **sans une ligne de
 * commentaire pour le justifier**.
 *
 * C'est le cas de référence que le `CLAUDE.md` du gateway interdit nommément :
 * « Ne JAMAIS enterrer l'incomplétude sous un `if (!isAnonymous)` au site
 * d'appel : le gate donne l'omission pour une règle produit […] Cas réel :
 * `_emitUnreadCountsSnapshot` (cycle 61) ».
 *
 * PIÈGE ARMÉ, et il faut le dire : les deux AUTRES transports couvrent bien les
 * sans-compte (`autoDeliverToOnlineRecipients`, et le drain de reconnexion, qui
 * branchent tous deux sur les deux colonnes). Reste découvert l'invité qui lit
 * l'historique par REST **sans socket authentifiée vivante** — page de lien
 * avant l'authentification socket, coque en reprise : l'expéditeur reste à une
 * seule coche pour lui. La précondition qui l'arme vraiment : le jour où l'un
 * des deux chemins socket change de forme, cette porte est la SEULE REST, et
 * elle est fermée aux invités.
 *
 * **Un témoin écrit avec un JWT ne peut pas tomber** : l'inscrit passait déjà.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../services/messaging/captureNoticeVisibility', () => ({
  ...(jest.requireActual('../../../services/messaging/captureNoticeVisibility') as object),
  hidingServedTo: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
  hidingServedToReader: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    (...args: any[]) => mockCanAccessConversation(...args)));

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

const mockMarkMessagesAsReceived = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsReceived: (...args: any[]) => mockMarkMessagesAsReceived(...args),
  })),
}));

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439011';
/** L'invité de lien : un `Participant.id`, et AUCUNE ligne `User`. */
const GUEST_PARTICIPANT_ID = '507f1f77bcf86cd799439055';
const REGISTERED_USER_ID = '507f1f77bcf86cd799439022';
const REGISTERED_PARTICIPANT_ID = '507f1f77bcf86cd799439023';

const message = () => ({
  id: '507f1f77bcf86cd799439099',
  conversationId: CONV_ID,
  senderId: 'p-other',
  content: 'Bonjour',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date('2026-11-01T08:00:00Z'),
  updatedAt: new Date('2026-11-01T08:00:00Z'),
  attachments: [],
  validatedMentions: null,
  _count: { attachments: 0 },
  sender: {
    id: 'p-other', userId: null, displayName: 'Alice', avatar: null,
    type: 'anonymous', role: 'member', language: 'fr', user: null, anonymousSession: null,
  },
});

async function read(identity: 'guest' | 'registered'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(
        identity === 'registered'
          ? { id: REGISTERED_PARTICIPANT_ID, userId: REGISTERED_USER_ID, isActive: true }
          : null,
      ),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([message()]),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const auth = async (req: any) => {
    req.authContext = identity === 'guest'
      ? {
          type: 'anonymous',
          isAuthenticated: true,
          isAnonymous: true,
          userId: GUEST_PARTICIPANT_ID,
          participantId: GUEST_PARTICIPANT_ID,
        }
      : {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: REGISTERED_USER_ID,
          registeredUser: { id: REGISTERED_USER_ID, role: 'USER' },
        };
  };

  registerMessagesRoutes(app, prisma, {} as any, auth, auth);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
  expect(res.statusCode).toBe(200);
  // L'accusé est en fire-and-forget : il part APRÈS la réponse.
  await new Promise((resolve) => setImmediate(resolve));
  return app;
}

describe("l'accusé de livraison du rattrapage REST atteint aussi les invités (#17077)", () => {
  beforeEach(() => {
    mockMarkMessagesAsReceived.mockClear();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("un invité de lien marque ses messages reçus, sous son `Participant.id`", async () => {
    const app = await read('guest');
    try {
      expect(mockMarkMessagesAsReceived).toHaveBeenCalledWith(GUEST_PARTICIPANT_ID, CONV_ID);
    } finally {
      await app.close();
    }
  });

  // NÉGATIF, vert des deux côtés : l'inscrit passait déjà. Il est ici pour
  // qu'un correctif ne puisse pas se payer en déplaçant le trou.
  it('un inscrit marque les siens, sous son `Participant.id` à lui', async () => {
    const app = await read('registered');
    try {
      expect(mockMarkMessagesAsReceived).toHaveBeenCalledWith(REGISTERED_PARTICIPANT_ID, CONV_ID);
    } finally {
      await app.close();
    }
  });
});
