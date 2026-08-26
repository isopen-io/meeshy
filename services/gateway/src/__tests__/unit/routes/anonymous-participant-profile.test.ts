/**
 * Un visiteur sans compte a une IDENTITÉ, et elle doit être consultable.
 *
 * Il a rempli un formulaire pour entrer — prénom, nom, parfois email et date de
 * naissance quand le lien les exigeait — et rien de tout cela n'était lisible
 * nulle part. Les autres membres ne voyaient qu'un pseudo, alors que la personne
 * avait explicitement fourni de quoi se présenter. Un participant sans fiche est
 * un participant qu'on ne peut ni reconnaître, ni modérer, ni accueillir.
 *
 * DEUX CERCLES, et la distinction est le cœur de cette route :
 *
 *   - l'IDENTITÉ (nom, pseudo, langue, date d'arrivée, lien emprunté) est
 *     visible de tout membre — c'est ce que la personne montre en entrant ;
 *   - les COORDONNÉES (email, date de naissance) ne le sont pas. Elles n'ont
 *     été demandées que parce que l'HÔTE a coché `requireEmail` /
 *     `requireBirthday` sur son lien : elles lui reviennent, à lui et à ses
 *     modérateurs, pas à la salle — laquelle contient d'autres visiteurs
 *     anonymes entrés par le même lien public.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const mockCanAccess = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: unknown[]) => mockCanAccess(...args),
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
  invalidateConversationIdCache: jest.fn(),
}));

// Gate de présence — régime STRICT (2026-08-25). La fiche servait `isOnline`
// et `lastActiveAt` BRUTS, sans aucune gate : un co-membre qui n'est ni ami ni
// ADMIN+ apprenait la dernière connexion de n'importe quel membre inscrit rien
// qu'en ouvrant sa fiche. Le service n'est doublé que sur son I/O :
// `lawFaithfulTargetResolver` applique la VRAIE loi partagée à un ensemble
// d'amis piloté par le test — chaque témoin rougit si la route cesse de
// transmettre le viewer, ou sert de nouveau le rang brut.
const mockResolveForTarget = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: (...args: unknown[]) => mockResolveForTarget(...args),
  }),
}));

import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceViewer, PresenceTarget } from '../../../services/PresenceVisibilityService';
import { registerParticipantsRoutes } from '../../../routes/conversations/participants';

const CONV_ID = '507f1f77bcf86cd799439022';
const VIEWER_ID = '507f1f77bcf86cd799439001';
const ANON_ID = '507f1f77bcf86cd799439033';
const REGISTERED_ID = '507f1f77bcf86cd799439044';

const joinPermissions = {
  canSendMessages: true,
  canSendFiles: false,
  canSendImages: true,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
};

/**
 * Relative, et non datée en dur.
 *
 * Cette route-ci RECOPIE `expiresAt` sans jamais le comparer à l'heure
 * courante : une date figée n'y ferait donc tomber aucun témoin. Mais un montage
 * daté en dur ne dit pas de lui-même s'il est comparé quelque part, et le dépôt
 * vient de perdre une CI sur exactement ce motif — une échéance atteinte pour de
 * vrai, sans commit fautif, donc introuvable par bissection.
 *
 * Le repère est donc relatif par défaut : ce qui ne peut pas expirer n'a pas
 * besoin qu'on vérifie s'il expire.
 */
const A_YEAR_AHEAD = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const shareLinkRow = {
  id: 'link-1',
  name: 'Invitation publique',
  isActive: true,
  allowViewHistory: false,
  expiresAt: A_YEAR_AHEAD,
  maxUses: 50,
  currentUses: 12,
  requireNickname: true,
  requireEmail: true,
  requireBirthday: false,
  allowedCountries: ['FR', 'BE'],
  allowedLanguages: ['fr'],
  allowedIpRanges: ['10.0.0.0/8'],
};

const anonymousRow = {
  id: ANON_ID,
  conversationId: CONV_ID,
  type: 'anonymous',
  userId: null,
  displayName: 'ano_bob_sm123',
  avatar: null,
  language: 'fr',
  role: 'member',
  isActive: true,
  isOnline: true,
  lastActiveAt: new Date('2026-08-18T10:00:00Z'),
  joinedAt: new Date('2026-08-18T09:00:00Z'),
  permissions: joinPermissions,
  anonymousSession: {
    shareLinkId: 'link-1',
    session: { country: 'FR', connectedAt: new Date('2026-08-18T09:00:00Z') },
    profile: {
      firstName: 'Bob',
      lastName: 'Smith',
      username: 'ano_bob_sm123',
      email: 'bob@example.com',
      birthday: new Date('1990-05-02T00:00:00Z'),
    },
  },
  user: null,
};

