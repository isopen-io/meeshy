import { readdirSync, readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { sessionStore, type AuthenticatedSession, type GuestIdentity } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SPLIT_QUERY } from '@/lib/view/split-query';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadHeader } from './thread-header';

/**
 * SUR ORDINATEUR, L'EN-TÊTE D'UNE CONVERSATION GARDE SON RETOUR (#10117,
 * retour porteur du 2026-10-11). Dans le cadre côte à côte, la liste est à
 * gauche, mais « ‹ » reste le geste qui REFERME le fil : il mène à `/chats`,
 * que le cadre rend avec la liste et l'état « choisissez une conversation ».
 * L'invité sans compte en focus sur `/world` (#10100) n'a pas de liste : il
 * reste sans retour, sur ordinateur aussi.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let originalMatchMedia: typeof window.matchMedia;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c/c-groupe' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  originalMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === SPLIT_QUERY,
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
  act(() => root?.render(<div data-split-detail="">{node}</div>));
  return container;
};

const ACCOUNT = {
  status: 'authenticated',
  token: 'jwt',
  sessionToken: 's',
  expiresAt: Number.MAX_SAFE_INTEGER,
  user: { id: 'u-moi', username: 'moi', displayName: 'Moi' },
} as unknown as AuthenticatedSession;
const GUEST: GuestIdentity = { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-groupe', link: 'mshy_world', mayWrite: true };

const asAccount = () => sessionStore.setState({ session: ACCOUNT });
const asGuest = () => sessionStore.setState({ session: { status: 'guest', sessionToken: 'anon', guest: GUEST, expiresAt: Number.MAX_SAFE_INTEGER } });

const CONVERSATION = {
  id: 'c-groupe',
  type: 'group',
  title: 'Équipe Lyon',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 12,
  participants: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
} as unknown as Conversation;

const header = () => (
  <ThreadHeader
    title="Équipe Lyon"
    accent="#0ea5e9"
    conversation={CONVERSATION}
    viewerId="u-moi"
    group
    otherUnread={3}
    expanded={false}
    onToggleExpanded={() => {}}
    currentRowTitle=""
    isAuto
    readingMenuRows={[]}
    onSelectReadingMode={() => {}}
    onResetReadingModeToAuto={() => {}}
  />
);

const STYLES = new URL('../styles/', import.meta.url).pathname;
const stylesheets = readdirSync(STYLES)
  .filter((name) => name.endsWith('.css'))
  .map((name) => ({ name, text: readFileSync(`${STYLES}${name}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

describe('dès 1024 px, la liste à côté, l’en-tête d’un compte garde son retour', () => {
  test('le chevron est rendu dans le volet du fil, et il mène à la liste qui referme le fil', () => {
    asAccount();
    const back = mount(header()).querySelector<HTMLAnchorElement>('[data-split-detail] [data-thread-back]');
    expect(back).not.toBeNull();
    expect(back?.getAttribute('href')).toBe('/chats');
    expect(back?.getAttribute('aria-label')).toBe('Retour — 3 messages non lus ailleurs');
  });

  test('aucune feuille ne le retire du volet', () => {
    const hiding = stylesheets.filter(({ text }) => text.includes('[data-thread-back]')).map(({ name }) => name);
    expect(hiding).toEqual([]);
  });

  test('l’invité sans compte, en focus, reste sans retour sur ordinateur', () => {
    asGuest();
    const el = mount(header());
    expect(el.querySelector('[data-thread-back]')).toBeNull();
    expect(el.querySelector('a[href="/chats"]')).toBeNull();
  });
});
