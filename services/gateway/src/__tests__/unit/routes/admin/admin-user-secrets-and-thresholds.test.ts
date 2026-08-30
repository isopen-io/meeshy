/**
 * Trois lignes du tableau de #4157, gardées par le comportement SERVI.
 *
 * Le lot #4157 a corrigé treize de ses seize lignes. Ces témoins tiennent les
 * trois qui restaient, et ils ont en commun d'être des défauts qu'une relecture
 * de GARDE ne peut pas voir : la garde y est correctement posée, et c'est la
 * CHARGE qu'elle laisse passer qui est fautive.
 *
 * - `GET /admin/users/:id/media` ne lisait ni `isViewOnce`, ni `isBlurred`, ni
 *   `effectFlags`, et servait `fileUrl` + `thumbnailUrl` : un média à VUE
 *   UNIQUE envoyé en privé sortait entier par une porte d'administration,
 *   pendant que l'éventail de notifications le retenait (`maskedAttachment`,
 *   cycle 125). Une protection de contenu se mesure sur tout ce que la charge
 *   TRANSPORTE, pas sur le rôle qui la demande.
 *
 * - `GET /admin/users/:id/activity` servait `conversationShareLink.linkId` —
 *   LE SECRET DE JOINTURE — alors que le même lot venait de le retirer de
 *   `GET /admin/share-links` et de lui dédier un geste souverain tracé. La
 *   protection avait été posée sur une porte et pas sur sa voisine, écrite
 *   dans un autre fichier. Elle servait aussi `trackingLink.token` et
 *   `affiliateToken.token` à des rôles pour qui `canViewSensitiveData` est
 *   `false`.
 *
 * - `GET /admin/users/:id/reports` se contentait de `canViewUsers` quand
 *   `GET /admin/reports` exige `canModerateContent` : DEUX seuils sur la même
 *   table, donc le plus bas décide.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';

const hasPermission = jest.fn<boolean, [string, string]>(() => true);

jest.mock('../../../../services/admin/permissions.service', () => ({
  permissionsService: {
    hasPermission: (role: string, perm: string) => hasPermission(role, perm),
    canManageUser: () => true,
    canModifyUser: () => true,
    canChangeRole: () => true,
    canViewPresence: () => true,
  },
}));

jest.mock('../../../../services/admin/user-management.service', () => ({
  UserManagementService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../services/admin/user-audit.service', () => ({
  UserAuditService: jest.fn().mockImplementation(() => ({ createAuditLog: jest.fn() })),
}));
jest.mock('../../../../services/admin/user-sanitization.service', () => ({
  sanitizationService: { sanitizeUser: (u: unknown) => u, sanitizeUsers: (u: unknown) => u },
}));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: jest.fn(), get: jest.fn(), set: jest.fn() }),
}));
jest.mock('../../../../middleware/auth', () => ({
  authUserCacheKey: (id: string) => `auth:user:${id}`,
  UnifiedAuthContext: {},
  UnifiedAuthRequest: {},
}));

import { userAdminRoutes } from '../../../../routes/admin/users';

/**
 * Une pièce jointe MASQUÉE et une pièce jointe ordinaire, côte à côte : le
 * témoin ne peut tomber que si les deux traversent la même route et en
 * ressortent DIFFÉREMMENT. Un fixture qui n'aurait que la masquée passerait
 * aussi si la route retirait `fileUrl` à tout le monde — ce qui serait un
 * autre défaut.
 */
const MEDIA_MASQUE = {
  id: 'att-vue-unique', originalName: 'secret.png', mimeType: 'image/png',
  fileUrl: '2025/10/abc/secret.png', thumbnailUrl: '2025/10/abc/secret-t.png',
  fileSize: 100, width: 10, height: 10, duration: null,
  createdAt: new Date('2026-08-02'), messageId: 'm1',
  isViewOnce: true, isBlurred: false, effectFlags: 0,
};
const MEDIA_ORDINAIRE = {
  id: 'att-ordinaire', originalName: 'photo.png', mimeType: 'image/png',
  fileUrl: '2025/10/def/photo.png', thumbnailUrl: '2025/10/def/photo-t.png',
  fileSize: 100, width: 10, height: 10, duration: null,
  createdAt: new Date('2026-08-01'), messageId: 'm2',
  isViewOnce: false, isBlurred: false, effectFlags: 0,
};

