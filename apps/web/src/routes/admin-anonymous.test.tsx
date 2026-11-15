import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { HttpRequest } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { typeInto } from '@/test-support/act-mount';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminAnonymousPanel } from './admin-anonymous';

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

const AWA = '64f1c2a9e8b7d6c5b4a39281';
const LUC = '64f1c2a9e8b7d6c5b4a39282';
const NAMELESS = '64f1c2a9e8b7d6c5b4a39283';
const CLUB = '64f1c2a9e8b7d6c5b4a39291';
const NOTITLE = '64f1c2a9e8b7d6c5b4a39292';

const served = (overrides: Readonly<Record<string, unknown>>) => ({
  avatar: '',
  language: 'es',
  isActive: true,
  isOnline: false,
  lastActiveAt: null,
  joinedAt: '2026-09-29T08:00:00.000Z',
  leftAt: null,
  conversation: { id: CLUB, identifier: 'mshy_club', title: 'Le club' },
  _count: { sentMessages: 12 },
  ...overrides,
});

const GUESTS = [
  served({
    id: AWA,
    displayName: 'Awa',
    isOnline: true,
    lastActiveAt: '2026-09-30T11:59:40.000Z',
    _count: { sentMessages: 1204 },
  }),
  served({
    id: LUC,
    displayName: 'Luc',
    language: 'en',
    isActive: false,
    leftAt: '2026-09-29T20:00:00.000Z',
    conversation: { id: NOTITLE, identifier: 'mshy_x', title: '' },
  }),
  served({ id: NAMELESS, displayName: '', language: '', isActive: false }),
];

const guestsReply =
  (handler: (request: HttpRequest) => void = () => undefined): RoutedReply =>
  (request) => {
    if (pathOf(request) !== '/api/v1/admin/anonymous-users') return undefined;
    handler(request);
    return { ok: true, data: { anonymousUsers: GUESTS, pagination: { total: 57, offset: 0, limit: 20, hasMore: true } } };
  };

