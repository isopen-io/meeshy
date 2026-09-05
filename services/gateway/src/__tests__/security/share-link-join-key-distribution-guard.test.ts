/**
 * Aucune valeur SERVIE par l'administration n'ouvre la porte de jointure d'un
 * lien de partage (#4692).
 *
 * ## Ce que le correctif précédent croyait avoir fait
 *
 * `f56e4c5d52` a retiré `linkId` du `select` de `GET /admin/users/:id/activity`
 * en écrivant, dans le commentaire posé à sa place : « `id` suffit à désigner
 * le lien, et le geste dédié reste la seule façon de le révéler ». La chaîne
 * dit le contraire, maillon par maillon :
 *
 * - le même `select` sert `id` ET `identifier` ;
 * - `findShareLinkByKey` acceptait `{ OR: [{linkId}, {identifier}, {id}] }` —
 *   les TROIS colonnes, indifféremment ;
 * - `POST /links/:key/members` est en `optionalAuth` (aucune créance) et
 *   `POST /anonymous/join/:linkId` est purement anonyme ;
 * - `admitLinkEntry` ne demande jamais par quelle colonne le lien a été trouvé.
 *
 * Les lecteurs de cette porte sont BIGBOSS, ADMIN, **MODERATOR et AUDIT**
 * (`canViewUsers`) — les deux derniers n'ont pas `canViewSensitiveData`, soit
 * exactement la population que le correctif voulait exclure. Le geste souverain
 * `POST /admin/share-links/:id/reveal` ne retenait donc rien qui ne fût déjà
 * distribué deux portes plus loin.
 *
 * ## Pourquoi ce témoin n'énumère AUCUN nom de colonne
 *
 * Le témoin qui gardait cette règle (`admin-user-secrets-and-thresholds`)
 * assérait trois valeurs NOMMÉES : `mshy_SECRET`, `TOKEN_TRACK`, `TOKEN_AFFIL`.
 * Il est resté vert pendant que `identifier` — une clé de jointure ÉQUIVALENTE
 * — sortait par la même charge, parce que personne ne l'avait nommée.
 *
 * Celui-ci dérive son fixture de la LOI elle-même :
 * `SHARE_LINK_JOIN_KEY_COLUMNS`, la liste que `findShareLinkByKey` consomme
 * pour construire son `OR`. Ajouter demain une colonne à la loi peuple
 * automatiquement le fixture d'un sentinelle de plus, et le témoin tombe si la
 * nouvelle colonne sort par une porte d'administration. Une règle qui gouverne
 * une CLASSE ne se garde pas par une énumération tenue à la main.
 *
 * ## Ce que ce témoin ne garde PAS — la chaîne INDIRECTE, mesurée et laissée ouverte
 *
 * Il garde une propriété DIRECTE : aucune valeur servie n'ouvre
 * `findShareLinkByKey`. Il ne garde pas la propriété TRANSITIVE, et celle-ci
 * n'est pas acquise. `id` reste ÉCHANGEABLE contre `linkId` par deux aperçus
 * qui n'exigent aucune créance :
 *
 * | route | créance | résolveur qui accepte l'ObjectId | sert |
 * |---|---|---|---|
 * | `GET /anonymous/link/:identifier` | AUCUNE | `resolveShareLinkId` (`routes/anonymous.ts:70-84`) | `linkId` |
 * | `GET /links/:identifier` | `authOptional` | `findShareLinkByIdentifier` (`routes/links/utils/prisma-queries.ts:223`) | `linkId` (`shareLinkSelectStructure:68`) |
 *
 * Chaîne complète : `id` (servi à MODERATOR/AUDIT) → aperçu public →
 * `linkId` → `POST /anonymous/join/:linkId`. Les deux aperçus sont
 * DÉLIBÉRÉMENT publics (`route-auth-coverage.test.ts:361` et `:371`), et le
 * web traite l'ObjectId comme une clé de lien de PREMIÈRE CLASSE
 * (`apps/web/utils/link-identifier`, type `conversationShareLinkId` ;
 * `use-auth.ts:213` le persiste sous `anonymous_current_share_link`). La
 * fermer casserait des appelants mesurés — c'est un lot à part, avec sa propre
 * décision produit, et ce paragraphe existe pour que le vert de ce fichier ne
 * se lise pas comme une fermeture de la classe entière.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const hasPermission = jest.fn<(role: string, perm: string) => boolean>(() => true);

jest.mock('../../services/admin/permissions.service', () => ({
  permissionsService: {
    hasPermission: (role: string, perm: string) => hasPermission(role, perm),
    canManageUser: () => true,
    canModifyUser: () => true,
    canChangeRole: () => true,
    canViewPresence: () => true,
    getPermissions: (role: string) => ({
      canAccessAdmin: true,
      canViewUsers: true,
      canViewUserDetails: true,
      canViewSensitiveData: role === 'BIGBOSS' || role === 'ADMIN',
      canCreateUsers: false,
      canUpdateUsers: false,
      canUpdateUserRoles: false,
      canDeleteUsers: false,
      canResetPasswords: false,
      canViewAuditLogs: false,
      canManageCommunities: true,
      canManageConversations: role !== 'AUDIT',
      canViewAnalytics: false,
      canModerateContent: true,
      canManageNotifications: false,
      canManageTranslations: false,
    }),
  },
}));

jest.mock('../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => ({ createAuditLog: jest.fn() })),
}));
jest.mock('../../services/admin/user-sanitization.service', () => ({
  sanitizationService: { sanitizeUser: (u: unknown) => u, sanitizeUsers: (u: unknown) => u },
}));
jest.mock('../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: jest.fn(), get: jest.fn(), set: jest.fn() }),
}));
jest.mock('../../middleware/auth', () => ({
  authUserCacheKey: (id: string) => `auth:user:${id}`,
  UnifiedAuthContext: {},
  UnifiedAuthRequest: {},
}));
jest.mock('../../utils/logger', () => ({ logError: jest.fn() }));

import { userAdminRoutes } from '../../routes/admin/users';
import { registerContentShareLinkRoutes } from '../../routes/admin/content-share-links';
import {
  SHARE_LINK_JOIN_KEY_COLUMNS,
  performLinkJoin,
} from '../../routes/conversations/link-admission';

const LINK_ROW_ID = '507f1f77bcf86cd799439033';
const CONVERSATION_ID = '507f1f77bcf86cd799439044';

/**
 * Un sentinelle par colonne de la LOI de jointure — jamais par nom écrit ici.
 * `mshy_` est le préfixe de PRODUCTION des deux clés publiques : un fixture qui
 * porterait `'ident'` là où la base porte `mshy_8x2Kq9Za` laisserait passer un
 * correctif qui ne filtre que sur la forme.
 */
