import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';

import type { AdminDeps } from '@/lib/api/admin';
import { adminUserDetailQueryKey, decodeAdminUserDetail, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { adminIdentityFixture, expectNoRawIdentifiers, type AdminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminMemberQuickEdit } from './admin-member-quick-edit';

/**
 * **L'ÉDITION RAPIDE D'UN MEMBRE** (#10562) — chaque information s'édite là où elle
 * s'affiche, part seule et de façon optimiste ; le rôle et la désactivation passent par la
 * confirmation (motif PROPOSÉ à l'ADMIN) ; les tentatives se remettent à zéro d'un geste ;
 * le mot de passe et le bannissement ouvrent leurs feuilles ; la section se replie.
 */
const { mount, mounter } = setupAdminKitTests();

const ID = '64f1c2a9e8b7d6c5b4a39281';
const NOW = new Date('2026-09-30T12:00:00.000Z');
const PROPOSE = 'Contrôle aléatoire, test de fonctionnalité et suivi client';
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ADMIN = adminIdentityFixture({ role: 'ADMIN' });

const METADATA = {
  deviceLocale: 'fr-FR',
  deviceCountry: 'FR',
  birthDate: '1990-03-12T00:00:00.000Z',
  ageVerifiedAt: null,
  voiceProfileConsentAt: null,
  voiceDataConsentAt: null,
  dataProcessingConsentAt: null,
  analyticsConsentAt: null,
  voiceCloningEnabledAt: null,
  termsAcceptedAt: null,
  termsVersion: null,
  onboardingCompletedAt: null,
  currentStreakDays: 0,
  longestStreakDays: 0,
  engagementScore: 0,
  meeshBalance: 0,
  blockedCount: 0,
  hasPendingEmail: false,
  hasPendingPhone: false,
};

const served = (overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
  id: ID,
  username: 'alice',
  displayName: 'Alice Martin',
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.test',
  role: 'USER',
  isActive: true,
  isOnline: false,
  lastActiveAt: '2026-09-29T08:00:00.000Z',
  failedLoginAttempts: 0,
  lockedUntil: null,
  adminMetadata: METADATA,
  ...overrides,
});

const member = (overrides: Readonly<Record<string, unknown>> = {}): AdminUserDetail => {
  const decoded = decodeAdminUserDetail(served(overrides));
  if (decoded === null) throw new Error('membre illisible');
  return decoded;
};

type Opened = { password: number; ban: number };

function Host({ initial, deps, opened }: { readonly initial: AdminUserDetail; readonly deps: AdminDeps; readonly opened: Opened }): ReactElement {
  const fiche = useQuery({ queryKey: adminUserDetailQueryKey(initial.id), queryFn: () => initial, initialData: initial, staleTime: Infinity });
  return (
    <AdminMemberQuickEdit
      membre={fiche.data}
      language="fr"
      onAnnounce={() => undefined}
      onOpenPassword={() => (opened.password += 1)}
      onOpenBan={() => (opened.ban += 1)}
      deps={deps}
      now={() => NOW}
    />
  );
}

async function open(m: AdminUserDetail, options: { readonly identity?: AdminIdentityFixture; readonly replies?: readonly RoutedReply[] } = {}) {
  appQueryClient.removeQueries({ queryKey: adminUserDetailQueryKey(ID) });
  const gateway = routedTransport(...(options.replies ?? []));
  const opened: Opened = { password: 0, ban: 0 };
  const host = await mount(
    <QueryClientProvider client={appQueryClient}>
      <Host initial={m} deps={{ source: 'gateway', transport: gateway.transport }} opened={opened} />
    </QueryClientProvider>,
    options.identity ?? ADMIN,
  );
  await mounter.settle();
  return { host, calls: gateway.calls, opened };
}

const patch = (suffix: string, reply: (body: Record<string, unknown>) => ApiResult<unknown>): RoutedReply => (request: HttpRequest) =>
  request.method === 'PATCH' && pathOf(request) === `/api/v1/admin/users/${ID}${suffix}` ? reply(request.body as Record<string, unknown>) : undefined;

