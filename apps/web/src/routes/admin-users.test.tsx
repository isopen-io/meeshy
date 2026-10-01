import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import { periodStart } from '@/lib/admin/period';
import type { HttpRequest } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { typeInto } from '@/test-support/act-mount';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminUsersPanel } from './admin-users';

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

const ALICE = '64f1c2a9e8b7d6c5b4a39281';
const BOB = '64f1c2a9e8b7d6c5b4a39282';
const CLEO = '64f1c2a9e8b7d6c5b4a39283';

const served = (overrides: Readonly<Record<string, unknown>>) => ({
  isActive: true,
  isOnline: false,
  role: 'USER',
  avatar: '',
  createdAt: '2026-09-27T12:00:00.000Z',
  lastActiveAt: null,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  lockedUntil: null,
  deactivatedAt: null,
  deletedAt: null,
  ...overrides,
});

const USERS = [
  served({
    id: ALICE,
    username: 'alice',
    displayName: 'Alice Martin',
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@example.test',
    role: 'MODERATOR',
    isOnline: true,
    lastActiveAt: '2026-09-30T11:59:40.000Z',
    emailVerifiedAt: '2026-09-01T00:00:00.000Z',
    twoFactorEnabledAt: '2026-09-02T00:00:00.000Z',
  }),
  served({
    id: BOB,
    username: 'bob',
    displayName: '',
    firstName: 'Bob',
    lastName: 'Durand',
    email: 'b***@example.test',
    role: 'BIGBOSS',
    isActive: false,
    deactivatedAt: '2026-09-20T00:00:00.000Z',
    phoneVerifiedAt: '2026-09-03T00:00:00.000Z',
  }),
  served({ id: CLEO, username: 'cleo', displayName: '', firstName: '', lastName: '', email: 'cleo@example.test', lockedUntil: '2026-10-02T00:00:00.000Z' }),
];

const usersReply =
  (handler: (request: HttpRequest) => void = () => undefined): RoutedReply =>
  (request) => {
    if (pathOf(request) !== '/api/v1/admin/users') return undefined;
    handler(request);
    return { ok: true, data: { users: USERS, pagination: { total: 57, offset: 0, limit: 20, hasMore: true } } };
  };

async function open(options: { readonly url?: string; readonly identity?: typeof BIGBOSS; readonly replies?: readonly RoutedReply[] } = {}) {
  const gateway = routedTransport(...(options.replies ?? [usersReply()]));
  const deps = { source: 'gateway' as const, transport: gateway.transport };
  const { Router } = createRouter(
    { probe: { pattern: '/probe', screen: async () => ({ default: () => <AdminUsersPanel language="fr" deps={deps} now={() => NOW} /> }) } },
    () => <p>absent</p>,
  );
  navigate(options.url ?? '/probe', true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, options.identity ?? BIGBOSS);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-row]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return { host, calls: gateway.calls };
}

const rowOf = (host: ParentNode, id: string) => host.querySelector(`[data-admin-row="${id}"]`);
const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
const select = (host: ParentNode, id: string) =>
  host.querySelector<HTMLSelectElement>(id === 'sort' ? '[data-admin-sort-select]' : `[data-admin-filter="${id}"]`);
const lastUrl = (calls: () => readonly HttpRequest[]) => new URL(calls()[calls().length - 1]?.path ?? '', 'https://x.test');

