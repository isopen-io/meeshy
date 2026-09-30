import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { adminCommunitiesQueryKey, decodeAdminCommunityRow } from '@/lib/api/admin-communities';
import { appQueryClient } from '@/lib/api/query-client';
import { mountAdminAt } from '@/test-support/admin-router';

import AdminCommunitiesScreen, { AdminCommunitiesPanel } from './admin-communities';

/**
 * LES COMMUNAUTÉS (#8876) — la liste du lot « contenus » : de vrais noms, des
 * métadonnées dites en mots, une recherche, un tri, deux filtres, une pagination,
 * et chaque ligne ouvre sa fiche.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const NOW = new Date('2026-09-30T12:00:00.000Z');

const community = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: ID(n),
  identifier: `mshy_club-${n}`,
  name: `Club ${n}`,
  description: null,
  avatar: null,
  banner: null,
  isPrivate: true,
  isActive: true,
  deletedAt: null,
  createdAt: '2026-09-29T11:00:00.000Z',
  updatedAt: '2026-09-29T11:00:00.000Z',
  creator: { id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: null },
  activeMemberCount: 42,
  conversationCount: 5,
  ...overrides,
});

type Reply = (req: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

const served = (rows: readonly unknown[], total = rows.length) => resultatServi({ success: true, data: rows, pagination: { total, offset: 0, limit: 20, hasMore: false } });

const DEFAULT_PAGE = () =>
  served([community(3), community(4, { name: 'Les Amis du Jazz', isPrivate: false, isActive: false, deletedAt: '2026-09-20T08:00:00.000Z' })], 31);

/** Un transport qui répond par `reply` et GARDE chaque requête : ce qui est parti se relit, jamais se suppose. */
function gatewayOf(reply: Reply) {
  const calls: HttpRequest[] = [];
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: 'jamais appelé' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(req);
      return (await reply(req)) as ApiResult<T>;
    },
  });
  return { deps: { source: 'gateway', transport } satisfies AdminDeps, calls };
}

async function monter(routes: Parameters<typeof createRouter>[0], url: string, identity = BIGBOSS) {
  const { Router } = createRouter(routes, () => <p>absent</p>);
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-list]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

async function ouvrir(reply: Reply = DEFAULT_PAGE, url = '/admin/communities', space: 'admin' | 'adm' = 'admin') {
  const { deps, calls } = gatewayOf(reply);
  const screen = async () => ({ default: () => <AdminCommunitiesPanel language="fr" deps={deps} now={NOW} /> });
  const fiche = async () => ({ default: () => <p data-fiche>fiche</p> });
  const host = await monter(
    space === 'admin'
      ? { adminCommunities: { pattern: '/admin/communities', screen }, adminCommunity: { pattern: '/admin/communities/$community', screen: fiche } }
      : { admCommunities: { pattern: '/adm/communities', screen }, admCommunity: { pattern: '/adm/communities/$community', screen: fiche } },
    url,
  );
  return { host, calls };
}

const click = (element: Element | null) => act(async () => (element as HTMLElement | null)?.click());
const queryOf = (call: HttpRequest | undefined) => Object.fromEntries(new URL(`http://x${call?.path ?? ''}`).searchParams);

