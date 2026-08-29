/**
 * Unit tests for links creation routes (creation.ts)
 * Tests POST /links.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((t: string) => t),
  },
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

// PROLONGER le module, jamais le REMPLACER (CLAUDE.md § « Un double PARTIEL
// d'un module perd en silence tout ce que le module GAGNE »). Ce double listait
// quatre exports à la main ; le jour où la route en a appelé un cinquième
// (`generateUniqueShareLinkId`, 2026-08-23), elle a reçu `undefined` et rendu
// 500 — la panne du cycle 91 rejouée à l'identique. Seul le générateur de
// linkId est surchargé, pour que l'identifiant reste PRÉDICTIBLE dans les
// assertions ; sa vraie loi est testée dans `link-helpers.test.ts`.
jest.mock('../../../../routes/links/utils/link-helpers', () => ({
  ...(jest.requireActual('../../../../routes/links/utils/link-helpers') as object),
  generateUniqueShareLinkId: jest.fn<any>().mockResolvedValue('mshy_TestLnk1'),
  generateConversationIdentifier: jest.fn((title: string) => `conv_${title.toLowerCase().replace(/\s/g, '_')}`),
  ensureUniqueShareLinkIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique_link'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCreationRoutes } from '../../../../routes/links/creation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'link-001';

const mockUser = { id: USER_ID, role: 'USER', username: 'alice', displayName: 'Alice' };

const mockShareLink = {
  id: LINK_ID,
  linkId: 'mshy_TestLnk1',
  name: null,
  description: null,
  expiresAt: null,
  isActive: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test Conv' }),
      create: jest.fn<any>().mockResolvedValue({ id: CONV_ID, title: 'New Conv' }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1' }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ displayName: 'Alice', username: 'alice' }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversationShareLink: {
      create: jest.fn<any>().mockResolvedValue(mockShareLink),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'registered' | 'anonymous' | 'unauthenticated';
  role?: string;
  prisma?: ReturnType<typeof makePrisma>;
  socketIOHandler?: { getManager: jest.Mock<any> } | null;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'registered', role = 'USER', prisma = makePrisma(), socketIOHandler = null } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  if (socketIOHandler) app.decorate('socketIOHandler', socketIOHandler);

  // Set _testAuthContext early (onRequest) so the mocked auth middleware can read it
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (auth === 'registered') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { ...mockUser, role },
        hasFullAccess: true,
      };
    } else if (auth === 'anonymous') {
      (req as any)._testAuthContext = {
        isAuthenticated: false,
        isAnonymous: true,
        userId: 'anon-1',
        registeredUser: null,
      };
    } else {
      (req as any)._testAuthContext = null;
    }
  });

  await registerCreationRoutes(app);
  await app.ready();
  return { app, prisma };
}

// ─── POST /links — not registered user ───────────────────────────────────────

describe('POST /links — anonymous user', () => {
  it('returns 403 when not a registered user', async () => {
    const { app } = await buildApp({ auth: 'anonymous' });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── POST /links — with conversationId ───────────────────────────────────────

describe('POST /links — not a member of conversation', () => {
  it('returns 403 when user is not a conversation member', async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /links — conversation not found', () => {
  it('returns 404 when conversation does not exist', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /links — direct conversation', () => {
  it('returns 403 for direct conversation type', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'direct', title: 'DM' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /links — global conversation without admin role', () => {
  it('returns 403 when USER tries to create global link', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    const { app } = await buildApp({ prisma, role: 'USER' });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /links — global conversation with admin role', () => {
  it('returns 201 when ADMIN creates global link', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    const { app } = await buildApp({ prisma, role: 'ADMIN' });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

// #4169 — la garde de RANG qui manquait aux DEUX portes. Le témoin qui compte
// n'est pas seulement « cette porte refuse » mais « l'AUTRE porte refuse
// aussi » : son jumeau vit dans `conversation-sharing.test.ts`
// (`POST /conversations/:id/new-link`), sur le MÊME prédicat
// (`mayMintShareLink`, `routes/links/utils/share-link-mint.ts`).
describe('POST /links — simple member on a group conversation', () => {
  it('returns 403 when a member (role: member) tries to mint a link', async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: 'part-1', role: 'member' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(403);
    expect(prisma.conversationShareLink.create).not.toHaveBeenCalled();
    await app.close();
  });
});

// #4169 critère de fin #3 — un anonyme muni du seul lien ne naît plus plus
// privilégié qu'un inscrit invité par un admin (`canViewHistory: false` par
// défaut sur `POST /conversations/:id/invite`,
// `routes/conversations/sharing.ts`). Ce témoin traverse le VRAI pipeline
// Fastify (`app.inject`, pas un appel direct au handler) : `createLinkBodySchema`
// active `useDefaults` d'AJV (server.ts ne le désactive pas), et un `default`
// de schéma de REQUÊTE matérialise la valeur AVANT que le handler ne
// s'exécute (§ CLAUDE.md « Un default dans un schéma de REQUÊTE est une
// ÉCRITURE ») — le seul type de témoin qui puisse voir ce piège.
describe('POST /links — allowViewHistory default', () => {
  it('defaults allowViewHistory to false in the created row when the body omits it', async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: 'part-1', role: 'moderator' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.conversationShareLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowViewHistory: false }) })
    );
    await app.close();
  });
});

describe('POST /links — success with existing conversation', () => {
  it('returns 201 with linkId when creating link for group conversation', async () => {
    // #4169 — `makePrisma()` par défaut ne pose aucun `role` sur la ligne
    // `Participant` : sous la garde de rang qui manquait avant ce lot, un
    // acteur sans rang lisible tombe SOUS le plancher MODERATOR (§
    // `conversation-authority.ts`, un rang illisible vaut 0). Ce test exerce
    // la MÉCANIQUE de création pour un acteur DÉJÀ autorisé — le témoin
    // négatif dédié (`role: 'member' ⇒ 403`) vit plus bas dans ce fichier.
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: 'part-1', role: 'moderator' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID, name: 'My Link' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversationId).toBe(CONV_ID);
    await app.close();
  });
});

// ─── POST /links — create new conversation ────────────────────────────────────

describe('POST /links — creates new conversation from newConversation data', () => {
  it('returns 201 when creating link with new conversation', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { newConversation: { title: 'Brand New Group' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('auto-joins the creator and members to the new conversation socket room', async () => {
    const MEMBER_ID = '507f1f77bcf86cd799439033';
    const joinUserToConversationRoom = jest.fn<any>().mockResolvedValue(undefined);
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockResolvedValue([
      { id: MEMBER_ID, displayName: 'Member', username: 'member' },
    ]);
    const { app } = await buildApp({
      prisma,
      socketIOHandler: { getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom }) },
    });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { newConversation: { title: 'Brand New Group', memberIds: [MEMBER_ID] } },
    });
    expect(res.statusCode).toBe(201);
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(USER_ID, CONV_ID);
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(MEMBER_ID, CONV_ID);
    await app.close();
  });
});

describe('POST /links — creates legacy conversation without conversationId', () => {
  it('returns 201 with auto-created conversation', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { name: 'Legacy Link', description: 'A shared chat' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

// ─── POST /links — service error ─────────────────────────────────────────────

describe('POST /links — DB error', () => {
  it('returns 500 when conversationShareLink.create throws', async () => {
    const prisma = makePrisma();
    // #4169 — atteindre l'écriture qui lève exige d'abord de franchir la
    // garde de rang (§ commentaire du témoin de succès ci-dessus).
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: 'part-1', role: 'moderator' });
    prisma.conversationShareLink.create = jest.fn<any>().mockRejectedValue(new Error('DB failure'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /links — conversation terminée ─────────────────────────────────────

/**
 * Troisième site de la famille nommée au cycle 70-bis (« garde d'ÉCRITURE sans
 * jumelle sur l'état du FIL ») : la porte contrôlait l'appartenance et le TYPE
 * de la conversation, jamais sa clôture. On pouvait donc fabriquer un lien de
 * partage NEUF sur un fil terminé — un lien actif en base, présenté comme vivant
 * par les écrans d'administration, et qui ne peut rendre que le 410 posé au
 * cycle 70 à chacun de ceux qui le suivent.
 */
