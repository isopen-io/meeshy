import { describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';

import { securityEventLabel, SECURITY_EVENT_TYPES } from '@/lib/admin/user-dossier-labels';
import { visibleAdminSections } from '@/lib/admin/sections';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { loadAdminInterfaceCatalog, translateAdminMaybe } from '@/lib/i18n-admin-catalog';
import { expectNoRawIdentifiers, adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import {
  AdminUserCommunitiesTab,
  AdminUserContactsTab,
  AdminUserReportsTab,
  AdminUserSecurityTab,
  AdminUserVoiceTab,
} from './admin-user-dossier';

/**
 * **LE DOSSIER D'UN MEMBRE, EN MOTS** (#7845, #8876) — contacts, communautés, profil
 * vocal, sécurité, signalements. Une personne est un chip (vrai nom, `@pseudo`, lien
 * vers sa fiche) ; un statut, un motif, une gravité, un événement se disent : jamais
 * `accepted`, `harassment` ou `LOGIN_FAILED` bruts, jamais une couleur écrite en dur.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const USER = '64f1c2a9e8b7d6c5b4a39281';
const OTHER = '64f1c2a9e8b7d6c5b4a39282';
const COMMUNITY = '64f1c2a9e8b7d6c5b4a39283';
const NOW = new Date('2026-09-30T12:00:00.000Z');

const page = (rows: readonly unknown[]): ApiResult<unknown> => ({ ok: true, data: rows, pagination: { total: rows.length, offset: 0, limit: 20, hasMore: false } });

const at = (suffix: string, reply: ApiResult<unknown>): RoutedReply => (request: HttpRequest) =>
  request.method === 'GET' && pathOf(request) === `/api/v1/admin/users/${USER}${suffix}` ? reply : undefined;

async function openAs(identity: typeof BIGBOSS, element: (deps: AdminDeps) => ReactElement, ...replies: readonly RoutedReply[]) {
  const gateway = routedTransport(...replies);
  const host = await mount(element({ source: 'gateway', transport: gateway.transport }), identity);
  await mounter.settle();
  await mounter.settle();
  return { host, calls: gateway.calls };
}

async function open(element: (deps: AdminDeps) => ReactElement, ...replies: readonly RoutedReply[]) {
  return (await openAs(BIGBOSS, element, ...replies)).host;
}

const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const noHex = (host: HTMLElement) => {
  const clone = host.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-presence]').forEach((dot) => dot.remove());
  expect(clone.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
};
const opens = (section: string) => visibleAdminSections(BIGBOSS.permissions, 'BIGBOSS').some((candidate) => candidate.id === section);

describe('contacts', () => {
  const activity = at('/activity', {
    ok: true,
    data: {
      contacts: {
        sent: [{ id: 'f1', status: 'accepted', createdAt: '2026-09-27T12:00:00.000Z', receiver: { id: OTHER, username: 'awa', displayName: 'Awa Diop', avatar: '' } }],
        received: [{ id: 'f2', status: 'pending', createdAt: '2026-09-29T12:00:00.000Z', sender: { id: USER, username: 'kwame', displayName: '', avatar: '' } }],
      },
      shareLinks: [{}, {}],
      trackingLinks: [{}],
      affiliateTokens: [],
    },
  });

  test('chaque contact est un chip (vrai nom, @pseudo, fiche), son statut est dit en mots', async () => {
    const host = await open((deps) => <AdminUserContactsTab userId={USER} language="fr" deps={deps} now={() => NOW} />, activity);
    const first = host.querySelector('[data-admin-contact="f1"]');
    expect(textOf(first)).toContain('Awa Diop');
    expect(textOf(first)).toContain('@awa');
    expect(textOf(first)).toContain('Amis');
    expect(textOf(first)).toContain('Envoyée');
    expect(first?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${OTHER}`);
    expect(textOf(host.querySelector('[data-admin-contact="f2"]'))).toContain('En attente');
    expect(textOf(host.querySelector('[data-admin-contact="f2"]'))).toContain('@kwame');
    expect(textOf(host)).toContain('2 lien(s) de partage · 1 lien(s) de suivi · 0 jeton(s) d\'affiliation');
    expect(host.textContent).not.toContain('accepted');
    expectNoRawIdentifiers(host);
    noHex(host);
  });
});

describe('communautés', () => {
  test('nom, identifiant public en secondaire, rôle et état en mots, lien vers la communauté si la section est ouverte', async () => {
    const host = await open(
      (deps) => <AdminUserCommunitiesTab userId={USER} language="fr" deps={deps} />,
      at('/communities', {
        ok: true,
        data: [
          {
            community: { id: COMMUNITY, name: 'Traducteurs du Sahel', identifier: 'mshy_sahel', avatar: '', isPrivate: true, memberCount: 1204 },
            membership: { role: 'admin', joinedAt: '2026-03-01T12:00:00.000Z', isActive: true },
            isCreator: true,
          },
        ],
        pagination: { total: 1, offset: 0, limit: 20, hasMore: false },
      }),
    );
    const row = host.querySelector(`[data-admin-community="${COMMUNITY}"]`);
    const text = textOf(row);
    expect(text).toContain('Traducteurs du Sahel');
    expect(text).toContain('mshy_sahel · Privée');
    expect(text).toContain('Administrateur');
    expect(text).toContain('Créateur');
    expect(text).toContain('Actif');
    expect(text).toContain('1 204');
    const link = row?.querySelector('a');
    if (opens('communities')) expect(link?.getAttribute('href')).toBe(`/admin/communities/${COMMUNITY}`);
    else expect(link).toBeNull();
    noHex(host);
  });

  test('une adhésion terminée se dit « Parti »', async () => {
    const host = await open(
      (deps) => <AdminUserCommunitiesTab userId={USER} language="fr" deps={deps} />,
      at('/communities', { ok: true, data: [{ community: { id: COMMUNITY, name: 'Sahel', identifier: 'x' }, membership: { role: 'member', isActive: false } }], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }),
    );
    expect(textOf(host.querySelector(`[data-admin-community="${COMMUNITY}"]`))).toContain('Parti');
  });
});

describe('profil vocal', () => {
  test('durée en mots, consentements « Donné le … » / « Non donné »', async () => {
    const host = await open(
      (deps) => <AdminUserVoiceTab userId={USER} language="fr" deps={deps} />,
      at('/voice-profile', {
        ok: true,
        data: {
          voiceProfile: { audioCount: 5, totalDurationMs: 65_000, embeddingModel: 'xtts-v2', createdAt: '2026-08-01T12:00:00.000Z' },
          consents: { voiceProfileConsentAt: '2026-08-02T12:00:00.000Z', voiceDataConsentAt: null, voiceCloningEnabledAt: null },
        },
      }),
    );
    const text = textOf(host.querySelector('[data-admin-voice]'));
    expect(text).toContain('1 min 05 s');
    expect(text).toContain('Donné le');
    expect(text).toContain('Non donné');
    expectNoRawIdentifiers(host);
  });
});

describe('sécurité', () => {
  const sessions = at('/sessions', page([{ id: 's1', browserName: 'Safari', osName: 'iOS', ipAddress: '196.0.0.1', city: 'Dakar', country: 'SN', isValid: true, createdAt: '2026-09-29T12:00:00.000Z', lastActivityAt: '2026-09-30T11:00:00.000Z' }]));
  const events = at(
    '/security-events',
    page([
      { id: 'e1', eventType: 'LOGIN_FAILED', severity: 'HIGH', status: 'FAILED', description: '', ipAddress: '196.0.0.1', createdAt: '2026-09-30T10:00:00.000Z' },
      { id: 'e2', eventType: 'BRAND_NEW_EVENT', severity: 'LOW', status: 'SUCCESS', description: 'Détail', ipAddress: '', createdAt: '2026-09-30T09:00:00.000Z' },
    ]),
  );

  test('événements dits en mots (type, gravité, résultat) ; un type inconnu est humanisé, jamais le code brut', async () => {
    const host = await open((deps) => <AdminUserSecurityTab userId={USER} language="fr" deps={deps} now={() => NOW} onAnnounce={() => undefined} />, sessions, events);
    const text = textOf(host.querySelector('[data-admin-security]'));
    expect(text).toContain('Connexion échouée');
    expect(text).toContain('Élevée');
    expect(text).toContain('Échoué');
    expect(text).toContain('Brand new event');
    expect(text).toContain('Ouverte');
    expect(text).not.toContain('LOGIN_FAILED');
    expect(text).not.toContain('BRAND_NEW_EVENT');
    expectNoRawIdentifiers(host);
    noHex(host);
  });

  test('un 403 dit que la section est réservée — pas une panne', async () => {
    const host = await open(
      (deps) => <AdminUserSecurityTab userId={USER} language="fr" deps={deps} now={() => NOW} onAnnounce={() => undefined} />,
      at('/sessions', { ok: false, status: 403, error: 'Forbidden' }),
      at('/security-events', { ok: false, status: 403, error: 'Forbidden' }),
    );
    expect(textOf(host)).toContain('Réservé aux administrateurs habilités aux données sensibles.');
  });
});

describe('signalements', () => {
  test('motif, statut et genre visé se disent en mots ; un texte retenu se dit « réservé à la modération »', async () => {
    const host = await open(
      (deps) => <AdminUserReportsTab userId={USER} language="fr" deps={deps} now={() => NOW} />,
      at('/reports', page([{ id: 'r1', reportedType: 'message', reportType: 'harassment', reason: 'Insultes', status: 'under_review', createdAt: '2026-09-28T12:00:00.000Z' }])),
      at('/reported-messages', page([{ id: 'r2', reporterName: 'Jean Dupont', reportType: 'hate_speech', reason: 'Haine', status: 'pending', createdAt: '2026-09-27T12:00:00.000Z', message: { content: null } }])),
    );
    const text = textOf(host.querySelector('[data-admin-reports]'));
    expect(text).toContain('Harcèlement');
    expect(text).toContain('En cours d’examen');
    expect(text).toContain('Message');
    expect(text).toContain('Jean Dupont');
    expect(text).toContain('Discours de haine');
    expect(text).toContain('En attente');
    expect(text).toContain('texte réservé à la modération');
    for (const raw of ['harassment', 'under_review', 'hate_speech']) expect(text).not.toContain(raw);
    expectNoRawIdentifiers(host);
    noHex(host);
  });
});

describe('les événements de sécurité ont tous un libellé', () => {
  test('chaque type connu est étiqueté en français et en anglais', async () => {
    await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
    const missing = SECURITY_EVENT_TYPES.filter((type) => translateAdminMaybe('fr', `admin.people.secEvent.${type}`) === null || translateAdminMaybe('en', `admin.people.secEvent.${type}`) === null);
    expect(missing).toEqual([]);
    expect(securityEventLabel('login_failed', 'fr')).toBe('Connexion échouée');
  });
});


describe('les onglets du dossier sont des listes du kit (#8876)', () => {
  const activity = (contacts: { readonly sent: readonly unknown[]; readonly received: readonly unknown[] }) =>
    at('/activity', { ok: true, data: { contacts, shareLinks: [], trackingLinks: [], affiliateTokens: [] } });
  const sentTo = { id: 'f1', status: 'accepted', createdAt: '2026-09-27T12:00:00.000Z', receiver: { id: OTHER, username: 'awa', displayName: 'Awa Diop', avatar: '' } };

  test('une rangée est AUSSI une carte : le tableau ne défile pas de côté à 375 px, il se plie', async () => {
    const host = await open((deps) => <AdminUserContactsTab userId={USER} language="fr" deps={deps} now={() => NOW} />, activity({ sent: [sentTo], received: [] }));
    expect(host.querySelector('table')?.parentElement?.className).toContain('@3xl:block');
    expect(host.querySelector('ul')?.className).toContain('@3xl:hidden');
    expect(host.querySelector('[data-admin-card="f1"]')?.textContent).toContain('Awa Diop');
  });

  test('aucun contact : un vide DESSINÉ, pas une ligne de texte nue', async () => {
    const host = await open((deps) => <AdminUserContactsTab userId={USER} language="fr" deps={deps} now={() => NOW} />, activity({ sent: [], received: [] }));
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Rien à afficher.');
    expect(host.querySelector('table')).toBeNull();
  });

  test('une panne dit « liste indisponible » AVEC un « Réessayer » qui relit — et la liste revient', async () => {
    let reads = 0;
    const flaky: RoutedReply = (request) => {
      if (request.method !== 'GET' || pathOf(request) !== `/api/v1/admin/users/${USER}/activity`) return undefined;
      reads += 1;
      return reads === 1
        ? { ok: false, status: 500, error: 'boom' }
        : { ok: true, data: { contacts: { sent: [sentTo], received: [] }, shareLinks: [], trackingLinks: [], affiliateTokens: [] } };
    };
    const host = await open((deps) => <AdminUserContactsTab userId={USER} language="fr" deps={deps} now={() => NOW} />, flaky);
    expect(host.querySelector('[data-admin-error]')?.textContent).toContain('Liste indisponible pour le moment.');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-admin-retry]')?.click());
    await mounter.settle();
    expect(reads).toBe(2);
    expect(host.querySelector('[data-admin-error]')).toBeNull();
    expect(textOf(host.querySelector('[data-admin-contact="f1"]'))).toContain('Awa Diop');
  });

  test('un 403 est un bloc RÉSERVÉ (verrou), jamais une erreur à réessayer', async () => {
    const host = await open(
      (deps) => <AdminUserCommunitiesTab userId={USER} language="fr" deps={deps} />,
      at('/communities', { ok: false, status: 403, error: 'Forbidden' }),
    );
    expect(host.querySelector('[data-admin-denied-inline]')?.textContent).toContain('Réservé aux administrateurs habilités aux données sensibles.');
    expect(host.querySelector('[data-admin-error]')).toBeNull();
    expect(host.querySelector('[data-admin-retry]')).toBeNull();
  });

  const reports = [
    at('/reports', page([{ id: 'r1', reportedType: 'message', reportType: 'harassment', reason: '', status: 'pending', createdAt: '2026-09-28T12:00:00.000Z' }])),
    at('/reported-messages', page([{ id: 'r2', reporterName: '', reportType: 'spam', reason: 'Pub', status: 'pending', createdAt: '2026-09-27T12:00:00.000Z', message: { content: 'x' } }])),
  ];

  test('chaque signalement ouvre SA fiche, reçu comme fait — le lien suit l’espace d’administration', async () => {
    const host = await open((deps) => <AdminUserReportsTab userId={USER} language="fr" deps={deps} now={() => NOW} />, ...reports);
    expect(opens('reports')).toBe(true);
    expect(host.querySelector('[data-admin-report="r1"] a')?.getAttribute('href')).toBe('/admin/reports/r1');
    expect(host.querySelector('[data-admin-report="r2"] a')?.getAttribute('href')).toBe('/admin/reports/r2');
  });

  test('sans la section signalements, aucun lien n’est tiré : le texte seul', async () => {
    const noModeration = adminIdentityFixture({ role: 'BIGBOSS', permissions: { canModerateContent: false } });
    const { host } = await openAs(noModeration, (deps) => <AdminUserReportsTab userId={USER} language="fr" deps={deps} now={() => NOW} />, ...reports);
    expect(host.querySelector('[data-admin-report="r1"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-report] a')).toBeNull();
  });

  test('un sujet ou un motif manquant se dit « Non renseigné », jamais un tiret brut', async () => {
    const host = await open((deps) => <AdminUserReportsTab userId={USER} language="fr" deps={deps} now={() => NOW} />, ...reports);
    const filed = host.querySelector('[data-admin-report="r1"]');
    expect(filed?.querySelector('[data-admin-not-provided]')?.textContent).toContain('Non renseigné');
    const received = host.querySelector('[data-admin-report="r2"]');
    expect(received?.querySelector('[data-admin-not-provided]')?.textContent).toContain('Non renseigné');
  });
});

describe('révoquer une session (#8876)', () => {
  const SESSION = 's1';
  const sessionRow = (id: string, isValid: boolean) => ({
    id,
    browserName: 'Safari',
    osName: 'iOS',
    ipAddress: '196.0.0.1',
    city: 'Dakar',
    country: 'SN',
    isValid,
    createdAt: '2026-09-29T12:00:00.000Z',
    lastActivityAt: '2026-09-30T11:00:00.000Z',
  });
  const noEvents = at('/security-events', page([]));

  /* Un jeu de lignes MUTABLE : la relecture qui suit la révocation doit voir la vérité du serveur. */
  const sessionsReply = (rows: () => readonly unknown[]): RoutedReply => (request) =>
    request.method === 'GET' && pathOf(request) === `/api/v1/admin/users/${USER}/sessions` ? page(rows()) : undefined;
  const revokeReply = (outcome: ApiResult<unknown>, onDelete: () => void = () => undefined): RoutedReply => (request) => {
    if (request.method !== 'DELETE' || pathOf(request) !== `/api/v1/admin/users/${USER}/sessions/${SESSION}`) return undefined;
    onDelete();
    return outcome;
  };
  const security = (deps: AdminDeps) => <AdminUserSecurityTab userId={USER} language="fr" deps={deps} now={() => NOW} onAnnounce={() => undefined} />;
  const revokeButtons = (host: HTMLElement) => host.querySelectorAll<HTMLButtonElement>('[data-admin-action="revoke-session"]');

  test('une session OUVERTE porte « Révoquer cette session », une session fermée n’en porte pas', async () => {
    const { host } = await openAs(BIGBOSS, security, sessionsReply(() => [sessionRow(SESSION, true), sessionRow('s2', false)]), noEvents);
    expect(host.querySelector(`[data-admin-session="${SESSION}"] [data-admin-action="revoke-session"]`)).not.toBeNull();
    expect(host.querySelector('[data-admin-session="s2"] [data-admin-action="revoke-session"]')).toBeNull();
    expect(revokeButtons(host)[0]?.style.minHeight).toBe('44px');
  });

  test('sans le rang d’administration, le geste n’est pas offert — la route le refuserait', async () => {
    const moderator = adminIdentityFixture({ role: 'MODERATOR' });
    const { host } = await openAs(moderator, security, sessionsReply(() => [sessionRow(SESSION, true)]), noEvents);
    expect(host.querySelector(`[data-admin-session="${SESSION}"]`)).not.toBeNull();
    expect(revokeButtons(host).length).toBe(0);
  });

  test('la feuille dit ce qui va se passer ; annuler n’envoie rien', async () => {
    const { host, calls } = await openAs(BIGBOSS, security, sessionsReply(() => [sessionRow(SESSION, true)]), noEvents);
    await act(async () => revokeButtons(host)[0]?.click());
    const sheet = document.querySelector('[data-admin-confirm]');
    expect(sheet?.textContent).toContain('Safari · iOS');
    expect(sheet?.textContent).toContain('journal d’audit');
    await act(async () => document.querySelector<HTMLButtonElement>('[data-admin-action="cancel"]')?.click());
    expect(calls().filter((call) => call.method === 'DELETE')).toEqual([]);
  });

  test('confirmer envoie DELETE sur la session, la ligne s’en va, la liste est relue', async () => {
    let rows: readonly unknown[] = [sessionRow(SESSION, true)];
    const { host, calls } = await openAs(
      BIGBOSS,
      security,
      sessionsReply(() => rows),
      revokeReply({ ok: true, data: { message: 'ok' } }, () => {
        rows = [];
      }),
      noEvents,
    );
    await act(async () => revokeButtons(host)[0]?.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-admin-action="confirm"]')?.click());
    await mounter.settle();
    await mounter.settle();
    const deletes = calls().filter((call) => call.method === 'DELETE');
    expect(deletes.map((call) => pathOf(call))).toEqual([`/api/v1/admin/users/${USER}/sessions/${SESSION}`]);
    expect(host.querySelector(`[data-admin-session="${SESSION}"]`)).toBeNull();
    expect(document.querySelector('[data-admin-confirm]')).toBeNull();
  });

  test('un refus remet la ligne, le dit en mots (403 traduit) et garde la feuille ouverte', async () => {
    const announced: string[] = [];
    const gateway = routedTransport(sessionsReply(() => [sessionRow(SESSION, true)]), revokeReply({ ok: false, status: 403, error: 'Forbidden' }), noEvents);
    const host = await mount(
      <AdminUserSecurityTab userId={USER} language="fr" deps={{ source: 'gateway', transport: gateway.transport }} now={() => NOW} onAnnounce={(message) => announced.push(message)} />,
      BIGBOSS,
    );
    await mounter.settle();
    await mounter.settle();
    await act(async () => revokeButtons(host)[0]?.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-admin-action="confirm"]')?.click());
    await mounter.settle();
    expect(host.querySelector(`[data-admin-session="${SESSION}"]`)).not.toBeNull();
    expect(document.querySelector('[data-admin-confirm-error]')?.textContent).toContain('droit');
    expect(announced.at(-1)).toContain('droit');
    expect(document.querySelector('[data-admin-confirm]')).not.toBeNull();
  });
});
