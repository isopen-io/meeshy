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

import { AdminMemberSecuritySection } from './admin-member-security';

/**
 * **LA SÉCURITÉ D'UN MEMBRE — LES GESTES DE #8004** : déverrouiller, retirer la
 * double authentification, poser ou retirer une preuve, poser ou retirer un
 * consentement. Pour chacun : il n'est proposé que s'il a un effet, il est
 * confirmé par une feuille qui le dit, il envoie le corps EXACT, il annonce son
 * résultat, le membre rendu remplace le détail en cache, et un refus se dit.
 */
const { mount, mounter } = setupAdminKitTests();

const ID = '64f1c2a9e8b7d6c5b4a39281';
const NOW = new Date('2026-09-30T12:00:00.000Z');
const FUTURE = '2026-10-02T00:00:00.000Z';
const PAST = '2026-09-01T00:00:00.000Z';

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ADMIN = adminIdentityFixture({ role: 'ADMIN' });

const METADATA = {
  deviceLocale: 'fr-FR',
  deviceCountry: 'FR',
  birthDate: null,
  ageVerifiedAt: null,
  voiceProfileConsentAt: null,
  voiceDataConsentAt: '2026-08-02T10:00:00.000Z',
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
  phoneNumber: '',
  role: 'USER',
  isActive: true,
  lockedUntil: null,
  lockedReason: null,
  lastPasswordChange: PAST,
  twoFactorEnabledAt: null,
  twoFactorBackupCodesRemaining: 6,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  adminMetadata: METADATA,
  ...overrides,
});

const member = (overrides: Readonly<Record<string, unknown>> = {}): AdminUserDetail => {
  const decoded = decodeAdminUserDetail(served(overrides));
  if (decoded === null) throw new Error('membre illisible');
  return decoded;
};

function Host({ initial, deps, announce }: { readonly initial: AdminUserDetail; readonly deps: AdminDeps; readonly announce: (text: string) => void }): ReactElement {
  const fiche = useQuery({ queryKey: adminUserDetailQueryKey(initial.id), queryFn: () => initial, initialData: initial, staleTime: Infinity });
  return (
    <AdminMemberSecuritySection
      membre={fiche.data}
      language="fr"
      sessions={2}
      onAnnounce={announce}
      onOpenPassword={() => undefined}
      onOpenSessions={() => undefined}
      deps={deps}
      now={() => NOW}
    />
  );
}

async function open(m: AdminUserDetail, options: { readonly identity?: AdminIdentityFixture; readonly replies?: readonly RoutedReply[] } = {}) {
  /* Un témoin peut ouvrir la section plusieurs fois : le détail d'un membre déjà en cache
     (`staleTime` infini) ne doit pas survivre au montage suivant. */
  appQueryClient.removeQueries({ queryKey: adminUserDetailQueryKey(ID) });
  const gateway = routedTransport(...(options.replies ?? []));
  const deps = { source: 'gateway' as const, transport: gateway.transport };
  const announcements: string[] = [];
  const host = await mount(
    <QueryClientProvider client={appQueryClient}>
      <Host initial={m} deps={deps} announce={(text) => announcements.push(text)} />
    </QueryClientProvider>,
    options.identity ?? BIGBOSS,
  );
  await mounter.settle();
  return { host, calls: gateway.calls, announcements };
}

const patch = (path: string, reply: (body: Record<string, unknown>) => ApiResult<unknown>): RoutedReply => (request: HttpRequest) =>
  request.method === 'PATCH' && pathOf(request) === `/api/v1/admin/users/${ID}/${path}` ? reply(request.body as Record<string, unknown>) : undefined;

