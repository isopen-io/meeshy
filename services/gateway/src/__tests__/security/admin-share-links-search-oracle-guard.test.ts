/**
 * `GET /admin/share-links?search=` ne répond plus « ce secret de jointure
 * contient-il cette sous-chaîne ? » (#4693).
 *
 * ## Le défaut, et pourquoi la charge servie ne le montre pas
 *
 * La réponse ne porte plus les clés de jointure (#4692). Mais le filtre les
 * INTERROGEAIT toujours :
 *
 * ```ts
 * where.OR = [{ linkId: { contains: search, mode: 'insensitive' } }, …]
 * ```
 *
 * Ce n'est pas la charge qui fuyait, c'est l'**APPARTENANCE de la ligne à la
 * page**. Un secret de la forme `mshy_` + 8 base62, comparé sans casse, s'extrait
 * caractère par caractère : on demande `mshy_a`, puis `mshy_aa`… et la présence
 * ou l'absence de la ligne répond. Quelques centaines de requêtes suffisent, au
 * seuil `canManageConversations` — MODERATOR compris.
 *
 * C'est **exactement** la classe fermée par #4387 sur `GET /admin/messages` :
 * « une SÉLECTION qui dépend du champ révèle autant que le champ ». La forme y
 * était coûteuse — le prédicat de protection n'étant pas exprimable en `where`,
 * il fallait scanner une fenêtre bornée, filtrer, puis paginer sur les `id`
 * restants. Ici la même règle se pose à sa source, sans rien coûter : la
 * colonne interrogée est connue AVANT la requête, donc on ne l'interroge pas.
 * On retire un terme du `OR`, on ne filtre pas après coup.
 *
 * ## Pourquoi ce témoin porte sur l'APPARTENANCE, jamais sur la charge
 *
 * Un témoin qui vérifierait que la réponse ne contient pas le secret serait
 * vert AVANT le correctif : le `select` ne le sert déjà plus. Le seul témoin
 * qui puisse tomber interroge donc ce que le double de Prisma FAIT du `where` —
 * une ligne dont SEULE une clé de jointure matche doit être absente de la page,
 * et absente du `total`.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../services/admin/permissions.service', () => ({
  permissionsService: {
    hasPermission: () => true,
    canManageUser: () => true,
    getPermissions: () => ({
      canAccessAdmin: true,
      canViewUsers: true,
      canViewUserDetails: true,
      canViewSensitiveData: false,
      canCreateUsers: false,
      canUpdateUsers: false,
      canUpdateUserRoles: false,
      canDeleteUsers: false,
      canResetPasswords: false,
      canViewAuditLogs: false,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: false,
      canModerateContent: true,
      canManageNotifications: false,
      canManageTranslations: false,
    }),
  },
}));
jest.mock('../../utils/logger', () => ({ logError: jest.fn() }));

import { registerContentShareLinkRoutes } from '../../routes/admin/content-share-links';
import { SHARE_LINK_JOIN_KEY_COLUMNS } from '../../routes/conversations/link-admission';

const LINK_ROW_ID = '507f1f77bcf86cd799439033';

/**
 * Un secret de la FORME de production — `mshy_` + 8 base62 — pour chaque
 * colonne que la loi de jointure reconnaît. Le fixture se dérive de la loi :
 * une colonne ajoutée demain au `OR` de `findShareLinkByKey` peuple ce tableau
 * sans qu'on y touche, et le témoin tombe si la recherche l'interroge.
 */
const SECRETS: Record<string, string> = Object.fromEntries(
  SHARE_LINK_JOIN_KEY_COLUMNS.map((colonne, rang) => [colonne, `mshy_Zq7${rang}Kb2X`])
);

const LIGNE = {
  id: LINK_ROW_ID,
  ...SECRETS,
  name: 'Campagne rentree',
  description: null,
  maxUses: null,
  currentUses: 0,
  maxConcurrentUsers: null,
  currentConcurrentUsers: 0,
  expiresAt: null,
  isActive: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: true,
  createdAt: new Date('2026-08-01'),
  creator: { id: 'u1', username: 'createur', displayName: 'C', avatar: null },
  conversation: { id: 'c1', identifier: 'mshy_conv', title: 'T', type: 'group' },
};

type Clause = Record<string, { contains?: string; mode?: string } | unknown>;

/**
 * Le double APPLIQUE le `where` : un Prisma de test qui rend la ligne quelle
 * que soit la clause ne teste RIEN de l'appartenance — c'est la leçon que le
 * dépôt a déjà payée sur le `select`, portée au `where`.
 */
function matche(where: { OR?: Clause[] } | undefined): boolean {
  const clauses = where?.OR;
  if (!clauses) return true;
  return clauses.some((clause) =>
    Object.entries(clause).some(([colonne, predicat]) => {
      const terme = (predicat as { contains?: string })?.contains;
      const valeur = (LIGNE as Record<string, unknown>)[colonne];
      if (typeof terme !== 'string' || typeof valeur !== 'string') return false;
      return valeur.toLowerCase().includes(terme.toLowerCase());
    })
  );
}

function makePrisma() {
  return {
    conversationShareLink: {
      findMany: jest.fn(async (args: { where?: { OR?: Clause[] } }) =>
        matche(args?.where) ? [LIGNE] : []
      ),
      count: jest.fn(async (args: { where?: { OR?: Clause[] } }) => (matche(args?.where) ? 1 : 0)),
    },
    participant: { groupBy: jest.fn(async () => []) },
  };
}

async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma() as never);
  app.decorate('authenticate', async (request: { authContext: unknown }) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'admin1',
      registeredUser: { id: 'admin1', role: 'MODERATOR', username: 'a' },
    };
  });
  app.register(registerContentShareLinkRoutes);
  await app.ready();
  return app;
}

async function chercher(terme: string) {
  const app = await monter();
  const res = await app.inject({
    method: 'GET',
    url: `/share-links?search=${encodeURIComponent(terme)}`,
  });
  await app.close();
  expect(res.statusCode).toBe(200);
  const corps = res.json() as {
    data: Array<Record<string, unknown>>;
    pagination: { total: number };
  };
  return corps;
}

describe("#4693 — l'appartenance à la page ne répond plus sur une clé de jointure", () => {
  it.each([...SHARE_LINK_JOIN_KEY_COLUMNS])(
    'un préfixe de `%s` ne fait apparaître AUCUNE ligne',
    async (colonne) => {
      const secret = SECRETS[colonne];

      // Le préfixe de marque seul : la première question d'une extraction
      // caractère par caractère.
      expect((await chercher(secret.slice(0, 6))).data).toHaveLength(0);
      // Le secret ENTIER : si même lui ne sélectionne rien, aucun préfixe ne le peut.
      const entier = await chercher(secret);
      expect(entier.data).toHaveLength(0);
      expect(entier.pagination.total).toBe(0);
    }
  );

  it("garde la recherche par nom — le correctif ne retire rien à l'usage légitime", async () => {
    const trouve = await chercher('rentree');
    expect(trouve.data).toHaveLength(1);
    expect(trouve.data[0]?.id).toBe(LINK_ROW_ID);
    expect(trouve.pagination.total).toBe(1);
  });

  it('reste insensible à la casse sur le nom', async () => {
    expect((await chercher('RENTREE')).data).toHaveLength(1);
  });
});
