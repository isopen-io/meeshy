/**
 * AUDIT ne doit plus lire le CORPS d'un message signalé (#4494).
 *
 * `GET /admin/users/:userId/reported-messages` lit la même table `Report` que
 * `GET /admin/users/:userId/reports`, dont #4157 a relevé le seuil à
 * `canModerateContent` sans regarder cette porte voisine — restée à
 * `canViewUsers` seul, alors qu'elle sert en plus le texte intégral de
 * chaque message signalé. Matrice mesurée dans `permissions.service.ts` :
 * AUDIT porte `canViewUsers` et PAS `canModerateContent` — l'écart entre les
 * deux seuils EST le rôle AUDIT.
 *
 * DÉCISION (réservation #4494, option b) : la porte reste ouverte à AUDIT —
 * il garde les métadonnées du signalement, c'est son métier d'auditer la
 * modération — mais `content` tombe à `null` pour lui. Même motif que
 * `attachmentProtectionSelect` (`routes/admin/users.ts`) pour les
 * médias protégés : la ligne reste, seul le CONTENU ne voyage pas.
 *
 * POURQUOI LE TÉMOIN EST ÉCRIT SUR AUDIT, ET NULLE PART AILLEURS : USER et
 * ANALYST n'ont pas `canViewUsers` et sont donc déjà refusés en 403 par
 * `requireUserViewAccess`, AVANT que ce handler n'existe. Un témoin posé sur
 * l'un d'eux ne pourrait jamais tomber, qu'on retire la garde de `content` ou
 * non — la garde juste et la garde absente y rendent le MÊME verdict (403).
 * AUDIT est le SEUL rôle qui franchit `requireUserViewAccess` sans porter
 * `canModerateContent` : c'est le seul rang où défaut et correctif sont
 * observables.
 *
 * Le témoin miroir (ADMIN garde `content`) n'est pas une formalité : sans
 * lui, un correctif qui viderait `content` pour TOUT LE MONDE passerait ce
 * fichier au vert en retirant à AUDIT une capacité qu'il n'a jamais eu à
 * perdre — l'option (a), explicitement écartée par la décision ci-dessus.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';

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

import { userAdminRoutes, SEUILS_REPORT, REPORT_PERMISSION_LA_PLUS_HAUTE } from '../../../../routes/admin/users';

const MESSAGE_SIGNALE = {
  id: 'msg1',
  content: 'texte privé du message signalé',
  conversationId: 'conv1',
  messageType: 'text',
  createdAt: new Date('2026-08-01'),
  deletedAt: null,
};

const REPORT_FIXTURE = {
  id: 'rep1',
  reportedEntityId: 'msg1',
  reportType: 'harassment',
  reason: 'Contenu abusif',
  status: 'PENDING',
  reporterId: 'reporter1',
  reporterName: 'Reporter',
  createdAt: new Date('2026-08-02'),
  resolvedAt: null,
};

function buildPrisma() {
  return {
    user: { findUnique: jest.fn(async () => ({ id: 'u1' })) },
    participant: { findMany: jest.fn(async () => [{ id: 'p1' }]) },
    message: {
      findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 'msg1' }])
        .mockResolvedValueOnce([MESSAGE_SIGNALE]),
    },
    report: {
      findMany: jest.fn(async () => [REPORT_FIXTURE]),
      count: jest.fn(async () => 1),
    },
  };
}

function monter(role: string): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', buildPrisma() as never);
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
  // Matrice réelle (permissions.service.ts) : AUDIT porte canViewUsers, pas
  // canModerateContent — c'est très exactement l'écart que ce lot ferme.
  hasPermission.mockImplementation((role, perm) => {
    if (perm === 'canModerateContent') return role !== 'AUDIT';
    return true;
  });
});

describe("#4494 — le CONTENU d'un message signalé ne voyage plus vers AUDIT", () => {
  it('AUDIT : les métadonnées du signalement restent servies, `content` tombe à null', async () => {
    const app = monter('AUDIT');
    const res = await app.inject({ method: 'GET', url: '/admin/users/u1/reported-messages' });

    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{
      id: string;
      reportType: string;
      reporterId: string;
      message: { id: string; content: string | null } | null;
    }>;
    expect(data[0].id).toBe('rep1');
    // Les métadonnées du signalement — le métier d'AUDIT — restent entières.
    expect(data[0].reportType).toBe('harassment');
    expect(data[0].reporterId).toBe('reporter1');
    // La ligne du message reste (l'auditeur sait QU'IL EXISTE) ; seul le
    // texte qu'il porte est retiré.
    expect(data[0].message).not.toBeNull();
    expect(data[0].message?.id).toBe('msg1');
    expect(data[0].message?.content).toBeNull();

    await app.close();
  });

  it("ADMIN : content reste servi — le témoin miroir, sans quoi rien ne prouve qu'on a retiré la bonne chose à la bonne personne", async () => {
    const app = monter('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/admin/users/u1/reported-messages' });

    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{ message: { content: string | null } | null }>;
    expect(data[0].message?.content).toBe('texte privé du message signalé');

    await app.close();
  });

  it("MODERATOR : content reste servi — canModerateContent n'est pas réservé à ADMIN/BIGBOSS", async () => {
    const app = monter('MODERATOR');
    const res = await app.inject({ method: 'GET', url: '/admin/users/u1/reported-messages' });

    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{ message: { content: string | null } | null }>;
    expect(data[0].message?.content).toBe('texte privé du message signalé');

    await app.close();
  });
});

describe('#4494 — balayage : les deux portes qui lisent Report portent un seuil cohérent, ou leur écart est déclaré', () => {
  // #4284 — les deux portes qui lisent `Report` (et SEUILS_REPORT lui-même)
  // ont été extraites de `routes/admin/users.ts` (alors à 1043 lignes) vers
  // `routes/admin/user-reports.ts`, une unité nommable à part entière : c'est
  // désormais CE fichier-là qui porte l'intégralité de la surface `Report`,
  // donc celui que ce balayage doit lire pour rester une mesure du réel.
  const SOURCE = readFileSync(join(__dirname, '../../../../routes/admin/user-reports.ts'), 'utf8');

  // Chaque enregistrement de route de ce fichier commence par
  // `fastify.<verbe><` en tête de ligne à deux espaces (vérifié par relecture
  // du fichier, pas supposé). Découper dessus donne un « chunk » par route ;
  // compter ceux qui référencent `Report` mesure le nombre RÉEL de portes à
  // déclarer, sans dépendre d'une liste tenue à la main — une troisième porte
  // ajoutée sans déclaration fait rougir le premier test ci-dessous.
  const routeChunks = SOURCE.split(/\n {2}fastify\.(?:get|post|put|patch|delete)</).slice(1);
  const chunksReadingReport = routeChunks.filter((c) => c.includes('.prisma.report.'));

  it('le fichier ne porte que les deux portes attendues sur Report — sinon SEUILS_REPORT est en retard', () => {
    expect(chunksReadingReport).toHaveLength(SEUILS_REPORT.length);
    expect([...SEUILS_REPORT].map((s) => s.porte).sort()).toEqual([
      'GET /admin/users/:userId/reported-messages',
      'GET /admin/users/:userId/reports',
    ]);
  });

  it('toute entrée sous le seuil le plus haut PORTE sa raison ; aucune ne la porte au seuil le plus haut', () => {
    for (const seuil of SEUILS_REPORT) {
      if (seuil.permission === REPORT_PERMISSION_LA_PLUS_HAUTE) {
        expect(seuil.raisonEcart).toBeUndefined();
      } else {
        expect(seuil.raisonEcart?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('la porte déclarée au seuil le plus haut REFUSE un AUDIT ; celle en écart le laisse passer', async () => {
    const reportsEntry = SEUILS_REPORT.find((s) => s.porte === 'GET /admin/users/:userId/reports');
    const reportedMessagesEntry = SEUILS_REPORT.find((s) => s.porte === 'GET /admin/users/:userId/reported-messages');
    expect(reportsEntry).toBeDefined();
    expect(reportedMessagesEntry).toBeDefined();

    const appReports = monter('AUDIT');
    const resReports = await appReports.inject({ method: 'GET', url: '/admin/users/u1/reports' });
    expect(resReports.statusCode).toBe(reportsEntry!.permission === REPORT_PERMISSION_LA_PLUS_HAUTE ? 403 : 200);
    await appReports.close();

    const appReportedMessages = monter('AUDIT');
    const resReportedMessages = await appReportedMessages.inject({ method: 'GET', url: '/admin/users/u1/reported-messages' });
    expect(resReportedMessages.statusCode).toBe(reportedMessagesEntry!.permission === REPORT_PERMISSION_LA_PLUS_HAUTE ? 403 : 200);
    await appReportedMessages.close();
  });
});
