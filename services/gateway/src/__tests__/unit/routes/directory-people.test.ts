/**
 * Chercher une personne se fait à une seule porte, par les noms seulement (#4159).
 *
 * `GET /users/search` faisait un `contains` NON ancré, insensible à la casse,
 * sur cinq colonnes dont trois n'étaient indexées par rien : chaque frappe
 * balayait la collection entière. C'est le défaut le plus coûteux du module, et
 * le moins visible — rien ne le signale à part la latence.
 *
 * Sa pagination MENTAIT aussi : en `offset` (donc un `count()` complet à chaque
 * page), avec un schéma déclarant `returned` — jamais produit — sans déclarer
 * `hasMore` — produit. `fast-json-stringify` retirait donc exactement ce que le
 * client attend, et **le client ne pouvait pas savoir s'il restait une page**.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
  mayOrderByRawPresence: () => false,
  servedOnlineFirst: () => 0,
}));

jest.mock('@meeshy/shared/utils/presence-visibility', () => ({
  applyPresenceVisibilityAsOffline: (u: unknown) => u,
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryPeopleRoutes } from '../../../routes/directory/people';
import { findManyIn } from '../../helpers/mongo-where';

const PREFIXE = '/api/v1/directory';
const VIEWER = '507f1f77bcf86cd799439011';

function buildApp(lignes: Array<Record<string, unknown>> = []) {
  const findMany = jest.fn<any>(async () => lignes);
  const prisma = {
    user: {
      findMany,
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
    },
  };
  return { prisma, findMany };
}

async function monter(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: VIEWER };
    req.authContext = { isAuthenticated: true, userId: VIEWER, registeredUser: { id: VIEWER } };
  });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', undefined as never);
  await app.register(directoryPeopleRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const chercher = (app: FastifyInstance, q: string) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/people?${q}` });

const comptes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `u-${i}`,
    username: `user${String(i).padStart(3, '0')}`,
    displayName: `User ${i}`,
    avatar: null,
  }));

describe('La recherche interroge l’INDEX, jamais cinq colonnes', () => {
  it('cherche par égalité exacte sur un jeton — pas par `contains`', async () => {
    const { prisma, findMany } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=Jean');

    const where = findMany.mock.calls[0][0].where as Record<string, any>;
    // L'égalité sur un élément de tableau est ce que le multikey sert. Un
    // `contains` non ancré retomberait en balayage complet, quel que soit
    // l'index posé.
    expect(where.searchTokens).toEqual({ has: 'jean' });
    expect(JSON.stringify(where)).not.toContain('contains');

    await app.close();
  });

  it('n’interroge NI ne rend l’adresse ou le numéro', async () => {
    const { prisma, findMany } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=jean');

    const args = findMany.mock.calls[0][0] as { where: unknown; select: Record<string, unknown> };
    // Joindre quelqu'un par son adresse a sa PROPRE porte, authentifiée et
    // bornée (#4160). Chercher par fragment de nom n'a pas à y toucher.
    expect(JSON.stringify(args.where)).not.toContain('email');
    expect(JSON.stringify(args.where)).not.toContain('phoneNumber');
    expect(args.select.email).toBeUndefined();
    expect(args.select.phoneNumber).toBeUndefined();

    await app.close();
  });

  it('applique la portée de contact — actif, non supprimé, blocage dans les deux sens', async () => {
    const { prisma, findMany } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=jean');

    const where = findMany.mock.calls[0][0].where as Record<string, any>;
    expect(where.isActive).toBe(true);
    // Le blocage vit désormais sous un `OR` avec `isSet: false` (#6452) : un
    // compte SANS `blockedUserIds` ne doit pas être écarté par le `NOT` — voir
    // `ContactDirectoryService.contactLookupScope.test.ts` pour la preuve par
    // évaluation contre un vrai document.
    const clausesAnd = where.AND as Array<Record<string, unknown>>;
    expect(JSON.stringify(clausesAnd)).toContain('isSet');
    const clauseBlocage = clausesAnd.find((clause) => JSON.stringify(clause).includes('blockedUserIds'));
    expect(clauseBlocage).toMatchObject({
      OR: [{ blockedUserIds: { isSet: false } }, { NOT: { blockedUserIds: { has: VIEWER } } }],
    });

    await app.close();
  });
});

/**
 * Preuve par ÉVALUATION contre de vrais documents (#6452), et pas seulement
 * par inspection de la FORME du `where` — ce que le reste du fichier fait, et
 * ce que le défaut d'origine traversait sans encombre : la forme était juste,
 * seule l'évaluation contre un champ ABSENT la trahissait. Reproduit le
 * scénario mesuré en staging : chercher « meeshy » retrouve le compte système
 * bien qu'il ne porte aucune clé `blockedUserIds`.
 */