const registeredRow = {
  id: REGISTERED_ID,
  conversationId: CONV_ID,
  type: 'user',
  userId: '507f1f77bcf86cd799439055',
  displayName: 'Alice',
  avatar: null,
  language: 'fr',
  role: 'member',
  isActive: true,
  isOnline: true,
  lastActiveAt: new Date('2026-08-18T10:00:00Z'),
  joinedAt: new Date('2026-08-18T09:00:00Z'),
  permissions: joinPermissions,
  anonymousSession: null,
  user: { id: '507f1f77bcf86cd799439055', username: 'alice', displayName: 'Alice' },
};

const PRESENCE_HIDDEN = { showOnline: false, showLastSeenTimestamp: false } as const;

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
      : PRESENCE_HIDDEN;

type Ctx = ReturnType<typeof setup>;

function setup(viewerRole: string = 'member', targetRow: any = anonymousRow) {
  const routes: { method: string; path: string; handler: any }[] = [];
  const register = (method: string) =>
    jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method, path, handler: handler ?? options.handler ?? options });
    });

  const prisma = {
    participant: {
      findFirst: jest.fn<any>(async ({ where }: any) => {
        if (where?.id === targetRow.id) return targetRow;
        if (where?.userId === VIEWER_ID) return { id: 'viewer-row', role: viewerRole, type: 'user' };
        return null;
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(shareLinkRow),
    },
    message: { create: jest.fn<any>().mockResolvedValue({ id: 'sys' }) },
    conversation: { findUnique: jest.fn<any>() },
    user: { findUnique: jest.fn<any>(), findFirst: jest.fn<any>() },
  };

  const fastify = {
    get: register('GET'),
    post: register('POST'),
    patch: register('PATCH'),
    delete: register('DELETE'),
    put: register('PUT'),
    prisma,
    socketIOHandler: undefined,
  } as any;

  registerParticipantsRoutes(fastify, prisma as never, jest.fn(), jest.fn());

  const reply: any = { _body: undefined, _status: 200 };
  reply.status = jest.fn((code: number) => { reply._status = code; return reply; });
  reply.send = jest.fn((body: any) => { reply._body = body; return reply; });

  return { routes, prisma, reply };
}

function routeFor(ctx: Ctx, fragment: string) {
  const found = ctx.routes.find((r) => r.method === 'GET' && r.path.includes(fragment));
  if (!found) throw new Error(`route *${fragment}* absente`);
  return found;
}

// `type: 'user'` est la forme RÉELLE que pose `createUnifiedAuthMiddleware`
// pour un inscrit : c'est sur elle que `viewerFromRequest` construit le viewer
// de présence. Un visiteur de lien partagé porte `type: 'anonymous'` et un
// `Participant.id` — jamais de rôle plateforme.
type PresenceViewerShape = { role: string } | 'anonymous';

const viewerAuthContext = (viewer: PresenceViewerShape) =>
  viewer === 'anonymous'
    ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'viewer-anon-part', participantId: 'viewer-anon-part', registeredUser: null }
    : { type: 'user', isAuthenticated: true, isAnonymous: false, userId: VIEWER_ID, registeredUser: { id: VIEWER_ID, role: viewer.role } };

async function fetchProfile(ctx: Ctx, participantId: string = ANON_ID, viewer: PresenceViewerShape = { role: 'USER' }) {
  const route = routeFor(ctx, 'participants/:participantId/profile');
  await route.handler(
    {
      params: { id: CONV_ID, participantId },
      authContext: viewerAuthContext(viewer),
    },
    ctx.reply
  );
  return ctx.reply._body?.data;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanAccess.mockResolvedValue(true);
  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver());
});

describe('GET /conversations/:id/participants/:participantId/profile — identité', () => {
  it('rend ce que le visiteur a montré en entrant', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data).toMatchObject({
      participantId: ANON_ID,
      isAnonymous: true,
      username: 'ano_bob_sm123',
      firstName: 'Bob',
      lastName: 'Smith',
      language: 'fr',
    });
  });

  it('date son arrivée et nomme le lien emprunté', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.joinedAt).toBeTruthy();
    expect(data.shareLinkName).toBe('Invitation publique');
  });

  it('refuse à qui n’est pas membre de la conversation', async () => {
    mockCanAccess.mockResolvedValue(false);
    const ctx = setup('member');

    await fetchProfile(ctx);

    expect(ctx.reply._status).toBe(403);
  });
});

