/**
 * Témoin — la clé de TRI de `GET /admin/reports` est CLOSE, jamais celle du client.
 *
 * `services/admin/report.service.ts` compose son ordre par
 * `orderBy[sortBy] = sortOrder` : la clé arrive TELLE QUELLE dans le `orderBy`
 * Prisma. Le seul appelant de `listReports` est cette route (mesuré : 1), et
 * elle lisait `request.query as any` puis posait `sortBy: query.sortBy ||
 * 'createdAt'` — le `as any` faisant sauter la liste blanche que le type
 * partagé DÉCLARE pourtant déjà (`ReportFilters['sortBy']`, trois colonnes de
 * date, `packages/shared/types/report.ts`). Un contrat que le compilateur ne
 * voit plus n'est plus un contrat.
 *
 * Directive du 2026-08-25 : « une SÉLECTION ou un ORDRE qui dépend de la
 * présence révèle autant que le champ ». `routes/admin/users.ts` refuse déjà
 * `isOnline`/`lastActiveAt` comme clé de tri (`PRESENCE_SORT_KEYS`) sur la
 * route qui ordonne des lignes `User`. Ici la liste est CLOSE plutôt que
 * noire : elle retient au passage les RELATIONS (`reporter`, `moderator`, deux
 * relations vers `User` que Prisma sait ordonner) et toute colonne future,
 * sans qu'il faille tenir à jour une liste d'interdits.
 *
 * Les cas ci-dessous sont choisis là où la règle JUSTE et la règle FAUSSE
 * DIVERGENT — une clé hors liste, dont la présence — et les deux clés valides
 * hors défaut prouvent que le témoin n'observe pas un simple écrasement à
 * `createdAt`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterAll, beforeAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/pagination', () => ({
  validatePagination: jest.fn<any>().mockReturnValue({ offset: 0, limit: 10 }),
  buildPaginationMeta: jest.fn<any>().mockReturnValue({ total: 0, limit: 10, offset: 0 }),
}));

const mockListReports = jest.fn<any>().mockResolvedValue({ reports: [], total: 0 });

jest.mock('../../../../services/admin/report.service', () => ({
  getReportService: jest.fn().mockReturnValue({
    createReport: jest.fn<any>(),
    listReports: (...a: any[]) => mockListReports(...a),
    getReportStats: jest.fn<any>(),
    getRecentReports: jest.fn<any>(),
    getReportById: jest.fn<any>(),
    updateReport: jest.fn<any>(),
    deleteReport: jest.fn<any>(),
    getReportsForEntity: jest.fn<any>(),
    assignModerator: jest.fn<any>(),
    getModeratorReports: jest.fn<any>(),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { reportRoutes } from '../../../../routes/admin/reports';

const USER_ID = '507f1f77bcf86cd799439011';

async function buildApp(role = 'MODERATOR'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });
  app.decorate('prisma', {
    message: { findUnique: async () => ({ conversationId: '507f1f77bcf86cd799439077' }) },
    participant: { findFirst: async () => ({ id: 'p1' }) },
    adminAuditLog: { create: jest.fn<any>() },
  } as any);

  await app.register(reportRoutes);
  await app.ready();
  return app;
}

/** La clé de tri RÉELLEMENT remise au service, pour une querystring donnée. */
async function servedSort(app: FastifyInstance, query: string): Promise<{ sortBy: unknown; sortOrder: unknown }> {
  mockListReports.mockClear();
  const res = await app.inject({ method: 'GET', url: `/${query}` });
  expect(res.statusCode).toBe(200);
  expect(mockListReports).toHaveBeenCalledTimes(1);
  const [filters] = mockListReports.mock.calls[0] as [{ sortBy: unknown; sortOrder: unknown }];
  return { sortBy: filters.sortBy, sortOrder: filters.sortOrder };
}

describe('GET /admin/reports — la clé de tri remise au service', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { mockListReports.mockResolvedValue({ reports: [], total: 0 }); });

  // Non-vacuité : la liste blanche n'est pas un écrasement. Deux clés valides
  // AUTRES que le défaut traversent inchangées — sans ces deux témoins, un
  // `sortBy: 'createdAt'` en dur passerait tous les autres cas au vert.
  it('laisse passer `updatedAt` — la liste est blanche, pas un écrasement', async () => {
    expect(await servedSort(app, '?sortBy=updatedAt')).toEqual({ sortBy: 'updatedAt', sortOrder: 'desc' });
  });

  it('laisse passer `resolvedAt`', async () => {
    expect(await servedSort(app, '?sortBy=resolvedAt&sortOrder=asc')).toEqual({ sortBy: 'resolvedAt', sortOrder: 'asc' });
  });

  it('sans `sortBy`, sert le défaut `createdAt` décroissant', async () => {
    expect(await servedSort(app, '')).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  // Les deux colonnes que la visibilité de la présence garde. `Report` ne les
  // PORTE pas aujourd'hui — c'est justement pourquoi la liste doit être close :
  // elle tient sans dépendre de la forme actuelle du modèle.
  it.each(['isOnline', 'lastActiveAt'])(
    'refuse `%s` comme clé de tri — un ORDRE qui dépend de la présence la révèle',
    async (key) => {
      expect(await servedSort(app, `?sortBy=${key}`)).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
    },
  );

  // `reporter`/`moderator` sont les deux relations `Report → User` ; Prisma
  // sait ordonner par une relation to-one, et c'est par là qu'une colonne de
  // présence rentrerait sans jamais figurer dans le modèle `Report`.
  it.each(['reporter', 'moderator'])('refuse la relation `%s` comme clé de tri', async (key) => {
    expect(await servedSort(app, `?sortBy=${key}`)).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('refuse une clé inconnue', async () => {
    expect(await servedSort(app, '?sortBy=moderatorNotes')).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  // Répété, `sortBy` arrive en TABLEAU (parseur de Fastify) : `orderBy[[a,b]]`
  // composerait la clé `"a,b"`. Un objet imbriqué, lui, est hors d'atteinte —
  // le parseur par défaut de Fastify 5 rend `sortOrder[isOnline]` comme une
  // clé PLATE (mesuré) — mais la liste close n'en dépend pas.
  it('refuse un `sortBy` répété (tableau)', async () => {
    expect(await servedSort(app, '?sortBy=createdAt&sortBy=isOnline')).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it.each(['DESC', 'ascending', ''])('normalise un `sortOrder` hors `asc`/`desc` (%s) en `desc`', async (order) => {
    expect(await servedSort(app, `?sortOrder=${order}`)).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });
});
