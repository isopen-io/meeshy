/**
 * `GET /admin/conversations` — le listing de l'instance (#6861).
 *
 * Trois classes de défaut, trois familles de témoins :
 *
 * 1. **LE RANG.** La route est souveraine. Un ADMIN et un AUDIT portent
 *    `canViewUsers` et lisent déjà `GET /admin/users/:id/conversations` : si le
 *    seuil glissait, l'écart ne se verrait par AUCUN symptôme — la route
 *    répondrait, simplement à plus de monde. Le témoin de rang est donc le seul
 *    qui puisse le dire.
 * 2. **LE CONTENU.** Cette route sert des MÉTADONNÉES. Un `select` élargi par
 *    inadvertance (un `lastMessage` « pour l'aperçu ») ouvrirait une lecture que
 *    le motif écrit de la route voisine garde. Le témoin interroge la charge
 *    SERVIE, pas le `select` : c'est ce qui part qui compte.
 * 3. **LA COMPOSITION DU `where`.** La recherche pose un `OR` ; posé à la racine
 *    à côté d'un autre, il s'écraserait en silence. Le témoin lit l'argument
 *    réellement remis à Prisma.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADMIN_ID = '507f1f77bcf86cd799439001';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

type AnyRecord = Record<string, unknown>;

/** Les arguments RÉELLEMENT remis à Prisma — c'est sur eux que porte la 3e famille. */
type Espion = { findManyArgs: AnyRecord | null };

function createMockPrisma(opts: { conversations?: AnyRecord[]; total?: number }, espion: Espion) {
  return {
    conversation: {
      findMany: jest.fn(async (args?: AnyRecord) => {
        espion.findManyArgs = args ?? null;
        return opts.conversations ?? [];
      }),
      count: jest.fn(async () => opts.total ?? (opts.conversations?.length ?? 0)),
    },
  } as unknown as PrismaClient;
}