const selects: Record<string, unknown> = {};

/**
 * Le mock HONORE le `select`, et ce n'est pas un détail de confort : un double
 * de Prisma qui rend toutes les colonnes quel que soit le `select` ne teste pas
 * la requête — c'est la leçon que le dépôt a déjà payée sur `where`. Sans cette
 * projection, le témoin de charge ci-dessous n'aurait pu tomber que sur une
 * fuite à la SÉRIALISATION, jamais sur celle qu'on corrige : une colonne
 * secrète effectivement DEMANDÉE à la base.
 */
function projeter<T extends Record<string, unknown>>(ligne: T, select: unknown): Record<string, unknown> {
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

const prisma: Record<string, Record<string, jest.Mock>> = {
  user: { findUnique: jest.fn(async () => ({ id: 'u1' })) },
  postMedia: {
    findMany: jest.fn(async (args: { select?: unknown }) => { selects.postMedia = args?.select; return []; }),
    count: jest.fn(async () => 0),
  },
  messageAttachment: {
    findMany: jest.fn(async (args: { select?: unknown }) => {
      selects.messageAttachment = args?.select;
      return [MEDIA_MASQUE, MEDIA_ORDINAIRE].map((m) => projeter(m, args?.select));
    }),
    count: jest.fn(async () => 2),
  },
  conversationShareLink: {
    findMany: jest.fn(async (args: { select?: unknown }) => {
      selects.conversationShareLink = args?.select;
      return [projeter({ id: 'sl1', linkId: 'mshy_SECRET', identifier: 'ident', name: 'n', description: null,
                maxUses: null, currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
                isActive: true, expiresAt: null, createdAt: new Date(), conversation: { id: 'c1', identifier: 'ci' } }, args?.select)];
    }),
  },
  trackingLink: {
    findMany: jest.fn(async (args: { select?: unknown }) => {
      selects.trackingLink = args?.select;
      return [projeter({ id: 'tl1', token: 'TOKEN_TRACK', name: 'n', campaign: null, source: null, medium: null,
                originalUrl: 'https://x', shortUrl: 'https://s', totalClicks: 0, uniqueClicks: 0,
                isActive: true, expiresAt: null, createdAt: new Date(), lastClickedAt: null }, args?.select)];
    }),
  },
  affiliateToken: {
    findMany: jest.fn(async (args: { select?: unknown }) => {
      selects.affiliateToken = args?.select;
      return [projeter({ id: 'af1', token: 'TOKEN_AFFIL', name: 'n', maxUses: null, currentUses: 0,
                clickCount: 0, isActive: true, expiresAt: null, createdAt: new Date(), _count: { affiliations: 0 } }, args?.select)];
    }),
  },
  friendRequest: { findMany: jest.fn(async () => []) },
  report: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  conversation: { findMany: jest.fn(async () => []), findUnique: jest.fn(), count: jest.fn(async () => 0) },
  participant: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
  message: { findMany: jest.fn(async () => []) },
};

function monter(role = 'MODERATOR'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (request: { authContext: unknown }) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      registeredUser: { id: 'admin1', role, username: 'a', email: 'a@x' },
    };
  });
  app.register(userAdminRoutes);
  return app;
}

beforeEach(() => {
  hasPermission.mockReset();
  hasPermission.mockReturnValue(true);
  for (const k of Object.keys(selects)) delete selects[k];
});

