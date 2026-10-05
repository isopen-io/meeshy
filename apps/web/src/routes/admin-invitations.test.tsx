import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import {
  OBJECT_ID,
  servedInvitation,
  servedInvitationDays,
  servedInvitationStats,
  servedPerson,
} from '@/lib/admin/invitation-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminInvitationsPanel } from './admin-invitations';

/**
 * **LES DEMANDES DE CONTACT** (#8876, #6729) — le bandeau (six chiffres, courbe de
 * sept jours), la liste nommée, filtrée par statut dans l'adresse, paginée ; chaque
 * rangée ouvre sa fiche ; les états (squelette, vide, vide filtré, erreur, refus)
 * sont dessinés. Ni recherche ni tri : la route n'en sert pas.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

type Handler = (path: string) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

function scripted(handlers: { readonly list: Handler; readonly stats?: Handler; readonly timeline?: Handler }): { readonly deps: AdminDeps; readonly paths: string[] } {
  const paths: string[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      paths.push(request.path);
      if (request.path.startsWith(adminEndpoints.invitationsStats)) return (handlers.stats ?? (() => resultatServi(servedInvitationStats())))(request.path);
      if (request.path.startsWith(adminEndpoints.invitationsTimelineDaily)) return (handlers.timeline ?? (() => resultatServi(servedInvitationDays())))(request.path);
      return handlers.list(request.path);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, paths };
}

const page = (invitations: readonly unknown[], total = invitations.length, hasMore = false) =>
  resultatServi({ data: { invitations, pagination: { total, offset: 0, limit: 20, hasMore } } });

const ROWS = [
  servedInvitation(),
  servedInvitation({
    id: OBJECT_ID(11),
    status: 'accepted',
    message: undefined,
    sender: servedPerson(5, { displayName: 'Léa Moreau', username: 'lea' }),
    receiver: servedPerson(6, { displayName: null, username: 'paul' }),
  }),
  servedInvitation({ id: OBJECT_ID(12), status: 'rejected', sender: servedPerson(7, { displayName: 'Koffi Mensah', username: 'koffi' }) }),
  servedInvitation({ id: OBJECT_ID(13), status: 'blocked' }),
];

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="invitations" language="fr" title="Demandes de contact">
      {() => <AdminInvitationsPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/invitations', identity = BIGBOSS) {
  const { Router } = createRouter(
    {
      adminInvitations: { pattern: '/admin/invitations', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
      admInvitations: { pattern: '/adm/invitations', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
    },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-invitations]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const rowIds = (host: ParentNode) => [...host.querySelectorAll('[data-admin-row]')].map((row) => row.getAttribute('data-admin-row'));
const listPaths = (paths: readonly string[]) => paths.filter((path) => path.startsWith(`${adminEndpoints.invitations}?`));

describe('la liste — nommée, jamais par identifiant', () => {
  test('chaque demande dit qui a demandé à qui, où elle en est, si un message l’accompagne', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(rowIds(host)).toEqual(ROWS.map((row) => row.id));
    const text = host.querySelector('table')?.textContent ?? '';
    for (const expected of [
      'Awa Diop',
      '@awa',
      'Jean Dupont',
      'Léa Moreau',
      '@paul',
      'Koffi Mensah',
      'En attente',
      'Acceptée',
      'Refusée',
      'Non reconnu',
      'Avec un message',
      'Sans message',
    ]) {
      expect(text).toContain(expected);
    }
    expectNoRawIdentifiers(host);
  });

  test('un membre sans nom affiché se lit par son @username, jamais par un identifiant', async () => {
    const { deps } = scripted({ list: () => page([ROWS[1]]) });
    const host = await open(deps);

    const receiverCell = host.querySelector(`[data-admin-row="${OBJECT_ID(11)}"] td:nth-child(2)`)?.textContent ?? '';
    expect(receiverCell).toContain('@paul');
    expectNoRawIdentifiers(host);
  });

  test('chaque rangée ouvre SA fiche, dans l’espace courant', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const links = [...host.querySelectorAll('[data-admin-row] td a')].filter((link) => link.getAttribute('href')?.startsWith('/admin/invitations/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ROWS.map((row) => `/admin/invitations/${row.id}`));
  });

  test('dans l’espace /adm, les rangées et les membres restent dans /adm (D-76)', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps, '/adm/invitations');

    const hrefs = [...host.querySelectorAll('[data-admin-row] td a')].map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((href) => href.startsWith('/adm/'))).toBe(true);
    expect(host.querySelector('[data-admin-stat="pending"] a')?.getAttribute('href')).toBe('/adm/invitations?status=pending');
  });

  test('le texte du message n’est PAS dans la liste : il n’est lu que dans la fiche', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(host.textContent).not.toContain('on s’est croisés hier');
  });

  test('aucune colonne n’est triable et aucune recherche n’est dessinée : la route n’en sert pas', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-sort]')).toBeNull();
    expect(host.querySelector('[data-admin-search]')).toBeNull();
    expect(host.querySelectorAll('[data-admin-filter]')).toHaveLength(1);
  });
});

describe('le bandeau', () => {
  test('six chiffres nommés : total, en attente, acceptées, refusées, 7 jours, taux d’acceptation', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const value = (id: string) => host.querySelector(`[data-admin-stat="${id}"]`)?.textContent ?? '';
    expect(value('total')).toContain('120');
    expect(value('pending')).toContain('12');
    expect(value('pending')).toContain('attendent une réponse');
    expect(value('accepted')).toContain('80');
    expect(value('rejected')).toContain('28');
    expect(value('recent')).toContain('9');
    expect(value('rate')).toMatch(/67\s?%/);
    expect(host.querySelectorAll('[data-admin-invitations-overview] [data-admin-stat]')).toHaveLength(6);
  });

  test('trois cartes mènent à la liste filtrée sur leur statut', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const hrefOf = (id: string) => host.querySelector(`[data-admin-stat="${id}"] a`)?.getAttribute('href');
    expect(hrefOf('pending')).toBe('/admin/invitations?status=pending');
    expect(hrefOf('accepted')).toBe('/admin/invitations?status=accepted');
    expect(hrefOf('rejected')).toBe('/admin/invitations?status=rejected');
    expect(hrefOf('total')).toBeUndefined();
    expect(hrefOf('rate')).toBeUndefined();
  });

  test('cliquer « En attente » filtre la liste ET relit la passerelle avec ce statut', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-stat="pending"] a'));

    expect(window.location.search).toBe('?status=pending');
    expect(listPaths(paths).at(-1)).toContain('status=pending');
    expect(host.querySelector<HTMLSelectElement>('[data-admin-filter="status"]')?.value).toBe('pending');
  });

  test('byType n’est jamais affiché : c’est une répartition par statut que les cartes disent déjà', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-chart="invitations-by-type"]')).toBeNull();
    expect(host.querySelectorAll('[data-admin-chart]')).toHaveLength(1);
  });

  test('la courbe a trois séries et dit son jour le plus chargé, en jours UTC réels', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const chart = host.querySelector('[data-admin-chart="invitations-timeline"]');
    expect(chart?.querySelectorAll('[data-admin-series]')).toHaveLength(3);
    expect(chart?.textContent).toContain('Envoyées');
    expect(chart?.textContent).toContain('Acceptées');
    expect(chart?.textContent).toContain('Refusées');
    expect(chart?.querySelector('[data-admin-chart-summary]')?.textContent).toBe('Jour le plus chargé : lun. 28 sept., avec 7 demandes envoyées');
  });

  test('aucune demande sur la période : la courbe le dit en mots', async () => {
    const quiet = servedInvitationDays().map((day) => ({ ...day, sent: 0, accepted: 0, rejected: 0 }));
    const { deps } = scripted({ list: () => page(ROWS), timeline: () => resultatServi(quiet) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-chart="invitations-timeline"] [data-admin-chart-summary]')?.textContent).toBe('Aucune demande envoyée sur les 7 derniers jours');
  });

  test('l’échec du bandeau n’enlève pas la liste ; « Réessayer » relit', async () => {
    let calls = 0;
    const { deps } = scripted({
      list: () => page(ROWS),
      stats: () => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : resultatServi(servedInvitationStats())),
    });
    const host = await open(deps);

    expect(rowIds(host)).toHaveLength(ROWS.length);
    expect(host.querySelector('[data-admin-stat="pending"][data-admin-stat-state="error"]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-stat="pending"] [data-admin-retry]'));

    expect(host.querySelector('[data-admin-stat="pending"]')?.textContent).toContain('12');
  });

  test('l’échec de la courbe est isolé : la liste et les chiffres restent', async () => {
    const { deps } = scripted({ list: () => page(ROWS), timeline: () => ({ ok: false, status: 500, error: 'boom' }) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-chart="invitations-timeline"] [data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-stat="total"]')?.textContent).toContain('120');
    expect(rowIds(host)).toHaveLength(ROWS.length);
  });
});

describe('filtres et pagination — dans l’adresse, jamais au-delà de la liste blanche', () => {
  test('le statut de l’adresse part à la passerelle ; un statut inconnu n’y arrive jamais', async () => {
    const good = scripted({ list: () => page(ROWS) });
    await open(good.deps, '/admin/invitations?status=accepted');
    expect(listPaths(good.paths)[0]).toContain('status=accepted');
  });

  test('un paramètre inconnu de l’adresse n’atteint jamais la passerelle (recherche, tri, communauté)', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    await open(deps, `/admin/invitations?status=blocked&q=secret&sort=email&communityId=${OBJECT_ID(9)}`);

    const path = listPaths(paths)[0] ?? '';
    for (const leaked of ['blocked', 'secret', 'email', 'communityId', 'search']) expect(path).not.toContain(leaked);
  });

  test('choisir un statut dans la barre réécrit l’adresse et relit la liste', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="status"]'), 'rejected');
    await mounter.settle();

    expect(window.location.search).toBe('?status=rejected');
    expect(listPaths(paths).at(-1)).toContain('status=rejected');
  });

  test('les options du statut sont nommées — jamais « pending »', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const options = [...(host.querySelectorAll('[data-admin-filter="status"] option') ?? [])].map((entry) => entry.textContent);
    expect(options).toEqual(['Tous', 'En attente', 'Acceptée', 'Refusée']);
  });

  test('« Suivants » avance d’une page : la pagination IMBRIQUÉE est lue', async () => {
    const { deps, paths } = scripted({ list: () => page(ROWS, 45, true) });
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list-next]'));

    expect(listPaths(paths).at(-1)).toContain('offset=20');
    expect(window.location.search).toContain('offset=20');
  });

  test('le compteur dit le total servi', async () => {
    const { deps } = scripted({ list: () => page(ROWS, 57, true) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('57 demandes');
  });

  test('« toutes les demandes de CE membre » : le filtre part, nomme le membre, et se retire', async () => {
    const { deps, paths } = scripted({ list: () => page([ROWS[0]]) });
    const host = await open(deps, `/admin/invitations?senderId=${OBJECT_ID(2)}`);

    expect(listPaths(paths)[0]).toContain(`senderId=${OBJECT_ID(2)}`);
    expect(host.querySelector('[data-admin-notice="info"]')?.textContent).toContain('Demandes envoyées par Awa Diop');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-notice] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(listPaths(paths).at(-1)).not.toContain('senderId');
  });
});

describe('les états dessinés', () => {
  test('vide absolu : « Aucune demande de contact » et ce qui la fera arriver', async () => {
    const { deps } = scripted({ list: () => page([]) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucune demande de contact');
    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('apparaîtront ici');
  });

  test('vide filtré : le dit, et « Réinitialiser » retire les filtres', async () => {
    const { deps } = scripted({ list: (path) => (path.includes('status=pending') ? page([]) : page(ROWS)) });
    const host = await open(deps, '/admin/invitations?status=pending');

    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucune demande ne correspond à ces filtres');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list] [data-admin-empty] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('squelette tant que la liste est en vol', async () => {
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