describe('Un compte actif SANS `blockedUserIds` reste trouvable', () => {
  const MEESHY_SYSTEM_ACCOUNT = {
    id: 'meeshy-system',
    username: 'meeshy',
    displayName: 'meeshy sama',
    avatar: null,
    searchTokens: ['meeshy', 'me'],
    isActive: true,
    // pas de clé `blockedUserIds` du tout — le cas mesuré en staging
  };
  const BLOCKS_THE_VIEWER = {
    id: 'blocks-viewer',
    username: 'meeshyblocker',
    displayName: 'Bloque le lecteur',
    avatar: null,
    searchTokens: ['meeshyblocker', 'me'],
    isActive: true,
    blockedUserIds: [VIEWER],
  };

  function buildAppAvecVraiFiltrage(lignes: Array<Record<string, unknown>>) {
    const findMany = jest.fn<any>(findManyIn(lignes));
    const prisma = {
      user: {
        findMany,
        findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })),
      },
    };
    return { prisma, findMany };
  }

  it('rend le compte système « meeshy », qui n’a jamais posé `blockedUserIds`', async () => {
    const { prisma } = buildAppAvecVraiFiltrage([MEESHY_SYSTEM_ACCOUNT]);
    const app = await monter(prisma);

    const res = await chercher(app, 'q=meeshy');

    expect(res.json().data.map((u: { username: string }) => u.username)).toEqual(['meeshy']);

    await app.close();
  });

  it('écarte toujours un compte qui a réellement bloqué le lecteur', async () => {
    const { prisma } = buildAppAvecVraiFiltrage([MEESHY_SYSTEM_ACCOUNT, BLOCKS_THE_VIEWER]);
    const app = await monter(prisma);

    const res = await chercher(app, 'q=me');

    const usernames = res.json().data.map((u: { username: string }) => u.username);
    expect(usernames).toContain('meeshy');
    expect(usernames).not.toContain('meeshyblocker');

    await app.close();
  });
});

describe('La projection est MINIMALE, et la présence se demande', () => {
  it('ne rend que quatre champs par défaut', async () => {
    const { prisma, findMany } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=jean');

    const select = findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(Object.keys(select).sort()).toEqual(['avatar', 'displayName', 'id', 'username']);

    await app.close();
  });

  it('n’ajoute la présence que sur `?expand=presence`', async () => {
    const { prisma, findMany } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=jean&expand=presence');

    const select = findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select.isOnline).toBe(true);
    expect(select.lastActiveAt).toBe(true);

    await app.close();
  });
});

describe('La pagination dit enfin s’il reste une page', () => {
  it('DÉCLARE `hasMore` dans la charge SÉRIALISÉE', async () => {
    const { prisma } = buildApp(comptes(21));
    const app = await monter(prisma);

    const res = await chercher(app, 'q=jean&limit=20');

    // Le défaut d'origine est une suppression au SÉRIALISEUR : le témoin doit
    // donc lire la charge rendue, jamais l'objet du handler.
    const charge = res.json();
    expect(charge.pagination).toBeDefined();
    expect(charge.pagination.hasMore).toBe(true);
    expect(charge.pagination.nextCursor).toBe('user019');
    expect(charge.data).toHaveLength(20);

    await app.close();
  });

  it('dit `hasMore: false` sur la dernière page', async () => {
    const { prisma } = buildApp(comptes(5));
    const app = await monter(prisma);

    const res = await chercher(app, 'q=jean&limit=20');

    expect(res.json().pagination.hasMore).toBe(false);
    expect(res.json().pagination.nextCursor).toBeNull();

    await app.close();
  });

  it('pagine par CURSEUR — plus de `count()` ni d’`offset`', async () => {
    const { prisma, findMany } = buildApp(comptes(3));
    const app = await monter(prisma);

    await chercher(app, 'q=jean&cursor=user010');

    const args = findMany.mock.calls[0][0] as Record<string, any>;
    expect(args.cursor).toEqual({ username: 'user010' });
    expect(args.skip).toBe(1);
    // L'ordre stable s'applique EN BASE, donc avant la découpe de page : deux
    // pages consécutives ne peuvent ni se recouvrir ni laisser de trou.
    expect(args.orderBy).toEqual({ username: 'asc' });

    await app.close();
  });
});

describe('Le contrat', () => {
  it('refuse une saisie trop courte pour discriminer', async () => {
    const { prisma } = buildApp();
    const app = await monter(prisma);

    const res = await chercher(app, 'q=j');

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('plafonne la taille de page', async () => {
    const { prisma, findMany } = buildApp();
    const app = await monter(prisma);

    await chercher(app, 'q=jean&limit=5000');

    expect(findMany.mock.calls[0][0].take).toBeLessThanOrEqual(51);

    await app.close();
  });
});