const action = (host: ParentNode, name: string) => host.querySelector<HTMLButtonElement>(`[data-admin-action="${name}"]`);
const sheet = () => document.querySelector('[data-admin-confirm]');
const confirmButton = () => document.querySelector<HTMLButtonElement>('[data-admin-confirm] [data-admin-action="confirm"]');
const motive = () => document.querySelector<HTMLTextAreaElement>('[data-admin-motive]');
const cached = () => appQueryClient.getQueryData<AdminUserDetail>(adminUserDetailQueryKey(ID));
const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function ask(host: ParentNode, name: string) {
  await mounter.click(action(host, name));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

async function confirm(written?: string) {
  if (written !== undefined) {
    const field = motive();
    if (field === null) throw new Error('motif absent');
    mounter.type(document.body, '[data-admin-motive]', written);
  }
  await mounter.click(confirmButton());
  await mounter.settle();
}

describe('déverrouiller le compte', () => {
  test('n’est proposé que tant que le verrou est FUTUR', async () => {
    const future = await open(member({ lockedUntil: FUTURE }));
    expect(action(future.host, 'unlock')).not.toBeNull();
    expect(textOf(future.host)).toContain('Verrouillé jusqu’au');
    mounter.unmountAll();

    const past = await open(member({ lockedUntil: PAST }));
    expect(action(past.host, 'unlock')).toBeNull();
    mounter.unmountAll();

    const none = await open(member());
    expect(action(none.host, 'unlock')).toBeNull();
  });

  test('la feuille dit ce qui va se passer ; confirmer envoie { unlock: true } et le membre rendu remplace le détail', async () => {
    const { host, calls, announcements } = await open(member({ lockedUntil: FUTURE }), {
      replies: [patch('security', () => ({ ok: true, data: served({ lockedUntil: null }) }))],
    });

    await ask(host, 'unlock');
    expect(textOf(sheet())).toContain('le verrou est levé');
    await confirm();

    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ unlock: true });
    expect(cached()?.lockedUntil).toBeNull();
    expect(announcements).toContain('Compte déverrouillé');
    expect(action(host, 'unlock')).toBeNull();
    expect(sheet()).toBeNull();
  });

  test('un motif écrit part dans la trace', async () => {
    const { host, calls } = await open(member({ lockedUntil: FUTURE }), { replies: [patch('security', () => ({ ok: true, data: served() }))] });

    await ask(host, 'unlock');
    await confirm('Demande du membre par téléphone');

    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ unlock: true, reason: 'Demande du membre par téléphone' });
  });

  test('un refus (403) se DIT dans la feuille, qui reste ouverte', async () => {
    const { host, announcements } = await open(member({ lockedUntil: FUTURE }), {
      replies: [patch('security', () => ({ ok: false, status: 403, error: 'Hiérarchie insuffisante' }))],
    });

    await ask(host, 'unlock');
    await confirm();

    expect(textOf(document.querySelector('[data-admin-confirm-error]'))).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(sheet()).not.toBeNull();
    expect(announcements).toContain('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(cached()?.lockedUntil).toBe(FUTURE);
  });

  test('annuler ferme la feuille sans rien envoyer', async () => {
    const { host, calls } = await open(member({ lockedUntil: FUTURE }));

    await ask(host, 'unlock');
    await mounter.click(document.querySelector<HTMLButtonElement>('[data-admin-confirm] [data-admin-action="cancel"]'));

    expect(sheet()).toBeNull();
    expect(calls()).toHaveLength(0);
  });
});

describe('retirer la double authentification', () => {
  const armed = () => member({ twoFactorEnabledAt: '2026-05-01T00:00:00.000Z' });

  test('proposée SEULEMENT si elle est armée, avec le nombre de codes de secours restants', async () => {
    const on = await open(armed());
    expect(action(on.host, 'remove-two-factor')).not.toBeNull();
    expect(textOf(on.host.querySelector('[data-admin-security="two-factor"]'))).toContain('6 code(s) de secours restant(s)');
    mounter.unmountAll();

    const off = await open(member());
    expect(action(off.host, 'remove-two-factor')).toBeNull();
    expect(textOf(off.host.querySelector('[data-admin-security="two-factor"]'))).toContain('Non activée');
    /* Armer n'est jamais offert : l'application doit être appairée par le membre. */
    expect(off.host.querySelector('#admin-member-two-factor')).toBeNull();
  });

  test('le motif est OBLIGATOIRE (dix caractères) ; le corps envoyé est { twoFactorEnabled: false, reason }', async () => {
    const { host, calls } = await open(armed(), { replies: [patch('security', () => ({ ok: true, data: served({ twoFactorEnabledAt: null }) }))] });

    await ask(host, 'remove-two-factor');
    expect(confirmButton()?.disabled).toBe(true);
    mounter.type(document.body, '[data-admin-motive]', 'trop bref');
    expect(confirmButton()?.disabled).toBe(true);

    await confirm('Appareil perdu, identité vérifiée');

    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ twoFactorEnabled: false, reason: 'Appareil perdu, identité vérifiée' });
    expect(cached()?.twoFactorEnabled).toBe(false);
  });
});

