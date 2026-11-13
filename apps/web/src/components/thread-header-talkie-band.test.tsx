import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation, Participant } from '@/lib/api/types';
import { appQueryClient } from '@/lib/api/query-client';
import { RELATION_LINKS_QUERY_KEY } from '@/lib/api/relations';
import { sessionStore, type AuthenticatedSession } from '@/lib/api/session';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { talkieStore } from '@/lib/talkie/talkie-live';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadHeader } from './thread-header';

/**
 * LA VOIX DU PAIR PREND TOUTE LA BARRE DE L'EN-TÊTE D'UN DIRECT (#17338, iOS
 * #17337) — par l'en-tête réel : le talkie s'y monte à la demande, la barre
 * élargie se pose par-dessus, et rien de tel dans un direct chiffré.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c/c-direct' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadNotificationRowCatalog('fr');
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  sessionStore.setState({ session: { status: 'anonymous' } });
  talkieStore.getState().active.forEach((entry) => talkieStore.getState().close(entry.talkieId));
  appQueryClient.clear();
});

const mount = (node: ReactNode): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
};

const ACCOUNT = {
  status: 'authenticated',
  token: 'jwt',
  sessionToken: 's',
  expiresAt: Number.MAX_SAFE_INTEGER,
  user: { id: 'u-moi', username: 'moi', displayName: 'Moi' },
} as unknown as AuthenticatedSession;

const participant = (id: string, name: string): Participant =>
  ({
    id: `p-${id}`,
    conversationId: 'c-direct',
    userId: `u-${id}`,
    type: 'user',
    displayName: name,
    role: 'member',
    language: 'fr',
    isActive: true,
    isOnline: false,
    joinedAt: new Date('2026-01-01'),
    user: { id: `u-${id}`, username: id, displayName: name },
  }) as Participant;

const DIRECT = {
  id: 'c-direct',
  type: 'direct',
  title: 'Nour Haddad',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 2,
  participants: [participant('nour', 'Nour Haddad'), participant('moi', 'Moi Même')],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
  lastMessageAt: new Date('2026-10-12T09:00:00.000Z'),
} as unknown as Conversation;

const header = (conversation: Conversation) => (
  <ThreadHeader
    title="Nour Haddad"
    accent="#0ea5e9"
    conversation={conversation}
    viewerId="u-moi"
    group={false}
    otherUnread={0}
    expanded={false}
    onToggleExpanded={() => {}}
    onOpenDetails={() => {}}
    currentRowTitle=""
    isAuto
    readingMenuRows={[]}
    onSelectReadingMode={() => {}}
    onResetReadingModeToAuto={() => {}}
  />
);

const settle = async () => {
  for (const _ of [0, 1, 2, 3]) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
};

const speaks = (talkieId: string) =>
  act(() => {
    talkieStore.getState().open({ talkieId, fromUserId: 'u-nour', codec: 'aac-adts', startedAt: new Date().toISOString(), maxDurationMs: 30_000 });
  });

describe('la voix du pair dans l’en-tête d’un direct', () => {
  test('elle prend toute la barre : la bande élargie se pose, le reste s’efface sans libérer sa place', async () => {
    sessionStore.setState({ session: ACCOUNT });
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, []);
    const node = mount(header(DIRECT));
    await settle();
    expect(node.querySelector('[data-talkie-band]')).toBeNull();
    speaks('t-direct');
    await settle();
    expect(node.querySelector('.thread-column')?.hasAttribute('data-talkie-spans')).toBe(true);
    expect(node.querySelector('[data-talkie-band]')?.getAttribute('data-talkie-delivery')).toBe('live');
    expect(node.querySelector('[data-thread-back]')).not.toBeNull();
    act(() => talkieStore.getState().close('t-direct'));
    await settle();
    expect(node.querySelector('[data-talkie-band]')).toBeNull();
    expect(node.querySelector('.thread-column')?.hasAttribute('data-talkie-spans')).toBe(false);
  });

  test('jamais dans un direct chiffré de bout en bout', async () => {
    sessionStore.setState({ session: ACCOUNT });
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, []);
    const node = mount(header({ ...DIRECT, encryptionMode: 'e2ee' } as Conversation));
    await settle();
    speaks('t-e2ee');
    await settle();
    expect(node.querySelector('[data-talkie-band]')).toBeNull();
  });
});
