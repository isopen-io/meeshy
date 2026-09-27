import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';

import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminMemberContactSection } from './admin-member-contact';
import { AdminMemberIdentitySection } from './admin-member-identity';
import { AdminMemberRoleSection } from './admin-member-role';
import { AdminMemberSecuritySection } from './admin-member-security';

/**
 * **LA FICHE D'UN MEMBRE S'ÉDITE EN PLACE, SECTION PAR SECTION** (#8289).
 *
 * Chaque témoin suit le même fil : modifier ⇒ « Enregistrer » s'active ⇒ la
 * charge qui part ne porte QUE ce qui a changé ⇒ l'état est rendu sous la
 * section, et le membre renvoyé remplace le détail en cache.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const membre = (surcharge: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  id: 'u-alice',
  username: 'alice',
  displayName: 'Alice',
  firstName: 'Alice',
  lastName: 'Martin',
  bio: '',
  avatar: '',
  banner: '',
  profileCompletionRate: null,
  email: 'alice@example.test',
  phoneNumber: '',
  role: 'USER',
  timezone: '',
  systemLanguage: 'fr',
  regionalLanguage: '',
  customDestinationLanguage: '',
  isActive: true,
  isOnline: false,
  deactivatedAt: null,
  deletedAt: null,
  deletedBy: null,
  lockedUntil: null,
  lockedReason: null,
  failedLoginAttempts: 0,
  lastPasswordChange: null,
  twoFactorEnabledAt: null,
  twoFactorEnabled: false,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  lastActiveAt: null,
  createdAt: null,
  updatedAt: null,
  ...surcharge,
});

/** Le membre servi sous sa forme de FIL (dates en chaînes), à partir d'une surcharge. */
const servi = (m: AdminUserDetail): Record<string, unknown> => ({ ...m });

async function monter(element: (deps: { readonly source: 'gateway'; readonly transport: ReturnType<typeof routedTransport>['transport'] }) => ReactElement, ...repondeurs: readonly RoutedReply[]) {
  const t = routedTransport(...repondeurs);
  const annonces: string[] = [];
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>{element({ source: 'gateway', transport: t.transport })}</QueryClientProvider>,
  );
  return { host, calls: t.calls, annonces };
}

/** L'hôte RÉEL de la fiche lit le membre dans le cache du détail — celui que chaque section réécrit. */
function FicheEnCache({ initial, rendre }: { readonly initial: AdminUserDetail; readonly rendre: (m: AdminUserDetail) => ReactElement }) {
  const fiche = useQuery({ queryKey: adminUserDetailQueryKey(initial.id), queryFn: () => initial, initialData: initial, staleTime: Infinity });
  return rendre(fiche.data);
}

const enregistrer = (host: ParentNode, section: string) => host.querySelector<HTMLButtonElement>(`[data-admin-section-save="${section}"]`);
const etat = (host: ParentNode, section: string) =>
  host.querySelector(`[data-admin-member-section="${section}"] [data-admin-section-state]`)?.textContent ?? '';

const patchMembre =
  (reponse: (corps: Record<string, unknown>) => ApiResult<unknown>): RoutedReply =>
  (req: HttpRequest) =>
    req.method === 'PATCH' && pathOf(req) === '/api/v1/admin/users/u-alice' ? reponse(req.body as Record<string, unknown>) : undefined;