describe('AdminCommunitiesPanel — de vrais noms, des métadonnées interprétées', () => {
  test('chaque communauté est nommée, avec son identifiant public en secondaire et son créateur nommé', async () => {
    const { host } = await ouvrir();
    const row = host.querySelector(`[data-admin-row="${ID(3)}"]`);
    expect(row?.textContent).toContain('Club 3');
    expect(row?.textContent).toContain('mshy_club-3');
    expect(row?.textContent).toContain('Awa Diop');
    expect(row?.textContent).toContain('@awa');
  });

  test('la visibilité et l’état se disent en mots, et la date en relatif', async () => {
    const { host } = await ouvrir();
    const open = host.querySelector(`[data-admin-row="${ID(3)}"]`)?.textContent ?? '';
    expect(open).toContain('Privée');
    expect(open).toContain('Active');
    expect(open).toContain('hier');
    const closed = host.querySelector(`[data-admin-row="${ID(4)}"]`)?.textContent ?? '';
    expect(closed).toContain('Publique');
    expect(closed).toContain('Désactivée');
  });

  test('les chiffres sont formatés : membres ACTIFS et conversations', async () => {
    const { host } = await ouvrir();
    const cells = [...(host.querySelector(`[data-admin-row="${ID(3)}"]`)?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent?.trim());
    expect(cells).toContain('42');
    expect(cells).toContain('5');
  });

  test('aucun identifiant, horodatage ou énumération brute n’est lisible', async () => {
    const { host } = await ouvrir();
    expectNoRawIdentifiers(host);
  });

  test('l’en-tête dit où l’on est : titre, phrase d’aide, fil d’Ariane « Échanges › Communautés »', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Communautés');
    const crumbs = [...host.querySelectorAll('nav[aria-label] li')].map((item) => item.textContent?.trim());
    expect(crumbs).toEqual(['Échanges', 'Communautés']);
  });

  test('le compteur de résultats dit le total servi', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('Résultats : 31');
  });
});

describe('AdminCommunitiesPanel — chaque ligne ouvre sa fiche', () => {
  test('le nom est un lien de 44 px vers la fiche de l’espace courant', async () => {
    const { host } = await ouvrir();
    const link = host.querySelector(`[data-admin-row="${ID(3)}"] a`);
    expect(link?.getAttribute('href')).toBe(`/admin/communities/${ID(3)}`);
    expect((link as HTMLElement | null)?.style.minHeight).toBe('44px');
  });

  test('dans l’espace /adm, le lien reste dans /adm', async () => {
    const { host } = await ouvrir(() => served([community(3)]), '/adm/communities', 'adm');
    expect(host.querySelector(`[data-admin-row="${ID(3)}"] a`)?.getAttribute('href')).toBe(`/adm/communities/${ID(3)}`);
  });

  test('le créateur ouvre SA fiche — la section des comptes est ouverte à BIGBOSS', async () => {
    const { host } = await ouvrir();
    const creator = [...host.querySelectorAll(`[data-admin-row="${ID(3)}"] a`)].find((link) => link.getAttribute('href')?.startsWith('/admin/users/'));
    expect(creator?.getAttribute('href')).toBe(`/admin/users/${ID(1)}`);
  });
});

