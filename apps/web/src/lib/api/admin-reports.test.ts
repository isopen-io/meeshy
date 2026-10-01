import { describe, expect, test } from 'bun:test';

import { OBJECT_ID, servedPerson as person, servedReport } from '@/lib/admin/report-fixtures';
import { resultatServi } from '@/test-support/served-pagination';

import { estClefNonPersistable } from './souverain';
import {
  ADMIN_REPORT_SIBLINGS_PAGE,
  ADMIN_REPORTS_KEY,
  ADMIN_REPORTS_LISTS_KEY,
  ADMIN_REPORTS_SIBLINGS_KEY,
  ADMIN_REPORTS_STATS_KEY,
  adminReportKey,
  adminReportSiblingsKey,
  adminReportsListKey,
  decideAdminReport,
  decodeAdminReport,
  decodeAdminReportStats,
  deleteAdminReport,
  assignAdminReport,
  loadAdminReport,
  loadAdminReportSiblings,
  loadAdminReports,
  loadAdminReportStats,
  type AdminReport,
} from './admin-reports';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * **LES SIGNALEMENTS, DÉCODÉS CHAMP PAR CHAMP** (#8876, #6726) — la forme
 * servie par `GET /admin/reports*` (schéma FERMÉ côté passerelle) : le
 * signalement, les deux personnes NOMMÉES (signalant, modérateur) et l'entité
 * signalée résolue. Un décodeur qui étalerait la charge recopierait, le jour où
 * la passerelle l'élargirait, tout ce qu'elle n'a pas déclaré — et ces réponses
 * portent l'extrait d'un contenu que l'auteur a peut-être voulu privé.
 */

describe('decodeAdminReport — champ par champ, forme figée', () => {
  test('garde exactement les champs affichés, noms de personnes et entité résolue compris', () => {
    const decoded = decodeAdminReport(servedReport());

    expect(decoded).toEqual({
      id: OBJECT_ID(1),
      reportedType: 'message',
      reportedEntityId: OBJECT_ID(2),
      reporterId: OBJECT_ID(3),
      reporterName: null,
      reportType: 'harassment',
      reason: 'Il me menace depuis hier',
      status: 'pending',
      moderatorId: null,
      moderatorNotes: null,
      actionTaken: null,
      createdAt: '2026-09-29T10:00:00.000Z',
      updatedAt: '2026-09-29T10:00:00.000Z',
      resolvedAt: null,
      reporter: { id: OBJECT_ID(3), username: 'membre3', displayName: 'Membre 3', avatar: null },
      moderator: null,
      reportedEntity: {
        type: 'message',
        id: OBJECT_ID(2),
        label: null,
        owner: { id: OBJECT_ID(4), username: 'membre4', displayName: 'Membre 4', avatar: null },
        excerpt: 'Tu vas voir',
        isProtected: false,
        deleted: false,
        conversation: { id: OBJECT_ID(5), title: 'Famille' },
        members: null,
      },
    });
  });

  test('garde de quoi nommer une conversation sans titre par ses membres — au rang d’administration seulement (#8876)', () => {
    const decoded = decodeAdminReport(
      servedReport({
        reportedEntity: {
          type: 'message',
          id: OBJECT_ID(2),
          label: null,
          owner: null,
          excerpt: null,
          isProtected: false,
          deleted: false,
          conversation: { id: OBJECT_ID(5), title: null },
          participants: [{ displayName: 'Awa Diop', username: 'awa', id: 'SECRET-ID' }],
          total: 2,
        },
      }),
    );

    expect(decoded?.reportedEntity?.members).toEqual({ participants: [{ displayName: 'Awa Diop', username: 'awa' }], total: 2 });
    expect(JSON.stringify(decoded)).not.toContain('SECRET-ID');
  });

  test('garde les notes du modérateur et l’action consignée', () => {
    const decoded = decodeAdminReport(
      servedReport({ status: 'resolved', moderatorId: OBJECT_ID(9), moderator: person(9), moderatorNotes: 'Message retiré', actionTaken: 'content_removed', resolvedAt: '2026-09-30T08:00:00.000Z' }),
    );

    expect(decoded?.moderatorNotes).toBe('Message retiré');
    expect(decoded?.actionTaken).toBe('content_removed');
    expect(decoded?.moderator?.displayName).toBe('Membre 9');
    expect(decoded?.resolvedAt).toBe('2026-09-30T08:00:00.000Z');
  });

  test('ne recopie RIEN de ce que la passerelle n’a pas déclaré (voisins de la ligne, de la personne, de l’entité)', () => {
    const decoded = decodeAdminReport(
      servedReport({
        ipAddress: '203.0.113.7',
        reporter: person(3, { email: 'x@y.z', passwordHash: 'secret', deviceFingerprint: 'abc' }),
        reportedEntity: {
          type: 'post',
          id: OBJECT_ID(2),
          label: null,
          owner: person(4, { phoneNumber: '+33600000000' }),
          excerpt: null,
          isProtected: true,
          deleted: false,
          conversation: null,
          geoPoint: { lat: 1, lng: 2 },
        },
      }),
    );

    const serialized = JSON.stringify(decoded);
    for (const leaked of ['203.0.113.7', 'x@y.z', 'secret', 'abc', '+33600000000', 'geoPoint']) expect(serialized).not.toContain(leaked);
    expect(Object.keys(decoded?.reporter ?? {}).sort()).toEqual(['avatar', 'displayName', 'id', 'username']);
  });

  test('une entité protégée porte isProtected et aucun extrait — jamais un vide qui se lirait « pas de texte »', () => {
    const decoded = decodeAdminReport(
      servedReport({ reportedEntity: { type: 'message', id: OBJECT_ID(2), label: null, owner: person(4), excerpt: null, isProtected: true, deleted: false, conversation: null } }),
    );

    expect(decoded?.reportedEntity?.isProtected).toBe(true);
    expect(decoded?.reportedEntity?.excerpt).toBeNull();
  });

  test('un signalement anonyme garde le nom d’expéditeur servi et aucun signalant', () => {
    const decoded = decodeAdminReport(servedReport({ reporterId: null, reporterName: 'Visiteur', reporter: null }));

    expect(decoded?.reporterName).toBe('Visiteur');
    expect(decoded?.reporter).toBeNull();
    expect(decoded?.reporterId).toBeNull();
  });

  test('les textes vides sont rendus null : la raison libre peut manquer', () => {
    const decoded = decodeAdminReport(servedReport({ reason: '   ', moderatorNotes: '' }));

    expect(decoded?.reason).toBeNull();
    expect(decoded?.moderatorNotes).toBeNull();
  });

  test('une entité absente du serveur reste null — elle n’est pas fabriquée', () => {
    expect(decodeAdminReport(servedReport({ reportedEntity: null }))?.reportedEntity).toBeNull();
  });

  test('une ligne sans identifiant, sans statut ou sans date de réception est illisible : null', () => {
    expect(decodeAdminReport(servedReport({ id: undefined }))).toBeNull();
    expect(decodeAdminReport(servedReport({ status: undefined }))).toBeNull();
    expect(decodeAdminReport(servedReport({ createdAt: undefined }))).toBeNull();
    expect(decodeAdminReport('pas un objet')).toBeNull();
    expect(decodeAdminReport(null)).toBeNull();
  });

  test('une personne sans identifiant est écartée, jamais réparée', () => {
    const decoded = decodeAdminReport(servedReport({ reporter: { username: 'fantome', displayName: 'Fantôme' } }));

    expect(decoded?.reporter).toBeNull();
  });
});

describe('decodeAdminReportStats — les six compteurs et les deux répartitions', () => {
  const served = {
    totalReports: 50,
    pendingReports: 12,
    underReviewReports: 3,
    resolvedReports: 20,
    rejectedReports: 5,
    dismissedReports: 10,
    reportsByType: { spam: 7, harassment: 20, other: 1 },
    reportsByReportedType: { message: 30, user: 15, post: 5 },
    averageResolutionTimeHours: 36.5,
    hiddenNeighbour: 'ne doit pas passer',
  };

  test('lit les compteurs et le délai moyen', () => {
    const stats = decodeAdminReportStats(served);

    expect(stats.total).toBe(50);
    expect(stats.pending).toBe(12);
    expect(stats.underReview).toBe(3);
    expect(stats.resolved).toBe(20);
    expect(stats.rejected).toBe(5);
    expect(stats.dismissed).toBe(10);
    expect(stats.averageResolutionHours).toBe(36.5);
  });

  test('range les répartitions de la plus grande à la plus petite, sans clé inconnue de valeur', () => {
    const stats = decodeAdminReportStats({ ...served, reportsByType: { spam: 7, harassment: 20, bad: 'x', other: 0 } });

    expect(stats.byType).toEqual([
      { key: 'harassment', count: 20 },
      { key: 'spam', count: 7 },
    ]);
    expect(stats.byReportedType.map((entry) => entry.key)).toEqual(['message', 'user', 'post']);
  });

  test('une charge partielle rend ZÉRO, jamais NaN, et jamais de voisin recopié', () => {
    const stats = decodeAdminReportStats({ pendingReports: 'beaucoup', hiddenNeighbour: 'x' });

    expect(stats).toEqual({
      total: 0,
      pending: 0,
      underReview: 0,
      resolved: 0,
      rejected: 0,
      dismissed: 0,
      averageResolutionHours: 0,
      byType: [],
      byReportedType: [],
    });
  });
});

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };

