import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (must be hoisted before imports) ────────────────────────────

const mockResolveConversationId = jest.fn<any>();
const mockGenerateUniqueShareLinkId = jest.fn<any>().mockResolvedValue('mshy_TestLnk1');
const mockEnsureUniqueShareLinkIdentifier = jest.fn<any>().mockResolvedValue('mshy_unique');

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendConflict = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendError = jest.fn<any>((reply: any, status: any, msg: any) => {
  reply._body = { success: false, status, error: msg };
  return reply;
});

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

// PROLONGER le module, jamais le REMPLACER (CLAUDE.md § « Un double PARTIEL
// d'un module perd en silence tout ce que le module GAGNE ») : un double qui
// énumère ses exports rend `undefined` au premier que le module gagne.
//
// #4169 — la cible du double a changé de domicile. `sharing.ts` important
// jusqu'ici `routes/conversations/utils/identifier-generator` (qui ne fait
// que RÉ-EXPORTER depuis `routes/links/utils/link-helpers`), mocker ce
// premier module masquait la génération d'identifiant SEULEMENT pour ce
// chemin d'appel précis. `mintConversationShareLink`
// (`routes/links/utils/share-link-mint.ts`), désormais LA porte unique
// appelée par `new-link` ET `/links`, importe `link-helpers` DIRECTEMENT :
// mocker l'ancien re-export laissait passer le VRAI générateur, qui
// interroge `conversationShareLink.findFirst` sur un double Prisma sans
// réponse par défaut — chaque candidat semblait « pris » et l'escalade
// anti-collision finissait par lever, capturée par le `catch` générique de
// la route en `500 Error creating link`. Même cible que
// `links/creation.test.ts` désormais, pour la même raison qu'elles décrivent
// la même porte.
jest.mock('../../../routes/links/utils/link-helpers', () => ({
  ...(jest.requireActual('../../../routes/links/utils/link-helpers') as object),
  generateUniqueShareLinkId: (...args: any[]) => mockGenerateUniqueShareLinkId(...args),
  ensureUniqueShareLinkIdentifier: (...args: any[]) => mockEnsureUniqueShareLinkIdentifier(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(),
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: jest.fn<any>(),
  sendErrorResponse: jest.fn<any>(),
}));

// Gate de présence. Régime STRICT (2026-08-25) : partager une conversation
// n'ouvre plus rien — la réponse à l'inviteur montre la présence de l'invité
// selon SA propre autorisation (soi/ADMIN+/ami), via `resolveForTarget`
// (cible unique), jamais sur la seule co-participation qu'il vient de créer.
// Le service n'est doublé que sur son I/O : `lawFaithfulTargetResolver`
// applique la VRAIE loi partagée à un ensemble d'amis piloté par le test.
const mockResolveForTarget = jest.fn<any>(async () => ({ showOnline: false, showLastSeenTimestamp: false }));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: (...args: any[]) => mockResolveForTarget(...args),
  }),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationSchema: { type: 'object' },
  conversationParticipantSchema: { type: 'object' },
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceViewer, PresenceTarget } from '../../../services/PresenceVisibilityService';
import { registerSharingRoutes } from '../../../routes/conversations/sharing';

// ─── IDs ──────────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const INVITEE_ID = '507f1f77bcf86cd799439033';

const PREFS_HIDDEN = { showOnline: false, showLastSeenTimestamp: false } as const;

const lawFaithfulTargetResolver =
  (friendsOfViewer: ReadonlySet<string> = new Set()) =>
  async (viewer: PresenceViewer, target: PresenceTarget) =>
    viewer
      ? resolvePresenceVisibility({
          isSelf: viewer.userId === target.id,
          viewerRole: viewer.role,
          areConnected: friendsOfViewer.has(target.id),
          targetShowOnlineStatus: true,
          targetShowLastSeen: true,
          targetIsDeactivated: false,
          isBlockedEitherWay: false,
        })
      : PREFS_HIDDEN;
const PART_ID = '507f1f77bcf86cd799439044';
const LINK_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;
type RouteReg = { method: string; path: string; handler: RouteHandler; options: any };

function createMockFastify() {
  const routes: RouteReg[] = [];
  const authenticate = jest.fn<any>();
  const notificationService = {
    createMemberJoinedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
    // #4169 — `mintConversationShareLink` (porte unique de `/new-link` ET
    // `/links`) notifie les admins/créateur par cette méthode. Absente ici,
    // elle n'aurait pas fait tomber le chemin nominal (best-effort, capturée
    // par son propre `try/catch`) mais aurait rendu IMPOSSIBLE tout témoin de
    // parité de notification pour `new-link`.
    createSystemNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
  const mentionService = {
    invalidateCacheForConversation: jest.fn<any>().mockResolvedValue(undefined),
  };
  const prismaOnFastify = {
    conversation: { findUnique: jest.fn<any>() },
    user: { findUnique: jest.fn<any>() },
    // `findMany` sert la décision d'entrée (`resolveConversationEntry`) : elle
    // lit TOUTES les lignes de la paire (conversation, utilisateur), y compris
    // celles qu'un départ ou un bannissement a laissées inactives — que
    // `conversation.participants`, chargé avec `isActive: true`, ne peut pas
    // voir. Vide par défaut = primo-arrivant.
    participant: {
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    // L'avis d'arrivée écrit ici. Sans ce double, `postJoinSystemMessage`
    // échouait à l'intérieur de sa propre garde — il ne rejette jamais — et
    // toute la suite restait VERTE en ne prouvant rien du câblage.
    message: {
      create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'sys-1', ...data })),
    },
  };
  const joinUserToConversationRoom = jest.fn<any>().mockResolvedValue(undefined);
  const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
  const socketIOHandler = {
    getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom, broadcastMessage }),
  };
  return {
    routes,
    authenticate,
    notificationService,
    mentionService,
    socketIOHandler,
    joinUserToConversationRoom,
    broadcastMessage,
    prisma: prismaOnFastify,
    get: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    patch: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'PATCH', path, handler, options });
    }),
  };
}