describe('identité — pseudo compris, sans bouton « Modifier »', () => {
  test('« Enregistrer » est inerte tant que rien ne change, puis n’envoie QUE le pseudo modifié', async () => {
    const { host, calls } = await monter(
      (deps) => <FicheEnCache initial={membre()} rendre={(m) => <AdminMemberIdentitySection membre={m} language="fr" onAnnounce={() => {}} deps={deps} />} />,
      patchMembre((corps) => ({ ok: true, data: servi(membre({ username: String(corps.username) })) })),
    );

    expect(host.textContent).not.toContain('Modifier');
    expect(enregistrer(host, 'identity')?.disabled).toBe(true);

    mounter.type(host, '#admin-member-username', 'alice_m');
    expect(enregistrer(host, 'identity')?.disabled).toBe(false);

    await mounter.submit(host);

    const patch = calls().find((req) => req.method === 'PATCH');
    expect(patch?.body).toEqual({ username: 'alice_m' });
    expect(etat(host, 'identity')).toBe('Modifications enregistrées');
    expect(appQueryClient.getQueryData<AdminUserDetail>(adminUserDetailQueryKey('u-alice'))?.username).toBe('alice_m');
    expect(enregistrer(host, 'identity')?.disabled).toBe(true);
  });

  test('un pseudo PRIS se dit sous le champ, avec les pseudos libres — en toucher un le pose', async () => {
    const { host } = await monter(
      (deps) => <AdminMemberIdentitySection membre={membre()} language="fr" onAnnounce={() => {}} deps={deps} />,
      patchMembre(() => ({ ok: false, status: 409, error: 'pris', code: 'USERNAME_TAKEN', suggestions: ['bob7', 'bob_'] })),
    );

    mounter.type(host, '#admin-member-username', 'bob');
    await mounter.submit(host);

    expect(host.querySelector('[data-admin-member-section="identity"] [role="alert"]')?.textContent).toBe('Ce pseudonyme est déjà pris.');
    const chips = [...host.querySelectorAll<HTMLButtonElement>('[data-admin-username-suggestion]')];
    expect(chips.map((c) => c.textContent)).toEqual(['bob7', 'bob_']);

    await mounter.click(chips[1] ?? null);
    expect(host.querySelector<HTMLInputElement>('#admin-member-username')?.value).toBe('bob_');
  });

  test('vider la langue secondaire la RETIRE (null)', async () => {
    const { host, calls } = await monter(
      (deps) => <AdminMemberIdentitySection membre={membre({ regionalLanguage: 'en' })} language="fr" onAnnounce={() => {}} deps={deps} />,
      patchMembre(() => ({ ok: true, data: servi(membre()) })),
    );

    typeInto(host.querySelector<HTMLSelectElement>('#admin-member-regionalLanguage'), '');
    await mounter.submit(host);

    expect(calls().find((req) => req.method === 'PATCH')?.body).toEqual({ regionalLanguage: null });
  });
});

describe('contact — l’état vérifié se LIT, et se renvoie', () => {
  const avecPreuves = (m: AdminUserDetail): RoutedReply => (req) => {
    if (req.method === 'PATCH' && pathOf(req) === '/api/v1/admin/users/u-alice/verifications') {
      return { ok: true, data: servi({ ...m, emailVerifiedAt: '2026-09-27T10:00:00.000Z' }) };
    }
    if (req.method === 'POST' && pathOf(req) === '/api/v1/admin/users/u-alice/verification-requests') {
      return { ok: true, data: { channel: (req.body as { channel: string }).channel } };
    }
    return undefined;
  };

  test('chaque contact porte son badge ; un contact non vérifié offre « Renvoyer la vérification »', async () => {
    const m = membre({ phoneNumber: '+33612345678', phoneVerifiedAt: '2026-09-01T00:00:00.000Z' });
    const { host } = await monter((deps) => <AdminMemberContactSection membre={m} language="fr" onAnnounce={() => {}} deps={deps} />);

    expect(host.querySelector('[data-admin-contact="email"] [data-admin-verified]')?.textContent).toBe('Non vérifié');
    expect(host.querySelector('[data-admin-contact="phone"] [data-admin-verified]')?.textContent).toBe('✓Vérifié');
    expect(host.querySelector('[data-admin-contact-resend="email"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-contact-resend="phone"]')).toBeNull();
  });

  test('renvoyer poste le CANAL et dit que c’est parti', async () => {
    const m = membre();
    const { host, calls } = await monter((deps) => <AdminMemberContactSection membre={m} language="fr" onAnnounce={() => {}} deps={deps} />, avecPreuves(m));

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-contact-resend="email"]'));

    expect(calls().find((req) => req.method === 'POST')?.body).toEqual({ channel: 'email' });
    expect(host.querySelector('[data-admin-contact-state="email"]')?.textContent).toBe('Vérification envoyée');
  });

  test('« Marquer vérifié » pose la preuve et le membre servi remplace le détail', async () => {
    const m = membre();
    const { host, calls } = await monter((deps) => <AdminMemberContactSection membre={m} language="fr" onAnnounce={() => {}} deps={deps} />, avecPreuves(m));

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-contact-verify="email"]'));

    expect(calls().find((req) => req.method === 'PATCH')?.body).toEqual({ emailVerified: true });
    expect(appQueryClient.getQueryData<AdminUserDetail>(adminUserDetailQueryKey('u-alice'))?.emailVerifiedAt).toBe('2026-09-27T10:00:00.000Z');
  });

  test('tant que l’adresse est en brouillon, ses gestes de preuve attendent', async () => {
    const m = membre();
    const { host } = await monter((deps) => <AdminMemberContactSection membre={m} language="fr" onAnnounce={() => {}} deps={deps} />);

    mounter.type(host, '#admin-member-email', 'autre@example.test');

    expect(host.querySelector<HTMLButtonElement>('[data-admin-contact-resend="email"]')?.disabled).toBe(true);
    expect(enregistrer(host, 'contact')?.disabled).toBe(false);
  });
});