async function buildApp(prisma: PrismaClient, role: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  (app as unknown as { prisma: PrismaClient }).prisma = prisma;

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = role
      ? {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: ADMIN_ID,
          registeredUser: { id: ADMIN_ID, role },
          hasFullAccess: true,
        }
      : { isAuthenticated: false, isAnonymous: false };
  });

  const { registerConversationsSovereignRoute } = await import('../../../routes/admin/conversations-sovereign');
  await app.register(
    async (instance) => {
      registerConversationsSovereignRoute(instance);
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
  return app;
}

function conversationsFixture(): AnyRecord[] {
  return [
    {
      id: 'c1',
      identifier: 'equipe-produit',
      title: 'Équipe produit',
      type: 'group',
      avatar: null,
      isActive: true,
      communityId: null,
      createdAt: new Date('2026-05-01').toISOString(),
      lastMessageAt: new Date('2026-06-02').toISOString(),
      // La colonne `memberCount` est MORTE : la fixture lui donne une valeur
      // FAUSSE exprès. Si la route la servait au lieu du `_count`, le témoin
      // lirait 99 — c'est ainsi qu'on prouve qu'elle ne la lit pas.
      memberCount: 99,
      _count: { participants: 4 },
      participants: [
        { id: 'p1', userId: 'u1', type: 'user', displayName: 'Alice', avatar: null, role: 'ADMIN', joinedAt: new Date('2026-05-01').toISOString(), isActive: true },
      ],
    },
  ];
}

async function lister(url: string, role: string, opts: { conversations?: AnyRecord[]; total?: number } = {}) {
  const espion: Espion = { findManyArgs: null };
  const prisma = createMockPrisma({ conversations: opts.conversations ?? conversationsFixture(), ...opts }, espion);
  const app = await buildApp(prisma, role);
  const res = await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer x' } });
  await app.close();
  return { res, espion };
}

/**
 * LE SEUIL EST DOUBLE, et c'est ce que ces quatre témoins mesurent.
 *
 * Directive porteur du 2026-09-16 : « permettre aussi aux ADMIN de pouvoir
 * accéder à ces informations pour le moment ». La route exige donc la
 * permission `canManageConversations` **et** le rang (BIGBOSS ou ADMIN).
 *
 * Le témoin qui porte tout le poids est celui du MODERATOR : il PORTE
 * `canManageConversations` (matrice centrale), et seule la garde de rang
 * l'arrête. Une route gardée par la seule permission passerait les trois
 * autres témoins sans broncher, et n'échouerait que sur celui-là.
 */
describe('GET /admin/conversations — le rang', () => {
  it('sert un BIGBOSS', async () => {
    const { res } = await lister('/api/v1/admin/conversations', 'BIGBOSS');
    expect(res.statusCode).toBe(200);
  });

  it('sert un ADMIN — directive porteur du 2026-09-16', async () => {
    const { res } = await lister('/api/v1/admin/conversations', 'ADMIN');
    expect(res.statusCode).toBe(200);
  });

  it('refuse un MODERATOR — il PORTE la permission, il n\'a pas le RANG', async () => {
    // Le témoin qui distingue une garde de rang d'une garde de permission.
    const { res } = await lister('/api/v1/admin/conversations', 'MODERATOR');
    expect(res.statusCode).toBe(403);
  });

  it('refuse un AUDIT — il n\'a ni la permission ni le rang', async () => {
    const { res } = await lister('/api/v1/admin/conversations', 'AUDIT');
    expect(res.statusCode).toBe(403);
  });

  it('refuse un USER', async () => {
    const { res } = await lister('/api/v1/admin/conversations', 'USER');
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /admin/conversations — ce qui est servi', () => {
  it('ne laisse partir AUCUNE clé de contenu de message', async () => {
    const { res } = await lister('/api/v1/admin/conversations', 'BIGBOSS');
    expect(res.statusCode).toBe(200);

    // Le test porte sur la charge SERVIE, pas sur le `select` : c'est ce qui
    // part qui compte, et un champ peut arriver par un `include` voisin.
    const brut = JSON.stringify(res.json());
    for (const interdit of ['content', 'lastMessage', 'messages', 'preview', 'transcript']) {
      expect(brut).not.toContain(`"${interdit}"`);
    }
  });

  it('sert le compte des participants ACTIFS, jamais la colonne morte `memberCount`', async () => {
    const { res } = await lister('/api/v1/admin/conversations', 'BIGBOSS');
    const ligne = res.json().data[0] as AnyRecord;

    // La fixture porte `memberCount: 99` et `_count.participants: 4`.
    expect(ligne.memberCount).toBe(4);
    expect(ligne.memberCount).not.toBe(99);
  });

  it('sert la pagination À CÔTÉ de `data`, comme ses voisines — jamais dedans', async () => {
    const { res } = await lister('/api/v1/admin/conversations?offset=0&limit=20', 'BIGBOSS', { total: 42 });
    const corps = res.json();

    expect(Array.isArray(corps.data)).toBe(true);
    expect(corps.pagination).toMatchObject({ total: 42, offset: 0, limit: 20, hasMore: true });
    expect((corps.data as AnyRecord[])[0]).not.toHaveProperty('pagination');
  });
});

describe('GET /admin/conversations — la composition du `where`', () => {
  it('range la recherche dans un `AND`, son `OR` intact — deux `OR` frères s\'écraseraient', async () => {
    const { espion } = await lister('/api/v1/admin/conversations?search=produit&type=group', 'BIGBOSS');
    const where = espion.findManyArgs?.where as AnyRecord;

    expect(where).toHaveProperty('AND');
    expect(where).not.toHaveProperty('OR');
    const clauses = where.AND as AnyRecord[];
    expect(clauses).toContainEqual({ type: 'group' });
    const recherche = clauses.find((c) => 'OR' in c);
    expect(recherche).toBeDefined();
    expect((recherche?.OR as AnyRecord[]).length).toBe(2);
  });

  it('ignore un filtre VIDE plutôt que de ne rien rendre', async () => {
    const { espion } = await lister('/api/v1/admin/conversations?type=&search=', 'BIGBOSS');
    const where = espion.findManyArgs?.where as AnyRecord;

    // `type: ''` ne rendrait AUCUNE conversation là où l'appelant les voulait
    // toutes — un filtre vide n'est pas un filtre.
    expect(where).toEqual({});
  });

  it('REFUSE une borne de date illisible au SCHÉMA, avant le handler — jamais un 500 de Prisma', async () => {
    const { res, espion } = await lister('/api/v1/admin/conversations?createdAfter=pas-une-date', 'BIGBOSS');

    // `format: 'date-time'` est validé par AJV AVANT que le handler existe.
    // Mesuré : `findMany` n'est jamais appelé. L'appelant apprend donc son
    // erreur, au lieu de recevoir une liste silencieusement NON filtrée — ce
    // que « ignorer la borne » aurait produit, et qui est pire qu'un refus.
    expect(res.statusCode).toBe(400);
    expect(espion.findManyArgs).toBeNull();
  });

  it('accepte une borne VALIDE et la pose sur `createdAt`', async () => {
    const { res, espion } = await lister(
      '/api/v1/admin/conversations?createdAfter=2026-06-01T00:00:00.000Z',
      'BIGBOSS',
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(espion.findManyArgs?.where)).toContain('createdAt');
  });

  it('REFUSE au schéma un tri qui n\'existe pas — `memberCount` est une colonne MORTE', async () => {
    const { res, espion } = await lister('/api/v1/admin/conversations?sort=memberCount', 'BIGBOSS');

    // Trier par effectif trierait sur des zéros avec l'air de fonctionner
    // (loi 4). L'`enum` du schéma le refuse AVANT le handler — mesuré :
    // `findMany` n'est jamais appelé. Le repli du handler reste la SECONDE
    // ligne, pour le jour où l'énumération du schéma bougerait sans lui.
    expect(res.statusCode).toBe(400);
    expect(espion.findManyArgs).toBeNull();
  });

  it('trie par `lastMessageAt` quand aucun tri n\'est demandé', async () => {
    const { espion } = await lister('/api/v1/admin/conversations', 'BIGBOSS');
    expect(espion.findManyArgs?.orderBy).toEqual({ lastMessageAt: 'desc' });
  });

  it('honore le tri `createdAt` quand il est demandé', async () => {
    const { espion } = await lister('/api/v1/admin/conversations?sort=createdAt', 'BIGBOSS');
    expect(espion.findManyArgs?.orderBy).toEqual({ createdAt: 'desc' });
  });
});
