/**
 * Témoin — le lien public LIT la loi de présence, il ne la recompose pas.
 *
 * `GET /links/:identifier` gatait la présence de ses participants anonymes par
 * `!!viewer && isGlobalAdmin(viewer.role)` : un prédicat de RÔLE écrit sur
 * place, à côté d'un ternaire par champ. Le verdict était juste — il n'y a pas
 * d'amitié possible avec un participant SANS COMPTE, donc seul le bypass
 * ADMIN/BIGBOSS s'applique — mais il était REDÉRIVÉ, quand la directive du
 * 2026-08-25 tient qu'« aucun site de service ne réécrit la boucle
 * amitié/rôle ». Une cible que le résolveur ne sait pas résoudre a déjà son
 * verdict dans la loi : `presenceMissingEntryPolicy(viewer)`
 * (`routes/users/presence-gate.ts`), et sa projection est
 * `applyPresenceVisibilityAsOffline(..., { onMissingEntry })`.
 *
 * Ce que ce témoin garde, c'est la CONSULTATION — le seul écart observable, la
 * loi et la copie rendant aujourd'hui le même verdict sur les cinq rangs. Le
 * jour où la loi bouge (un rang qui gagne ou perd le bypass, une cible
 * désactivée, un blocage), ce site suit sans qu'on y pense ; la copie, elle, ne
 * suivait pas et rien ne l'aurait dit.
 *
 * La loi RÉELLE tourne sous l'espion (`requireActual`) : les assertions de
 * VALEUR ci-dessous restent donc des assertions de comportement, non de
 * câblage — le témoin de charge complet vit dans `links-retrieval.test.ts`
 * (§ « présence des participants anonymes »).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

const mockPresenceMissingEntryPolicy = jest.fn<any>();

// L'espion ENVELOPPE la loi, il ne la remplace pas : un double rendrait le
// témoin de valeur vacant (il n'attesterait plus que du double).
jest.mock('../../../../routes/users/presence-gate', () => {
  const actual = jest.requireActual('../../../../routes/users/presence-gate') as Record<string, unknown>;
  const real = actual.presenceMissingEntryPolicy as (viewer: unknown) => 'hide' | 'reveal';
  return {
    ...actual,
    presenceMissingEntryPolicy: (viewer: unknown) => {
      const verdict = real(viewer);
      mockPresenceMissingEntryPolicy(viewer, verdict);
      return verdict;
    },
  };
});

const ANONYMOUS_LAST_ACTIVE_AT = new Date('2026-08-20T12:34:56.000Z');
const ANONYMOUS_JOINED_AT = new Date('2026-08-01T10:00:00.000Z');

const mockFindShareLinkByIdentifier = jest.fn<any>();
const mockCountOnlineAnonymousParticipants = jest.fn<any>().mockResolvedValue(1);

jest.mock('../../../../routes/links/utils/prisma-queries', () => ({
  findShareLinkByIdentifier: (...args: any[]) => mockFindShareLinkByIdentifier(...args),
  getConversationMessages: jest.fn<any>().mockResolvedValue([]),
  countConversationMessages: jest.fn<any>().mockResolvedValue(0),
  findActiveUserParticipant: jest.fn<any>().mockResolvedValue(null),
  findLinkMembers: jest.fn<any>().mockResolvedValue([]),
  findLinkAnonymousParticipants: jest.fn<any>().mockResolvedValue([
    {
      id: 'part-anon',
      displayName: 'Guest One',
      avatar: null,
      language: 'es',
      isOnline: true,
      lastActiveAt: ANONYMOUS_LAST_ACTIVE_AT,
      joinedAt: ANONYMOUS_JOINED_AT,
      permissions: { canSendMessages: true, canSendFiles: false, canSendImages: true },
      anonymousSession: { profile: { firstName: 'Guest', lastName: 'One', username: 'guest' } },
    },
  ]),
  countLinkParticipantsByType: jest.fn<any>().mockResolvedValue({ totalMembers: 0, totalAnonymousParticipants: 1 }),
  countOnlineAnonymousParticipants: (...args: any[]) => mockCountOnlineAnonymousParticipants(...args),
}));

jest.mock('../../../../services/historyFloor', () => {
  const actual = jest.requireActual('../../../../services/historyFloor') as object;
  return { ...actual, loadReaderHistoryFloor: jest.fn<any>().mockResolvedValue(null) };
});

jest.mock('../../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithUnifiedSender: jest.fn((m: any) => m),
}));

jest.mock('../../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: jest.fn((req: any) => {
    const ctx = req.authContext;
    if (ctx?.registeredUser) {
      return { isAuthenticated: true, isAnonymous: false, user: ctx.registeredUser, anonymousParticipant: null };
    }
    return { isAuthenticated: false, isAnonymous: false, user: null, anonymousParticipant: null };
  }),
  generateInitialLinkId: jest.fn(() => 'mshy_initial_abc123'),
  generateConversationIdentifier: jest.fn((t: string) => `conv_${t}`),
  generateFinalLinkId: jest.fn((id: string) => `mshy_final_${id}`),
  ensureUniqueShareLinkIdentifier: jest.fn().mockResolvedValue('mshy_unique_link'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRetrievalRoutes } from '../../../../routes/links/retrieval';

const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';

const shareLink = () => ({
  id: 'link-001',
  linkId: LINK_ID,
  conversationId: CONV_ID,
  name: 'Test Link',
  description: null,
  isActive: true,
  allowViewHistory: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: false,
  requireAccount: false,
  requireEmail: false,
  requireNickname: false,
  requireBirthday: false,
  expiresAt: null,
  conversation: {
    id: CONV_ID,
    identifier: 'test-conv',
    title: 'Test Conversation',
    description: null,
    type: 'group',
    createdAt: new Date('2024-01-01'),
    participants: [],
  },
});

async function callAs(role: string | null): Promise<{ body: any }> {
  mockFindShareLinkByIdentifier.mockResolvedValue(shareLink());

  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as any);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as any)._testAuthContext = role
      ? {
          type: 'user',
          isAuthenticated: true,
          isAnonymous: false,
          userId: `${role.toLowerCase()}-id`,
          registeredUser: { id: `${role.toLowerCase()}-id`, role, username: 'x', firstName: 'X', lastName: 'Y', systemLanguage: 'fr' },
        }
      : { isAuthenticated: false, isAnonymous: false, userId: null, registeredUser: null };
  });

  await registerRetrievalRoutes(app);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
  expect(res.statusCode).toBe(200);
  await app.close();
  return { body: res.json().data };
}

describe('GET /links/:identifier — la présence des participants anonymes passe par la loi', () => {
  beforeEach(() => {
    mockPresenceMissingEntryPolicy.mockClear();
    mockCountOnlineAnonymousParticipants.mockClear();
  });

  it.each([
    ['ADMIN', 'reveal'],
    ['BIGBOSS', 'reveal'],
    ['MODERATOR', 'hide'],
    ['USER', 'hide'],
  ])('consulte `presenceMissingEntryPolicy` avec le viewer %s résolu ⇒ %s', async (role, verdict) => {
    await callAs(role);

    expect(mockPresenceMissingEntryPolicy).toHaveBeenCalled();
    expect(mockPresenceMissingEntryPolicy).toHaveBeenCalledWith(
      { userId: `${role.toLowerCase()}-id`, role },
      verdict,
    );
  });

  it('consulte la loi avec `null` pour un visiteur sans compte ⇒ hide', async () => {
    await callAs(null);

    expect(mockPresenceMissingEntryPolicy).toHaveBeenCalledWith(null, 'hide');
  });

  // Non-vacuité : la loi RÉELLE tourne sous l'espion, donc ces valeurs
  // attestent le comportement, pas le câblage. Sans elles, un site qui
  // APPELLERAIT la loi puis l'ignorerait resterait vert.
  it('sert la présence réelle au viewer que la loi révèle', async () => {
    const { body } = await callAs('ADMIN');

    expect(body.anonymousParticipants[0].isOnline).toBe(true);
    expect(body.anonymousParticipants[0].lastActiveAt).toBe(ANONYMOUS_LAST_ACTIVE_AT.toISOString());
    expect(body.stats.onlineAnonymousParticipants).toBe(1);
  });

  it('masque `isOnline` ET `lastActiveAt` au viewer que la loi cache, agrégat compris', async () => {
    const { body } = await callAs('MODERATOR');

    expect(body.anonymousParticipants[0].isOnline).toBe(false);
    expect(body.anonymousParticipants[0].lastActiveAt).toBeNull();
    expect(body.stats.onlineAnonymousParticipants).toBe(0);
    expect(mockCountOnlineAnonymousParticipants).not.toHaveBeenCalled();
  });

  // Ce que le gate ne touche PAS : la date d'ARRIVÉE n'est pas une dernière
  // activité, et elle reste servie sous son propre nom.
  it('laisse `joinedAt` intact pour un viewer masqué', async () => {
    const { body } = await callAs('USER');

    expect(body.anonymousParticipants[0].joinedAt).toBe(ANONYMOUS_JOINED_AT.toISOString());
    expect(body.anonymousParticipants[0].username).toBe('guest');
  });
});