describe('#4157 R3 — un média protégé ne sort pas par la porte d\'administration', () => {
  it("retire fileUrl et thumbnailUrl d'un média à VUE UNIQUE, et les garde sur l'ordinaire", async () => {
    const app = monter();
    const res = await app.inject({ method: 'GET', url: '/admin/users/u1/media' });

    expect(res.statusCode).toBe(200);
    const items = res.json().data as Array<Record<string, unknown>>;
    const masque = items.find((m) => m.id === 'att-vue-unique');
    const ordinaire = items.find((m) => m.id === 'att-ordinaire');

    expect(masque).toBeDefined();
    expect(masque?.fileUrl).toBeNull();
    expect(masque?.thumbnailUrl).toBeNull();
    // La ligne reste VISIBLE — un administrateur doit savoir que le média
    // existe ; c'est son CONTENU qui ne voyage pas.
    expect(masque?.isProtected).toBe(true);

    expect(ordinaire?.fileUrl).toBe('2025/10/def/photo.png');
    expect(ordinaire?.isProtected).toBe(false);

    await app.close();
  });

  /**
   * La garde ne peut pas décider sans les colonnes. Ce témoin-ci est le seul
   * qui rougisse si quelqu'un retire les trois champs du `select` en gardant
   * le filtre : le filtre lirait alors `undefined` partout et laisserait tout
   * passer, sans qu'aucune assertion de charge ne tombe sur un fixture qui,
   * lui, porte toujours les champs.
   */
  it('LIT isViewOnce, isBlurred et effectFlags — une garde sans sa colonne ne garde rien', async () => {
    const app = monter();
    await app.inject({ method: 'GET', url: '/admin/users/u1/media' });

    const select = selects.messageAttachment as Record<string, unknown>;
    expect(select.isViewOnce).toBe(true);
    expect(select.isBlurred).toBe(true);
    expect(select.effectFlags).toBe(true);

    await app.close();
  });
});

describe("#4157 R4 — aucun secret d'accès ne voyage dans l'activité", () => {
  it('ne sert ni linkId, ni token de suivi, ni token d\'affiliation', async () => {
    const app = monter();
    const res = await app.inject({ method: 'GET', url: '/admin/users/u1/activity' });

    expect(res.statusCode).toBe(200);
    const brut = res.payload;

    expect(brut).not.toContain('mshy_SECRET');
    expect(brut).not.toContain('TOKEN_TRACK');
    expect(brut).not.toContain('TOKEN_AFFIL');

    await app.close();
  });

  /**
   * Et les colonnes ne sont pas LUES : un `select` qui les ramène puis un
   * `map` qui les retire laisse le secret traverser le processus, les journaux
   * de requête Prisma et toute erreur sérialisée en chemin. Le retrait se fait
   * à la REQUÊTE, pas à la sérialisation.
   */
  it('ne les DEMANDE pas à la base — le retrait est dans le select, pas dans un map', async () => {
    const app = monter();
    await app.inject({ method: 'GET', url: '/admin/users/u1/activity' });

    expect((selects.conversationShareLink as Record<string, unknown>)?.linkId).toBeUndefined();
    expect((selects.trackingLink as Record<string, unknown>)?.token).toBeUndefined();
    expect((selects.affiliateToken as Record<string, unknown>)?.token).toBeUndefined();

    await app.close();
  });
});

describe('#4157 R10 — un seul seuil gouverne la table des signalements', () => {
  it('exige canModerateContent, comme GET /admin/reports — pas le seul canViewUsers', async () => {
    const app = monter();
    await app.inject({ method: 'GET', url: '/admin/users/u1/reports' });

    const demandees = hasPermission.mock.calls.map((c) => c[1]);
    expect(demandees).toContain('canModerateContent');

    await app.close();
  });

  it('REFUSE un rôle qui voit les utilisateurs mais ne modère pas (AUDIT)', async () => {
    hasPermission.mockImplementation((_role, perm) => perm !== 'canModerateContent');

    const app = monter('AUDIT');
    const res = await app.inject({ method: 'GET', url: '/admin/users/u1/reports' });

    expect(res.statusCode).toBe(403);

    await app.close();
  });
});