function createMockPrisma() {
  return {
    conversation: {
      findUnique: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, title: 'Updated', participants: [] }),
    },
    participant: {
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
      // La branche RÉINTÉGRATION de la jointure par lien passe par `update`
      // (`REJOIN_PARTICIPANT_STATE`) et non par `create` : sans double, aucun
      // témoin ne pouvait affirmer qu'elle n'a PAS eu lieu.
      update: jest.fn<any>(),
    },
    user: {
      findUnique: jest.fn<any>(),
    },
    conversationShareLink: {
      create: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    message: {
      create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'sys-1', ...data })),
    },
  } as any;
}

function createMockReply() {
  const reply: any = {
    _body: undefined,
    status: jest.fn<any>(),
    send: jest.fn<any>((body: any) => { reply._body = body; return reply; }),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

function getRoute(fastify: ReturnType<typeof createMockFastify>, method: string, pathFragment: string) {
  const r = fastify.routes.find(r => r.method === method && r.path.includes(pathFragment));
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not found`);
  return r;
}

// `type: 'user'` est la forme RÉELLE que pose `createUnifiedAuthMiddleware`
// pour un inscrit : c'est sur elle que `viewerFromRequest` construit le viewer
// de présence.
function makeRequest(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    authContext: { type: 'user', userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER' } },
    ...overrides,
  };
}

function makeShareLink(overrides: Record<string, any> = {}) {
  return {
    id: LINK_ID,
    linkId: 'old-link-id',
    identifier: 'mshy_test',
    conversationId: CONV_ID,
    isActive: true,
    expiresAt: null,
    currentUses: 0,
    conversation: { id: CONV_ID, title: 'Test', type: 'group' },
    name: null,
    description: null,
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, any> = {}) {
  return {
    id: PART_ID,
    userId: USER_ID,
    conversationId: CONV_ID,
    role: 'member',
    displayName: 'Alice',
    isActive: true,
    user: { id: USER_ID, role: 'USER' },
    ...overrides,
  };
}

function setup() {
  const fastify = createMockFastify();
  const prisma = createMockPrisma();
  const optionalAuth = jest.fn<any>();
  const requiredAuth = jest.fn<any>();
  registerSharingRoutes(fastify as any, prisma, optionalAuth, requiredAuth);
  return { fastify, prisma, reply: createMockReply(), optionalAuth, requiredAuth };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/new-link — Create share link
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/:id/new-link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateUniqueShareLinkId.mockResolvedValue('mshy_TestLnk1');
    mockEnsureUniqueShareLinkIdentifier.mockResolvedValue('mshy_unique');
  });

  function getNewLinkRoute() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'POST', 'new-link');
    return { fastify, prisma, reply, route };
  }

  function stubSuccess(prisma: any, overrides: Record<string, any> = {}) {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test' });
    // #4169 — `makeParticipant()` par défaut porte `role: 'member'`, et un
    // simple membre n'a plus le droit de fabriquer un lien sur un `group`
    // (c'est tout le sujet de l'issue). Ce helper teste la MÉCANIQUE de
    // création (identifiants, forme de la réponse) : il fixe donc son acteur
    // au plancher exigé, MODERATOR, pour rester un témoin de succès — le
    // témoin NÉGATIF dédié (`role: 'member' ⇒ 403`) est posé séparément.
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'moderator' }));
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    prisma.conversationShareLink.create.mockResolvedValue({
      id: LINK_ID,
      name: null,
      description: null,
      maxUses: null,
      expiresAt: null,
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowViewHistory: true,
      requireNickname: true,
      requireEmail: false,
      ...overrides,
    });
  }

  // #4169 — sortait 403 « Unauthorized access » avant ce lot ; ce site était
  // aussi un ANTI-TÉMOIN une fois `user.findUnique` déplacé en tête de la
  // route (§ ci-dessus) : sans mock sur `user.findUnique`, l'exécution
  // s'arrêtait dès « User not found » et le test restait vert par une raison
  // sans rapport avec son nom (`sendForbidden` avec `expect.any(String)`
  // n'a aucun mal à matcher n'importe quel message). Désormais 404, aligné
  // sur `POST /links` : un identifiant qui ne résout à RIEN est un « je ne
  // trouve pas », pas un refus d'accès — les deux portes partagent
  // maintenant `mintConversationShareLink`, donc le MÊME verdict.
  it('returns 404 when the conversation identifier cannot be resolved', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    mockResolveConversationId.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    expect(mockSendForbidden).not.toHaveBeenCalled();
  });

  it('returns 404 when conversation not found', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    // #4169 — cette route relit le rôle de l'appelant AVANT de déléguer à la
    // porte unique (comportement inchangé) : un acteur enregistré est requis
    // pour atteindre le chemin qu'on teste ici, même si son rôle n'importe pas.
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue(null);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when user is not a member', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test' });
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when user record not found', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test' });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    prisma.user.findUnique.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 for direct conversation type', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'direct', title: 'DM' });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 for global conversation when user is not BIGBOSS', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('allows BIGBOSS to create link for global conversation', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    prisma.user.findUnique.mockResolvedValue({ role: 'BIGBOSS' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
    expect(reply._body?.data).toMatchObject({ code: 'mshy_TestLnk1' });
  });

  it('creates link with name-based identifier', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { name: 'My Group' } });
    await route.handler(req, reply);
    expect(mockEnsureUniqueShareLinkIdentifier).toHaveBeenCalledWith(
      expect.anything(),
      'mshy_my-group'
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('creates link with description-based identifier when no name', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { description: 'A public room' } });
    await route.handler(req, reply);
    expect(mockEnsureUniqueShareLinkIdentifier).toHaveBeenCalledWith(
      expect.anything(),
      'mshy_a-public-room'
    );
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  // 2026-08-23 — la route ne FABRIQUE plus d'identifiant horodaté quand elle
  // n'a ni nom ni description : elle passe une base VIDE, et le repli compact
  // et opaque est décidé par `ensureUniqueShareLinkIdentifier` (source unique).
  // L'ancien témoin gravait `mshy_link-<Date.now()>-<Math.random()>` dans la
  // route, c'est-à-dire à l'endroit exact où la règle ne doit pas vivre.
  it('passes an EMPTY base when there is neither name nor description', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockEnsureUniqueShareLinkIdentifier).toHaveBeenCalledWith(expect.anything(), '');
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('response includes shareLink details and inviteLink URL', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma, { name: 'Test Link', maxUses: 10 });
    const req = makeRequest({ params: { id: CONV_ID }, body: { name: 'Test Link', maxUses: 10 } });
    await route.handler(req, reply);
    expect(reply._body?.data).toMatchObject({
      code: 'mshy_TestLnk1',
      // `/chat/:linkId` est l'URL canonique d'un lien de partage — `/join`
      // n'est plus qu'une redirection 308 : le lien FABRIQUÉ ne doit plus
      // jamais prendre le détour.
      link: expect.stringContaining('/chat/mshy_TestLnk1'),
      shareLink: expect.objectContaining({ linkId: 'mshy_TestLnk1' }),
    });
  });

  it('handles name with special characters', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: { name: 'My Room!! 2024' } });
    await route.handler(req, reply);
    expect(mockEnsureUniqueShareLinkIdentifier).toHaveBeenCalledWith(
      expect.anything(),
      'mshy_my-room-2024'
    );
  });

  it('sends internal error on unexpected exception', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    // #4169 — même raison que le témoin précédent : atteindre l'exception
    // simulée plus bas exige de franchir d'abord la relecture du rôle.
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    mockResolveConversationId.mockRejectedValue(new Error('DB down'));
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  // ── #4169 — la garde de RANG qui manquait aux DEUX portes ──────────────────
  //
  // Avant ce lot, un simple membre d'un groupe PRIVÉ fabriquait un lien vers
  // l'historique complet sans qu'aucune ligne de ce fichier ne rougisse — la
  // suite gravait la politique OUVERTE (`stubSuccess` ci-dessus en était la
  // preuve). Le témoin qui compte n'est pas seulement « cette porte refuse »
  // mais « l'AUTRE porte refuse aussi » : son jumeau vit dans
  // `links/creation.test.ts` (`POST /links`), sur le MÊME prédicat
  // (`mayMintShareLink`).
  it('returns 403 when a simple member (role: member) tries to mint a link on a group conversation', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test' });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    expect(prisma.conversationShareLink.create).not.toHaveBeenCalled();
  });

  // Critère de fin #2 — `/links` accepte déjà BIGBOSS OU ADMIN sur `global` ;
  // `new-link` n'acceptait que BIGBOSS. Sans ce témoin, le durcissement vers
  // la porte unique aurait pu régresser silencieusement vers « BIGBOSS seul ».
  it('allows ADMIN (not just BIGBOSS) to create a link for the global conversation', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    prisma.conversation.findUnique.mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  // Critère de fin #3 — l'anonyme muni d'un lien ne naît plus plus privilégié
  // que l'inscrit invité par un admin (`canViewHistory: false` par défaut,
  // route `/invite` de ce même fichier).
  it('defaults allowViewHistory to false in the created row when the body omits it', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(prisma.conversationShareLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowViewHistory: false }) })
    );
  });

  // Critère de fin #4 — `new-link` émet désormais la MÊME notification aux
  // admins/créateur que `POST /links` (`creation.ts:329`), parce que les deux
  // portes partagent le même écrivain (`mintConversationShareLink`).
  it('notifies conversation admins, same as POST /links', async () => {
    const { fastify, prisma, reply, route } = getNewLinkRoute();
    stubSuccess(prisma);
    prisma.participant.findMany.mockResolvedValue([{ userId: 'admin-1' }, { userId: 'admin-2' }]);
    const req = makeRequest({ params: { id: CONV_ID }, body: { name: 'Team Link' } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
    expect(fastify.notificationService.createSystemNotification).toHaveBeenCalledTimes(2);
    expect(fastify.notificationService.createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: 'admin-1' })
    );
  });

  // Critère de fin #5, second tiret — la garde 410 sur les DEUX portes. Elle
  // existe déjà côté `/links` (`links/creation.test.ts`, « conversation
  // terminée ») ; `new-link` n'avait JAMAIS eu cette garde — c'était le tout
  // premier défaut listé par l'issue.
  it('returns 410 when the conversation is closed — new-link had NO such guard before this lot', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID, type: 'group', title: 'Test', isActive: true, closedAt: new Date('2026-03-01')
    });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'moderator' }));
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendError).toHaveBeenCalledWith(reply, 410, 'CONVERSATION_CLOSED', expect.anything());
    expect(prisma.conversationShareLink.create).not.toHaveBeenCalled();
  });

  // Le fil fermé par l'ancien `leave.ts` (avant le cycle 67) ne porte que
  // `isActive: false`, sans `closedAt` — `isConversationClosed` lit les DEUX
  // colonnes (`services/messaging/conversationWriteAdmission.ts`).
  it('returns 410 when the conversation is closed by isActive alone', async () => {
    const { prisma, reply, route } = getNewLinkRoute();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    prisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID, type: 'group', title: 'Test', isActive: false, closedAt: null
    });
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'moderator' }));
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    const req = makeRequest({ params: { id: CONV_ID }, body: {} });
    await route.handler(req, reply);
    expect(mockSendError).toHaveBeenCalledWith(reply, 410, 'CONVERSATION_CLOSED', expect.anything());
    expect(prisma.conversationShareLink.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /conversations/:id — Update conversation
// ─────────────────────────────────────────────────────────────────────────────

// `PATCH /conversations/:id` NE VIT PLUS DANS `sharing.ts`.
//
// Ce fichier portait trois blocs de témoins pour la route jumelle du `PUT` de
// `core.ts`. Elle a été supprimée : deux exemplaires d'un même geste avaient
// divergé, et celui-ci acceptait `title`/`description`/`type` seulement, sans
// garde de rang ni événement — le web lui postait `avatar`/`banner`, qu'il
// ignorait sous une réponse 200.
//
// Ce qui a été PORTÉ vers `conversation-update-route.test.ts`, sur les DEUX
// verbes : le gate de présence des participants (désormais en régime STRICT
// — soi/ADMIN+/ami —, préférences indépendantes comprises) — c'est ce que cet
// exemplaire-ci avait de PLUS, et le `PUT` ne l'avait jamais eu.
//
// Ce qui a été RETIRÉ avec la route, délibérément : « n'importe quel membre
// peut renommer » (la faille d'autorisation), et les quatre témoins de mutation
// de `type` (aucun client ne l'envoie, et la changer déplace les invariants
// d'admission d'écriture sans que rien ne les recalcule).

describe('GET /conversations/:conversationId/links', () => {
  beforeEach(() => jest.clearAllMocks());

  function getLinksRoute() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'GET', '/links');
    return { prisma, reply, route };
  }

  it('returns 403 when user is not a member', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(null);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('moderator sees all links (aucun filtre createdBy)', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'moderator' }));
    const mockLinks = [{ id: 'link1', currentUses: 5 }, { id: 'link2', currentUses: 2 }];
    prisma.conversationShareLink.findMany.mockResolvedValue(mockLinks);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('createdBy');
    expect(reply._body).toMatchObject({
      success: true,
      isModerator: true,
      data: [
        expect.objectContaining({ id: 'link1', participantCount: 5 }),
        expect.objectContaining({ id: 'link2', participantCount: 2 }),
      ],
    });
  });

  it('admin role also gets all links', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'admin' }));
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('createdBy');
    expect(reply._body).toMatchObject({ isModerator: true });
  });

  it('creator role also gets all links', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('createdBy');
  });

  it('regular member sees only own links (filtre createdBy applique)', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    prisma.conversationShareLink.findMany.mockResolvedValue([{ id: 'link1', currentUses: 1 }]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    // #4170 -- ce temoin assertait `creatorId`, une colonne qui N'EXISTE PAS sur
    // ConversationShareLink (le schema declare `createdBy`). Le Prisma mocke ne
    // valide aucun nom de colonne, donc le test restait VERT sur du code qui levait
    // en production et tombait dans le catch-all : 500 sur toute lecture par un
    // membre non-moderateur. Un temoin qui asserte l'IMPLEMENTATION plutot que le
    // COMPORTEMENT peut verrouiller un defaut au lieu de le prevenir.
    expect(findCall.where).toHaveProperty('createdBy', USER_ID);
    expect(reply._body).toMatchObject({ isModerator: false });
  });

  it('maps currentUses to participantCount in response', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    prisma.conversationShareLink.findMany.mockResolvedValue([{ id: 'l1', currentUses: 7 }]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(reply._body.data[0]).toMatchObject({ id: 'l1', currentUses: 7, participantCount: 7 });
  });

  it('sends internal error on unexpected exception', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockRejectedValue(new Error('DB error'));
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/join/:linkId — Join via share link
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId', () => {
  beforeEach(() => jest.clearAllMocks());

  function getJoinRoute() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'POST', 'join/:linkId');
    return { fastify, prisma, reply, route };
  }

  it('returns 401 when authContext is absent', async () => {
    const { prisma, reply, route } = getJoinRoute();
    const req = { params: { linkId: LINK_ID }, authContext: undefined };
    await route.handler(req, reply);
    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 404 when share link not found', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(null);
    const req = makeRequest({ params: { linkId: 'nonexistent' } });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 410 when share link is not active', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ isActive: false }));
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendError).toHaveBeenCalledWith(reply, 410, expect.any(String));
  });

  it('returns 410 when share link is expired', async () => {
    const { prisma, reply, route } = getJoinRoute();
    const pastDate = new Date(Date.now() - 1000);
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ expiresAt: pastDate }));
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendError).toHaveBeenCalledWith(reply, 410, expect.any(String));
  });

  it('does not expire when expiresAt is in the future', async () => {
    const { prisma, reply, route } = getJoinRoute();
    const futureDate = new Date(Date.now() + 86400000);
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ expiresAt: futureDate }));
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Alice', username: 'alice' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({ conversationId: CONV_ID }));
  });

  it('returns success when user is already a member', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findMany.mockResolvedValue([makeParticipant()]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({
      conversationId: CONV_ID,
    }));
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  // Le droit de voir l'avant-jointure est FIGÉ au join depuis le lien, comme
  // pour un anonyme (`routes/anonymous.ts`) : c'est ce que le plancher de
  // lecture (`services/historyFloor`) lit en premier.
  it('fige `canViewHistory` depuis le lien à la création de la ligne — lien fermé', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ allowViewHistory: false }));
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Bob', username: 'bob' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    await route.handler(makeRequest({ params: { linkId: LINK_ID } }), reply);
    expect(prisma.participant.create.mock.calls[0][0].data.permissions.canViewHistory).toBe(false);
  });

  it('fige `canViewHistory` depuis le lien à la création de la ligne — lien ouvert', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ allowViewHistory: true }));
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Bob', username: 'bob' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    await route.handler(makeRequest({ params: { linkId: LINK_ID } }), reply);
    expect(prisma.participant.create.mock.calls[0][0].data.permissions.canViewHistory).toBe(true);
  });

  /**
   * Le rejoin remet déjà le rôle et les droits booléens à ce que le lien donne
   * à un nouvel arrivant. `historyVisibleFrom` doit suivre : il PRIME sur ces
   * deux-là (rang 2 du plancher), donc un ancien octroi survivant les rendait
   * inopérants — la ligne périmée décidait seule de ce que le revenant lit.
   */
  it('efface l’octroi d’historique de la venue PRÉCÉDENTE quand on rejoint par lien', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink({ allowViewHistory: false }));
    prisma.participant.findMany.mockResolvedValue([
      makeParticipant({ isActive: false, bannedAt: null, joinedAt: new Date('2026-01-01T00:00:00Z') }),
    ]);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Bob', username: 'bob' });
    prisma.participant.update.mockResolvedValue({ id: PART_ID });
    prisma.conversationShareLink.update.mockResolvedValue({});

    await route.handler(makeRequest({ params: { linkId: LINK_ID } }), reply);

    expect(prisma.participant.create).not.toHaveBeenCalled();
    const written = prisma.participant.update.mock.calls[0][0];
    expect(written.where).toEqual({ id: PART_ID });
    expect(written.data.historyVisibleFrom).toBeNull();
    // Et la remise à zéro du rang/droits, qui existait déjà, n'a pas bougé.
    expect(written.data.role).toBe('member');
    expect(written.data.permissions.canViewHistory).toBe(false);
    expect(written.data.isActive).toBe(true);
  });

  it('joins successfully and increments usage counter', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Bob', username: 'bob' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    fastify.notificationService.createMemberJoinedNotification.mockResolvedValue(undefined);
    prisma.participant.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_ID },
        data: { currentUses: { increment: 1 } },
      })
    );
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({ conversationId: CONV_ID }));
  });

  it('auto-joins the joining user\'s connected sockets to the conversation room', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Bob', username: 'bob' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    prisma.participant.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(fastify.joinUserToConversationRoom).toHaveBeenCalledWith(USER_ID, CONV_ID);
  });

  it('uses username as displayName when displayName is null', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce({ displayName: null, username: 'bob' })
      .mockResolvedValueOnce(null);
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    prisma.participant.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(prisma.participant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: 'bob' }) })
    );
  });

  it('uses User as fallback displayName when both are null', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce({ displayName: null, username: null })
      .mockResolvedValueOnce(null);
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    prisma.participant.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(prisma.participant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: 'User' }) })
    );
  });

  it('notifies admins when they exist', async () => {
    const { prisma, reply, route, fastify } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce({ displayName: 'Carol', username: 'carol' })
      .mockResolvedValueOnce({ username: 'admin', displayName: 'Admin', avatar: null });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const adminParticipant = { userId: '507f1f77bcf86cd799439099' };
    prisma.participant.findMany.mockResolvedValue([adminParticipant]);
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    // La confirmation au nouvel arrivant reste unitaire (un destinataire, une
    // notification) ; les administrateurs partagent une seule diffusion, qui ne
    // bloque plus la réponse « vous avez rejoint » derrière N appels en série.
    expect(fastify.notificationService.createMemberJoinedNotification).toHaveBeenCalledTimes(1);
    expect(fastify.notificationService.createMemberJoinedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: USER_ID })
    );
    expect(fastify.notificationService.createMemberJoinedNotificationsBatch).toHaveBeenCalledTimes(1);
    expect(fastify.notificationService.createMemberJoinedNotificationsBatch).toHaveBeenCalledWith(
      [adminParticipant.userId],
      { newMemberUserId: USER_ID, conversationId: CONV_ID, joinMethod: 'via_link' }
    );
  });

  it('does not block join when notification service is absent', async () => {
    const { fastify, prisma, reply } = setup();
    (fastify as any).notificationService = undefined;
    registerSharingRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'join/:linkId');
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Dave', username: 'dave' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('does not block join when notification throws', async () => {
    const { fastify, prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.user.findUnique
      .mockResolvedValueOnce({ displayName: 'Eve', username: 'eve' })
      .mockRejectedValue(new Error('notif DB error'));
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('sends internal error on unexpected exception', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('DB down'));
    const req = makeRequest({ params: { linkId: LINK_ID } });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  // Une clôture n'éteint AUCUN lien de partage : les quatre écrivains de
  // clôture n'écrivent que sur `Conversation`. Le lien survit donc au fil, et
  // les trois validations de cette route portent toutes sur le LIEN.
  it('n\'ÉCRIT AUCUNE ligne `Participant` quand la conversation visée est close', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ conversation: { id: CONV_ID, title: 'Test', type: 'group', isActive: false, closedAt: new Date('2026-03-01') } })
    );
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Dave', username: 'dave' });
    const req = makeRequest({ params: { linkId: LINK_ID } });

    await route.handler(req, reply);

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith(reply, 410, expect.any(String));
  });

  it('refuse aussi sur `isActive: false` seul — le lien reste actif, la conversation non', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ isActive: true, conversation: { id: CONV_ID, title: 'Test', type: 'group', isActive: false, closedAt: null } })
    );
    const req = makeRequest({ params: { linkId: LINK_ID } });

    await route.handler(req, reply);

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(mockSendSuccess).not.toHaveBeenCalled();
  });

  it('ne RÉINTÈGRE pas non plus un ancien membre dans un fil terminé', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ conversation: { id: CONV_ID, title: 'Test', type: 'group', isActive: false, closedAt: new Date('2026-03-01') } })
    );
    prisma.participant.findMany.mockResolvedValue([
      { id: PART_ID, isActive: false, bannedAt: null, joinedAt: new Date('2026-01-01') },
    ]);
    const req = makeRequest({ params: { linkId: LINK_ID } });

    await route.handler(req, reply);

    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('CONTRE-ÉPREUVE — une conversation vivante laisse la jointure aboutir', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ conversation: { id: CONV_ID, title: 'Test', type: 'group', isActive: true, closedAt: null } })
    );
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Dave', username: 'dave' });
    prisma.participant.create.mockResolvedValue({});
    prisma.conversationShareLink.update.mockResolvedValue({});
    const req = makeRequest({ params: { linkId: LINK_ID } });

    await route.handler(req, reply);

    expect(prisma.participant.create).toHaveBeenCalledTimes(1);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('accepts identifier as linkId (iOS share link format)', async () => {
    const { prisma, reply, route } = getJoinRoute();
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    const req = makeRequest({ params: { linkId: 'mshy_test' } });
    await route.handler(req, reply);
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ linkId: 'mshy_test' }, { identifier: 'mshy_test' }] },
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /conversations/:id/invite — Invite user
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/:id/invite', () => {
  beforeEach(() => jest.clearAllMocks());

  function getInviteRoute() {
    const fastify = createMockFastify();
    const prisma = createMockPrisma();
    registerSharingRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'invite');
    const reply = createMockReply();
    return { fastify, prisma, reply, route };
  }

  function makeConversation(participants: any[] = []) {
    return {
      id: CONV_ID,
      title: 'Test',
      type: 'group',
      participants,
    };
  }

  function makeInviterParticipant(role = 'admin') {
    return { id: PART_ID, userId: USER_ID, role, user: { id: USER_ID, username: 'alice', role: 'USER' } };
  }

  function makeTargetUser() {
    return { id: INVITEE_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B' };
  }

  it('returns 401 when not authenticated', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: null, isAuthenticated: false, registeredUser: null },
    });
    await route.handler(req, reply);
    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 401 when registeredUser is missing', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: null },
    });
    await route.handler(req, reply);
    expect(mockSendUnauthorized).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 404 when conversation not found', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when inviter is not a member', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([]));
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when inviter is a member but without invite permission', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('member');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER' } },
    });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('allows admin member to invite', async () => {
    const { fastify, prisma, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({
      id: 'new-part',
      user: makeTargetUser(),
      userId: INVITEE_ID,
    });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  // Un membre invité après coup lit depuis son arrivée : le droit est écrit
  // EXPLICITEMENT (`false`), jamais laissé au défaut du schéma — un
  // administrateur lui ouvre l'avant par date (`historyVisibleFrom`).
  it('écrit `canViewHistory: false` sur la ligne d’un invité', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([makeInviterParticipant('admin')]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    await route.handler(makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } }), reply);
    expect(fastify.prisma.participant.create.mock.calls[0][0].data.permissions.canViewHistory).toBe(false);
  });

  it('allows creator member to invite', async () => {
    const { fastify, prisma, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('creator');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('auto-joins the invited user\'s connected sockets to the conversation room', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser(), userId: INVITEE_ID });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(fastify.joinUserToConversationRoom).toHaveBeenCalledWith(INVITEE_ID, CONV_ID);
  });

  it('allows ADMIN user role (not participant role) to invite', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('member');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'ADMIN' } },
    });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('allows BIGBOSS user role to invite', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('member');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({
      params: { id: CONV_ID },
      body: { userId: INVITEE_ID },
      authContext: { userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'BIGBOSS' } },
    });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  // ── Cycle 92 : la charge utile de l'invitation ────────────────────────────
  //
  // Cette route déclarait `membership` et envoyait `member` : fast-json-stringify
  // supprimait donc TOUT le participant, et personne ne s'en apercevait — le seul
  // client (web `invite-user-modal`) ne lit que l'enveloppe `success` et recharge
  // la liste. Le lot du cycle 91 bis (§6) refusait d'aligner les deux noms SANS
  // poser le gate dans le même commit, parce que `Participant.isOnline` et
  // `lastActiveAt` sont DÉCLARÉS par `conversationParticipantSchema` : un rang
  // brut les aurait publiés sans garde. Les deux arrivent donc ensemble, ici.
  describe('la charge utile du nouvel adhérent', () => {
    const invitedRow = (over: Record<string, unknown> = {}) => ({
      id: 'new-part',
      conversationId: CONV_ID,
      userId: INVITEE_ID,
      type: 'user',
      displayName: 'Bob',
      avatar: null,
      role: 'member',
      language: 'fr',
      isActive: true,
      isOnline: true,
      lastActiveAt: new Date('2026-08-22T09:00:00.000Z'),
      joinedAt: new Date('2026-08-22T10:00:00.000Z'),
      permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true },
      user: makeTargetUser(),
      // État privé par paire : le rang Prisma le porte, aucune surface ne le sert.
      bannedAt: null,
      leftAt: null,
      deletedForMe: null,
      nickname: 'surnom privé',
      shareLinkId: 'lnk-1',
      sessionTokenHash: null,
      ...over,
    });

    async function invite(row: Record<string, unknown>, viewerRole: string = 'USER') {
      const { fastify, reply, route } = getInviteRoute();
      fastify.prisma.conversation.findUnique.mockResolvedValue(
        makeConversation([makeInviterParticipant('admin')]),
      );
      fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
      fastify.prisma.participant.create.mockResolvedValue(row);
      const req = makeRequest({
        params: { id: CONV_ID },
        body: { userId: INVITEE_ID },
        authContext: { type: 'user', userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: viewerRole } },
      });
      await route.handler(req, reply);
      return mockSendSuccess.mock.calls.at(-1)?.[1];
    }

    it('sert le participant sous la clé que le schéma déclare', async () => {
      mockResolveForTarget.mockResolvedValue({ showOnline: true, showLastSeenTimestamp: true });

      const payload = await invite(invitedRow());

      expect(payload.participant).toBeDefined();
      expect(payload.participant.participantId).toBe('new-part');
      expect(payload.participant.userId).toBe(INVITEE_ID);
    });

    it('sépare le rang de conversation du rôle global', async () => {
      mockResolveForTarget.mockResolvedValue({ showOnline: true, showLastSeenTimestamp: true });

      const payload = await invite(invitedRow());

      expect(payload.participant.conversationRole).toBe('member');
      expect(payload.participant.role).toBe('USER');
    });

    it('masque la présence quand l\'invité refuse de montrer son statut', async () => {
      mockResolveForTarget.mockResolvedValue({ showOnline: false, showLastSeenTimestamp: false });

      const payload = await invite(invitedRow());

      expect(payload.participant.isOnline).toBe(false);
      expect(payload.participant.lastActiveAt).toBeNull();
    });

    // La porte : le viewer DEMANDEUR — identité ET rôle — atteint le service,
    // avec l'invité pour cible. Sans le rôle, ADMIN et USER seraient
    // indiscernables ; sans l'identité, l'amitié le serait.
    it('consulte le gate sur l\'invité, pour l\'inviteur (identité + rôle)', async () => {
      mockResolveForTarget.mockResolvedValue({ showOnline: true, showLastSeenTimestamp: true });

      await invite(invitedRow());

      expect(mockResolveForTarget).toHaveBeenCalledWith(
        { userId: USER_ID, role: 'USER' },
        { id: INVITEE_ID, deactivatedAt: null },
      );
    });

    // Régime STRICT : l'invitation crée une co-participation, et une
    // co-participation n'est pas une relation — la présence de l'invité suit
    // l'autorisation PROPRE de l'inviteur.
    it('invité ami accepté ⇒ présence servie', async () => {
      mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver(new Set([INVITEE_ID])));

      const payload = await invite(invitedRow());

      expect(payload.participant.isOnline).toBe(true);
      expect(payload.participant.lastActiveAt).toEqual(new Date('2026-08-22T09:00:00.000Z'));
    });

    it('invité NON ami ⇒ isOnline false et lastActiveAt null, malgré la co-participation créée', async () => {
      mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver());

      const payload = await invite(invitedRow());

      expect(payload.participant.isOnline).toBe(false);
      expect(payload.participant.lastActiveAt).toBeNull();
    });

    it('inviteur ADMIN non ami ⇒ présence servie', async () => {
      mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver());

      const payload = await invite(invitedRow(), 'ADMIN');

      expect(payload.participant.isOnline).toBe(true);
      expect(payload.participant.lastActiveAt).toEqual(new Date('2026-08-22T09:00:00.000Z'));
    });

    it('inviteur MODERATOR non ami ⇒ cachée, comme un utilisateur ordinaire', async () => {
      mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver());

      const payload = await invite(invitedRow(), 'MODERATOR');

      expect(payload.participant.isOnline).toBe(false);
      expect(payload.participant.lastActiveAt).toBeNull();
    });

    it('ne recopie pas l\'état privé par paire du rang Prisma', async () => {
      mockResolveForTarget.mockResolvedValue({ showOnline: true, showLastSeenTimestamp: true });

      const payload = await invite(invitedRow());

      expect(payload.participant).not.toHaveProperty('nickname');
      expect(payload.participant).not.toHaveProperty('shareLinkId');
      expect(payload.participant).not.toHaveProperty('bannedAt');
      expect(payload.participant).not.toHaveProperty('deletedForMe');
    });
  });

  it('returns 404 when user to invite not found', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(null);
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 400 when user is already a member', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    const existingMember = { id: 'existing', userId: INVITEE_ID, role: 'member', isActive: true, bannedAt: null, user: { id: INVITEE_ID, username: 'bob', role: 'USER' } };
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter, existingMember]));
    fastify.prisma.participant.findMany.mockResolvedValue([existingMember]);
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendBadRequest).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('sends notification after successful invite', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce({ username: 'alice', displayName: 'Alice', avatar: null });
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(fastify.notificationService.createConversationInviteNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        invitedUserId: INVITEE_ID,
        inviterId: USER_ID,
        conversationId: CONV_ID,
      })
    );
  });

  it('does not block invite when notification service is absent', async () => {
    const fastify = createMockFastify();
    (fastify as any).notificationService = undefined;
    const prisma = createMockPrisma();
    registerSharingRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'invite');
    const reply = createMockReply();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('does not block invite when notification throws', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockRejectedValue(new Error('notif error'));
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('does not block invite when mention cache invalidation throws', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    fastify.mentionService.invalidateCacheForConversation.mockRejectedValue(new Error('cache error'));
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('invalidates mention cache after invite', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(fastify.mentionService.invalidateCacheForConversation).toHaveBeenCalledWith(CONV_ID);
  });

  it('does not block invite when mention service is absent', async () => {
    const fastify = createMockFastify();
    (fastify as any).mentionService = undefined;
    const prisma = createMockPrisma();
    registerSharingRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'invite');
    const reply = createMockReply();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('sends internal error on unexpected exception', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockRejectedValue(new Error('DB crash'));
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('response includes new member and confirmation message', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    const targetUser = makeTargetUser();
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', user: targetUser });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    // Ce témoin assertait `member` — le nom que le HANDLER employait, et que le
    // schéma de réponse supprimait. Il était vert parce qu'il mocke `sendSuccess`
    // et ne traverse donc jamais le sérialiseur : il attestait une clé que le
    // client n'a jamais reçue. Repointé sur la clé DÉCLARÉE.
    expect(reply._body?.data).toMatchObject({
      participant: expect.objectContaining({ participantId: 'new-part' }),
      message: expect.stringContaining('Bob'),
    });
  });

  it('uses username in message when displayName is null', async () => {
    const { fastify, reply, route } = getInviteRoute();
    const inviter = makeInviterParticipant('admin');
    fastify.prisma.conversation.findUnique.mockResolvedValue(makeConversation([inviter]));
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce({ id: INVITEE_ID, username: 'charlie', displayName: null, firstName: null, lastName: null })
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'np', user: { displayName: null, username: 'charlie' } });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });
    await route.handler(req, reply);
    expect(reply._body?.data?.message).toContain('charlie');
  });

  // Le rang de l'inviteur SURVIT à la clôture — fermer une conversation
  // n'écrit sur AUCUNE ligne `Participant`. L'autorisation seule ne pouvait donc
  // pas fermer cette porte.
  it('n\'ÉCRIT AUCUNE ligne `Participant` quand la conversation est close, même pour un créateur', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockResolvedValue({
      ...makeConversation([makeInviterParticipant('creator')]),
      isActive: false,
      closedAt: new Date('2026-03-01'),
    });
    fastify.prisma.user.findUnique.mockResolvedValue(makeTargetUser());
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });

    await route.handler(req, reply);

    expect(fastify.prisma.participant.create).not.toHaveBeenCalled();
    expect(fastify.prisma.participant.update).not.toHaveBeenCalled();
    expect(mockSendError).toHaveBeenCalledWith(reply, 410, expect.any(String));
  });

  it('CONTRE-ÉPREUVE — une conversation vivante laisse l\'invitation aboutir', async () => {
    const { fastify, reply, route } = getInviteRoute();
    fastify.prisma.conversation.findUnique.mockResolvedValue({
      ...makeConversation([makeInviterParticipant('admin')]),
      isActive: true,
      closedAt: null,
    });
    fastify.prisma.user.findUnique
      .mockResolvedValueOnce(makeTargetUser())
      .mockResolvedValueOnce(null);
    fastify.prisma.participant.create.mockResolvedValue({ id: 'np', user: makeTargetUser() });
    const req = makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } });

    await route.handler(req, reply);

    expect(fastify.prisma.participant.create).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Avis d'arrivée — les quatre portes disent la même chose
//
// Trois routes font entrer un INSCRIT dans une conversation, et aucune ne le
// disait au fil : les présents découvraient l'arrivant à son premier message.
// La porte anonyme portait le même silence, avec un enjeu de plus — rien
// n'indiquait que le visiteur n'a pas de compte.
//
// Ces témoins portent sur l'ÉCRITURE (`prisma.message.create`), jamais sur la
// réponse HTTP : `postJoinSystemMessage` ne rejette jamais, donc un câblage
// absent laisserait toute réponse inchangée. Le double `prisma.message` ajouté
// à `createMockPrisma` existe pour ça — sans lui, le service échouait dans sa
// propre garde et la suite restait verte en ne prouvant rien.
// ─────────────────────────────────────────────────────────────────────────────

describe('Avis d’arrivée — POST /conversations/join/:linkId', () => {
  beforeEach(() => jest.clearAllMocks());

  function joinSetup() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'POST', 'join/:linkId');
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findFirst.mockResolvedValue(null);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ displayName: 'Bob', username: 'bob' });
    prisma.participant.create.mockResolvedValue({ id: 'new-participant' });
    prisma.conversationShareLink.update.mockResolvedValue({});
    return { fastify, prisma, reply, route };
  }

  it('annonce l’arrivée de l’inscrit dans le fil', async () => {
    const { prisma, reply, route } = joinSetup();

    await route.handler(makeRequest({ params: { linkId: LINK_ID } }), reply);

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.message.create.mock.calls[0][0] as any;
    expect(data).toMatchObject({
      conversationId: CONV_ID,
      senderId: 'new-participant',
      messageType: 'system',
    });
  });

  it('dit que l’arrivant A un compte, et qu’il est entré par un lien', async () => {
    const { prisma, reply, route } = joinSetup();

    await route.handler(makeRequest({ params: { linkId: LINK_ID } }), reply);

    const { data } = prisma.message.create.mock.calls[0][0] as any;
    expect(data.metadata).toMatchObject({
      kind: 'member-joined',
      displayName: 'Bob',
      isAnonymous: false,
      viaShareLink: true,
    });
  });

  it('n’annonce rien quand la personne était DÉJÀ membre — personne n’est entré', async () => {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'POST', 'join/:linkId');
    prisma.conversationShareLink.findFirst.mockResolvedValue(makeShareLink());
    prisma.participant.findMany.mockResolvedValue([makeParticipant()]);

    await route.handler(makeRequest({ params: { linkId: LINK_ID } }), reply);

    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('n’annonce rien quand le lien est refusé', async () => {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'POST', 'join/:linkId');
    prisma.conversationShareLink.findFirst.mockResolvedValue(null);

    await route.handler(makeRequest({ params: { linkId: 'nonexistent' } }), reply);

    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('l’entrée reste acquise si l’avis ne peut pas s’écrire', async () => {
    const { prisma, reply, route } = joinSetup();
    prisma.message.create.mockRejectedValue(new Error('mongo down'));

    await route.handler(makeRequest({ params: { linkId: LINK_ID } }), reply);

    expect(mockSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({ conversationId: CONV_ID }));
  });
});

describe('POST /conversations/:id/invite — profil de l invité', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ne charge pas la présence brute de l invité', async () => {
    const { fastify, reply } = setup();
    const route = getRoute(fastify, 'POST', '/invite');
    fastify.prisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      title: 'Test',
      type: 'group',
      participants: [{ id: PART_ID, userId: USER_ID, role: 'admin', user: { id: USER_ID, username: 'alice', role: 'USER' } }],
    });
    fastify.prisma.user.findUnique.mockResolvedValue({
      id: INVITEE_ID, username: 'bob', displayName: 'Bob', firstName: 'Bob', lastName: 'B',
    });
    fastify.prisma.participant.create.mockResolvedValue({ id: 'new-part', userId: INVITEE_ID, user: { id: INVITEE_ID } });

    await route.handler(makeRequest({ params: { id: CONV_ID }, body: { userId: INVITEE_ID } }), reply);

    const include = fastify.prisma.participant.create.mock.calls[0][0].include;
    expect(include.user.select.isOnline).toBeUndefined();
  });
});
