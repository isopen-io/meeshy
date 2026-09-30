import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedPerson, servedShareLink } from '@/lib/admin/share-link-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminShareLinksPanel } from './admin-share-links';

/**
 * **LES LIENS DE PARTAGE** (#8876, #6729) — la liste nommée (jamais par clé de
 * jointure), filtrée dans l'adresse, recherchée par NOM, paginée ; chaque rangée ouvre
 * sa fiche ; aucune colonne n'est triable (la route ne trie pas) ; les états sont
 * dessinés.
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
  servedShareLink(),
  servedShareLink({
    id: OBJECT_ID(11),
    name: null,
    description: null,
    maxUses: null,
    currentUses: 3,
    expiresAt: null,
    creator: servedPerson(5, { displayName: null, username: 'lea' }),
    conversation: { id: OBJECT_ID(6), identifier: 'mshy_x', title: null, type: 'direct' },
    _count: { anonymousParticipants: 0 },
  }),
  servedShareLink({ id: OBJECT_ID(12), name: 'Lien fermé', isActive: false }),
  servedShareLink({ id: OBJECT_ID(13), name: 'Lien périmé', expiresAt: '2026-09-01T00:00:00.000Z' }),
  servedShareLink({ id: OBJECT_ID(14), name: 'Lien plein', maxUses: 12, currentUses: 12 }),
];

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="shareLinks" language="fr" title="Liens de partage">
      {() => <AdminShareLinksPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/share-links', identity = BIGBOSS) {
  const { Router } = createRouter(
    {
      adminShareLinks: { pattern: '/admin/share-links', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
      admShareLinks: { pattern: '/adm/share-links', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
    },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-share-links]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
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
const listPaths = (paths: readonly string[]) => paths.filter((path) => path.startsWith(`${adminEndpoints.shareLinks}?`));

describe('la liste — nommée, jamais par clé de jointure', () => {
  test('chaque lien dit son nom, sa conversation, son créateur, son usage, ses invités et son état', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowIds(host)).toEqual(ROWS.map((row) => row.id));
    const first = rowText(host, OBJECT_ID(1));
    for (const expected of ['Soirée du vendredi', 'Les voisins', 'Groupe', 'Awa Diop', '@awa', '12 sur 50', '7', 'Actif']) expect(first).toContain(expected);
    expectNoRawIdentifiers(host);
  });

  test('un lien sans nom se dit « Lien sans nom » — jamais son identifiant ni sa clé', async () => {
    const { deps } = scripted(() => page([ROWS[1]]));
    const host = await open(deps);

    const row = rowText(host, OBJECT_ID(11));
    expect(row).toContain('Lien sans nom');
    expect(row).toContain('3, sans limite');
    expect(row).toContain('N’expire jamais');
    expect(row).toContain('Conversation sans titre');
    expect(row).toContain('@lea');
    expect(row).not.toContain('mshy_x');
    expectNoRawIdentifiers(host);
  });

  test('l’état est dit : ouvert, fermé, expiré, quota atteint — chacun avec son mot', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(12))).toContain('Fermé');
    expect(rowText(host, OBJECT_ID(13))).toContain('Expiré');
    expect(rowText(host, OBJECT_ID(14))).toContain('Quota atteint');
  });

  test('aucune clé de jointure n’est affichée, même si la charge en portait une par erreur', async () => {
    const leaking = ROWS.map((row) => ({ ...row, linkId: 'mshy_AbCd1234', allowedIpRanges: ['203.0.113.0/24'] }));
    const { deps } = scripted(() => page(leaking));
    const host = await open(deps);

    for (const leaked of ['mshy_AbCd1234', 'mshy_voisins', '203.0.113']) {
      expect(host.textContent).not.toContain(leaked);
      expect(host.innerHTML).not.toContain(leaked);
    }
  });

  test('chaque rangée ouvre SA fiche, dans l’espace courant', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    const links = [...host.querySelectorAll('[data-admin-row] td a')].filter((link) => link.getAttribute('href')?.startsWith('/admin/share-links/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ROWS.map((row) => `/admin/share-links/${row.id}`));
  });

  test('dans l’espace /adm, les rangées, les conversations et les membres restent dans /adm (D-76)', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps, '/adm/share-links');

    const hrefs = [...host.querySelectorAll('[data-admin-row] td a')].map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((href) => href.startsWith('/adm/'))).toBe(true);
  });

  test('aucune colonne n’est triable : la route ne trie pas', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-sort]')).toBeNull();
  });
});

describe('recherche, filtre et pagination — dans l’adresse, jamais au-delà de la liste blanche', () => {
  test('la recherche ne porte que sur le nom : libellé dit, frappe différée, relue dans l’adresse', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar] label span')?.textContent).toBe('Rechercher un lien par son nom');
    typeInto(host.querySelector<HTMLInputElement>('[data-admin-search]'), 'voisins');
    await wait(350);
    await mounter.settle();

    expect(window.location.search).toBe('?q=voisins');
    expect(listPaths(paths).at(-1)).toContain('search=voisins');
  });

  test('le filtre d’ouverture part à la passerelle ; ses options sont nommées', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    const options = [...host.querySelectorAll('[data-admin-filter="isActive"] option')].map((entry) => entry.textContent);
    expect(options).toEqual(['Tous', 'Ouverts', 'Fermés']);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="isActive"]'), 'false');
    await mounter.settle();

    expect(window.location.search).toBe('?isActive=false');
    expect(listPaths(paths).at(-1)).toContain('isActive=false');
  });

  test('un paramètre inconnu de l’adresse n’atteint jamais la passerelle', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    await open(deps, '/admin/share-links?isActive=maybe&sort=linkId&order=asc&createdBy=x');

    const path = listPaths(paths)[0] ?? '';
    for (const leaked of ['maybe', 'linkId', 'order', 'createdBy', 'sort']) expect(path).not.toContain(leaked);
  });

  test('« Suivants » avance d’une page : la pagination V1 (à côté de data) est lue', async () => {
    const { deps, paths } = scripted(() => page(ROWS, 45, true));
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list-next]'));

    expect(listPaths(paths).at(-1)).toContain('offset=20');
    expect(window.location.search).toContain('offset=20');
  });

  test('le compteur dit le total servi', async () => {
    const { deps } = scripted(() => page(ROWS, 57, true));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('57 liens');
  });
});

describe('les états dessinés', () => {
  test('vide absolu : « Aucun lien de partage » et ce qui le fera arriver', async () => {
    const { deps } = scripted(() => page([]));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucun lien de partage');
    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('apparaîtront ici');
  });

  test('vide filtré : le dit, et « Réinitialiser » retire les filtres', async () => {
    const { deps } = scripted((path) => (path.includes('isActive=false') ? page([]) : page(ROWS)));
    const host = await open(deps, '/admin/share-links?isActive=false');

    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucun lien ne correspond à ces filtres');

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