describe('GET …/profile — les coordonnées ne sont pas publiques', () => {
  it('les cache à un membre ordinaire — la salle contient d’autres visiteurs', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.email).toBeNull();
    expect(data.birthday).toBeNull();
  });

  it('les rend à un modérateur — c’est l’hôte qui les a exigées', async () => {
    const data = await fetchProfile(setup('moderator'));

    expect(data.email).toBe('bob@example.com');
    expect(data.birthday).toBeTruthy();
  });

  it('les rend à un administrateur de la conversation', async () => {
    const data = await fetchProfile(setup('admin'));

    expect(data.email).toBe('bob@example.com');
  });

  // Le membre ordinaire doit SAVOIR que des coordonnées existent sans les
  // lire : sans ce drapeau, sa vue et celle d'un visiteur qui n'en a fourni
  // aucune sont identiques, et l'hôte ne peut pas distinguer les deux.
  it('dit qu’il en existe, sans les livrer', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.hasEmail).toBe(true);
    expect(data.hasBirthday).toBe(true);
  });
});

/**
 * Les CAPACITÉS relèvent du premier cercle : savoir qu'un visiteur ne peut pas
 * joindre de fichier explique son silence, et cette explication n'appartient pas
 * qu'à l'hôte. Elles disent ce qui s'applique RÉELLEMENT à la personne — soit la
 * résolution `rights ?? permissions`, jamais la configuration courante du lien,
 * dont l'hôte a pu changer depuis l'arrivée.
 */
describe('GET …/profile — ce que le visiteur peut faire', () => {
  it('rend les capacités à un membre ordinaire', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.entryCapabilities).toMatchObject({
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: true,
    });
  });

  it('reflète la surcharge posée sur ce participant, pas l’instantané du join', async () => {
    const overridden = {
      ...anonymousRow,
      anonymousSession: { ...anonymousRow.anonymousSession, rights: { canSendFiles: true } },
    };

    const data = await fetchProfile(setup('member', overridden));

    expect(data.entryCapabilities.canSendFiles).toBe(true);
    expect(data.entryCapabilities.canSendImages).toBe(true);
  });

  it('énonce l’accès à l’historique', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.entryCapabilities.canViewHistory).toBe(false);
  });

  it('n’en énonce aucune pour un participant qui a un compte', async () => {
    const data = await fetchProfile(setup('member', registeredRow), REGISTERED_ID);

    expect(data.isAnonymous).toBe(false);
    expect(data.entryCapabilities).toBeNull();
  });
});

/**
 * Les RÉGLAGES DU LIEN relèvent du second cercle, pour la raison qui vaut déjà
 * pour l'email : la salle contient d'autres visiteurs venus par ce même lien.
 * Leur montrer ses quotas, sa date d'expiration et ses conditions d'entrée
 * reviendrait à publier la configuration de l'hôte à ceux qu'elle filtre.
 */
describe('GET …/profile — les réglages du lien', () => {
  it('les cache à un membre ordinaire', async () => {
    const data = await fetchProfile(setup('member'));

    expect(data.entryLink).toBeNull();
  });

  it('les rend à un modérateur', async () => {
    const data = await fetchProfile(setup('moderator'));

    expect(data.entryLink).toMatchObject({
      name: 'Invitation publique',
      isActive: true,
      maxUses: 50,
      currentUses: 12,
      requireEmail: true,
      requireBirthday: false,
      allowedCountries: ['FR', 'BE'],
    });
  });

  // Une plage IP est une règle de pare-feu, pas un renseignement sur quelqu'un.
  // Aucune surface ne l'affiche, et l'exposer ferait fuiter la topologie d'accès
  // de l'hôte pour zéro usage produit.
  it('n’expose jamais les plages IP, même à un administrateur', async () => {
    const data = await fetchProfile(setup('admin'));

    expect(data.entryLink).not.toHaveProperty('allowedIpRanges');
  });

  it('n’en rend aucun pour un participant qui a un compte', async () => {
    const data = await fetchProfile(setup('admin', registeredRow), REGISTERED_ID);

    expect(data.entryLink).toBeNull();
  });
});

/**
 * Un avis d'arrivée reste dans le fil POUR TOUJOURS, y compris des mois après
 * que la personne est partie. Il porte son `participantId`, donc il peut mener
 * à sa fiche — mais la fiche, elle, ne sert que les participants ACTIFS.
 *
 * « Inconnu » et « parti » ne sont alors pas la même réponse. Les confondre
 * sous un 404 nu force le client à écrire « Fiche indisponible », qui se lit
 * comme une panne, là où la vérité est un fait de conversation : cette personne
 * n'est plus là. Le code de l'erreur est le seul endroit où cette distinction
 * peut voyager — le corps, lui, ne doit toujours rien livrer.
 */