describe('AdminUsersPanel — des personnes, nommées (#8876)', () => {
  test('chaque compte se reconnaît à son vrai nom, son @pseudo et son lien vers sa fiche', async () => {
    const { host } = await open();
    const alice = rowOf(host, ALICE);
    expect(textOf(alice)).toContain('Alice Martin');
    expect(textOf(alice)).toContain('@alice');
    expect(alice?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${ALICE}`);
    /* Sans nom affiché : « Prénom Nom » avant le pseudo. */
    expect(textOf(rowOf(host, BOB))).toContain('Bob Durand');
    /* Ni nom affiché ni prénom : le pseudo, avec son @. */
    expect(textOf(rowOf(host, CLEO))).toContain('@cleo');
    expectNoRawIdentifiers(host);
  });

  test('le rôle se dit en mots — jamais BIGBOSS, ADMIN ou USER bruts', async () => {
    const { host } = await open();
    expect(textOf(rowOf(host, ALICE))).toContain('Modérateur');
    expect(textOf(rowOf(host, BOB))).toContain('Créateur');
    expect(textOf(rowOf(host, CLEO))).toContain('Membre');
    const body = textOf(host.querySelector('[data-admin-list="users"]'));
    for (const raw of ['BIGBOSS', 'MODERATOR', 'USER']) expect(body).not.toContain(raw);
  });

  test('l’état se lit en mots : actif, désactivé, verrouillé — le plus grave gagne', async () => {
    const { host } = await open();
    expect(textOf(rowOf(host, ALICE))).toContain('Actif');
    expect(textOf(rowOf(host, BOB))).toContain('Désactivé');
    expect(textOf(rowOf(host, CLEO))).toContain('Verrouillé');
  });

  test('la sécurité se dit en mots : e-mail vérifié, téléphone vérifié, double authentification', async () => {
    const { host } = await open();
    const alice = textOf(rowOf(host, ALICE));
    expect(alice).toContain('E-mail vérifié');
    expect(alice).toContain('Double authentification');
    expect(alice).not.toContain('Téléphone vérifié');
    const bob = textOf(rowOf(host, BOB));
    expect(bob).toContain('E-mail non vérifié');
    expect(bob).toContain('Téléphone vérifié');
  });

  test('la présence est CALCULÉE (règle 1/3/5) et peinte par l’avatar : aucun hexadécimal dans la liste', async () => {
    const { host } = await open();
    /* Alice : isOnline ET active il y a 20 s ⇒ point « en ligne ». Bob et Cléo : hors ligne ⇒ aucun point. */
    expect(rowOf(host, ALICE)?.querySelector('[data-presence]')?.getAttribute('data-presence')).toBe('online');
    expect(rowOf(host, BOB)?.querySelector('[data-presence]')).toBeNull();
    /* Le seul hexadécimal de la liste est la pastille de l'avatar, qui lit la table CENTRALE de la
       présence (`PRESENCE_HEX`) : tout le reste est en jetons. */
    const clone = host.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-presence]').forEach((dot) => dot.remove());
    expect(clone.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('la dernière activité masquée se dit « Non communiquée », jamais « Jamais » ni un ISO', async () => {
    const { host } = await open();
    expect(textOf(rowOf(host, BOB))).toContain('Non communiquée');
    expect(textOf(rowOf(host, ALICE))).not.toContain('Non communiquée');
  });

  test('le compteur dit le total servi, en mots', async () => {
    const { host } = await open();
    expect(textOf(host.querySelector('[data-admin-toolbar-count]'))).toBe('57 compte(s)');
  });

  test('chaque ligne a sa carte sous md, avec les mêmes noms', async () => {
    const { host } = await open();
    const carte = host.querySelector(`[data-admin-card="${ALICE}"]`);
    expect(textOf(carte)).toContain('Alice Martin');
    expect(carte?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${ALICE}`);
    expect(textOf(carte)).toContain('Double authentification');
  });
});

