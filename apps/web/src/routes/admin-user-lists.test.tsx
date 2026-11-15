import { describe, expect, test } from 'bun:test';

import { MEMBER_EXTRAS } from '@/lib/admin/member-fixture';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminUserConversationsSection, AdminUserMediaSection } from './admin-user-lists';

/**
 * **CE QU'UN MEMBRE A CRÉÉ, ET OÙ IL PARLE, EN MOTS** (#6819, #8876) — une conversation
 * se reconnaît à son titre, ou aux noms de ses membres (un direct n'a pas de titre
 * propre) — jamais à son identifiant — ; son type se dit (« Conversation privée ») ; un
 * média se dit par son nom, son genre, sa taille et sa date, jamais par son type MIME.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const USER = '64f1c2a9e8b7d6c5b4a39281';

const MEMBRE: AdminUserDetail = {
  id: USER,
  username: 'amina',
  displayName: '',
  firstName: 'Amina',
  lastName: 'Diallo',
  bio: '',
  avatar: '',
  banner: '',
  profileCompletionRate: null,
  email: 'amina@example.test',
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
};

const page = (rows: readonly unknown[]): ApiResult<unknown> => ({ ok: true, data: rows, pagination: { total: rows.length, offset: 0, limit: 20, hasMore: false } });
const at = (suffix: string, reply: ApiResult<unknown>): RoutedReply => (request: HttpRequest) =>
  request.method === 'GET' && pathOf(request) === `/api/v1/admin/users/${USER}${suffix}` ? reply : undefined;

const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

async function openConversations(rows: readonly unknown[]) {
  const gateway = routedTransport(at('/conversations', page(rows)));
  const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
  const host = await mount(<AdminUserConversationsSection membre={MEMBRE} language="fr" deps={deps} />);
  await mounter.settle();
  await mounter.settle();
  return host;
}

describe('les conversations d’un membre', () => {
  const ROWS = [
    { id: 'c-titled', identifier: 'mshy_atelier', title: 'Atelier traduction', type: 'group', memberCount: 4, participants: [] },
    {
      id: 'c-direct',
      identifier: 'mshy_direct_77',
      title: null,
      type: 'direct',
      memberCount: 2,
      participants: [
        { userId: 'a', displayName: 'Awa Diop', role: 'member' },
        { userId: 'b', displayName: 'Jean Dupont', role: 'member' },
      ],
    },
    { id: 'c-empty', identifier: 'mshy_vide', title: null, type: 'group', memberCount: 0, participants: [] },
  ];

  test('le titre, sinon les noms des membres, sinon « Conversation sans titre » — jamais l’identifiant', async () => {
    const host = await openConversations(ROWS);
    expect(textOf(host.querySelector('[data-admin-conversation="c-titled"]'))).toContain('Atelier traduction');
    expect(textOf(host.querySelector('[data-admin-conversation="c-direct"]'))).toContain('Awa Diop et Jean Dupont');
    expect(textOf(host.querySelector('[data-admin-conversation="c-empty"]'))).toContain('Conversation sans titre');
    for (const raw of ['mshy_atelier', 'mshy_direct_77', 'mshy_vide', 'c-direct']) expect(textOf(host)).not.toContain(raw);
    expectNoRawIdentifiers(host);
  });

  test('le type se dit en mots (Groupe, Conversation privée), jamais « group » ou « direct »', async () => {
    const host = await openConversations(ROWS);
    expect(textOf(host.querySelector('[data-admin-conversation="c-titled"]'))).toContain('Groupe · 4 membres');
    expect(textOf(host.querySelector('[data-admin-conversation="c-direct"]'))).toContain('Conversation privée');
  });

  test('le filtre de type nomme chaque type', async () => {
    const host = await openConversations(ROWS);
    const options = [...host.querySelectorAll('[data-admin-filter="admin-user-conv-type"] option, select option')].map((option) => option.textContent);
    expect(options).toContain('Conversation privée');
    expect(options).toContain('Groupe');
    expect(options).not.toContain('direct');
  });
});

describe('les médias d’un membre', () => {
  test('un média se dit par son nom, son genre, sa taille, sa durée et sa date — jamais son type MIME ni son identifiant', async () => {
    const gateway = routedTransport(
      at(
        '/media',
        page([
          { id: 'm1', originalName: 'voeux.mp4', mimeType: 'video/mp4', fileSize: 5_242_880, duration: 65, createdAt: '2026-09-01T12:00:00.000Z', source: 'message' },
          { id: 'm2', originalName: '', mimeType: 'application/pdf', fileSize: 2048, duration: null, createdAt: null, source: 'post' },
        ]),
      ),
    );
    const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
    const host = await mount(<AdminUserMediaSection userId={USER} language="fr" deps={deps} />);
    await mounter.settle();
    await mounter.settle();
    const first = textOf(host.querySelector('[data-admin-media="m1"]'));
    expect(first).toContain('voeux.mp4');
    expect(first).toContain('Vidéo');
    expect(first).toContain('5 Mo');
    expect(first).toContain('1 min 05 s');
    expect(first).not.toContain('video/mp4');
    const second = textOf(host.querySelector('[data-admin-media="m2"]'));
    expect(second).toContain('Média sans nom');
    expect(second).toContain('Document');
    expect(second).not.toContain('m2');
    expectNoRawIdentifiers(host);
  });
});