const recorder = (answer: (request: HttpRequest) => ApiResult<unknown>) => {
  const calls: Call[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      calls.push({ method: request.method, path: request.path, ...(request.body === undefined ? {} : { body: request.body }) });
      return answer(request);
    },
  } as unknown as HttpTransport;
  return { calls, deps: { source: 'gateway' as const, transport } };
};

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data, status: 200 });

describe('loadAdminReports — la forme V2 imbriquée, lue par la pagination servie', () => {
  test('lit les lignes et le total sous data.reports / data.pagination', async () => {
    const { deps, calls } = recorder(() =>
      resultatServi({ data: { reports: [servedReport(), servedReport({ id: OBJECT_ID(7) })], pagination: { total: 57, offset: 0, limit: 20, hasMore: true } } }),
    );

    const result = await loadAdminReports({ ...deps, query: new URLSearchParams({ offset: '0', limit: '20', status: 'pending' }) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows.map((row: AdminReport) => row.id)).toEqual([OBJECT_ID(1), OBJECT_ID(7)]);
    expect(result.data.total).toBe(57);
    expect(result.data.hasMore).toBe(true);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.path).toBe('/api/v1/admin/reports?offset=0&limit=20&status=pending');
  });

  test('écarte une ligne illisible et garde le total du serveur', async () => {
    const { deps } = recorder(() => resultatServi({ data: { reports: [servedReport(), { oups: true }], pagination: { total: 2, hasMore: false } } }));

    const result = await loadAdminReports({ ...deps, query: new URLSearchParams() });

    expect(result.ok && result.data.rows).toHaveLength(1);
    expect(result.ok && result.data.total).toBe(2);
  });

  test('un échec du transport est rendu tel quel', async () => {
    const { deps } = recorder(() => ({ ok: false, status: 403, error: 'Forbidden' }));

    expect(await loadAdminReports({ ...deps, query: new URLSearchParams() })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });
});

describe('loadAdminReportStats / loadAdminReport', () => {
  test('les statistiques sont lues à /admin/reports/stats', async () => {
    const { deps, calls } = recorder(() => ok({ totalReports: 1, pendingReports: 1 }));

    const result = await loadAdminReportStats(deps);

    expect(calls[0]?.path).toBe('/api/v1/admin/reports/stats');
    expect(result.ok && result.data.pending).toBe(1);
  });

  test('la fiche est lue à /admin/reports/:id et décodée', async () => {
    const { deps, calls } = recorder(() => ok(servedReport()));

    const result = await loadAdminReport({ ...deps, reportId: OBJECT_ID(1) });

    expect(calls[0]?.path).toBe(`/api/v1/admin/reports/${OBJECT_ID(1)}`);
    expect(result.ok && result.data.reportType).toBe('harassment');
  });

  test('une charge de fiche illisible est un ÉCHEC, jamais une fiche vide', async () => {
    const { deps } = recorder(() => ok({ pas: 'un signalement' }));

    const result = await loadAdminReport({ ...deps, reportId: OBJECT_ID(1) });

    expect(result.ok).toBe(false);
  });

  test('les autres signalements de l’entité : page V1 (pagination à côté), bornée', async () => {
    const { deps, calls } = recorder(() =>
      resultatServi({ data: [servedReport({ id: OBJECT_ID(8) })], pagination: { total: 9, offset: 0, limit: ADMIN_REPORT_SIBLINGS_PAGE, hasMore: true } }),
    );

    const result = await loadAdminReportSiblings({ ...deps, type: 'message', entityId: OBJECT_ID(2) });

    expect(calls[0]?.path).toBe(`/api/v1/admin/reports/entity/message/${OBJECT_ID(2)}?offset=0&limit=${ADMIN_REPORT_SIBLINGS_PAGE}`);
    expect(result.ok && result.data.total).toBe(9);
    expect(result.ok && result.data.rows.map((row: AdminReport) => row.id)).toEqual([OBJECT_ID(8)]);
  });
});

describe('les clés de requête — jamais écrites sur le disque', () => {
  test('toute clé du lot est non persistable : l’extrait d’un message signalé ne survit pas à la session', () => {
    const keys = [
      ADMIN_REPORTS_KEY,
      ADMIN_REPORTS_LISTS_KEY,
      ADMIN_REPORTS_STATS_KEY,
      ADMIN_REPORTS_SIBLINGS_KEY,
      adminReportsListKey('status=pending'),
      adminReportKey(OBJECT_ID(1)),
      adminReportSiblingsKey('message', OBJECT_ID(2)),
    ];

    expect(keys.map((key) => estClefNonPersistable(key))).toEqual(keys.map(() => true));
  });

  test('les clés de liste, de fiche et de voisins descendent des préfixes que les gestes invalident', () => {
    expect(adminReportsListKey('x').slice(0, ADMIN_REPORTS_LISTS_KEY.length)).toEqual([...ADMIN_REPORTS_LISTS_KEY]);
    expect(adminReportKey('r').slice(0, ADMIN_REPORTS_KEY.length)).toEqual([...ADMIN_REPORTS_KEY]);
    expect(adminReportSiblingsKey('message', 'e').slice(0, ADMIN_REPORTS_SIBLINGS_KEY.length)).toEqual([...ADMIN_REPORTS_SIBLINGS_KEY]);
  });
});

describe('les gestes — méthode, chemin, corps', () => {
  test('résoudre : PATCH { status, actionTaken, moderatorNotes }', async () => {
    const { deps, calls } = recorder(() => ok(servedReport({ status: 'resolved' })));

    const result = await decideAdminReport({ ...deps, reportId: OBJECT_ID(1), decision: { kind: 'resolve', actionTaken: 'content_removed', notes: 'Retiré' } });

    expect(calls[0]).toEqual({ method: 'PATCH', path: `/api/v1/admin/reports/${OBJECT_ID(1)}`, body: { status: 'resolved', actionTaken: 'content_removed', moderatorNotes: 'Retiré' } });
    expect(result).toEqual({ ok: true, data: { acknowledged: true }, status: 200 });
  });

  test('résoudre sans note n’envoie pas de note vide', async () => {
    const { deps, calls } = recorder(() => ok({}));

    await decideAdminReport({ ...deps, reportId: OBJECT_ID(1), decision: { kind: 'resolve', actionTaken: 'none', notes: null } });

    expect(calls[0]?.body).toEqual({ status: 'resolved', actionTaken: 'none' });
  });

  test('rejeter, classer sans suite et rouvrir ne posent que leur statut (et la note quand il y en a une)', async () => {
    const { deps, calls } = recorder(() => ok({}));

    await decideAdminReport({ ...deps, reportId: OBJECT_ID(1), decision: { kind: 'reject', notes: 'Infondé' } });
    await decideAdminReport({ ...deps, reportId: OBJECT_ID(1), decision: { kind: 'dismiss', notes: null } });
    await decideAdminReport({ ...deps, reportId: OBJECT_ID(1), decision: { kind: 'reopen' } });

    expect(calls.map((call) => call.body)).toEqual([{ status: 'rejected', moderatorNotes: 'Infondé' }, { status: 'dismissed' }, { status: 'pending' }]);
  });

  test('la réponse brute du PATCH (notes, identifiants) n’entre jamais dans le retour', async () => {
    const { deps } = recorder(() => ok(servedReport({ moderatorNotes: 'secret de modération' })));

    const result = await decideAdminReport({ ...deps, reportId: OBJECT_ID(1), decision: { kind: 'reopen' } });

    expect(JSON.stringify(result)).not.toContain('secret de modération');
  });

  test('prendre en charge : POST /assign sans corps', async () => {
    const { deps, calls } = recorder(() => ok({}));

    await assignAdminReport({ ...deps, reportId: OBJECT_ID(1) });

    expect(calls[0]).toEqual({ method: 'POST', path: `/api/v1/admin/reports/${OBJECT_ID(1)}/assign` });
  });

  test('supprimer : DELETE /admin/reports/:id ; un 403 (modérateur visé) est rendu tel quel', async () => {
    const { deps, calls } = recorder(() => ({ ok: false, status: 403, error: 'Un modérateur ne peut pas supprimer un signalement qui le vise' }));

    const result = await deleteAdminReport({ ...deps, reportId: OBJECT_ID(1) });

    expect(calls[0]).toEqual({ method: 'DELETE', path: `/api/v1/admin/reports/${OBJECT_ID(1)}` });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(403);
  });
});
