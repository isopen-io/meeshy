/**
 * @jest-environment node
 *
 * LA CARTE DE CONVERSATION (#8099) — ce qu'un client affiche à la place de
 * l'aperçu de lien générique.
 *
 * Deux portes, une seule forme (`@meeshy/shared/types/conversation-card`) :
 * - `GET /links/:identifier/card` — lien de PARTAGE, auth optionnelle ;
 * - `GET /conversations/:id/card` — lien DIRECT, servi au seul MEMBRE.
 *
 * Le témoin sort le corps du SÉRIALISEUR (`response.json()`), donc mesure
 * aussi ce que le schéma déclaré laisse partir — et ce qu'il retient.
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    get: jest.fn(async () => null),
    set: jest.fn(async () => {}),
    del: jest.fn(async () => {}),
    isAvailable: jest.fn(() => false),
  })),
  resetCacheStore: jest.fn(),
}));

import { createUnifiedAuthMiddleware } from '../../../../middleware/auth';
import {
  registerDirectConversationCardRoute,
  registerShareLinkCardRoute,
} from '../../../../routes/conversations/card';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const CREATOR_ID = '507f1f77bcf86cd799439099';
const SESSION_ID = '507f1f77bcf86cd7994390aa';
const CONV_ID = '507f1f77bcf86cd799439033';
const LINK_DB_ID = '507f1f77bcf86cd799439055';
const LINK_ID = 'mshy_beta-8099';

const SECRET = process.env.JWT_SECRET as string;
const JETON = {
  authorization: `Bearer ${jwt.sign({ userId: USER_ID, sid: SESSION_ID }, SECRET, { expiresIn: '1h' })}`,
};

const utilisateur = () => ({
  id: USER_ID,
  username: 'sonde',
  email: 'sonde@meeshy.me',
  firstName: 'Sonde',
  lastName: null,
  displayName: 'Sonde',
  bio: null,
  avatar: null,
  banner: null,
  phoneNumber: null,
  role: 'USER',
  isActive: true,
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  isOnline: false,
  lastActiveAt: new Date('2026-09-01'),
  emailVerifiedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-09-01'),
  deviceLocale: null,
  profileCompletionRate: null,
});

type LienFactice = {
  readonly isActive?: boolean;
  readonly expiresAt?: Date | null;
  readonly maxUses?: number | null;
  readonly currentUses?: number;
  readonly requireAccount?: boolean;
  readonly allowViewHistory?: boolean;
  readonly description?: string | null;
  readonly creatorActive?: boolean;
  readonly conversationDescription?: string | null;
  readonly conversationTitle?: string | null;
  readonly conversationType?: string;
};

const lien = (o: LienFactice = {}) => ({
  id: LINK_DB_ID,
  linkId: LINK_ID,
  identifier: LINK_ID,
  name: 'Invitation bêta',
  description: o.description === undefined ? 'Venez tester la bêta avec nous' : o.description,
  isActive: o.isActive ?? true,
  expiresAt: o.expiresAt ?? null,
  maxUses: o.maxUses ?? null,
  currentUses: o.currentUses ?? 0,
  requireAccount: o.requireAccount ?? false,
  allowViewHistory: o.allowViewHistory ?? true,
  conversationId: CONV_ID,
  conversation: {
    id: CONV_ID,
    title: o.conversationTitle === undefined ? 'Les bêta-testeurs' : o.conversationTitle,
    description: o.conversationDescription === undefined ? 'Un groupe pour tester' : o.conversationDescription,
    type: o.conversationType ?? 'group',
    avatar: 'https://cdn.meeshy.me/a.png',
    banner: 'https://cdn.meeshy.me/b.png',
  },
  creator: {
    id: CREATOR_ID,
    displayName: 'Alice Martin',
    username: 'alice',
    avatar: 'https://cdn.meeshy.me/alice.png',
    isActive: o.creatorActive ?? true,
  },
});

type Monde = {
  readonly lien?: ReturnType<typeof lien> | null;
  readonly membre?: boolean;
  readonly conversationExiste?: boolean;
};

const prismaDe = (monde: Monde) => {
  const shareLink = monde.lien === undefined ? lien() : monde.lien;
  const trouveLien = jest.fn(async (args: { where?: Record<string, unknown> }) => {
    if (!shareLink) return null;
    const where = args.where ?? {};
    const candidats = [where, ...((where.OR as ReadonlyArray<Record<string, unknown>> | undefined) ?? [])];
    return candidats.some((c) => c.id === LINK_DB_ID || c.linkId === LINK_ID || c.identifier === LINK_ID)
      ? shareLink
      : null;
  });
  const participantMembre = { id: '507f1f77bcf86cd7994390ee', role: 'member', userId: USER_ID };
  return {
    userSession: { findFirst: jest.fn(async () => ({ isValid: true })) },
    user: { findUnique: jest.fn(async () => utilisateur()) },
    conversationShareLink: { findFirst: trouveLien, findUnique: trouveLien },
    conversation: {
      findFirst: jest.fn(async () =>
        monde.conversationExiste === false
          ? null
          : {
              id: CONV_ID,
              identifier: 'mee_beta',
              title: 'Les bêta-testeurs',
              description: 'Un groupe pour tester',
              type: 'group',
              avatar: null,
              banner: null,
            }
      ),
    },
    participant: {
      findFirst: jest.fn(async () => (monde.membre ? participantMembre : null)),
      count: jest.fn(async () => 7),
      findMany: jest.fn(async () => [
        { type: 'user', language: null, userId: USER_ID, user: { id: USER_ID, displayName: 'Sonde', username: 'sonde', avatar: null, systemLanguage: 'fr', regionalLanguage: 'en-US', customDestinationLanguage: null } },
        { type: 'user', language: null, userId: OTHER_USER_ID, user: { id: OTHER_USER_ID, displayName: 'Bob', username: 'bob', avatar: null, systemLanguage: 'EN', regionalLanguage: null, customDestinationLanguage: 'es' } },
        { type: 'anonymous', language: 'de', userId: null, user: null },
      ]),
    },
    message: { count: jest.fn(async () => 42) },
  };
};

const monter = async (prisma: unknown): Promise<FastifyInstance> => {
  const app = Fastify();
  app.decorate('prisma', prisma as never);
  const optionalAuth = createUnifiedAuthMiddleware(prisma as never, { requireAuth: false, allowAnonymous: true });
  registerShareLinkCardRoute(app, prisma as never, optionalAuth);
  registerDirectConversationCardRoute(app, prisma as never, optionalAuth);
  await app.ready();
  return app;
};

type Reponse = { readonly statut: number; readonly corps: Record<string, any> };

const lire = async (url: string, monde: Monde, entetes: Record<string, string> = {}): Promise<Reponse> => {
  const app = await monter(prismaDe(monde));
  try {
    const r = await app.inject({ method: 'GET', url, headers: entetes });
    return { statut: r.statusCode, corps: r.json() as Record<string, any> };
  } finally {
    await app.close();
  }
};

const CLES_DE_CARTE = [
  'avatarUrl', 'bannerUrl', 'conversationId', 'conversationType', 'description', 'inviteMessage', 'inviter',
  'kind', 'link', 'stats', 'title', 'viewer',
];

describe('GET /links/:identifier/card — lien de partage (#8099)', () => {
  it('rend 404 pour un lien inconnu', async () => {
    const { statut, corps } = await lire('/links/mshy_inconnu/card', { lien: null });
    expect(statut).toBe(404);
    expect(corps.data).toBeUndefined();
  });

  it('sert la carte complète à un visiteur sans session, sans identifiant de conversation', async () => {
    const { statut, corps } = await lire(`/links/${LINK_ID}/card`, {});
    expect(statut).toBe(200);
    expect(corps.data).toEqual({
      kind: 'share-link',
      conversationId: null,
      title: 'Les bêta-testeurs',
      description: 'Un groupe pour tester',
      avatarUrl: 'https://cdn.meeshy.me/a.png',
      bannerUrl: 'https://cdn.meeshy.me/b.png',
      conversationType: 'group',
      stats: { memberCount: 7, onlineCount: null, messageCount: 42, languages: ['de', 'en', 'es', 'fr'] },
      viewer: { isMember: false, canJoin: true, requiresAccount: false, canJoinAnonymously: true },
      link: { identifier: LINK_ID, isActive: true, expiresAt: null },
      inviter: { displayName: 'Alice Martin', username: 'alice', avatarUrl: 'https://cdn.meeshy.me/alice.png' },
      inviteMessage: 'Venez tester la bêta avec nous',
    });
  });

  it('ne laisse partir aucun identifiant du créateur ni aucune liste de participants', async () => {
    const { corps } = await lire(`/links/${LINK_ID}/card`, {});
    const fil = JSON.stringify(corps);
    expect(fil).not.toContain(CREATOR_ID);
    expect(fil).not.toContain(OTHER_USER_ID);
    expect(fil).not.toContain(LINK_DB_ID);
    expect(Object.keys(corps.data.inviter).sort()).toEqual(['avatarUrl', 'displayName', 'username']);
    expect(Object.keys(corps.data).sort()).toEqual(CLES_DE_CARTE);
  });

  it('retient le décompte des messages quand le lien n’ouvre pas l’historique', async () => {
    const { corps } = await lire(`/links/${LINK_ID}/card`, { lien: lien({ allowViewHistory: false }) });
    expect(corps.data.stats.messageCount).toBeNull();
    expect(corps.data.stats.memberCount).toBe(7);
  });

  it('ferme la jonction anonyme quand le lien exige un compte', async () => {
    const { corps } = await lire(`/links/${LINK_ID}/card`, { lien: lien({ requireAccount: true }) });
    expect(corps.data.viewer).toEqual({ isMember: false, canJoin: true, requiresAccount: true, canJoinAnonymously: false });
  });

  it.each([
    ['désactivé', lien({ isActive: false })],
    ['expiré', lien({ expiresAt: new Date('2020-01-01') })],
    ['épuisé', lien({ maxUses: 3, currentUses: 3 })],
  ])('rend un lien %s inactif, sans statistiques, description, inviteur ni action', async (_nom, l) => {
    const { statut, corps } = await lire(`/links/${LINK_ID}/card`, { lien: l });
    expect(statut).toBe(200);
    expect(corps.data.link.isActive).toBe(false);
    expect(corps.data.description).toBeNull();
    expect(corps.data.inviteMessage).toBeNull();
    expect(corps.data.inviter).toBeNull();
    expect(corps.data.stats).toEqual({ memberCount: 0, onlineCount: null, messageCount: null, languages: [] });
    expect(corps.data.viewer).toEqual({ isMember: false, canJoin: false, requiresAccount: false, canJoinAnonymously: false });
    expect(corps.data.title).toBe('Les bêta-testeurs');
  });

  it('reconnaît un MEMBRE : identifiant servi, décompte servi même sans historique, aucune jonction', async () => {
    const { corps } = await lire(`/links/${LINK_ID}/card`, { lien: lien({ allowViewHistory: false }), membre: true }, JETON);
    expect(corps.data.conversationId).toBe(CONV_ID);
    expect(corps.data.stats.messageCount).toBe(42);
    expect(corps.data.viewer).toEqual({ isMember: true, canJoin: false, requiresAccount: false, canJoinAnonymously: false });
  });

  it('tronque la description à 200 caractères et le message d’invitation à 280', async () => {
    const { corps } = await lire(`/links/${LINK_ID}/card`, {
      lien: lien({ conversationDescription: 'd'.repeat(500), description: 'm'.repeat(500) }),
    });
    expect(corps.data.description).toHaveLength(200);
    expect(corps.data.description.endsWith('…')).toBe(true);
    expect(corps.data.inviteMessage).toHaveLength(280);
  });

  it('tait l’inviteur dont le compte n’est plus actif', async () => {
    const { corps } = await lire(`/links/${LINK_ID}/card`, { lien: lien({ creatorActive: false }) });
    expect(corps.data.inviter).toBeNull();
  });

  it('rend une description vide en null et un titre absent par le nom du lien', async () => {
    const { corps } = await lire(`/links/${LINK_ID}/card`, {
      lien: lien({ conversationDescription: '   ', conversationTitle: null, description: '' }),
    });
    expect(corps.data.description).toBeNull();
    expect(corps.data.inviteMessage).toBeNull();
    expect(corps.data.title).toBe('Invitation bêta');
  });
});

describe('GET /conversations/:id/card — lien direct (#8099)', () => {
  it('sert la carte au membre, sans lien ni inviteur', async () => {
    const { statut, corps } = await lire(`/conversations/${CONV_ID}/card`, { membre: true }, JETON);
    expect(statut).toBe(200);
    expect(corps.data).toEqual({
      kind: 'direct',
      conversationId: CONV_ID,
      title: 'Les bêta-testeurs',
      description: 'Un groupe pour tester',
      avatarUrl: null,
      bannerUrl: null,
      conversationType: 'group',
      stats: { memberCount: 7, onlineCount: null, messageCount: 42, languages: ['de', 'en', 'es', 'fr'] },
      viewer: { isMember: true, canJoin: false, requiresAccount: false, canJoinAnonymously: false },
      link: null,
      inviter: null,
      inviteMessage: null,
    });
  });

  it('rend au non-membre le même 404, octet pour octet, qu’à un id inexistant', async () => {
    const nonMembre = await lire(`/conversations/${CONV_ID}/card`, { membre: false }, JETON);
    const inexistante = await lire('/conversations/mee_nexiste_pas/card', { membre: false, conversationExiste: false }, JETON);
    expect(nonMembre.statut).toBe(404);
    expect(nonMembre).toEqual(inexistante);
  });

  it('refuse une session absente en 401', async () => {
    const { statut, corps } = await lire(`/conversations/${CONV_ID}/card`, { membre: true });
    expect(statut).toBe(401);
    expect(corps.code).toBe('UNAUTHORIZED');
  });
});
