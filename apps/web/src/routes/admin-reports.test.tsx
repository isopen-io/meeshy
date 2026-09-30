import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedMessageEntity, servedPerson, servedReport, servedStats } from '@/lib/admin/report-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminReportsPanel } from './admin-reports';

/**
 * **LA LISTE DES SIGNALEMENTS** (#8876, #6726) — nommée, filtrée dans l'adresse,
 * triée, paginée ; chaque rangée ouvre sa fiche ; le bandeau de la file pose les
 * filtres ; les états (squelette, vide, vide filtré, erreur, refus) sont dessinés.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

type Handler = (path: string) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

function scripted(handlers: { readonly list: Handler; readonly stats?: Handler }): { readonly deps: AdminDeps; readonly paths: string[] } {
  const paths: string[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      paths.push(request.path);
      if (request.path.startsWith(adminEndpoints.reportsStats)) return (handlers.stats ?? (() => resultatServi(servedStats())))(request.path);
      return handlers.list(request.path);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, paths };
}

const page = (reports: readonly unknown[], total = reports.length, hasMore = false) =>
  resultatServi({ data: { reports, pagination: { total, offset: 0, limit: 20, hasMore } } });

const ROWS = [
  servedReport(),
  servedReport({
    id: OBJECT_ID(11),
    reportedType: 'user',
    reportedEntityId: OBJECT_ID(20),
    reportType: 'spam',
    status: 'under_review',
    reporterId: null,
    reporter: null,
    reporterName: 'Visiteur',
    moderatorId: OBJECT_ID(9),
    moderator: servedPerson(9, { displayName: 'Léa Moreau', username: 'lea' }),
    reportedEntity: { type: 'user', id: OBJECT_ID(20), label: 'Awa Diop', owner: null, excerpt: null, isProtected: false, deleted: false, conversation: null },
  }),
  servedReport({
    id: OBJECT_ID(12),
    reportedType: 'post',
    reportedEntityId: OBJECT_ID(21),
    reportType: 'hate_speech',
    status: 'resolved',
    moderatorId: OBJECT_ID(9),
    moderator: servedPerson(9, { displayName: 'Léa Moreau', username: 'lea' }),
    actionTaken: 'content_removed',
    resolvedAt: '2026-09-30T08:00:00.000Z',
    reportedEntity: { type: 'post', id: OBJECT_ID(21), label: null, owner: servedPerson(7), excerpt: null, isProtected: true, deleted: false, conversation: null },
  }),
  servedReport({ id: OBJECT_ID(13), status: 'dismissed', reporterId: null, reporter: null, reportType: 'other' }),
  servedReport({
    id: OBJECT_ID(14),
    reportedEntity: servedMessageEntity({ excerpt: null, deleted: true }),
  }),
];

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="reports" language="fr" title="Signalements">
      {() => <AdminReportsPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/reports', identity = BIGBOSS) {
  const { Router } = createRouter(
    { adminReports: { pattern: '/admin/reports', screen: async () => ({ default: () => <Screen deps={deps} /> }) } },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-reports]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const rowIds = (host: ParentNode) => [...host.querySelectorAll('[data-admin-row]')].map((row) => row.getAttribute('data-admin-row'));
const listPaths = (paths: readonly string[]) => paths.filter((path) => !path.startsWith(adminEndpoints.reportsStats));

describe('la liste — nommée, jamais par identifiant', () => {
  test('chaque signalement dit qui est visé, pourquoi, où il en est, qui a signalé et qui le traite', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(rowIds(host)).toEqual(ROWS.map((row) => row.id));
    const text = host.querySelector('table')?.textContent ?? '';
    for (const expected of [
      'Message de Membre 4',
      'Tu vas voir',
      'Awa Diop',
      'Publication de Membre 7',
      'Contenu protégé',
      'Harcèlement',
      'Indésirable',
      'Discours de haine',
      'Autre motif',
      'En attente',
      'En cours d’examen',
      'Résolu',
      'Classé sans suite',
      'Membre 3',
      'Visiteur',
      'Anonyme',
      'Léa Moreau',
      'Non assigné',
    ]) {
      expect(text).toContain(expected);
    }
    expectNoRawIdentifiers(host);
  });

  test('un message supprimé est barré et dit « supprimé »', async () => {
    const { deps } = scripted({ list: () => page([ROWS[4]]) });
    const host = await open(deps);

    const row = host.querySelector(`[data-admin-row="${OBJECT_ID(14)}"]`);
    expect(row?.textContent).toContain('supprimé');
    expect((row?.querySelector('[data-admin-entity]') as HTMLElement | null)?.textContent).toContain('Message de Membre 4');
  });

  test('chaque rangée ouvre SA fiche, dans l’espace courant', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const links = [...host.querySelectorAll('[data-admin-row] td a')].filter((link) => link.getAttribute('href')?.startsWith('/admin/reports/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ROWS.map((row) => `/admin/reports/${row.id}`));
  });

  test('« Résolu » ne date que les dossiers résolus ou rejetés ; le classé sans suite n’a pas de date de résolution', async () => {
    const { deps } = scripted({ list: () => page([ROWS[2], ROWS[3]]) });
    const host = await open(deps);

    const resolvedCell = (id: string) => host.querySelector(`[data-admin-row="${id}"] td:nth-child(7)`)?.textContent ?? '';
    expect(resolvedCell(OBJECT_ID(12))).not.toBe('—');
    expect(resolvedCell(OBJECT_ID(13))).toBe('—');
  });
});

describe('le bandeau de la file', () => {
  test('les cinq statuts posent le filtre : chaque carte est un lien vers la liste filtrée', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const hrefOf = (id: string) => host.querySelector(`[data-admin-stat="${id}"] a`)?.getAttribute('href');
    expect(hrefOf('pending')).toBe('/admin/reports?status=pending');
    expect(hrefOf('under_review')).toBe('/admin/reports?status=under_review');
    expect(hrefOf('resolved')).toBe('/admin/reports?status=resolved');
    expect(hrefOf('rejected')).toBe('/admin/reports?status=rejected');
    expect(hrefOf('dismissed')).toBe('/admin/reports?status=dismissed');
    expect(host.querySelector('[data-admin-stat="pending"]')?.textContent).toContain('12');
    expect(host.querySelector('[data-admin-stat="pending"]')?.textContent).toContain('sur 50 signalements');
  });

  test('cliquer « En attente » filtre la liste ET relit la passerelle avec ce statut', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-stat="pending"] a'));

    expect(window.location.search).toBe('?status=pending');
    expect(listPaths(paths).at(-1)).toContain('status=pending');
    expect(host.querySelector<HTMLSelectElement>('[data-admin-filter="status"]')?.value).toBe('pending');
  });

  test('le délai moyen est dit hors dossiers classés sans suite, en durée lisible', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const average = host.querySelector('[data-admin-stat="average"]')?.textContent ?? '';
    expect(average).toContain('Délai moyen de résolution');
    expect(average).toMatch(/1\s+j\s+12\s+h/);
    expect(average).toContain('Hors dossiers classés sans suite');
    expect(host.querySelector('[data-admin-stat="average"] a')).toBeNull();
  });

  test('sans dossier résolu ni rejeté, pas de durée inventée', async () => {
    const { deps } = scripted({
      list: () => page(ROWS),
      stats: () => resultatServi(servedStats({ resolvedReports: 0, rejectedReports: 0, averageResolutionTimeHours: 0 })),
    });
    const host = await open(deps);

    const average = host.querySelector('[data-admin-stat="average"]')?.textContent ?? '';
    expect(average).toContain('—');
    expect(average).toContain('Aucun dossier résolu ou rejeté');
  });

  test('deux répartitions nommées : motifs et genres de contenu', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-chart="reasons"]')?.textContent).toContain('Harcèlement');
    expect(host.querySelector('[data-admin-chart="kinds"]')?.textContent).toContain('Message');
    expect(host.querySelector('[data-admin-chart="reasons"]')?.textContent).toContain('Le plus fréquent : Harcèlement (20).');
  });

  test('l’échec des statistiques n’enlève pas la liste ; « Réessayer » relit', async () => {
    let calls = 0;
    const { deps } = scripted({
      list: () => page(ROWS),
      stats: () => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : resultatServi(servedStats())),
    });
    const host = await open(deps);

    expect(rowIds(host)).toHaveLength(ROWS.length);
    expect(host.querySelector('[data-admin-stat="pending"][data-admin-stat-state="error"]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-stat="pending"] [data-admin-retry]'));

    expect(host.querySelector('[data-admin-stat="pending"]')?.textContent).toContain('12');
  });
});

describe('filtres, tri et pagination — dans l’adresse, jamais au-delà de la liste blanche', () => {
  test('les filtres de l’adresse partent à la passerelle ; la période devient createdAfter', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    await open(deps, '/admin/reports?status=under_review&reportType=spam&reportedType=user&assigned=none&period=7d');

    const path = listPaths(paths)[0] ?? '';
    for (const expected of ['status=under_review', 'reportType=spam', 'reportedType=user', 'assigned=none', 'createdAfter=2026-09-23T12%3A00%3A00.000Z']) {
      expect(path).toContain(expected);
    }
  });

  test('un filtre inconnu de l’adresse n’atteint jamais la passerelle', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    await open(deps, '/admin/reports?status=archived&sort=reporterName&reportedEntityId=../x&q=secret');

    const path = listPaths(paths)[0] ?? '';
    expect(path).not.toContain('archived');
    expect(path).not.toContain('reporterName');
    expect(path).not.toContain('reportedEntityId');
    expect(path).not.toContain('secret');
    expect(path).toContain('sortBy=createdAt');
  });

  test('choisir un statut dans la barre réécrit l’adresse et relit la liste', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="reportType"]'), 'harassment');
    await mounter.settle();

    expect(window.location.search).toBe('?reportType=harassment');
    expect(listPaths(paths).at(-1)).toContain('reportType=harassment');
  });

  test('aucun champ de recherche : la passerelle n’en sert pas', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-search]')).toBeNull();
    expect(host.querySelectorAll('[data-admin-filter]')).toHaveLength(5);
  });

  test('trier par « Reçu » inverse l’ordre ; trier par « Résolu » passe la clé resolvedAt', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-sort="createdAt"]'));
    expect(listPaths(paths).at(-1)).toContain('sortOrder=asc');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-sort="resolvedAt"]'));
    expect(listPaths(paths).at(-1)).toContain('sortBy=resolvedAt');
  });

  test('« Suivants » avance d’une page par offset', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS, 45, true) });
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list-next]'));

    expect(listPaths(paths).at(-1)).toContain('offset=20');
    expect(window.location.search).toContain('offset=20');
  });

  test('le compteur dit le total servi', async () => {
    const { deps } = scripted({ list: () => page(ROWS, 57, true) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('57 signalement(s)');
  });

  test('« tous les signalements de CET élément » : le filtre par identifiant part, se dit, et se retire', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    const host = await open(deps, `/admin/reports?reportedEntityId=${OBJECT_ID(2)}`);

    expect(listPaths(paths)[0]).toContain(`reportedEntityId=${OBJECT_ID(2)}`);
    expect(host.querySelector('[data-admin-notice="info"]')?.textContent).toContain('Signalements qui visent un seul élément');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-notice] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(listPaths(paths).at(-1)).not.toContain('reportedEntityId');
  });
});

describe('les états dessinés', () => {
  test('vide absolu : « Aucun signalement » et ce qui le fera arriver', async () => {
    const { deps } = scripted({ list: () => page([]), stats: () => resultatServi(servedStats({ totalReports: 0 })) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucun signalement');
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Quand un membre signale');
  });

  test('vide filtré : le dit, et « Réinitialiser » retire les filtres', async () => {
    const { deps } = scripted({ list: (path) => (path.includes('status=pending') ? page([]) : page(ROWS)) });
    const host = await open(deps, '/admin/reports?status=pending');

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucun signalement pour ces filtres');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-empty] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('squelette tant que la liste est en vol — jamais un spinner sur des données déjà là', async () => {
    const { deps } = scripted({ list: () => new Promise<never>(() => undefined) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list-skeleton]')).not.toBeNull();
  });

  test('erreur sans données : « Réessayer » relit la passerelle', async () => {
    let calls = 0;
    const { deps } = scripted({ list: () => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : page(ROWS)) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-error]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list] [data-admin-error] [data-admin-retry]'));

    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('refus (403) : un bloc refusé, pas une panne', async () => {
    const { deps } = scripted({ list: () => ({ ok: false, status: 403, error: 'Forbidden' }) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-list] [data-admin-error]')).toBeNull();
  });
});
