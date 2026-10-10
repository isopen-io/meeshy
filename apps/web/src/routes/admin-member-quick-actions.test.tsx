import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { MEMBER_EXTRAS } from '@/lib/admin/member-fixture';
import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminMemberContactSection } from './admin-member-contact';
import { AdminMemberQuickActions } from './admin-member-quick-actions';
import { AdminMemberRoleSection } from './admin-member-role';

/**
 * **LES ACTIONS EN UN CLIC** (#8289, demande porteur) — « Activer le compte »,
 * « Valider l'e-mail », « Valider le téléphone ». Chaque témoin retient la
 * réponse de la passerelle pour observer l'état OPTIMISTE, puis la libère :
 * succès ⇒ l'état reste ; refus ⇒ l'instantané revient.
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
  ...MEMBER_EXTRAS,
  ...surcharge,
});

/** Un transport qui RETIENT chaque réponse jusqu'à `liberer()` — pour voir l'écran entre le geste et la réponse. */
function transportRetenu(reponse: (req: HttpRequest) => ApiResult<unknown>) {
  const appels: HttpRequest[] = [];
  const enAttente: (() => void)[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      appels.push(req);
      return new Promise<ApiResult<unknown>>((resolve) => enAttente.push(() => resolve(reponse(req))));
    },
  } as unknown as HttpTransport;
  const liberer = async () => {
    await act(async () => {
      while (enAttente.length > 0) {
        enAttente.shift()?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    await mounter.settle();
  };
  return { deps: { source: 'gateway' as const, transport }, appels, liberer };
}

function Fiche({ initial, deps }: { readonly initial: AdminUserDetail; readonly deps: { readonly source: 'gateway'; readonly transport: HttpTransport } }) {
  const fiche = useQuery({ queryKey: adminUserDetailQueryKey(initial.id), queryFn: () => initial, initialData: initial, staleTime: Infinity });
  const m = fiche.data;
  return (
    <>
      <AdminMemberQuickActions membre={m} language="fr" onAnnounce={() => {}} deps={deps} />
      <AdminMemberContactSection membre={m} language="fr" onAnnounce={() => {}} deps={deps} />
      <AdminMemberRoleSection membre={m} language="fr" onAnnounce={() => {}} onOpenBan={() => {}} deps={deps} />
    </>
  );
}

const monter = (initial: AdminUserDetail, t: ReturnType<typeof transportRetenu>) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <Fiche initial={initial} deps={t.deps} />
    </QueryClientProvider>,
  );

const badge = (host: ParentNode, channel: string) => host.querySelector(`[data-admin-contact="${channel}"] [data-admin-verified]`)?.getAttribute('data-admin-verified');

describe('« Valider l’e-mail » — un clic, le badge bascule AVANT la réponse', () => {
  test('succès : optimiste puis confirmé, et l’action disparaît', async () => {
    const t = transportRetenu(() => ({ ok: true, data: { ...membre(), emailVerifiedAt: '2026-09-27T10:00:00.000Z' } }));
    const host = await monter(membre(), t);
    expect(badge(host, 'email')).toBe('false');

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-quick="email"]'));

    expect(badge(host, 'email')).toBe('true');
    expect(t.appels[0]?.body).toEqual({ emailVerified: true });

    await t.liberer();
    expect(badge(host, 'email')).toBe('true');
    expect(host.querySelector('[data-admin-quick="email"]')).toBeNull();
    expect(host.querySelector('[data-admin-quick-state]')?.textContent).toBe('Modifications enregistrées');
  });

  test('refus : l’instantané revient et le motif se lit', async () => {
    const t = transportRetenu(() => ({ ok: false, status: 403, error: 'Hiérarchie insuffisante' }));
    const host = await monter(membre(), t);

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-quick="email"]'));
    expect(badge(host, 'email')).toBe('true');

    await t.liberer();
    expect(badge(host, 'email')).toBe('false');
    expect(host.querySelector('[data-admin-quick-state]')?.textContent).toBe('Refusé : votre rôle ne permet pas de modifier ce membre');
  });
});

describe('« Valider le téléphone »', () => {
  test('n’est offert que pour un numéro non vérifié, et pose phoneVerified', async () => {
    const sans = await monter(membre(), transportRetenu(() => ({ ok: true, data: membre() })));
    expect(sans.querySelector('[data-admin-quick="phone"]')).toBeNull();
    mounter.unmountAll();
    appQueryClient.clear();

    const t = transportRetenu(() => ({ ok: true, data: { ...membre({ phoneNumber: '+33612345678' }), phoneVerifiedAt: '2026-09-27T10:00:00.000Z' } }));
    const host = await monter(membre({ phoneNumber: '+33612345678' }), t);
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-quick="phone"]'));

    expect(badge(host, 'phone')).toBe('true');
    expect(t.appels[0]?.body).toEqual({ phoneVerified: true });
  });
});

describe('« Activer le compte » — actif ET sorti de `blocked`, en un geste', () => {
  test('un compte suspendu sans preuve ni numéro : actif et prouvé à l’écran tout de suite, sans modale', async () => {
    const final = { ...membre(), isActive: true, emailVerifiedAt: '2026-09-27T10:00:00.000Z' };
    const t = transportRetenu((req) => ({ ok: true, data: req.path.endsWith('/verifications') ? final : { ...membre(), isActive: true } }));
    const host = await monter(membre({ isActive: false }), t);

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-quick="activate"]'));

    expect(host.querySelector('dialog')).toBeNull();
    expect(badge(host, 'email')).toBe('true');
    expect(host.querySelector('#admin-member-active')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-admin-section-save="role"]')?.hasAttribute('disabled')).toBe(true);

    await t.liberer();
    expect(t.appels.map((a) => a.body)).toEqual([{ isActive: true }, { emailVerified: true }]);
    expect(host.querySelector('[data-admin-quick="activate"]')).toBeNull();
    expect(host.querySelector('[data-admin-quick-state]')?.textContent).toBe('Compte activé');
  });

  test('un compte actif portant un numéro n’a rien à activer', async () => {
    const host = await monter(membre({ phoneNumber: '+33612345678' }), transportRetenu(() => ({ ok: true, data: membre() })));
    expect(host.querySelector('[data-admin-quick="activate"]')).toBeNull();
  });
});