describe('POST /links — conversation terminée', () => {
  it('returns 410 when the conversation is closed by closedAt', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({
      id: CONV_ID, type: 'group', title: 'Test Conv',
      isActive: true, closedAt: new Date('2026-08-18T09:00:00.000Z'),
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(410);
    expect(prisma.conversationShareLink.create).not.toHaveBeenCalled();
    await app.close();
  });

  // Les fils fermés par l'ancien `leave.ts` (avant le cycle 67) portent
  // `isActive: false` et AUCUN `closedAt`, et rien ne les rétro-remplit.
  it('returns 410 when the conversation is closed by isActive alone', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({
      id: CONV_ID, type: 'group', title: 'Test Conv',
      isActive: false, closedAt: null,
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(410);
    expect(prisma.conversationShareLink.create).not.toHaveBeenCalled();
    await app.close();
  });

  // La garde de REQUÊTE : `isConversationClosed` accepte une ligne partielle,
  // donc un `select` amputé compile et rend les deux témoins ci-dessus verts —
  // le double mocké rend ce qu'on lui dicte, `select` ou pas.
  it('asks for both terminal columns in its select', async () => {
    const { app, prisma } = await buildApp();
    await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    const select = prisma.conversation.findUnique.mock.calls[0][0]?.select;
    expect(select).toMatchObject({ isActive: true, closedAt: true });
    await app.close();
  });
});