describe('poser ou retirer une preuve', () => {
  test('l’e-mail : « Marquer vérifié » envoie { emailVerified: true } ; vérifié, c’est « Retirer la vérification »', async () => {
    const first = await open(member(), {
      replies: [patch('verifications', () => ({ ok: true, data: served({ emailVerifiedAt: '2026-09-30T12:00:00.000Z' }) }))],
    });
    expect(action(first.host, 'unverify-email')).toBeNull();
    await ask(first.host, 'verify-email');
    await confirm();
    expect(first.calls().find((request) => request.method === 'PATCH')?.body).toEqual({ emailVerified: true });
    expect(cached()?.emailVerifiedAt).toBe('2026-09-30T12:00:00.000Z');
    expect(action(first.host, 'unverify-email')).not.toBeNull();
    mounter.unmountAll();

    const second = await open(member({ emailVerifiedAt: PAST }), { replies: [patch('verifications', () => ({ ok: true, data: served() }))] });
    expect(action(second.host, 'verify-email')).toBeNull();
    await ask(second.host, 'unverify-email');
    await confirm();
    expect(second.calls().find((request) => request.method === 'PATCH')?.body).toEqual({ emailVerified: false });
  });

  test('le téléphone n’est offert que si le membre en a un', async () => {
    const without = await open(member());
    expect(action(without.host, 'verify-phone')).toBeNull();
    mounter.unmountAll();

    const { host, calls } = await open(member({ phoneNumber: '+33612345678' }), { replies: [patch('verifications', () => ({ ok: true, data: served({ phoneNumber: '+33612345678' }) }))] });
    await ask(host, 'verify-phone');
    await confirm('Appel de contrôle effectué');
    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ phoneVerified: true, reason: 'Appel de contrôle effectué' });
  });

  test('l’âge n’est offert que si le bloc adminMetadata est servi (sans lui, l’effet est inconnu)', async () => {
    const without = await open(member({ adminMetadata: undefined }));
    expect(action(without.host, 'verify-age')).toBeNull();
    mounter.unmountAll();

    const { host, calls } = await open(member(), { replies: [patch('verifications', () => ({ ok: true, data: served() }))] });
    await ask(host, 'verify-age');
    await confirm();
    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ ageVerified: true });
  });

  test('les preuves se lisent en mots : « Vérifié le … » ou « Non vérifié », jamais une date brute', async () => {
    const { host } = await open(member({ emailVerifiedAt: PAST }));
    expect(textOf(host.querySelector('[data-admin-security="proof-email"]'))).toContain('Vérifié le');
    expectNoRawIdentifiers(host);
  });
});

describe('les consentements — le rang souverain seulement, motif écrit de dix caractères', () => {
  test('un ADMIN ne les voit pas ; le créateur les voit, avec l’état de chacun', async () => {
    const admin = await open(member(), { identity: ADMIN });
    expect(admin.host.querySelector('[data-admin-security="consents"]')).toBeNull();
    mounter.unmountAll();

    const boss = await open(member());
    expect(boss.host.querySelector('[data-admin-security="consents"]')).not.toBeNull();
    expect(textOf(boss.host.querySelector('[data-admin-security="consent-voiceData"]'))).toContain('Donné le');
    expect(textOf(boss.host.querySelector('[data-admin-security="consent-voiceProfile"]'))).toContain('Non donné');
    expect(textOf(boss.host.querySelector('[data-admin-security="consents"]'))).toContain('l’analytique');
  });

  test('sans bloc adminMetadata, rien à poser : les états sont inconnus', async () => {
    const { host } = await open(member({ adminMetadata: undefined }));
    expect(host.querySelector('[data-admin-security="consents"]')).toBeNull();
  });

  test('poser : motif obligatoire, corps { voiceProfile: true, reason }, annonce, détail remplacé', async () => {
    const { host, calls, announcements } = await open(member(), {
      replies: [patch('consents', () => ({ ok: true, data: served({ adminMetadata: { ...METADATA, voiceProfileConsentAt: '2026-09-30T12:00:00.000Z' } }) }))],
    });

    await ask(host, 'grant-consent-voiceProfile');
    expect(confirmButton()?.disabled).toBe(true);
    await confirm('Consentement recueilli par écrit');

    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ voiceProfile: true, reason: 'Consentement recueilli par écrit' });
    expect(announcements).toContain('Consentement mis à jour');
    expect(cached()?.adminMetadata?.voiceProfileConsentAt).toBe('2026-09-30T12:00:00.000Z');
    expect(action(host, 'revoke-consent-voiceProfile')).not.toBeNull();
  });

  test('retirer un consentement donné envoie `false`', async () => {
    const { host, calls } = await open(member(), { replies: [patch('consents', () => ({ ok: true, data: served() }))] });

    await ask(host, 'revoke-consent-voiceData');
    await confirm('Retrait demandé par le membre');

    expect(calls().find((request) => request.method === 'PATCH')?.body).toEqual({ voiceData: false, reason: 'Retrait demandé par le membre' });
  });
});

describe('garde et états', () => {
  test('sans `canManageUsers`, AUCUN geste n’est dessiné', async () => {
    const reader = adminIdentityFixture({ role: 'BIGBOSS', permissions: { canManageUsers: false } });
    const { host } = await open(member({ lockedUntil: FUTURE, twoFactorEnabledAt: PAST, emailVerifiedAt: PAST }), { identity: reader });
    for (const name of ['unlock', 'remove-two-factor', 'unverify-email', 'verify-age', 'grant-consent-voiceProfile']) expect(action(host, name)).toBeNull();
    expect(textOf(host)).toContain('Verrouillé jusqu’au');
  });

  test('la section se lit sans identifiant brut ni énumération brute', async () => {
    const { host } = await open(member({ lockedUntil: FUTURE, twoFactorEnabledAt: PAST, emailVerifiedAt: PAST }));
    expectNoRawIdentifiers(host);
  });
});
