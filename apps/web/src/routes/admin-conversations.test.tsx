import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedConversationRow, servedParticipant } from '@/lib/admin/conversation-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminConversationsPanel } from './admin-conversations';

/**
 * **L'INVENTAIRE DES CONVERSATIONS** (#8876) — nommé, jamais par identifiant ;
 * recherche, tri, filtres et pagination dans l'adresse ; chaque rangée ouvre sa
 * fiche dans l'espace courant ; les états (squelette, vide, vide filtré, erreur,
 * refus) sont dessinés ; et l'écran ne s'ouvre qu'au rang d'administration.
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

const page = (rows: readonly unknown[], total = rows.length, hasMore = false) =>
  resultatServi({ data: rows, pagination: { total, offset: 0, limit: 20, hasMore } });

const DIRECT = servedConversationRow({
  id: OBJECT_ID(2),
  identifier: null,
  title: null,
  type: 'direct',
  memberCount: 2,
  participants: [servedParticipant(1), servedParticipant(2)],
  lastMessageAt: '2026-09-30T11:55:00.000Z',
});

const UNTITLED_GROUP = servedConversationRow({
  id: OBJECT_ID(3),
  identifier: null,
  title: null,
  type: 'group',
  memberCount: 9,
  participants: [servedParticipant(1), servedParticipant(2), servedParticipant(3)],
  community: { id: OBJECT_ID(40), name: 'Lycée Njanda' },
});

const ARCHIVED = servedConversationRow({ id: OBJECT_ID(4), title: 'Ancien groupe', isActive: false, lastMessageAt: null });
const CLOSED = servedConversationRow({ id: OBJECT_ID(5), title: 'Canal fermé', type: 'broadcast', closedAt: '2026-09-20T09:00:00.000Z' });
const EMPTY = servedConversationRow({ id: OBJECT_ID(6), identifier: null, title: null, type: 'group', memberCount: 0, participants: [] });

const ROWS = [servedConversationRow(), DIRECT, UNTITLED_GROUP, ARCHIVED, CLOSED, EMPTY];

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="conversations" language="fr" title="Conversations">
      {() => <AdminConversationsPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/conversations', identity = BIGBOSS) {
  const { Router } = createRouter(
    { adminConversations: { pattern: '/admin/conversations', screen: async () => ({ default: () => <Screen deps={deps} /> }) } },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-conversations]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const rowIds = (host: ParentNode) => [...host.querySelectorAll('[data-admin-row]')].map((row) => row.getAttribute('data-admin-row'));
const listPaths = (paths: readonly string[]) => paths.filter((path) => path.startsWith(adminEndpoints.conversations));
const query = (path: string | undefined) => Object.fromEntries(new URL(path ?? '', 'https://x.test').searchParams);

describe('la liste — nommée, jamais par identifiant', () => {
  test('chaque conversation se dit : titre, ou ceux qui la composent — jamais son identifiant', async () => {
    const { deps } = scripted(() => page(ROWS, ROWS.length));
    const host = await open(deps);

    expect(rowIds(host)).toEqual(ROWS.map((row) => row.id));
    const text = host.querySelector('table')?.textContent ?? '';
    for (const expected of [
      'Atelier du jeudi',
      'Awa Diop et Jean Kamga',
      'Awa Diop, Jean Kamga et 7 autres',
      'Ancien groupe',
      'Canal fermé',
      'Conversation sans titre',
    ]) {
      expect(text).toContain(expected);
    }
    expectNoRawIdentifiers(host);
  });

  test('le type et l’état se disent en mots : privée, groupe, canal de diffusion — active, archivée, fermée', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    const text = host.querySelector('table')?.textContent ?? '';
    for (const expected of ['Groupe', 'Conversation privée', 'Canal de diffusion', 'Active', 'Archivée', 'Fermée à l’écriture']) {
      expect(text).toContain(expected);
    }
    expect(text).not.toMatch(/\b(direct|group|broadcast)\b/);
  });

  test('la communauté est NOMMÉE, ou « — » sans communauté', async () => {
    const { deps } = scripted(() => page([UNTITLED_GROUP, ARCHIVED]));
    const host = await open(deps);

    const communityCell = (id: string) => host.querySelector(`[data-admin-row="${id}"] td:nth-child(3)`)?.textContent ?? '';
    expect(communityCell(OBJECT_ID(3))).toContain('Lycée Njanda');
    expect(communityCell(OBJECT_ID(4))).toBe('—');
  });

  test('l’effectif est formaté, et la pile montre au plus six premiers membres', async () => {
    const many = servedConversationRow({
      id: OBJECT_ID(7),
      memberCount: 12408,
      participants: [1, 2, 3, 4, 5, 6, 7].map((n) => servedParticipant(n)),
    });
    const { deps } = scripted(() => page([many]));
    const host = await open(deps);

    const row = host.querySelector(`[data-admin-row="${OBJECT_ID(7)}"]`);
    expect(row?.textContent).toMatch(/12\s?408/);
    expect(row?.querySelectorAll('[data-admin-member-stack] [data-avatar], [data-admin-member-stack] > *')).toHaveLength(6);
  });

  test('« Dernier message » se lit en relatif ; une conversation muette n’invente pas de date', async () => {
    const { deps } = scripted(() => page([DIRECT, ARCHIVED]));
    const host = await open(deps);

    const last = (id: string) => host.querySelector(`[data-admin-row="${id}"] td:nth-child(7)`)?.textContent ?? '';
    expect(last(OBJECT_ID(2))).toMatch(/5 min/);
    expect(last(OBJECT_ID(4))).toBe('—');
  });

  test('chaque rangée ouvre SA fiche, dans l’espace courant', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    const links = [...host.querySelectorAll('[data-admin-row] td a')].filter((link) => link.getAttribute('href')?.startsWith('/admin/conversations/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ROWS.map((row) => `/admin/conversations/${row.id}`));
  });
});

describe('recherche, filtres, tri et pagination — dans l’adresse, jamais au-delà de la liste blanche', () => {
  test('sans rien : le dernier message d’abord, vingt par page', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    await open(deps);

    expect(query(listPaths(paths)[0])).toEqual({ offset: '0', limit: '20', sort: 'lastMessageAt', order: 'desc' });
  });

  test('l’adresse pose recherche, type, état, période et communauté — la période devient createdAfter', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    await open(deps, `/admin/conversations?q=Famille&type=group&isActive=false&period=7d&communityId=${OBJECT_ID(40)}&sort=createdAt&order=asc`);

    expect(query(listPaths(paths)[0])).toEqual({
      offset: '0',
      limit: '20',
      sort: 'createdAt',
      order: 'asc',
      search: 'Famille',
      type: 'group',
      isActive: 'false',
      createdAfter: '2026-09-23T12:00:00.000Z',
      communityId: OBJECT_ID(40),
    });
  });

  test('un tri, un type ou un identifiant hors liste blanche n’atteint jamais la passerelle', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    await open(deps, '/admin/conversations?sort=memberCount&type=secret&communityId=../x&period=10y');

    expect(query(listPaths(paths)[0])).toEqual({ offset: '0', limit: '20', sort: 'lastMessageAt', order: 'desc' });
  });

  test('choisir un type dans la barre réécrit l’adresse et relit la liste', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="type"]'), 'direct');
    await mounter.settle();

    expect(window.location.search).toBe('?type=direct');
    expect(query(listPaths(paths).at(-1)).type).toBe('direct');
    expect([...(host.querySelector<HTMLSelectElement>('[data-admin-filter="type"]')?.options ?? [])].map((o) => o.textContent)).toContain('Conversation privée');
  });

  test('la recherche écrit l’adresse après une courte pause et relit la liste sous `search`', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    mounter.type(host, '[data-admin-search]', 'Famille');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await mounter.settle();
    await mounter.settle();

    expect(window.location.search).toBe('?q=Famille');
    expect(query(listPaths(paths).at(-1)).search).toBe('Famille');
  });

  test('trier par « Création » passe `createdAt` ; un second clic inverse l’ordre', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-sort="createdAt"]'));
    expect(query(listPaths(paths).at(-1))).toMatchObject({ sort: 'createdAt', order: 'desc' });

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-sort="createdAt"]'));
    expect(query(listPaths(paths).at(-1))).toMatchObject({ sort: 'createdAt', order: 'asc' });
  });

  test('l’effectif n’est pas triable : la passerelle ne le trie pas', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-sort="memberCount"]')).toBeNull();
    expect([...host.querySelectorAll('[data-admin-sort]')].map((th) => th.getAttribute('data-admin-sort')).sort()).toEqual(['createdAt', 'lastMessageAt']);
  });

  test('« Suivants » avance d’une page par offset, et le compteur dit le total servi', async () => {
    const { deps, paths } = scripted(() => page(ROWS, 57, true));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('57 conversation(s)');
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list-next]'));

    expect(query(listPaths(paths).at(-1)).offset).toBe('20');
  });

  test('« toutes les conversations d’une communauté » : le filtre se dit par son NOM et se retire', async () => {
    const { deps, paths } = scripted(() => page([UNTITLED_GROUP]));
    const host = await open(deps, `/admin/conversations?communityId=${OBJECT_ID(40)}`);

    expect(host.querySelector('[data-admin-notice="info"]')?.textContent).toContain('Lycée Njanda');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-notice] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(query(listPaths(paths).at(-1)).communityId).toBeUndefined();
  });
});

describe('les états dessinés', () => {
  test('vide absolu : « Aucune conversation » et ce qui la fera arriver', async () => {
    const { deps } = scripted(() => page([]));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucune conversation');
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('apparaissent ici');
  });

  test('vide filtré : le dit, et « Réinitialiser » retire les filtres', async () => {
    const { deps } = scripted((path) => (path.includes('type=global') ? page([]) : page(ROWS)));
    const host = await open(deps, '/admin/conversations?type=global');

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucune conversation pour ces filtres');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-empty] [data-admin-list-reset]'));

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

describe('l’accès — fail-closed, au rang d’administration', () => {
  test('un MODERATOR porte la permission mais pas le rang : l’écran ne s’ouvre pas et rien n’est lu', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps, '/admin/conversations', adminIdentityFixture({ role: 'MODERATOR' }));

    expect(host.querySelector('[data-admin-conversations]')).toBeNull();
    expect(listPaths(paths)).toEqual([]);
  });

  test('un ADMIN, lui, entre', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps, '/admin/conversations', adminIdentityFixture({ role: 'ADMIN' }));

    expect(host.querySelector('[data-admin-conversations]')).not.toBeNull();
    expect(rowIds(host)).toHaveLength(ROWS.length);
  });
});
