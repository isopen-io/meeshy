import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ADMIN_USER_TABS } from '@/lib/admin/user-tabs';
import { visibleAdminSections } from '@/lib/admin/sections';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers, type AdminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminUserFiche } from './admin-user';

/**
 * **LA FICHE D'UN MEMBRE, SUR LE KIT** (#8005, #8004) — ce qu'un administrateur lit :
 * le VRAI nom, l'état dit en mots, quinze chiffres, des métadonnées INTERPRÉTÉES
 * (langues nommées, pays, âge, consentements, appareil), et rien d'inventé pour
 * qui ne reçoit pas le bloc sensible.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ID = '64f1c2a9e8b7d6c5b4a39281';
const NOW = new Date('2026-09-30T12:00:00.000Z');

const METADATA = {
  deviceLocale: 'pt-BR',
  deviceCountry: 'BR',
  birthDate: '1994-03-12T12:00:00.000Z',
  ageVerifiedAt: '2026-08-01T12:00:00.000Z',
  voiceProfileConsentAt: '2026-08-02T12:00:00.000Z',
  voiceDataConsentAt: null,
  dataProcessingConsentAt: '2026-08-03T12:00:00.000Z',
  analyticsConsentAt: null,
  voiceCloningEnabledAt: null,
  termsAcceptedAt: '2026-07-01T12:00:00.000Z',
  termsVersion: '2026-06',
  onboardingCompletedAt: '2026-07-02T12:00:00.000Z',
  currentStreakDays: 4,
  longestStreakDays: 21,
  engagementScore: 73.5,
  meeshBalance: 120,
  blockedCount: 2,
  hasPendingEmail: true,
  hasPendingPhone: false,
};

const DETAIL = {
  id: ID,
  username: 'amina',
  firstName: 'Amina',
  lastName: 'Diallo',
  displayName: '',
  bio: 'Traductrice',
  avatar: '',
  banner: '',
  profileCompletionRate: 80,
  role: 'MODERATOR',
  isActive: true,
  isOnline: true,
  emailVerifiedAt: '2026-01-02T12:00:00.000Z',
  phoneVerifiedAt: null,
  lastActiveAt: '2026-09-30T11:59:45.000Z',
  createdAt: '2025-12-01T12:00:00.000Z',
  updatedAt: '2026-09-15T12:00:00.000Z',
  deactivatedAt: null,
  email: 'amina@example.test',
  phoneNumber: '',
  timezone: 'Africa/Dakar',
  systemLanguage: 'fr',
  regionalLanguage: 'wo',
  customDestinationLanguage: '',
  lastPasswordChange: '2026-06-01T12:00:00.000Z',
  failedLoginAttempts: 2,
  lockedUntil: null,
  lockedReason: null,
  twoFactorEnabledAt: '2026-05-01T12:00:00.000Z',
  twoFactorBackupCodesRemaining: 6,
  deletedAt: null,
  deletedBy: null,
  registrationCountry: 'SN',
  lastLoginLocation: 'Dakar, SN',
  lastLoginDevice: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
  registrationLocation: 'Thiès, SN',
  registrationDevice: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36',
  adminMetadata: METADATA,
  _count: { createdShareLinks: 3, createdTrackingLinks: 2, createdAffiliateTokens: 1, affiliateRelations: 4, referredRelations: 5, sentFriendRequests: 6, receivedFriendRequests: 7 },
};

const STATS = {
  messagesSent: 1204,
  conversations: 31,
  posts: 12,
  reels: 2,
  stories: 9,
  comments: 40,
  reactionsGiven: 300,
  mediaUploaded: 15,
  friends: 22,
  pendingFriendRequestsIn: 1,
  pendingFriendRequestsOut: 3,
  reportsFiled: null,
  reportsReceived: 2,
  activeSessions: 2,
  communities: 4,
};

const page = (rows: readonly unknown[]): ApiResult<unknown> => ({ ok: true, data: rows, pagination: { total: rows.length, offset: 0, limit: 20, hasMore: false } });

const at = (suffix: string, reply: ApiResult<unknown>, method = 'GET'): RoutedReply => (request: HttpRequest) =>
  request.method === method && pathOf(request) === `/api/v1/admin/users/${ID}${suffix}` ? reply : undefined;

const base = (detail: Readonly<Record<string, unknown>> = DETAIL, bans: readonly unknown[] = []): readonly RoutedReply[] => [
  at('', { ok: true, data: detail }),
  at('/stats', { ok: true, data: STATS }),
  at('/bans', { ok: true, data: bans }),
  at('/media', page([])),
  at('/conversations', page([])),
];

async function open(options: { readonly url?: string; readonly identity?: AdminIdentityFixture; readonly replies?: readonly RoutedReply[] } = {}) {
  /* Un témoin peut ouvrir la fiche plusieurs fois : le membre déjà en cache ne doit pas survivre au montage suivant. */
  appQueryClient.removeQueries({ queryKey: ['admin', 'user', ID] });
  const gateway = routedTransport(...(options.replies ?? base()));
  const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
  const Screen = () => <AdminUserFiche userId={ID} language="fr" reach={useAdminReach()} deps={deps} now={() => NOW} />;
  const { Router } = createRouter({ probe: { pattern: '/probe', screen: async () => ({ default: Screen }) } }, () => <p>absent</p>);
  navigate(options.url ?? '/probe', true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, options.identity ?? BIGBOSS);
  for (let attempt = 0; attempt < 40 && host.querySelector('[data-admin-fiche], [data-admin-error], [data-admin-denied-inline]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return { host, calls: gateway.calls };
}

const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const meta = (host: ParentNode, anchor: string) => textOf(host.querySelector(`[data-admin-meta="${anchor}"]`));
const auditOpens = () => visibleAdminSections(BIGBOSS.permissions, 'BIGBOSS').some((section) => section.id === 'audit');

describe('l’en-tête d’identité — le vrai nom, l’état en mots', () => {
  test('nom composé (sans nom affiché : « Prénom Nom »), @pseudo, avatar avec sa présence calculée', async () => {
    const { host } = await open();
    expect(host.querySelector('[data-admin-user]')?.getAttribute('data-admin-user')).toBe(ID);
    expect(host.querySelector('[data-admin-fiche="user"]')).not.toBeNull();
    const identity = host.querySelector('[data-admin-identity]');
    expect(identity?.querySelector('h2')?.textContent).toBe('Amina Diallo');
    expect(textOf(identity)).toContain('@amina');
    expect(identity?.querySelector('[data-presence]')?.getAttribute('data-presence')).toBe('online');
  });

  test('rôle, état, preuve d’e-mail et double authentification se disent en mots', async () => {
    const { host } = await open();
    const identity = textOf(host.querySelector('[data-admin-identity]'));
    expect(identity).toContain('Modérateur');
    expect(identity).toContain('Actif');
    expect(identity).toContain('E-mail vérifié');
    expect(identity).toContain('Double authentification');
    expect(identity).not.toContain('MODERATOR');
  });

  test('l’état le plus grave gagne : un bannissement en vigueur se dit « Banni »', async () => {
    const { host } = await open({ replies: base(DETAIL, [{ id: 'b1', reason: 'spam', active: true, createdAt: '2026-09-29T12:00:00.000Z', expiresAt: null, liftedAt: null }]) });
    expect(textOf(host.querySelector('[data-admin-identity]'))).toContain('Banni');
  });

  test('désactivé, verrouillé', async () => {
    const off = await open({ replies: base({ ...DETAIL, isActive: false, deactivatedAt: '2026-09-20T12:00:00.000Z' }) });
    expect(textOf(off.host.querySelector('[data-admin-identity]'))).toContain('Désactivé');
    mounter.unmountAll();
    const locked = await open({ replies: base({ ...DETAIL, lockedUntil: '2026-10-02T12:00:00.000Z' }) });
    expect(textOf(locked.host.querySelector('[data-admin-identity]'))).toContain('Verrouillé');
  });

  test('le fil d’Ariane nomme le groupe, la section et le membre — jamais son identifiant', async () => {
    const { host } = await open();
    const crumbs = [...host.querySelectorAll('nav ol li')].map((item) => textOf(item));
    expect(crumbs).toEqual(['Personnes', 'Comptes', 'Amina Diallo']);
  });

  test('« Journal de ce membre » n’existe que si la section d’audit est ouverte, et pointe vers ce membre', async () => {
    const { host } = await open();
    const link = host.querySelector<HTMLAnchorElement>('[data-admin-link="member-journal"]');
    if (auditOpens()) {
      expect(link?.getAttribute('href')).toBe(`/admin/audit?subject=${ID}`);
    } else {
      expect(link).toBeNull();
      expect(textOf(host)).not.toContain('Journal de ce membre');
    }
  });
});

describe('le bandeau de chiffres — quinze, dont un que la passerelle retient', () => {
  test('quinze cartes, formatées ; les signalements déposés se disent « Non communiqué », jamais 0', async () => {
    const { host } = await open();
    const cards = [...host.querySelectorAll('[data-admin-stat-strip] [data-admin-stat]')];
    expect(cards).toHaveLength(15);
    expect(textOf(host.querySelector('[data-admin-stat="messagesSent"]'))).toContain('1 204');
    expect(textOf(host.querySelector('[data-admin-stat="reportsFiled"]'))).toContain('Non communiqué');
    expect(textOf(host.querySelector('[data-admin-stat="reportsReceived"]'))).toContain('2');
  });

  test('les demandes envoyées mènent aux demandes de contact de ce membre, quand la section est ouverte', async () => {
    const { host } = await open();
    const link = host.querySelector('[data-admin-stat="pendingFriendRequestsOut"] a');
    const opens = visibleAdminSections(BIGBOSS.permissions, 'BIGBOSS').some((section) => section.id === 'invitations');
    if (opens) expect(link?.getAttribute('href')).toBe(`/admin/invitations?senderId=${ID}`);
    else expect(link).toBeNull();
  });

  test('un échec des chiffres se dit, avec « Réessayer », sans masquer le reste de la fiche', async () => {
    const { host } = await open({ replies: [at('', { ok: true, data: DETAIL }), at('/stats', { ok: false, status: 500, error: 'boom' }), at('/bans', { ok: true, data: [] })] });
    expect(host.querySelector('[data-admin-stat-strip]')).toBeNull();
    expect(host.querySelector('[data-admin-notice="warning"] [data-admin-retry]')).not.toBeNull();
    expect(host.querySelector('[data-admin-identity]')).not.toBeNull();
  });
});

describe('les métadonnées interprétées (#8005)', () => {
  test('identité et langues : les trois rangs du Prisme NOMMÉS, le fuseau, le pays d’inscription, la complétude', async () => {
    const { host } = await open();
    expect(meta(host, 'systemLanguage')).toContain('Français');
    expect(meta(host, 'regionalLanguage')).toContain('Wolof');
    expect(meta(host, 'customLanguage')).toContain('Aucune');
    expect(meta(host, 'timezone')).toContain('Africa/Dakar');
    expect(meta(host, 'registrationCountry')).toContain('Sénégal');
    expect(meta(host, 'completion')).toContain('80 %');
    expect(meta(host, 'systemLanguage')).toContain('Les messages sont lus dans cet ordre de langues');
  });

  test('dates en absolu ET en relatif ; la dernière activité masquée se dit « Non communiquée »', async () => {
    const { host } = await open();
    expect(host.querySelector('[data-admin-meta="createdAt"] time')?.getAttribute('title')).toContain('2025');
    expect(meta(host, 'createdAt')).toContain('il y a');
    mounter.unmountAll();
    const hidden = await open({ replies: base({ ...DETAIL, lastActiveAt: null, isOnline: false }) });
    expect(meta(hidden.host, 'lastActive')).toContain('Non communiquée');
    expect(meta(hidden.host, 'lastActive')).toContain('La présence n’est partagée qu’avec');
  });

  test('métadonnées de compte : langue et pays de l’appareil, âge calculé, consentements, conditions, série, score, meesh, blocages, changements en attente', async () => {
    const { host } = await open();
    expect(meta(host, 'deviceLocale').toLowerCase()).toContain('portugais');
    expect(meta(host, 'deviceCountry')).toContain('Brésil');
    expect(meta(host, 'age')).toContain('32 ans');
    expect(meta(host, 'age')).toContain('12 mars 1994');
    expect(meta(host, 'ageVerified')).toContain('Vérifié le');
    expect(meta(host, 'consent-voiceProfile')).toContain('Donné le');
    expect(meta(host, 'consent-voiceData')).toContain('Non donné');
    expect(meta(host, 'consent-analytics')).toContain('Non donné');
    expect(meta(host, 'terms')).toContain('Version 2026-06');
    expect(meta(host, 'onboarding')).toContain('Terminé le');
    expect(meta(host, 'streak')).toContain('4 jours (record : 21 jours)');
    expect(meta(host, 'engagement')).toContain('73,5');
    expect(meta(host, 'meesh')).toContain('120');
    expect(meta(host, 'blocked')).toContain('2 compte(s)');
    expect(meta(host, 'pendingEmail')).toContain('Oui');
    expect(meta(host, 'pendingEmail')).toContain('jamais affichée');
    expect(meta(host, 'pendingPhone')).toContain('Non');
  });

  test('connexions : lieu et appareil LUS (navigateur · plateforme), tentatives, verrou, mot de passe, codes de secours', async () => {
    const { host } = await open();
    expect(meta(host, 'lastLogin')).toContain('Dakar, SN · Safari · iPhone / iPad');
    expect(meta(host, 'registration')).toContain('Thiès, SN · Chrome · Ordinateur');
    expect(meta(host, 'failedLogins')).toContain('2');
    expect(meta(host, 'failedLogins')).toContain('repart de zéro');
    expect(meta(host, 'lock')).toContain('Aucun verrou');
    expect(meta(host, 'passwordChanged')).toContain('Changé le');
    expect(meta(host, 'backupCodes')).toContain('6 code(s) de secours restant(s)');
    expect(host.textContent).not.toContain('Mozilla');
  });

  test('compteurs de liens (`_count`) et identifiant technique, seule ligne où l’identifiant s’écrit', async () => {
    const { host } = await open();
    expect(meta(host, 'shareLinks')).toContain('3');
    expect(meta(host, 'referralsReceived')).toContain('5');
    expect(meta(host, 'requestsReceived')).toContain('7');
    expect(host.querySelector('[data-admin-technical-id]')?.textContent).toBe(ID);
  });

  test('sans le bloc sensible (rôle qui ne le reçoit pas) : ni métadonnées de compte, ni connexions, ni pays inventé', async () => {
    const masked = {
      ...DETAIL,
      adminMetadata: undefined,
      twoFactorBackupCodesRemaining: undefined,
      registrationCountry: undefined,
      lastLoginLocation: undefined,
      lastLoginDevice: undefined,
      registrationLocation: undefined,
      registrationDevice: undefined,
      email: 'a***@example.test',
    };
    const { host } = await open({ replies: base(masked) });
    const text = textOf(host.querySelector('aside'));
    expect(text).not.toContain('Métadonnées de compte');
    expect(text).not.toContain('Connexions');
    expect(host.querySelector('[data-admin-meta="registrationCountry"]')).toBeNull();
    expect(host.querySelector('[data-admin-meta="deviceLocale"]')).toBeNull();
    expect(text).toContain('Identité et langues');
  });

  test('aucun identifiant, horodatage ISO, booléen ou énumération bruts dans toute la fiche', async () => {
    const { host } = await open();
    expectNoRawIdentifiers(host);
  });

  test('aucun hexadécimal dans la fiche (la pastille de l’avatar lit la table centrale de la présence)', async () => {
    const { host } = await open();
    const clone = host.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-presence]').forEach((dot) => dot.remove());
    expect(clone.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('états dessinés et onglets', () => {
  test('membre introuvable (404), refus (403) et panne : chacun se dit à sa façon', async () => {
    const notFound = await open({ replies: [at('', { ok: false, status: 404, error: 'User not found' }), at('/stats', { ok: true, data: STATS }), at('/bans', { ok: true, data: [] })] });
    expect(textOf(notFound.host.querySelector('[data-admin-error]'))).toContain('n’existe pas');
    mounter.unmountAll();
    const denied = await open({ replies: [at('', { ok: false, status: 403, error: 'Forbidden' }), at('/stats', { ok: true, data: STATS }), at('/bans', { ok: true, data: [] })] });
    expect(denied.host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(denied.host.querySelector('[data-admin-error]')).toBeNull();
    mounter.unmountAll();
    const down = await open({ replies: [at('', { ok: false, status: 500, error: 'boom' }), at('/stats', { ok: true, data: STATS }), at('/bans', { ok: true, data: [] })] });
    expect(textOf(down.host.querySelector('[data-admin-error]'))).toContain('Fiche indisponible');
    expect(down.host.querySelector('[data-admin-retry]')).not.toBeNull();
  });

  test('les onglets sont un tablist : l’onglet s’écrit dans l’adresse, les ancres de la recette existent', async () => {
    const { host } = await open();
    expect(host.querySelector('[role="tablist"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-user-panel="profile"]')).not.toBeNull();
    await act(async () => (host.querySelector('[data-admin-user-tab="conversations"]') as HTMLElement | null)?.click());
    await mounter.settle();
    expect(window.location.search).toBe('?tab=conversations');
    expect(host.querySelector('[data-admin-user-panel="conversations"]')).not.toBeNull();
    expect(host.querySelector('[data-collapsible-toggle="admin-conv"]')).not.toBeNull();
  });

  test('les onglets de la fiche sont ceux du gabarit commun : contrat d’identifiants, aria-controls, Début/Fin', async () => {
    const { host } = await open();
    const tabs = [...host.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.id)).toEqual(ADMIN_USER_TABS.map((onglet) => `admin-user-tab-${onglet}`));
    expect(tabs.map((tab) => tab.getAttribute('data-admin-user-tab'))).toEqual([...ADMIN_USER_TABS]);
    expect(tabs.map((tab) => tab.getAttribute('aria-controls'))).toEqual(ADMIN_USER_TABS.map((onglet) => `admin-user-panel-${onglet}`));
    const panel = host.querySelector('[role="tabpanel"]');
    expect(panel?.id).toBe('admin-user-panel-profile');
    expect(panel?.getAttribute('aria-labelledby')).toBe('admin-user-tab-profile');
    expect(panel?.getAttribute('data-admin-user-panel')).toBe('profile');
    tabs[0]?.focus();
    await act(async () => {
      tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    });
    await mounter.settle();
    expect(window.location.search).toBe(`?tab=${ADMIN_USER_TABS.at(-1)}`);
    expect(document.activeElement?.id).toBe(`admin-user-tab-${ADMIN_USER_TABS.at(-1)}`);
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(`admin-user-tab-${ADMIN_USER_TABS.at(-1)}`);
  });

  test('le profil porte ses sections éditables : images, identité, contact, sécurité, rôle', async () => {
    const { host } = await open();
    for (const section of ['images', 'identity', 'contact', 'security', 'role']) {
      expect(host.querySelector(`[data-admin-member-section="${section}"]`)).not.toBeNull();
    }
  });

  test('le menu de rôle nomme chaque rôle — jamais BIGBOSS', async () => {
    const { host } = await open();
    const options = [...(host.querySelectorAll('#admin-member-role option') ?? [])].map((option) => option.textContent);
    expect(options).toEqual(['Créateur', 'Administrateur', 'Modérateur', 'Auditeur', 'Analyste', 'Membre']);
  });
});