async function open(options: { readonly url?: string; readonly identity?: typeof BIGBOSS; readonly replies?: readonly RoutedReply[]; readonly wait?: string } = {}) {
  const gateway = routedTransport(...(options.replies ?? [guestsReply()]));
  const deps = { source: 'gateway' as const, transport: gateway.transport };
  const { Router } = createRouter(
    { probe: { pattern: '/probe', screen: async () => ({ default: () => <AdminAnonymousPanel language="fr" deps={deps} now={() => NOW} /> }) } },
    () => <p>absent</p>,
  );
  navigate(options.url ?? '/probe', true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, options.identity ?? BIGBOSS);
  const anchor = options.wait ?? '[data-admin-row]';
  for (let attempt = 0; attempt < 30 && host.querySelector(anchor) === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return { host, calls: gateway.calls };
}

const rowOf = (host: ParentNode, id: string) => host.querySelector(`[data-admin-row="${id}"]`);
const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
const select = (host: ParentNode, id: string) =>
  host.querySelector<HTMLSelectElement>(id === 'sort' ? '[data-admin-sort-select]' : `[data-admin-filter="${id}"]`);
const lastUrl = (calls: () => readonly HttpRequest[]) => new URL(calls()[calls().length - 1]?.path ?? '', 'https://x.test');

describe('AdminAnonymousPanel — des invités, nommés (#8876)', () => {
  test('chaque invité se reconnaît à son nom et mène à sa fiche ; sans nom : « Invité sans nom », jamais un identifiant', async () => {
    const { host } = await open();
    const awa = rowOf(host, AWA);
    expect(textOf(awa)).toContain('Awa');
    expect(awa?.querySelector('a')?.getAttribute('href')).toBe(`/admin/anonymous/${AWA}`);
    expect(textOf(rowOf(host, NAMELESS))).toContain('Invité sans nom');
    expectNoRawIdentifiers(host);
    expect(host.textContent ?? '').not.toContain('mshy_');
  });

  test('la conversation est une puce nommée qui mène à SA fiche ; sans titre : « Conversation sans titre »', async () => {
    const { host } = await open();
    const chip = rowOf(host, AWA)?.querySelector(`a[href="/admin/conversations/${CLUB}"]`);
    expect(textOf(chip ?? null)).toContain('Le club');
    expect(textOf(rowOf(host, LUC))).toContain('Conversation sans titre');
  });

  test('sans le rang des conversations, la puce reste une étiquette : jamais un lien vers un refus', async () => {
    const auditor = adminIdentityFixture({ role: 'AUDIT', permissions: { canManageUsers: true } });
    const { host } = await open({ identity: auditor });
    expect(textOf(rowOf(host, AWA))).toContain('Le club');
    expect(rowOf(host, AWA)?.querySelector(`a[href="/admin/conversations/${CLUB}"]`)).toBeNull();
  });

  test('la langue est NOMMÉE (« Espagnol »), jamais « ES » ; absente, elle se dit « Aucune »', async () => {
    const { host } = await open();
    expect(textOf(rowOf(host, AWA))).toContain('Espagnol');
    expect(textOf(rowOf(host, LUC))).toContain('Anglais');
    expect(textOf(rowOf(host, NAMELESS))).toContain('Aucune');
    expect(textOf(rowOf(host, AWA))).not.toMatch(/\bES\b/);
  });

  test('l’état se lit en mots : actif, parti, accès retiré — le plus parlant gagne', async () => {
    const { host } = await open();
    expect(textOf(rowOf(host, AWA))).toContain('Actif');
    expect(textOf(rowOf(host, LUC))).toContain('Parti');
    expect(textOf(rowOf(host, NAMELESS))).toContain('Accès retiré');
  });

  test('la présence se dit en mots ; masquée, elle se dit « Non communiquée », jamais « Hors ligne depuis toujours »', async () => {
    const { host } = await open();
    expect(textOf(rowOf(host, AWA))).toContain('En ligne');
    expect(textOf(rowOf(host, LUC))).toContain('Non communiquée');
  });

  test('la pastille est peinte par l’avatar d’après la règle partagée : aucun hexadécimal dans la liste', async () => {
    const { host } = await open();
    expect(rowOf(host, AWA)?.querySelector('[data-presence]')?.getAttribute('data-presence')).toBe('online');
    expect(rowOf(host, LUC)?.querySelector('[data-presence]')).toBeNull();
    const clone = host.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-presence]').forEach((dot) => dot.remove());
    expect(clone.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test('les nombres sont formatés et le total servi se dit en mots', async () => {
    const { host } = await open();
    expect(textOf(rowOf(host, AWA))).toContain('1 204');
    expect(textOf(host.querySelector('[data-admin-toolbar-count]'))).toBe('57 anonymes');
  });

  test('l’arrivée se dit en relatif, avec l’absolu en infobulle — jamais un ISO', async () => {
    const { host } = await open();
    const time = rowOf(host, AWA)?.querySelector('time[datetime="2026-09-29T08:00:00.000Z"]');
    expect(time).not.toBeNull();
    expect(time?.getAttribute('title') ?? '').not.toBe('');
    expect(textOf(time ?? null)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test('chaque ligne a sa carte sous md, avec les mêmes noms', async () => {
    const { host } = await open();
    const carte = host.querySelector(`[data-admin-card="${AWA}"]`);
    expect(textOf(carte)).toContain('Awa');
    expect(textOf(carte)).toContain('Le club');
    expect(carte?.querySelector('a')?.getAttribute('href')).toBe(`/admin/anonymous/${AWA}`);
  });
});

describe('AdminAnonymousPanel — filtres, tri, recherche', () => {
  test('le tri par défaut est l’arrivée, la plus récente d’abord ; un en-tête réécrit l’adresse', async () => {
    const { host, calls } = await open();
    expect(lastUrl(calls).searchParams.get('sortBy')).toBe('joinedAt');
    expect(lastUrl(calls).searchParams.get('sortOrder')).toBe('desc');
    await act(async () => (host.querySelector('[data-admin-sort="displayName"]') as HTMLElement | null)?.click());
    await mounter.settle();
    expect(window.location.search).toContain('sort=displayName');
    expect(lastUrl(calls).searchParams.get('sortBy')).toBe('displayName');
    expect(lastUrl(calls).searchParams.get('sortOrder')).toBe('asc');
  });

  test('le filtre d’état écrit l’adresse ET la requête', async () => {
    const { host, calls } = await open();
    typeInto(select(host, 'status'), 'inactive');
    await mounter.settle();
    expect(window.location.search).toContain('status=inactive');
    expect(lastUrl(calls).searchParams.get('status')).toBe('inactive');
    expect(lastUrl(calls).searchParams.get('offset')).toBe('0');
  });

  test('la recherche passe par `search`', async () => {
    const { host, calls } = await open();
    typeInto(host.querySelector<HTMLInputElement>('[data-admin-search]'), 'awa');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await mounter.settle();
    expect(lastUrl(calls).searchParams.get('search')).toBe('awa');
  });

  test('« Trier par » propose les trois tris servis, pour les cartes sous md', async () => {
    const { host, calls } = await open();
    const options = [...(select(host, 'sort')?.querySelectorAll('option') ?? [])].map((option) => option.textContent);
    expect(options).toEqual(['Nom', 'Arrivée', 'Dernière activité']);
    typeInto(select(host, 'sort'), 'displayName');
    await mounter.settle();
    expect(lastUrl(calls).searchParams.get('sortBy')).toBe('displayName');
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
      pathOf(request) === '/api/v1/admin/anonymous-users' ? { ok: true, data: { anonymousUsers: [], pagination: { total: 0, hasMore: false } } } : undefined;
    const { host } = await open({ url: '/probe?status=inactive', replies: [empty], wait: '[data-admin-empty]' });
    expect(textOf(host.querySelector('[data-admin-empty]'))).toContain('Aucun anonyme ne correspond à ces filtres.');
    expect(host.querySelector('[data-admin-list-reset]')).not.toBeNull();
  });

  test('sans aucun filtre, une liste vide dit qu’il n’y a encore aucun participant anonyme', async () => {
    const empty: RoutedReply = (request) =>
      pathOf(request) === '/api/v1/admin/anonymous-users' ? { ok: true, data: { anonymousUsers: [], pagination: { total: 0, hasMore: false } } } : undefined;
    const { host } = await open({ replies: [empty], wait: '[data-admin-empty]' });
    expect(textOf(host.querySelector('[data-admin-empty]'))).toContain('Aucun participant anonyme pour le moment.');
  });
});

describe('AdminAnonymousPanel — états dessinés et garde', () => {
  test('une erreur serveur se dit avec « Réessayer »', async () => {
    const fail: RoutedReply = (request) => (pathOf(request) === '/api/v1/admin/anonymous-users' ? { ok: false, status: 500, error: 'boom' } : undefined);
    const { host } = await open({ replies: [fail], wait: '[data-admin-error]' });
    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-retry]')).not.toBeNull();
  });

  test('sans la section des anonymes, rien n’est lu', async () => {
    const nobody = adminIdentityFixture({ role: 'USER' });
    const gateway = routedTransport(guestsReply());
    const deps = { source: 'gateway' as const, transport: gateway.transport };
    const { Router } = createRouter(
      { probe: { pattern: '/probe', screen: async () => ({ default: () => <AdminAnonymousPanel language="fr" deps={deps} now={() => NOW} /> }) } },
      () => <p>absent</p>,
    );
    navigate('/probe', true);
    await mount(<Router wrap={(children) => children} skeleton={null} />, nobody);
    await mounter.settle();
    expect(gateway.calls()).toHaveLength(0);
  });
});