const view = (host: ParentNode, id: string) => host.querySelector<HTMLButtonElement>(`[data-admin-inline-view="${id}"]`);
const cached = () => appQueryClient.getQueryData<AdminUserDetail>(adminUserDetailQueryKey(ID));
const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function commit(host: ParentNode, id: string, value: string) {
  await mounter.click(view(host, id));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const field = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-admin-inline-input="${id}"]`);
  if (field === null) throw new Error(`champ ${id} absent`);
  await act(async () => {
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
  if (!(field instanceof HTMLSelectElement)) await act(async () => field.blur());
  await mounter.settle();
}

const confirmButton = () => document.querySelector<HTMLButtonElement>('[data-admin-confirm] [data-admin-action="confirm"]');

describe('ce qui se lit d’un coup d’œil', () => {
  test('pseudo, noms, naissance AVEC l’âge, rôle, compte, présence et tentatives — en mots', async () => {
    const { host } = await open(member());
    expect(textOf(view(host, 'username'))).toContain('@alice');
    expect(textOf(view(host, 'displayName'))).toContain('Alice Martin');
    expect(textOf(view(host, 'birthDate'))).toContain('12 mars 1990');
    expect(textOf(view(host, 'birthDate'))).toContain('36 ans');
    expect(textOf(view(host, 'role'))).toContain('Membre');
    expect(textOf(view(host, 'active'))).toContain('Actif');
    expect(host.querySelector('[data-admin-quick-presence]')?.getAttribute('data-admin-quick-presence')).toBe('offline');
    expect(textOf(host.querySelector('[data-admin-quick-presence]'))).toContain('Vu le');
    expect(textOf(host.querySelector('[data-admin-quick-attempts]'))).toContain('Aucun échec récent');
    expect(host.querySelector('[data-admin-quick-reset]')).toBeNull();
    expectNoRawIdentifiers(host);
  });

  test('sans le bloc de métadonnées, la date de naissance n’est pas dessinée (l’état est inconnu)', async () => {
    const { host } = await open(member({ adminMetadata: undefined }));
    expect(view(host, 'birthDate')).toBeNull();
  });
});

describe('une information s’édite là où elle s’affiche, et part seule', () => {
  test('le nom affiché : la perte du focus valide, seul le champ changé part, le cache bascule', async () => {
    const { host, calls } = await open(member(), { replies: [patch('', (body) => ({ ok: true, data: served(body) }))] });
    await commit(host, 'displayName', 'Alice M.');
    const sent = calls().find((request) => request.method === 'PATCH');
    expect(sent?.body).toEqual({ displayName: 'Alice M.' });
    expect(cached()?.displayName).toBe('Alice M.');
    expect(textOf(view(host, 'displayName'))).toContain('Alice M.');
  });

  test('la date de naissance part en jour ISO', async () => {
    const { host, calls } = await open(member(), { replies: [patch('', () => ({ ok: true, data: served({ adminMetadata: { ...METADATA, birthDate: '1991-04-01T00:00:00.000Z' } }) }))] });
    await commit(host, 'birthDate', '1991-04-01');
    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ birthDate: '1991-04-01' });
    expect(cached()?.adminMetadata?.birthDate).toBe('1991-04-01T00:00:00.000Z');
  });

  test('un pseudo PRIS : le refus sous le champ, le cache revient, et toucher un pseudo libre le pose', async () => {
    let attempt = 0;
    const { host, calls } = await open(member(), {
      replies: [
        patch('', (body) => {
          attempt += 1;
          return attempt === 1 ? { ok: false, status: 409, error: 'pris', code: 'USERNAME_TAKEN', suggestions: ['bob7', 'bob_'] } : { ok: true, data: served(body) };
        }),
      ],
    });
    await commit(host, 'username', 'bob');
    expect(textOf(host.querySelector('[data-admin-inline="username"] [role="alert"]'))).toBe('Ce pseudonyme est déjà pris.');
    expect(cached()?.username).toBe('alice');
    const chips = [...host.querySelectorAll<HTMLButtonElement>('[data-admin-quick-suggestion]')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['bob7', 'bob_']);
    await mounter.click(chips[0] ?? null);
    await mounter.settle();
    expect(calls().filter((request) => request.method === 'PATCH').map((request) => request.body)).toEqual([{ username: 'bob' }, { username: 'bob7' }]);
    expect(cached()?.username).toBe('bob7');
  });
});

describe('ce qui retire un droit se confirme — sans se justifier', () => {
  test('changer le rôle ouvre la confirmation ; l’ADMIN y trouve le motif proposé, qui part', async () => {
    const { host, calls } = await open(member(), { replies: [patch('', (body) => ({ ok: true, data: served({ role: body.role }) }))] });
    await commit(host, 'role', 'MODERATOR');
    expect(calls().some((request) => request.method === 'PATCH')).toBe(false);
    expect(textOf(document.querySelector('dialog h2'))).toBe('Passer ce membre en « Modérateur » ?');
    expect(document.querySelector<HTMLTextAreaElement>('[data-admin-motive]')?.value).toBe(PROPOSE);
    await mounter.click(confirmButton());
    await mounter.settle();
    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ role: 'MODERATOR', reason: PROPOSE });
    expect(cached()?.role).toBe('MODERATOR');
  });

  test('désactiver se confirme ; BIGBOSS confirme sans motif', async () => {
    const { host, calls } = await open(member(), { identity: BIGBOSS, replies: [patch('', () => ({ ok: true, data: served({ isActive: false }) }))] });
    await commit(host, 'active', 'inactive');
    expect(document.querySelector('[data-admin-motive]')).toBeNull();
    await mounter.click(confirmButton());
    await mounter.settle();
    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ isActive: false });
    expect(cached()?.isActive).toBe(false);
  });

  test('réactiver est immédiat : aucune feuille, le motif proposé part dans la trace', async () => {
    const { host, calls } = await open(member({ isActive: false }), { replies: [patch('', () => ({ ok: true, data: served({ isActive: true }) }))] });
    await commit(host, 'active', 'active');
    expect(document.querySelector('[data-admin-confirm]')).toBeNull();
    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ isActive: true, reason: PROPOSE });
    expect(cached()?.isActive).toBe(true);
  });
});

describe('les gestes du compte, dans la carte', () => {
  test('« Remettre à zéro » n’existe que s’il y a des échecs ; il vide le compteur et le verrou', async () => {
    const { host, calls } = await open(member({ failedLoginAttempts: 4, lockedUntil: '2026-10-02T00:00:00.000Z', lockedReason: 'FAILED_LOGIN' }), {
      replies: [patch('/security', () => ({ ok: true, data: served({ failedLoginAttempts: 0, lockedUntil: null }) }))],
    });
    expect(textOf(host.querySelector('[data-admin-quick-attempts]'))).toContain('Échecs depuis la dernière connexion : 4');
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-quick-reset]'));
    await mounter.settle();
    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ unlock: true, reason: PROPOSE });
    expect(cached()?.failedLoginAttempts).toBe(0);
    expect(cached()?.lockedUntil).toBeNull();
    expect(host.querySelector('[data-admin-quick-reset]')).toBeNull();
  });

  test('régénérer le mot de passe et bannir ouvrent leurs feuilles — de GROS boutons', async () => {
    const { host, opened } = await open(member());
    const password = host.querySelector<HTMLButtonElement>('[data-admin-quick-password]');
    expect(password?.style.minHeight).toBe('52px');
    await mounter.click(password);
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-quick-ban]'));
    expect(opened).toEqual({ password: 1, ban: 1 });
  });

  test('sans `canManageUsers` (modérateur), tout se lit et rien ne s’offre', async () => {
    const { host } = await open(member({ failedLoginAttempts: 2 }), { identity: adminIdentityFixture({ role: 'MODERATOR' }) });
    expect(view(host, 'username')).toBeNull();
    expect(textOf(host.querySelector('[data-admin-inline="username"]'))).toContain('@alice');
    expect(host.querySelector('[data-admin-quick-reset]')).toBeNull();
    expect(host.querySelector('[data-admin-quick-gestures]')).toBeNull();
  });
});

describe('une section condensée, repliable', () => {
  test('replier cache le contenu, le dit (aria-expanded), et le repli survit au remontage', async () => {
    window.localStorage.removeItem('meeshy.admin.quickEdit.folded');
    const first = await open(member());
    const toggle = () => document.querySelector<HTMLButtonElement>('[data-admin-quick-edit-toggle]');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
    await mounter.click(toggle());
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(first.host.querySelector('[data-admin-quick-edit]')?.getAttribute('data-admin-quick-edit')).toBe('folded');
    expect(view(first.host, 'username')).toBeNull();
    /* Repliée, la carte garde ses GESTES : la section se condense, elle ne se vide pas. */
    expect(first.host.querySelector('[data-admin-quick-password]')).not.toBeNull();
    mounter.unmountAll();
    const second = await open(member());
    expect(second.host.querySelector('[data-admin-quick-edit]')?.getAttribute('data-admin-quick-edit')).toBe('folded');
    await mounter.click(toggle());
    expect(view(second.host, 'username')).not.toBeNull();
    window.localStorage.removeItem('meeshy.admin.quickEdit.folded');
  });
});
