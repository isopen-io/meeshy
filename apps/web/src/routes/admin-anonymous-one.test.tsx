import { describe, expect, test } from 'bun:test';

import { visibleAdminSections } from '@/lib/admin/sections';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers, type AdminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminAnonymousFiche } from './admin-anonymous-one';

/**
 * **LA FICHE D'UN ANONYME, SUR LE KIT** (#8876) — un invité se lit en mots : son nom,
 * son état, sa langue NOMMÉE, sa conversation et son lien d'entrée en puces, ses
 * permissions en PHRASES. Aucun geste : la passerelle n'en sert aucun.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ID = '64f1c2a9e8b7d6c5b4a39281';
const CLUB = '64f1c2a9e8b7d6c5b4a39291';
const LINK = '64f1c2a9e8b7d6c5b4a39292';
const NOW = new Date('2026-09-30T12:00:00.000Z');

const FICHE = {
  id: ID,
  displayName: 'Awa',
  avatar: '',
  language: 'es',
  isActive: true,
  isOnline: true,
  lastActiveAt: '2026-09-30T11:59:45.000Z',
  joinedAt: '2026-09-27T12:00:00.000Z',
  leftAt: null,
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: false,
    canSendAudios: false,
    canSendLocations: false,
    canSendLinks: false,
    canViewHistory: true,
  },
  conversationId: CLUB,
  conversation: { id: CLUB, identifier: 'mshy_club', title: 'Le club', type: 'group' },
  shareLink: { id: LINK, name: 'Invitation salon', isActive: true, expiresAt: '2026-12-01T12:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' },
  _count: { sentMessages: 1204 },
};

const at = (reply: ApiResult<unknown>): RoutedReply => (request) =>
  request.method === 'GET' && pathOf(request) === `/api/v1/admin/anonymous-users/${ID}` ? reply : undefined;

async function open(options: { readonly identity?: AdminIdentityFixture; readonly reply?: ApiResult<unknown>; readonly language?: InterfaceLanguage } = {}) {
  appQueryClient.removeQueries({ queryKey: ['admin', 'anonymous-one', ID] });
  const gateway = routedTransport(at(options.reply ?? { ok: true, data: FICHE }));
  const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
  const Screen = () => <AdminAnonymousFiche participantId={ID} language={options.language ?? 'fr'} deps={deps} now={() => NOW} />;
  const { Router } = createRouter({ probe: { pattern: '/probe', screen: async () => ({ default: Screen }) } }, () => <p>absent</p>);
  navigate('/probe', true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, options.identity ?? BIGBOSS);
  for (let attempt = 0; attempt < 40 && host.querySelector('[data-admin-fiche], [data-admin-error], [data-admin-denied-inline]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return { host, calls: gateway.calls };
}

const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
const meta = (host: ParentNode, anchor: string) => textOf(host.querySelector(`[data-admin-meta="${anchor}"]`));
const opens = (section: 'shareLinks' | 'conversations') => visibleAdminSections(BIGBOSS.permissions, 'BIGBOSS').some((candidate) => candidate.id === section);

describe('AdminAnonymousFiche — l’identité d’un invité', () => {
  test('le nom, « Invité sans compte », l’état et la langue NOMMÉE : jamais « ES » ni l’identifiant', async () => {
    const { host } = await open();
    expect(host.querySelector('[data-admin-fiche="anonymous"]')).not.toBeNull();
    const identity = textOf(host.querySelector('[data-admin-identity]'));
    expect(identity).toContain('Awa');
    expect(identity).toContain('Invité sans compte');
    expect(identity).toContain('Actif');
    expect(identity).toContain('En ligne');
    expect(meta(host, 'language')).toContain('Espagnol');
    expect(meta(host, 'language')).not.toMatch(/\bES\b/);
    expectNoRawIdentifiers(host);
  });

  test('un invité sans nom se dit « Invité sans nom »', async () => {
    const { host } = await open({ reply: { ok: true, data: { ...FICHE, displayName: '' } } });
    expect(textOf(host.querySelector('[data-admin-identity]'))).toContain('Invité sans nom');
  });

  test('la présence est peinte par l’avatar d’après la règle partagée', async () => {
    const { host } = await open();
    expect(host.querySelector('[data-admin-identity] [data-presence]')?.getAttribute('data-presence')).toBe('online');
  });

  test('parti : l’état le dit, avec la date ; accès retiré : il le dit aussi', async () => {
    const left = await open({ reply: { ok: true, data: { ...FICHE, isActive: false, leftAt: '2026-09-29T09:00:00.000Z' } } });
    expect(textOf(left.host.querySelector('[data-admin-identity]'))).toContain('Parti');
    expect(meta(left.host, 'left')).not.toBe('');
    expect(meta(left.host, 'left')).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test('accès retiré : l’état le dit, sans date de départ', async () => {
    const { host } = await open({ reply: { ok: true, data: { ...FICHE, isActive: false } } });
    expect(textOf(host.querySelector('[data-admin-identity]'))).toContain('Accès retiré');
    expect(host.querySelector('[data-admin-meta="left"]')).toBeNull();
  });
});

describe('AdminAnonymousFiche — chiffres et métadonnées interprétées', () => {
  test('le bandeau dit les messages, les permissions accordées et l’arrivée — en mots et en nombres formatés', async () => {
    const { host } = await open();
    const strip = host.querySelector('[data-admin-stat-strip]');
    expect(textOf(strip?.querySelector('[data-admin-stat="messages"]') ?? null)).toContain('1 204');
    expect(textOf(strip?.querySelector('[data-admin-stat="permissions"]') ?? null)).toContain('4 sur 8');
    expect(textOf(strip?.querySelector('[data-admin-stat="arrived"]') ?? null)).toContain('il y a 3 jours');
  });

  test('chaque date se dit en relatif ET en absolu, jamais en ISO', async () => {
    const { host } = await open();
    expect(meta(host, 'joined')).toContain('il y a 3 jours');
    expect(meta(host, 'lastActive')).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(meta(host, 'presence')).toContain('En ligne');
  });

  test('la présence masquée se dit « Non communiquée », avec sa phrase', async () => {
    const { host } = await open({ reply: { ok: true, data: { ...FICHE, isOnline: false, lastActiveAt: null } } });
    expect(meta(host, 'presence')).toContain('Non communiquée');
    expect(meta(host, 'presence')).toContain('amis acceptés');
    expect(meta(host, 'lastActive')).toContain('Non communiquée');
  });

  test('l’identifiant technique est la SEULE ligne où l’identifiant s’écrit, avec sa copie', async () => {
    const { host } = await open();
    expect(host.querySelector('[data-admin-technical-id]')?.textContent).toBe(ID);
    expect(host.querySelector('[data-admin-action="copy-technical-id"]')).not.toBeNull();
  });
});

describe('AdminAnonymousFiche — conversation et lien d’entrée, nommés', () => {
  test('la conversation est une puce nommée, son type est dit en mots, et elle mène à SA fiche', async () => {
    const { host } = await open();
    const section = host.querySelector('[data-admin-fiche-section="conversation"]');
    expect(textOf(section)).toContain('Le club');
    expect(textOf(section)).toContain('Groupe');
    expect(section?.querySelector(`a[href="/admin/conversations/${CLUB}"]`) !== null).toBe(opens('conversations'));
  });

  test('sans le rang des conversations, la puce reste une étiquette', async () => {
    const auditor = adminIdentityFixture({ role: 'AUDIT', permissions: { canManageUsers: true } });
    const { host } = await open({ identity: auditor });
    const section = host.querySelector('[data-admin-fiche-section="conversation"]');
    expect(textOf(section)).toContain('Le club');
    expect(section?.querySelector('a')).toBeNull();
  });

  test('le lien d’entrée est une puce nommée : son état, son échéance — ni son identifiant ni ses clés de jointure', async () => {
    const { host } = await open();
    const section = host.querySelector('[data-admin-fiche-section="entry"]');
    expect(textOf(section)).toContain('Invitation salon');
    expect(textOf(section)).toContain('Actif');
    expect(textOf(section)).toContain('Échéance du lien');
    expect(section?.querySelector(`a[href="/admin/share-links/${LINK}"]`) !== null).toBe(opens('shareLinks'));
    expect(host.textContent ?? '').not.toContain('mshy_');
  });

  test('un lien fermé se dit « Fermé » ; sans échéance : « Sans échéance »', async () => {
    const { host } = await open({ reply: { ok: true, data: { ...FICHE, shareLink: { ...FICHE.shareLink, isActive: false, expiresAt: null } } } });
    const section = host.querySelector('[data-admin-fiche-section="entry"]');
    expect(textOf(section)).toContain('Fermé');
    expect(textOf(section)).toContain('Sans échéance');
  });

  test('sans lien d’entrée enregistré, la fiche le dit', async () => {
    const { host } = await open({ reply: { ok: true, data: { ...FICHE, shareLink: null } } });
    expect(textOf(host.querySelector('[data-admin-fiche-section="entry"]'))).toContain('Aucun lien d’entrée n’est enregistré');
  });
});

describe('AdminAnonymousFiche — les permissions se disent en phrases', () => {
  test('« Peut envoyer des fichiers » / « Ne peut pas envoyer de vidéos » — jamais canSendFiles', async () => {
    const { host } = await open();
    const section = textOf(host.querySelector('[data-admin-fiche-section="permissions"]'));
    expect(section).toContain('Peut envoyer des fichiers');
    expect(section).toContain('Ne peut pas envoyer de vidéos');
    expect(section).toContain('Voit les messages écrits avant son arrivée');
    expect(section).not.toMatch(/canSend|canView/);
    expect(host.querySelectorAll('[data-admin-permission]')).toHaveLength(8);
  });

  test('aucune permission servie : la section ne s’affiche pas', async () => {
    const { host } = await open({ reply: { ok: true, data: { ...FICHE, permissions: {} } } });
    expect(host.querySelector('[data-admin-fiche-section="permissions"]')).toBeNull();
  });
});

describe('AdminAnonymousFiche — aucun geste, des états dessinés', () => {
  test('la passerelle ne sert aucun geste sur un anonyme : le seul contrôle est la copie de l’identifiant', async () => {
    const { host } = await open();
    const actions = [...host.querySelectorAll('[data-admin-action]')].map((element) => element.getAttribute('data-admin-action'));
    expect(actions).toEqual(['copy-technical-id']);
  });

  test('un participant introuvable se dit comme tel (404) ; un refus comme un refus (403)', async () => {
    const missing = await open({ reply: { ok: false, status: 404, error: 'x' } });
    expect(textOf(missing.host.querySelector('[data-admin-error]'))).toContain('n’existe pas');
    const denied = await open({ reply: { ok: false, status: 403, error: 'x' } });
    expect(denied.host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
  });

  test('une panne se dit avec « Réessayer »', async () => {
    const { host } = await open({ reply: { ok: false, status: 500, error: 'boom' } });
    expect(host.querySelector('[data-admin-retry]')).not.toBeNull();
  });

  test('une charge illisible n’invente pas de fiche', async () => {
    const { host } = await open({ reply: { ok: true, data: {} } });
    expect(host.querySelector('[data-admin-fiche]')).toBeNull();
    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
  });

  test('la même fiche en anglais : langue, état et phrases suivent la langue d’interface', async () => {
    const { host } = await open({ language: 'en' });
    expect(textOf(host.querySelector('[data-admin-identity]'))).toContain('Guest without an account');
    expect(meta(host, 'language')).toContain('Spanish');
    expect(textOf(host.querySelector('[data-admin-fiche-section="permissions"]'))).toContain('Can send files');
  });
});
