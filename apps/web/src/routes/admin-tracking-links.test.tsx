import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedPerson, servedTrackingLink } from '@/lib/admin/tracking-link-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminTrackingLinksPanel } from './admin-tracking-links';

/**
 * **LES LIENS DE SUIVI** (#8876, #6729) — la liste nommée (nom, sinon campagne ;
 * cible et créateur nommés), triée sur ce que la passerelle trie (création, clics,
 * visiteurs uniques, dernier clic), filtrée dans l'adresse, recherchée, paginée ;
 * chaque rangée ouvre sa fiche ; les états sont dessinés.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

type Handler = (path: string) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

function scripted(list: Handler): { readonly deps: AdminDeps; readonly paths: string[] } {
  const paths: string[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      paths.push(request.path);
      return list(request.path);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, paths };
}

const page = (links: readonly unknown[], total = links.length, hasMore = false) => ({
  ok: true as const,
  status: 200,
  data: links,
  pagination: { total, limit: 20, offset: 0, hasMore },
});

const ROWS = [
  servedTrackingLink(),
  servedTrackingLink({
    id: OBJECT_ID(11),
    name: null,
    campaign: 'soldes-hiver',
    source: null,
    medium: null,
    targetType: 'CONVERSATION',
    target: { type: 'CONVERSATION', id: OBJECT_ID(5), label: 'Les voisins' },
    creator: servedPerson(5, { displayName: null, username: 'lea' }),
    totalClicks: 0,
    uniqueClicks: 0,
    lastClickedAt: null,
  }),
  servedTrackingLink({ id: OBJECT_ID(12), name: null, campaign: null, source: null, medium: null, targetType: 'EXTERNAL', target: null, isActive: false }),
  servedTrackingLink({ id: OBJECT_ID(13), name: 'Lien périmé', expiresAt: '2026-09-01T00:00:00.000Z', targetType: 'PROFILE', target: { type: 'PROFILE', id: OBJECT_ID(6), label: 'Léa Moreau' } }),
];

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="trackingLinks" language="fr" title="Liens de suivi">
      {() => <AdminTrackingLinksPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/tracking-links', identity = BIGBOSS) {
  const { Router } = createRouter(
    {
      adminTrackingLinks: { pattern: '/admin/tracking-links', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
      admTrackingLinks: { pattern: '/adm/tracking-links', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
    },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-tracking-links]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const rowIds = (host: ParentNode) => [...host.querySelectorAll('[data-admin-row]')].map((row) => row.getAttribute('data-admin-row'));
const rowText = (host: ParentNode, id: string) => host.querySelector(`[data-admin-row="${id}"]`)?.textContent ?? '';
const listPaths = (paths: readonly string[]) => paths.filter((path) => path.startsWith(`${adminEndpoints.trackingLinks}?`));

describe('la liste — nommée, jamais par identifiant ni par jeton', () => {
  test('chaque lien dit son nom, son adresse courte, sa campagne, sa cible, son créateur, ses clics, son état', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowIds(host)).toEqual(ROWS.map((row) => row.id));
    const first = rowText(host, OBJECT_ID(1));
    for (const expected of [
      'Lancement de rentrée',
      'https://m.meeshy.me/l/Ab3xYz',
      'Campagne : rentree-2026',
      'Source : newsletter',
      'Support : email',
      'Publication de Awa Diop',
      'Awa Diop',
      '1 204',
      '980',
      'Actif',
    ]) {
      expect(first.replace(/ | /g, ' ')).toContain(expected);
    }
    expectNoRawIdentifiers(host);
  });

  test('sans nom, la campagne tient lieu de titre ; sans campagne, « Lien de suivi sans nom »', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(11))).toContain('soldes-hiver');
    expect(rowText(host, OBJECT_ID(12))).toContain('Lien de suivi sans nom');
    expect(host.textContent).not.toContain('Ab3xYz-');
  });

  test('un lien externe dit « Site externe » ; une conversation et un profil sont des puces vers leur fiche', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(12))).toContain('Site externe');
    expect(rowText(host, OBJECT_ID(12))).toContain('—');
    expect(rowText(host, OBJECT_ID(11))).toContain('Les voisins');
    const hrefs = [...host.querySelectorAll('[data-admin-row] td a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain(`/admin/conversations/${OBJECT_ID(5)}`);
    expect(hrefs).toContain(`/admin/users/${OBJECT_ID(6)}`);
    expect(hrefs).toContain(`/admin/users/${OBJECT_ID(2)}`);
  });

  test('le créateur sans nom affiché se lit par son @username', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(11))).toContain('@lea');
  });

  test('l’état est dit : actif, désactivé, expiré', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(12))).toContain('Désactivé');
    expect(rowText(host, OBJECT_ID(13))).toContain('Expiré');
  });

  test('un lien jamais cliqué dit « Aucun clic » — jamais une date vide', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(11))).toContain('Aucun clic');
  });

  test('aucun jeton ni identifiant n’est affiché, même si la charge en portait', async () => {
    const leaking = ROWS.map((row) => ({ ...row, token: 'TOKEN-SECRET', ipAddress: '203.0.113.7' }));
    const { deps } = scripted(() => page(leaking));
    const host = await open(deps);

    for (const leaked of ['TOKEN-SECRET', '203.0.113.7']) expect(host.innerHTML).not.toContain(leaked);
  });

  test('chaque rangée ouvre SA fiche ; dans l’espace /adm, tout reste dans /adm (D-76)', async () => {
    const { deps } = scripted(() => page(ROWS));
    const admin = await open(deps);

    const links = [...admin.querySelectorAll('[data-admin-row] td a')].filter((link) => link.getAttribute('href')?.startsWith('/admin/tracking-links/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ROWS.map((row) => `/admin/tracking-links/${row.id}`));

    mounter.unmountAll();
    const adm = await open(deps, '/adm/tracking-links');
    const hrefs = [...adm.querySelectorAll('[data-admin-row] td a')].map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((href) => href.startsWith('/adm/'))).toBe(true);
  });
});

describe('tri, filtres, recherche et pagination — dans l’adresse, jamais au-delà de la liste blanche', () => {
  test('quatre colonnes sont triables : clics, visiteurs uniques, dernier clic, création', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    const sortable = [...host.querySelectorAll('[data-admin-sort]')].map((header) => header.getAttribute('data-admin-sort')).sort();
    expect(sortable).toEqual(['createdAt', 'lastClickedAt', 'totalClicks', 'uniqueClicks']);
  });

  test('trier par clics part du plus grand, sous les noms `sort` et `order` ; un second clic inverse', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-sort="totalClicks"]'));
    expect(listPaths(paths).at(-1)).toContain('sort=totalClicks&order=desc');
    expect(listPaths(paths).at(-1)).not.toContain('sortBy');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-sort="totalClicks"]'));
    expect(listPaths(paths).at(-1)).toContain('sort=totalClicks&order=asc');
  });

  test('l’adresse pilote le tri et les filtres ; ils partent tels quels à la passerelle', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    await open(deps, `/admin/tracking-links?sort=lastClickedAt&order=asc&isActive=true&targetType=REEL&createdBy=${OBJECT_ID(2)}`);

    const path = listPaths(paths)[0] ?? '';
    for (const expected of ['sort=lastClickedAt', 'order=asc', 'isActive=true', 'targetType=REEL', `createdBy=${OBJECT_ID(2)}`]) expect(path).toContain(expected);
  });

  test('un paramètre inconnu de l’adresse n’atteint jamais la passerelle', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    await open(deps, '/admin/tracking-links?sort=token&isActive=maybe&targetType=VIDEO&createdBy=../x&source=evil');

    const path = listPaths(paths)[0] ?? '';
    for (const leaked of ['token', 'maybe', 'VIDEO', '../x', 'evil']) expect(path).not.toContain(leaked);
    expect(path).toContain('sort=createdAt');
  });

  test('les options des filtres sont NOMMÉES — jamais « POST » ni « true »', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    const state = [...host.querySelectorAll('[data-admin-filter="isActive"] option')].map((entry) => entry.textContent);
    const target = [...host.querySelectorAll('[data-admin-filter="targetType"] option')].map((entry) => entry.textContent);
    expect(state).toEqual(['Tous', 'Actifs', 'Désactivés']);
    expect(target).toEqual(['Tous', 'Publication', 'Reel', 'Story', 'Statut', 'Conversation', 'Profil', 'Site externe']);
  });

  test('choisir un genre de cible réécrit l’adresse et relit la liste', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="targetType"]'), 'PROFILE');
    await mounter.settle();

    expect(window.location.search).toBe('?targetType=PROFILE');
    expect(listPaths(paths).at(-1)).toContain('targetType=PROFILE');
  });

  test('la recherche (nom, campagne, adresse) : libellé dit, frappe différée, relue dans l’adresse', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar] label span')?.textContent).toBe('Rechercher par nom, campagne ou adresse');
    typeInto(host.querySelector<HTMLInputElement>('[data-admin-search]'), 'rentree');
    await wait(350);
    await mounter.settle();

    expect(window.location.search).toBe('?q=rentree');
    expect(listPaths(paths).at(-1)).toContain('search=rentree');
  });

  test('« tous les liens de CE membre » : le filtre part, nomme le membre, et se retire', async () => {
    const { deps, paths } = scripted(() => page([ROWS[0]]));
    const host = await open(deps, `/admin/tracking-links?createdBy=${OBJECT_ID(2)}`);

    expect(host.querySelector('[data-admin-notice="info"]')?.textContent).toContain('Liens créés par Awa Diop');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-notice] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(listPaths(paths).at(-1)).not.toContain('createdBy');
  });

  test('« Suivants » avance d’une page : la pagination V1 est lue ; le compteur dit le total servi', async () => {
    const { deps, paths } = scripted(() => page(ROWS, 57, true));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('57 liens');
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list-next]'));

    expect(listPaths(paths).at(-1)).toContain('offset=20');
  });
});

describe('les états dessinés', () => {
  test('vide absolu : « Aucun lien de suivi » et ce qui le fera arriver', async () => {
    const { deps } = scripted(() => page([]));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucun lien de suivi');
    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('apparaîtront ici');
  });

  test('vide filtré : le dit, et « Réinitialiser » retire les filtres', async () => {
    const { deps } = scripted((path) => (path.includes('targetType=REEL') ? page([]) : page(ROWS)));
    const host = await open(deps, '/admin/tracking-links?targetType=REEL');

    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucun lien de suivi ne correspond à ces filtres');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list] [data-admin-empty] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('squelette tant que la liste est en vol', async () => {
    const { deps } = scripted(() => new Promise<never>(() => undefined));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list-skeleton]')).not.toBeNull();
  });

  test('erreur sans données : « Réessayer » relit la passerelle', async () => {
    let calls = 0;
    const { deps } = scripted(() => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : page(ROWS)));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-error]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list] [data-admin-error] [data-admin-retry]'));

    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('refus (403) : un bloc refusé, pas une panne', async () => {
    const { deps } = scripted(() => ({ ok: false, status: 403, error: 'Forbidden' }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-list] [data-admin-error]')).toBeNull();
  });
});

/**
 * **LE TRI DES CARTES** (#8876) — sous le seuil du tableau il n'y a plus d'en-tête à cliquer : sans
 * « Trier par », une liste ne se triait qu'au tableau. Le contrôle est celui du kit (`AdminSortControl`),
 * il liste les colonnes triables et inverse l'ordre.
 */
