import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation, Participant } from '@/lib/api/types';
import { sessionStore, type AuthenticatedSession } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { closeMoodPeek, currentMoodPeek, registerMoodPeekHost } from '@/lib/view/mood-peek';
import { AuthorMoodsContext } from '@/lib/view/use-author-moods';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadHeader } from './thread-header';

/**
 * **L'HUMEUR DU PAIR SUR L'AVATAR DE L'EN-TÊTE D'UN DIRECT SE TOUCHE**
 * (#10528) — la pastille y était déjà (#9065) ; il lui manquait un effet et
 * une voix. Ici elle garde son mouvement : l'en-tête n'est pas une liste.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c/c-direct' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadNotificationRowCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let release: (() => void) | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  closeMoodPeek();
  release?.();
  release = null;
  sessionStore.setState({ session: { status: 'anonymous' } });
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

const header = (mood: string | undefined) => (
  <AuthorMoodsContext.Provider value={(id) => (id === 'u-nour' ? mood : undefined)}>
    <ThreadHeader
      title="Nour Haddad"
      accent="#0ea5e9"
      conversation={DIRECT}
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
  </AuthorMoodsContext.Provider>
);

describe('l’en-tête d’une conversation directe', () => {
  test('toucher l’humeur du pair l’ouvre, sans quitter le fil', () => {
    sessionStore.setState({ session: ACCOUNT });
    release = registerMoodPeekHost();
    const el = mount(header('🎉'));

    const target = el.querySelector<HTMLButtonElement>('[data-mood-peek="u-nour"]');
    expect(target?.getAttribute('aria-label')).toBe('Humeur de Nour Haddad');
    expect(target?.closest('a')).toBeNull();
    act(() => target?.click());

    expect(currentMoodPeek()).toEqual({ authorId: 'u-nour', emoji: '🎉', name: 'Nour Haddad' });
  });

  test('sans humeur, aucune cible', () => {
    sessionStore.setState({ session: ACCOUNT });
    release = registerMoodPeekHost();

    expect(mount(header(undefined)).querySelector('[data-mood-peek]')).toBeNull();
  });
});
