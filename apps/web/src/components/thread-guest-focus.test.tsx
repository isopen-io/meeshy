import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { sessionStore, type AuthenticatedSession, type GuestIdentity } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadHeader } from './thread-header';
import { ThreadError, ThreadRefused } from './thread-states';

/**
 * LE FIL D'UN INVITÉ EST EN FOCUS (#10100, décision porteur du 2026-10-11) —
 * « sans compte, montrer la structure de l'application est inutile ». Le
 * chevron de retour mène à la liste des conversations, qu'un invité n'a pas :
 * la garde l'envoie à la connexion. Sans lui, l'en-tête dit OÙ l'on est (le
 * nom et l'effectif), au téléphone comme sur ordinateur. Un COMPTE — même
 * sous son identité anonyme (#8816) — garde son retour.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let originalMatchMedia: typeof window.matchMedia;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/world' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  originalMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  window.matchMedia = originalMatchMedia;
  sessionStore.setState({ session: { status: 'anonymous' } });
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
});

const mount = (node: ReactNode): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
};

const GUEST: GuestIdentity = { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-world', link: 'mshy_world', mayWrite: true };
const ACCOUNT = {
  status: 'authenticated',
  token: 'jwt',
  sessionToken: 's',
  expiresAt: Number.MAX_SAFE_INTEGER,
  user: { id: 'u-moi', username: 'moi', displayName: 'Moi' },
} as unknown as AuthenticatedSession;

const asGuest = () => sessionStore.setState({ session: { status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: Number.MAX_SAFE_INTEGER } });
const asAnonymousAccount = () =>
  sessionStore.setState({ session: { status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: Number.MAX_SAFE_INTEGER, account: ACCOUNT } });

const WORLD = {
  id: 'c-world',
  type: 'global',
  title: 'World Wide',
  status: 'active',
  visibility: 'public',
  isActive: true,
  memberCount: 42,
  participants: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
} as unknown as Conversation;

const header = () => (
  <ThreadHeader
    title="World Wide"
    accent="#6366f1"
    conversation={WORLD}
    viewerId="p-awa"
    group
    otherUnread={0}
    expanded={false}
    onToggleExpanded={() => {}}
    currentRowTitle=""
    isAuto
    readingMenuRows={[]}
    onSelectReadingMode={() => {}}
    onResetReadingModeToAuto={() => {}}
  />
);

describe('l’en-tête du fil d’un invité', () => {
  test('aucun retour vers une liste que l’invité n’a pas', () => {
    asGuest();
    const el = mount(header());
    expect(el.querySelector('[data-thread-back]')).toBeNull();
    expect(el.querySelector('a[href="/chats"]')).toBeNull();
  });

  test('au téléphone, au repos, il dit où l’on est : World Wide et son effectif', () => {
    asGuest();
    const el = mount(header());
    expect(el.querySelector('h1')?.textContent).toBe('World Wide');
    expect(el.textContent).toContain('42 participants');
  });

  test('un compte, même sous son identité anonyme, garde son retour et son en-tête replié', () => {
    asAnonymousAccount();
    const el = mount(header());
    expect(el.querySelector('[data-thread-back]')).not.toBeNull();
    expect(el.querySelector('h1')).toBeNull();
  });
});

describe('les états du fil d’un invité', () => {
  test('un refus ne propose pas « Retour aux conversations »', () => {
    asGuest();
    const el = mount(<ThreadRefused />);
    expect(el.querySelector('a[href="/chats"]')).toBeNull();
    expect(el.textContent).not.toContain('Retour aux conversations');
  });

  test('une panne non plus : seul « Réessayer » reste', () => {
    asGuest();
    const el = mount(<ThreadError onRetry={() => {}} />);
    expect(el.querySelector('a[href="/chats"]')).toBeNull();
  });

  test('un compte garde ses retours', () => {
    sessionStore.setState({ session: ACCOUNT });
    const el = mount(<ThreadRefused />);
    expect(el.querySelector('a[href="/chats"]')).not.toBeNull();
  });
});