const JOIN_KEY_SENTINELS: Record<string, string> = Object.fromEntries(
  SHARE_LINK_JOIN_KEY_COLUMNS.map((colonne) => [colonne, `mshy_SENTINELLE${colonne}`])
);

function shareLinkRow(): Record<string, unknown> {
  return {
    id: LINK_ROW_ID,
    ...JOIN_KEY_SENTINELS,
    name: 'Lien de revue',
    description: null,
    maxUses: null,
    currentUses: 0,
    maxConcurrentUsers: null,
    currentConcurrentUsers: 0,
    isActive: true,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: true,
    expiresAt: null,
    createdAt: new Date('2026-08-01'),
    creator: { id: 'u1', username: 'createur', displayName: 'C', avatar: null },
    conversation: { id: CONVERSATION_ID, identifier: 'mshy_conv-lisible', title: 'T', type: 'group' },
  };
}

/**
 * Le double HONORE le `select` : un Prisma de test qui rend toutes les colonnes
 * quel que soit le `select` ne teste pas la requête, et le témoin ne pourrait
 * tomber que sur une fuite de sérialisation — jamais sur celle qu'on corrige,
 * une colonne secrète effectivement DEMANDÉE à la base.
 */
function projeter(ligne: Record<string, unknown>, select: unknown): Record<string, unknown> {
  if (!select || typeof select !== 'object') return { ...ligne };
  const demande = select as Record<string, unknown>;
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(demande)) {
    if (valeur === true && cle in ligne) sortie[cle] = ligne[cle];
    else if (valeur && typeof valeur === 'object' && cle in ligne) {
      const imbrique = (valeur as { select?: unknown }).select;
      const cible = ligne[cle];
      sortie[cle] = cible && typeof cible === 'object'
        ? projeter(cible as Record<string, unknown>, imbrique)
        : cible;
    }
  }
  return sortie;
}