describe('le tri des cartes — « Trier par » du kit', () => {
  test('le « Trier par » étiqueté liste les colonnes triables, et choisir une autre clé réécrit la liste', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    const control = host.querySelector('[data-admin-sort-control]');
    expect(control).not.toBeNull();
    expect(control?.querySelector('label')?.textContent).toContain('Trier par');
    const select = control?.querySelector<HTMLSelectElement>('[data-admin-sort-select]');
    expect([...(select?.querySelectorAll('option') ?? [])].map((option) => option.value)).toEqual(['totalClicks', 'uniqueClicks', 'lastClickedAt', 'createdAt']);

    typeInto(select ?? null, 'totalClicks');
    await mounter.settle();
    expect(window.location.search).toContain('sort=totalClicks');
  });

  test('le bouton inverse l’ordre et dit l’ordre courant', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    const direction = host.querySelector<HTMLButtonElement>('[data-admin-sort-direction]');
    expect(direction?.getAttribute('aria-label')).toContain('actuellement');
    const before = direction?.getAttribute('data-admin-sort-direction');
    await mounter.click(direction);
    await mounter.settle();
    expect(host.querySelector('[data-admin-sort-direction]')?.getAttribute('data-admin-sort-direction')).not.toBe(before);
  });

  test('le contrôle se cache dès que le tableau, qui porte les mêmes tris, s’affiche (seuil de conteneur)', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-sort-control]')?.className).toContain('@3xl:hidden');
  });
});