describe('sécurité — le second facteur', () => {
  const securite = (reponse: ApiResult<unknown>): RoutedReply => (req) =>
    req.method === 'PATCH' && pathOf(req) === '/api/v1/admin/users/u-alice/security' ? reponse : undefined;

  const monterSecurite = (m: AdminUserDetail, ...repondeurs: readonly RoutedReply[]) =>
    monter(
      (deps) => (
        <AdminMemberSecuritySection membre={m} language="fr" sessions={2} onAnnounce={() => {}} onOpenPassword={() => {}} onOpenSessions={() => {}} deps={deps} />
      ),
      ...repondeurs,
    );

  test('sans téléphone, armer n’est pas offert — et la raison est dite', async () => {
    const { host } = await monterSecurite(membre());
    const bascule = host.querySelector<HTMLButtonElement>('#admin-member-two-factor');

    expect(bascule?.disabled).toBe(true);
    expect(host.textContent).toContain('Renseignez un téléphone pour activer le second facteur.');
    expect(host.querySelector('[data-admin-sessions-count]')?.textContent).toBe('2');
  });

  test('avec un téléphone, armer part sur …/security ; une application jamais appairée se dit', async () => {
    const { host, calls } = await monterSecurite(
      membre({ phoneNumber: '+33612345678' }),
      securite({ ok: false, status: 409, error: 'x', code: 'TWO_FACTOR_NOT_ENROLLED' }),
    );

    await mounter.click(host.querySelector<HTMLButtonElement>('#admin-member-two-factor'));

    expect(calls().find((req) => req.method === 'PATCH')?.body).toEqual({ twoFactorEnabled: true });
    expect(etat(host, 'security')).toBe('Le membre doit d’abord appairer une application d’authentification.');
  });

  test('un second facteur armé se désarme même sans téléphone — c’est la récupération d’un appareil perdu', async () => {
    const m = membre({ twoFactorEnabled: true, twoFactorEnabledAt: '2026-09-01T00:00:00.000Z' });
    const { host, calls } = await monterSecurite(m, securite({ ok: true, data: servi({ ...m, twoFactorEnabledAt: null, twoFactorEnabled: false }) }));

    await mounter.click(host.querySelector<HTMLButtonElement>('#admin-member-two-factor'));

    expect(calls().find((req) => req.method === 'PATCH')?.body).toEqual({ twoFactorEnabled: false });
    expect(appQueryClient.getQueryData<AdminUserDetail>(adminUserDetailQueryKey('u-alice'))?.twoFactorEnabled).toBe(false);
  });
});

describe('rôle et statut — la confirmation ne protège que ce qui le mérite', () => {
  test('changer le rôle avertit, demande « Confirmer », puis n’envoie que le rôle', async () => {
    const { host, calls } = await monter(
      (deps) => <AdminMemberRoleSection membre={membre()} language="fr" onAnnounce={() => {}} onOpenBan={() => {}} deps={deps} />,
      patchMembre((corps) => ({ ok: true, data: servi(membre({ role: String(corps.role) })) })),
    );

    typeInto(host.querySelector<HTMLSelectElement>('#admin-member-role'), 'MODERATOR');
    expect(host.querySelector('[data-admin-edit-warning="role"]')).not.toBeNull();
    expect(enregistrer(host, 'role')?.textContent).toBe('Confirmer');

    await mounter.submit(host);
    expect(calls().some((req) => req.method === 'PATCH')).toBe(false);

    await mounter.submit(host);
    expect(calls().find((req) => req.method === 'PATCH')?.body).toEqual({ role: 'MODERATOR' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(etat(host, 'role')).toBe('Modifications enregistrées');
  });
});