function makePrisma() {
  return {
    user: { findUnique: jest.fn(async () => ({ id: 'u1' })) },
    conversationShareLink: {
      findMany: jest.fn(async (args: { select?: unknown }) => [projeter(shareLinkRow(), args?.select)]),
      count: jest.fn(async () => 1),
    },
    trackingLink: { findMany: jest.fn(async () => []) },
    affiliateToken: { findMany: jest.fn(async () => []) },
    friendRequest: { findMany: jest.fn(async () => []) },
    participant: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      groupBy: jest.fn(async () => []),
    },
    report: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    conversation: { findMany: jest.fn(async () => []), findUnique: jest.fn(), count: jest.fn(async () => 0) },
    message: { findMany: jest.fn(async () => []) },
    postMedia: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    messageAttachment: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  };
}

async function monter(role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma() as never);
  app.decorate('authenticate', async (request: { authContext: unknown }) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'admin1',
      registeredUser: { id: 'admin1', role, username: 'a', email: 'a@x' },
    };
  });
  app.register(userAdminRoutes);
  app.register(registerContentShareLinkRoutes);
  await app.ready();
  return app;
}

/** Les deux rôles admis par ces portes SANS `canViewSensitiveData`. */
const ROLES_SANS_DONNEES_SENSIBLES = ['MODERATOR', 'AUDIT'] as const;

beforeEach(() => {
  hasPermission.mockReset();
  hasPermission.mockReturnValue(true);
});

describe('#4692 — la loi de jointure est NOMMÉE, et `id` n\'en fait pas partie', () => {
  it('déclare au moins les deux clés publiques', () => {
    expect([...SHARE_LINK_JOIN_KEY_COLUMNS].sort()).toEqual(['identifier', 'linkId']);
  });

  /**
   * `id` est la référence sur laquelle la console AGIT (`DELETE
   * /admin/share-links/:id`, `POST …/reveal`, la navigation de la page) : elle
   * ne peut pas lui être retirée sans lui retirer tout moyen d'agir. Elle ne
   * peut donc rester servie qu'à une condition — qu'elle n'ouvre AUCUNE porte.
   * C'est ce que les deux commentaires d'administration affirmaient déjà
   * (« la référence OPAQUE ») sans que rien ne le rende vrai.
   */
  it("n'accepte pas l'ObjectId — la référence que la console sert doit être OPAQUE", () => {
    expect([...SHARE_LINK_JOIN_KEY_COLUMNS]).not.toContain('id');
  });
});

/**
 * Le lien du fixture est CLOS (`isActive: false`) : `admitLinkEntry` le refuse
 * en `LINK_EXPIRED` dès sa première ligne. Le témoin distingue donc « la clé
 * n'ouvre rien » (`not-found`) de « la clé a bien trouvé la ligne »
 * (`refused`), sans dérouler la création d'invité — deux verdicts qu'un simple
 * `not.toBe('not-found')` sur un lien ouvert ne séparerait pas aussi nettement.
 */