describe('GET …/profile — la personne a quitté la conversation', () => {
  const departedRow = { ...anonymousRow, isActive: false };

  it('refuse toujours de servir la fiche', async () => {
    const ctx = setup('member', departedRow);

    const data = await fetchProfile(ctx);

    expect(ctx.reply._status).toBe(404);
    expect(data).toBeUndefined();
  });

  it('dit que la personne est PARTIE, et non qu’elle est introuvable', async () => {
    const ctx = setup('member', departedRow);

    await fetchProfile(ctx);

    // `code` vit à la RACINE de l'enveloppe, pas sous `error` — `sendError`
    // (`utils/response.ts`) rend `{ success, error, message, code }`, et
    // c'est là que les clients le lisent.
    expect(ctx.reply._body?.code).toBe('PARTICIPANT_LEFT');
  });

  it('garde un 404 nu pour un participant qui n’a jamais existé', async () => {
    const ctx = setup('member');

    await fetchProfile(ctx, '507f1f77bcf86cd799439099');

    expect(ctx.reply._status).toBe(404);
    expect(ctx.reply._body?.code).not.toBe('PARTICIPANT_LEFT');
  });
});

// ── Régime STRICT (2026-08-25) — la présence sur la fiche ────────────────────
// Hors soi-même, ADMIN+ et amitié acceptée, ni `isOnline` ni `lastActiveAt`
// d'un autre membre ne sortent — la co-participation n'est pas une relation.
// Un rang inférieur au premier est le seul qui distingue la règle juste du
// court-circuit : la cible est donc un membre AUTRE que le lecteur.
describe('GET …/profile — présence (régime strict)', () => {
  const LAST_SEEN = registeredRow.lastActiveAt;

  it('transmet le viewer demandeur (identité + rôle) et la cible inscrite', async () => {
    await fetchProfile(setup('member', registeredRow), REGISTERED_ID, { role: 'USER' });

    expect(mockResolveForTarget).toHaveBeenCalledWith(
      { userId: VIEWER_ID, role: 'USER' },
      { id: registeredRow.userId, deactivatedAt: null },
    );
  });

  it('ami accepté ⇒ présence servie', async () => {
    mockResolveForTarget.mockImplementation(lawFaithfulTargetResolver(new Set([registeredRow.userId])));

    const data = await fetchProfile(setup('member', registeredRow), REGISTERED_ID, { role: 'USER' });

    expect(data.isOnline).toBe(true);
    expect(data.lastActiveAt).toEqual(LAST_SEEN);
  });

  it('co-membre NON ami ⇒ isOnline false et lastActiveAt null', async () => {
    const data = await fetchProfile(setup('member', registeredRow), REGISTERED_ID, { role: 'USER' });

    expect(data.isOnline).toBe(false);
    expect(data.lastActiveAt).toBeNull();
  });

  it('ADMIN non ami ⇒ présence servie', async () => {
    const data = await fetchProfile(setup('member', registeredRow), REGISTERED_ID, { role: 'ADMIN' });

    expect(data.isOnline).toBe(true);
    expect(data.lastActiveAt).toEqual(LAST_SEEN);
  });

  it('MODERATOR non ami ⇒ cachée, comme un utilisateur ordinaire', async () => {
    const data = await fetchProfile(setup('member', registeredRow), REGISTERED_ID, { role: 'MODERATOR' });

    expect(data.isOnline).toBe(false);
    expect(data.lastActiveAt).toBeNull();
  });

  it('viewer anonyme ⇒ cachée, et le service reçoit un viewer nul', async () => {
    const data = await fetchProfile(setup('member', registeredRow), REGISTERED_ID, 'anonymous');

    expect(data.isOnline).toBe(false);
    expect(data.lastActiveAt).toBeNull();
    expect(mockResolveForTarget).toHaveBeenCalledWith(null, { id: registeredRow.userId, deactivatedAt: null });
  });

  // Un visiteur sans compte n'a pas de `User.id` : le service ne peut pas le
  // résoudre. Régime strict : entrée absente ⇒ masqué, sauf ADMIN+ — et le
  // MODERATOR, qui n'est ni ami ni administrateur, reste du côté masqué.
  it('visiteur sans compte ⇒ caché pour un USER, et rien n\'est résolu pour lui', async () => {
    const data = await fetchProfile(setup('member'), ANON_ID, { role: 'USER' });

    expect(data.isOnline).toBe(false);
    expect(data.lastActiveAt).toBeNull();
    expect(mockResolveForTarget).not.toHaveBeenCalled();
  });

  it('visiteur sans compte ⇒ caché pour un MODERATOR', async () => {
    const data = await fetchProfile(setup('member'), ANON_ID, { role: 'MODERATOR' });

    expect(data.isOnline).toBe(false);
    expect(data.lastActiveAt).toBeNull();
  });

  it('visiteur sans compte ⇒ servi à un ADMIN', async () => {
    const data = await fetchProfile(setup('member'), ANON_ID, { role: 'ADMIN' });

    expect(data.isOnline).toBe(true);
    expect(data.lastActiveAt).toEqual(anonymousRow.lastActiveAt);
  });
});