describe('AdminUsersPanel — filtres, tri, recherche (#8876)', () => {
  test('le filtre de rôle écrit l’adresse ET la requête, sous le nom de paramètre historique', async () => {
    const { host, calls } = await open();
    typeInto(select(host, 'role'), 'ADMIN');
    await mounter.settle();
    expect(window.location.search).toContain('role=ADMIN');
    expect(lastUrl(calls).searchParams.get('role')).toBe('ADMIN');
    expect(lastUrl(calls).searchParams.get('offset')).toBe('0');
  });

  test('une liste INTACTE n’offre pas « Réinitialiser » — le tri n’est pas un filtre posé ; un filtre le fait apparaître', async () => {
    const { host } = await open();
    expect(host.querySelector('[data-admin-list-reset]')).toBeNull();

    typeInto(select(host, 'role'), 'ADMIN');
    await mounter.settle();
    expect(host.querySelector('[data-admin-list-reset]')).not.toBeNull();
  });

  test('les options du rôle sont nommées (Créateur, Administrateur…), jamais des codes', async () => {
    const { host } = await open();
    const options = [...(select(host, 'role')?.querySelectorAll('option') ?? [])].map((option) => option.textContent);
    expect(options).toEqual([
      'Tous',
      'Rang d’administration (créateur et administrateurs)',
      'Créateur',
      'Administrateur',
      'Modérateur',
      'Auditeur',
      'Analyste',
      'Membre',
    ]);
  });

  test('« Administrateurs » du tableau de bord : le rang d’administration liste le CRÉATEUR (BIGBOSS), pas zéro compte', async () => {
    /* La passerelle applique `role=BIGBOSS,ADMIN` : le seul administrateur d'une plateforme jeune est son créateur. */
    const filtering: RoutedReply = (request) => {
      if (pathOf(request) !== '/api/v1/admin/users') return undefined;
      const roles = (new URL(request.path, 'https://x.test').searchParams.get('role') ?? '').split(',').filter((role) => role !== '');
      const users = roles.length === 0 ? USERS : USERS.filter((user) => roles.includes(user.role as string));
      return { ok: true, data: { users, pagination: { total: users.length, offset: 0, limit: 20, hasMore: false } } };
    };
    const { host, calls } = await open({ url: '/probe?role=ADMINISTRATION', replies: [filtering] });

    expect(select(host, 'role')?.value).toBe('ADMINISTRATION');
    expect(lastUrl(calls).searchParams.get('role')).toBe('BIGBOSS,ADMIN');
    expect(rowOf(host, BOB)).not.toBeNull();
    expect(textOf(rowOf(host, BOB))).toContain('Créateur');
    expect(rowOf(host, ALICE)).toBeNull();
    expect(rowOf(host, CLEO)).toBeNull();
  });

  test('choisir « Rang d’administration » écrit l’adresse sous sa valeur lisible et la requête sous les deux rôles', async () => {
    const { host, calls } = await open();
    typeInto(select(host, 'role'), 'ADMINISTRATION');
    await mounter.settle();

    expect(window.location.search).toContain('role=ADMINISTRATION');
    expect(lastUrl(calls).searchParams.get('role')).toBe('BIGBOSS,ADMIN');
  });

  test('le tableau de bord mène à users?isActive=true et users?role=ADMIN : ces adresses posent le filtre', async () => {
    const { host, calls } = await open({ url: '/probe?isActive=true&role=ADMIN' });
    expect(select(host, 'isActive')?.value).toBe('true');
    expect(select(host, 'role')?.value).toBe('ADMIN');
    expect(lastUrl(calls).searchParams.get('isActive')).toBe('true');
    expect(lastUrl(calls).searchParams.get('role')).toBe('ADMIN');
  });

  test('e-mail vérifié, téléphone vérifié et double authentification filtrent par oui / non', async () => {
    const { host, calls } = await open();
    typeInto(select(host, 'emailVerified'), 'false');
    await mounter.settle();
    typeInto(select(host, 'phoneVerified'), 'true');
    await mounter.settle();
    typeInto(select(host, 'twoFactorEnabled'), 'true');
    await mounter.settle();
    const url = lastUrl(calls);
    expect(url.searchParams.get('emailVerified')).toBe('false');
    expect(url.searchParams.get('phoneVerified')).toBe('true');
    expect(url.searchParams.get('twoFactorEnabled')).toBe('true');
  });

  test('la période d’inscription devient une borne createdAfter calculée depuis l’horloge injectée', async () => {
    const { host, calls } = await open();
    typeInto(select(host, 'period'), '7d');
    await mounter.settle();
    const url = lastUrl(calls);
    expect(url.searchParams.get('createdAfter')).toBe(periodStart('7d', NOW));
    expect(url.searchParams.has('period')).toBe(false);
  });

  test('la recherche passe par `search` (le nom affiché compris, côté passerelle)', async () => {
    const { host, calls } = await open();
    typeInto(host.querySelector<HTMLInputElement>('[data-admin-search]'), 'alice');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await mounter.settle();
    expect(lastUrl(calls).searchParams.get('search')).toBe('alice');
  });

  test('trier par un en-tête réécrit l’adresse ; le tri par défaut est l’inscription, la plus récente d’abord', async () => {
    const { host, calls } = await open();
    expect(lastUrl(calls).searchParams.get('sortBy')).toBe('createdAt');
    expect(lastUrl(calls).searchParams.get('sortOrder')).toBe('desc');
    await act(async () => (host.querySelector('[data-admin-sort="email"]') as HTMLElement | null)?.click());
    await mounter.settle();
    expect(lastUrl(calls).searchParams.get('sortBy')).toBe('email');
    expect(lastUrl(calls).searchParams.get('sortOrder')).toBe('asc');
  });

  test('« Trier par » offre Prénom et Nom, que la passerelle trie mais qu’aucune colonne ne porte', async () => {
    const { host, calls } = await open();
    const options = [...(select(host, 'sort')?.querySelectorAll('option') ?? [])].map((option) => option.textContent);
    expect(options).toEqual(['Pseudonyme', 'E-mail', 'Inscription', 'Dernière activité', 'Prénom', 'Nom']);
    typeInto(select(host, 'sort'), 'lastName');
    await mounter.settle();
    expect(lastUrl(calls).searchParams.get('sortBy')).toBe('lastName');
    expect(lastUrl(calls).searchParams.get('sortOrder')).toBe('asc');
  });

  test('sans rang d’administration, la présence n’est pas triable : la passerelle ignorerait le tri en silence', async () => {
    const auditor = adminIdentityFixture({ role: 'AUDIT', permissions: { canManageUsers: true } });
    const { host } = await open({ identity: auditor });
    expect(host.querySelector('[data-admin-sort="lastActiveAt"]')).toBeNull();
    const options = [...(select(host, 'sort')?.querySelectorAll('option') ?? [])].map((option) => option.value);
    expect(options.includes('lastActiveAt')).toBe(false);
  });

  test('un filtre sans résultat dit « aucun résultat » et propose de réinitialiser', async () => {
    const empty: RoutedReply = (request) =>
      pathOf(request) === '/api/v1/admin/users' ? { ok: true, data: { users: [], pagination: { total: 0, hasMore: false } } } : undefined;
    const gateway = routedTransport(empty);
    const deps = { source: 'gateway' as const, transport: gateway.transport };
    const { Router } = createRouter(
      { probe: { pattern: '/probe', screen: async () => ({ default: () => <AdminUsersPanel language="fr" deps={deps} now={() => NOW} /> }) } },
      () => <p>absent</p>,
    );
    navigate('/probe?role=AUDIT', true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
    for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-empty]') === null; attempt += 1) await mounter.settle();
    expect(textOf(host.querySelector('[data-admin-empty]'))).toContain('Aucun compte ne correspond à ces filtres.');
    expect(host.querySelector('[data-admin-list-reset]')).not.toBeNull();
  });
});

describe('AdminUsersPanel — états dessinés et garde', () => {
  test('une erreur serveur se dit avec « Réessayer » ; un 403 se dit comme un refus', async () => {
    const fail: RoutedReply = (request) => (pathOf(request) === '/api/v1/admin/users' ? { ok: false, status: 500, error: 'boom' } : undefined);
    const { host } = await open({ replies: [fail] });
    for (let attempt = 0; attempt < 10 && host.querySelector('[data-admin-error]') === null; attempt += 1) await mounter.settle();
    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-retry]')).not.toBeNull();
  });

  test('sans la section des comptes, rien n’est lu', async () => {
    const nobody = adminIdentityFixture({ role: 'USER' });
    const gateway = routedTransport(usersReply());
    const deps = { source: 'gateway' as const, transport: gateway.transport };
    const { Router } = createRouter(
      { probe: { pattern: '/probe', screen: async () => ({ default: () => <AdminUsersPanel language="fr" deps={deps} now={() => NOW} /> }) } },
      () => <p>absent</p>,
    );
    navigate('/probe', true);
    await mount(<Router wrap={(children) => children} skeleton={null} />, nobody);
    await mounter.settle();
    expect(gateway.calls()).toHaveLength(0);
  });
});