const LIGNE_JOINTURE = {
  id: LINK_ROW_ID,
  linkId: 'mshy_publique1',
  identifier: 'mshy_lisible-1',
  conversationId: CONVERSATION_ID,
  isActive: false,
  maxUses: null,
  currentUses: 0,
  maxConcurrentUsers: null,
  currentConcurrentUsers: 0,
  maxUniqueSessions: null,
  currentUniqueSessions: 0,
  expiresAt: null,
  requireAccount: false,
  requireNickname: false,
  requireEmail: false,
  requireBirthday: false,
  allowedLanguages: [],
  allowedIpRanges: [],
  allowViewHistory: true,
  conversation: { id: CONVERSATION_ID, title: 'T', type: 'group', isActive: true, closedAt: null },
};

/** Le double APPLIQUE le `where.OR` — sans quoi il ne teste rien de la loi. */
function prismaJointure() {
  return {
    conversationShareLink: {
      findFirst: jest.fn(async (args: { where?: { OR?: Array<Record<string, string>> } }) => {
        const clauses = args?.where?.OR ?? [];
        const trouve = clauses.some((clause) =>
          Object.entries(clause).every(
            ([colonne, valeur]) => (LIGNE_JOINTURE as Record<string, unknown>)[colonne] === valeur
          )
        );
        return trouve ? LIGNE_JOINTURE : null;
      }),
    },
  } as never;
}

const rejoindre = (key: string) =>
  performLinkJoin({
    prisma: prismaJointure(),
    key,
    authContext: undefined,
    requestIp: '127.0.0.1',
    profile: { firstName: 'A', lastName: 'B', language: 'fr' },
  });

describe('#4692 — un ObjectId ne rejoint plus aucune conversation', () => {
  it("rend `not-found` quand la clé est l'ObjectId du lien", async () => {
    expect((await rejoindre(LINK_ROW_ID)).kind).toBe('not-found');
  });

  it.each([...SHARE_LINK_JOIN_KEY_COLUMNS])(
    'trouve toujours la ligne par sa colonne `%s` — la porte publique reste ouverte',
    async (colonne) => {
      const verdict = await rejoindre(LIGNE_JOINTURE[colonne]);
      expect(verdict.kind).toBe('refused');
    }
  );
});

describe.each(ROLES_SANS_DONNEES_SENSIBLES)(
  "#4692 — %s ne reçoit AUCUNE clé de jointure",
  (role) => {
    it("GET /admin/users/:id/activity ne sert aucune colonne de SHARE_LINK_JOIN_KEY_COLUMNS", async () => {
      const app = await monter(role);
      const res = await app.inject({ method: 'GET', url: '/admin/users/u1/activity' });

      expect(res.statusCode).toBe(200);
      for (const sentinelle of Object.values(JOIN_KEY_SENTINELS)) {
        expect(res.payload).not.toContain(sentinelle);
      }

      await app.close();
    });

    it('GET /admin/share-links ne sert aucune colonne de SHARE_LINK_JOIN_KEY_COLUMNS', async () => {
      if (role === 'AUDIT') return; // `canManageConversations` false — la porte refuse, testée ailleurs

      const app = await monter(role);
      const res = await app.inject({ method: 'GET', url: '/share-links' });

      expect(res.statusCode).toBe(200);
      for (const sentinelle of Object.values(JOIN_KEY_SENTINELS)) {
        expect(res.payload).not.toContain(sentinelle);
      }

      await app.close();
    });
  }
);

describe('#4692 — la ligne reste IDENTIFIABLE sans sa clé de jointure', () => {
  it('sert toujours `id`, sur lequel la console agit', async () => {
    const app = await monter('MODERATOR');
    const res = await app.inject({ method: 'GET', url: '/share-links' });

    const lignes = res.json().data as Array<Record<string, unknown>>;
    expect(lignes[0]?.id).toBe(LINK_ROW_ID);

    await app.close();
  });
});