describe('AdminCommunitiesPanel — recherche, tri, filtres, pagination dans l’adresse', () => {
  test('sans filtre : la première page, triée par création décroissante', async () => {
    const { calls } = await ouvrir();
    expect(queryOf(calls[0])).toEqual({ offset: '0', limit: '20', sort: 'createdAt', order: 'desc' });
  });

  test('l’état de l’adresse part à la passerelle', async () => {
    const { calls } = await ouvrir(DEFAULT_PAGE, '/admin/communities?sort=name&order=asc&isPrivate=false&isActive=true&q=jazz');
    expect(queryOf(calls[0])).toEqual({ offset: '0', limit: '20', search: 'jazz', sort: 'name', order: 'asc', isPrivate: 'false', isActive: 'true' });
  });

  test('trier par nom réécrit l’adresse, relit la liste et annonce l’ordre', async () => {
    const { host, calls } = await ouvrir();
    await click(host.querySelector('[data-admin-sort="name"]'));
    await mounter.settle();
    expect(window.location.search).toBe('?sort=name&order=asc');
    expect(queryOf(calls[calls.length - 1])).toMatchObject({ sort: 'name', order: 'asc' });
  });

  test('le filtre de visibilité est une liste nommée « Privées / Publiques » qui réécrit l’adresse', async () => {
    const { host, calls } = await ouvrir();
    const select = host.querySelector('[data-admin-filter="isPrivate"]') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(['Tous', 'Privées', 'Publiques']);
    act(() => {
      select.value = 'false';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await mounter.settle();
    expect(window.location.search).toBe('?isPrivate=false');
    expect(queryOf(calls[calls.length - 1])).toMatchObject({ isPrivate: 'false' });
  });

  test('le filtre d’état : « Actives / Désactivées »', async () => {
    const { host } = await ouvrir();
    const select = host.querySelector('[data-admin-filter="isActive"]') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(['Tous', 'Actives', 'Désactivées']);
  });

  test('la recherche s’écrit dans l’adresse après une courte pause et part à la passerelle', async () => {
    const { host, calls } = await ouvrir();
    mounter.type(host, '[data-admin-search]', 'jazz');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await mounter.settle();
    expect(window.location.search).toBe('?q=jazz');
    expect(queryOf(calls[calls.length - 1])).toMatchObject({ search: 'jazz' });
  });

  test('« Suivants » avance l’offset dans l’adresse et à la passerelle', async () => {
    const { host, calls } = await ouvrir(() => resultatServi({ data: [community(3)], pagination: { total: 45, offset: 0, limit: 20, hasMore: true } }));
    await click(host.querySelector('[data-admin-list-next]'));
    await mounter.settle();
    expect(window.location.search).toBe('?offset=20');
    expect(queryOf(calls[calls.length - 1])).toMatchObject({ offset: '20' });
  });
});

describe('AdminCommunitiesPanel — les états dessinés', () => {
  test('squelette tant que rien n’est arrivé', async () => {
    const { host } = await ouvrir(() => new Promise(() => undefined));
    expect(host.querySelector('[data-admin-list-skeleton]')).not.toBeNull();
  });

  test('erreur : « Réessayer » relit et la liste apparaît', async () => {
    let calls = 0;
    const { host } = await ouvrir(() => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : served([community(3)])));
    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    await click(host.querySelector('[data-admin-retry]'));
    await mounter.settle();
    expect(host.querySelector(`[data-admin-row="${ID(3)}"]`)).not.toBeNull();
  });

  test('un refus 403 se dit comme un refus, pas comme une panne', async () => {
    const { host } = await ouvrir(() => ({ ok: false, status: 403, error: 'Permission insuffisante' }));
    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('vide absolu : un titre et une indication', async () => {
    const { host } = await ouvrir(() => served([]));
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucune communauté');
    expect(host.querySelector('[data-admin-list-reset]')).toBeNull();
  });

  test('vide FILTRÉ : « Aucune communauté pour ces filtres » et « Réinitialiser » vide l’adresse', async () => {
    const { host } = await ouvrir(() => served([]), '/admin/communities?isActive=false');
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucune communauté pour ces filtres');
    await click(host.querySelector('[data-admin-empty] [data-admin-list-reset]'));
    await mounter.settle();
    expect(window.location.search).toBe('');
  });

  test('l’écran fermé à qui n’a pas la capacité : le refus unique, aucune requête', async () => {
    const host = await mount(<AdminCommunitiesScreen />, adminIdentityFixture({ role: 'ANALYST' }));
    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-screen="communities"]')).toBeNull();
  });
});

describe('AdminCommunitiesScreen — servi par la table des routes, dans les deux espaces', () => {
  const seed = () =>
    appQueryClient.setQueryData(adminCommunitiesQueryKey(''), { rows: [decodeAdminCommunityRow(community(3))], total: 1, hasMore: false });

  test('/admin/communities rend la VRAIE liste (pas l’écran d’attente), surlignée au menu, et sa ligne ouvre la fiche', async () => {
    seed();
    const host = await mountAdminAt(mounter, '/admin/communities', BIGBOSS, '[data-admin-screen="communities"]');
    expect(host.querySelector('[data-admin-stub]') === null).toBe(true);
    expect(host.querySelector('[data-admin-nav="communities"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector(`[data-admin-row="${ID(3)}"] a`)?.getAttribute('href')).toBe(`/admin/communities/${ID(3)}`);
  });

  test('/adm/communities rend la même liste, et ses liens restent dans /adm', async () => {
    seed();
    const host = await mountAdminAt(mounter, '/adm/communities', BIGBOSS, '[data-admin-screen="communities"]');
    expect(host.querySelector(`[data-admin-row="${ID(3)}"] a`)?.getAttribute('href')).toBe(`/adm/communities/${ID(3)}`);
    expect(host.querySelector('[data-admin-nav="communities"]')?.getAttribute('href')).toBe('/adm/communities');
  });
});
