import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { accentOf } from '@/lib/accent';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Conversation, Message } from '@/lib/api/types';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { resolveThreadMode, toStickyPreference } from '@/lib/reading-mode/decision';
import { createReadingModeStore } from '@/lib/reading-mode/store';
import { readingModeScopeOf } from '@/lib/reading-mode/scope';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationPeekCard } from './conversation-peek-card';

/**
 * TENIR UNE CONVERSATION MONTRE SES DERNIERS MESSAGES (#11211) — dans le mode
 * de lecture qu'elle ouvrirait (bulles en bulles, Script et Focal en rangées
 * plates, Rivière comme le fil la ramène), à son accent, lus du cache sans requête.
 */

const VIEWER = 'u-moi';

const conversationOf = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c-lyon',
    type: 'group',
    title: 'Équipe Lyon',
    isActive: true,
    memberCount: 4,
    participants: [],
    unreadCount: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as Conversation;

const messageOf = (index: number, overrides: Partial<Message> = {}): Message =>
  ({
    id: `m-${index}`,
    conversationId: 'c-lyon',
    senderId: 'p-nour',
    content: `Message ${index}`,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    maxViewOnceCount: 1,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 1,
    readCount: 1,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date(`2026-09-24T09:0${index}:00.000Z`).toISOString(),
    updatedAt: new Date(`2026-09-24T09:0${index}:00.000Z`).toISOString(),
    timestamp: new Date(`2026-09-24T09:0${index}:00.000Z`).toISOString(),
    translations: [],
    sender: {
      id: 'p-nour',
      conversationId: 'c-lyon',
      userId: 'u-nour',
      displayName: 'Nour Haddad',
      type: 'user',
      role: 'member',
      language: 'fr',
      isActive: true,
      joinedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      isOnline: false,
      user: { id: 'u-nour', username: 'nour', displayName: 'Nour Haddad' },
    },
    ...overrides,
  }) as unknown as Message;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadRowMenuCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(options: {
  readonly conversation?: Conversation;
  readonly messages?: readonly Message[] | null;
  readonly sticky?: ConversationReadingMode;
}) {
  const conversation = options.conversation ?? conversationOf();
  const client = new QueryClient();
  if (options.messages !== null && options.messages !== undefined) {
    client.setQueryData(messagesQueryKey(conversation.id), {
      pages: [{ messages: options.messages, hasOlder: false, nextCursor: null }],
      pageParams: [undefined],
    });
  }
  const store = createReadingModeStore(null);
  if (options.sticky !== undefined) store.setPreference(readingModeScopeOf({ id: VIEWER }), conversation.id, options.sticky);
  const opened: string[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ConversationPeekCard
        conversation={conversation}
        viewerId={VIEWER}
        languages={['fr']}
        isAnonymous={false}
        interfaceLanguage="fr"
        maxHeight={300}
        onOpen={() => opened.push(conversation.id)}
        client={client}
        store={store}
        readingModesEnabled
        now={() => Date.parse('2026-09-24T10:00:00.000Z')}
      />,
    );
  });
  return { client, opened };
}

const card = (): HTMLElement => {
  const node = container.querySelector<HTMLElement>('[data-peek-card]');
  if (node === null) throw new Error('carte introuvable');
  return node;
};

const THREE = [messageOf(1), messageOf(2), messageOf(3)];

describe('ConversationPeekCard — le mode et l’accent de la conversation', () => {
  test('un choix collant « bulles » rend des bulles', () => {
    mount({ messages: THREE, sticky: 'bubbles' });
    expect(card().querySelectorAll('[data-message]').length).toBe(3);
    expect(card().querySelector('[data-reading-mode]')).toBeNull();
  });

  test('un choix collant « script » rend des rangées plates', () => {
    mount({ messages: THREE, sticky: 'script' });
    expect(card().querySelectorAll('[data-reading-mode="script"]').length).toBe(3);
  });

  test('la Rivière se rend comme le fil la rendrait en l’ouvrant (revue #11211)', () => {
    const thread = resolveThreadMode({
      unreadCount: 0,
      lastOpenedAt: null,
      now: Date.parse('2026-09-24T10:00:00.000Z'),
      sticky: toStickyPreference('river'),
      isAnonymous: false,
      conversationType: 'group',
      memberCount: 8,
    });
    mount({ messages: THREE, sticky: 'river', conversation: conversationOf({ memberCount: 8 }) });
    expect(thread.mode).not.toBe('river');
    expect(card().querySelectorAll(`[data-reading-mode="${thread.mode}"]`).length).toBe(3);
  });

  test('le Résumé retombe sur Focal', () => {
    mount({ messages: THREE, sticky: 'summary' });
    expect(card().querySelectorAll('[data-reading-mode="focal"]').length).toBe(3);
  });

  test('--accent vaut l’accent de la conversation', () => {
    const conversation = conversationOf();
    mount({ messages: THREE, conversation });
    expect(card().style.getPropertyValue('--accent')).toBe(accentOf(conversation));
  });

  test('la carte est un groupe nommé, nette : ni échelle ni flou', () => {
    mount({ messages: THREE });
    expect(card().getAttribute('role')).toBe('group');
    expect(card().getAttribute('aria-label')).toContain('Équipe Lyon');
    expect(card().style.transform).toBe('');
    expect(card().getAttribute('style') ?? '').not.toContain('scale');
    expect(card().getAttribute('style') ?? '').not.toContain('blur');
  });

  test('l’en-tête dit le nombre de membres d’un groupe', () => {
    mount({ messages: THREE });
    expect(card().querySelector('[data-peek-header]')?.textContent).toContain('4 membres');
  });

  test('une conversation chiffrée de bout en bout porte son badge', () => {
    mount({ messages: THREE, conversation: conversationOf({ encryptionMode: 'e2ee' } as Partial<Conversation>) });
    expect(card().querySelector('[data-peek-e2ee]')).not.toBeNull();
  });
});

describe('ConversationPeekCard — le cache d’abord', () => {
  test('cache vide ⇒ un squelette, et aucune requête', () => {
    const { client } = mount({ messages: null });
    expect(card().querySelector('[data-peek-skeleton]')).not.toBeNull();
    expect(client.getQueryCache().getAll().length).toBe(0);
  });

  test('cache non vide ⇒ aucun squelette, aucune requête émise', () => {
    const { client } = mount({ messages: THREE });
    expect(card().querySelector('[data-peek-skeleton]')).toBeNull();
    expect(client.getQueryCache().getAll().map((query) => query.state.fetchStatus)).toEqual(['idle']);
  });

  test('trois messages en cache sont rendus, dans l’ordre', () => {
    mount({ messages: THREE, sticky: 'bubbles' });
    expect([...card().querySelectorAll<HTMLElement>('[data-message]')].map((node) => node.dataset.message)).toEqual(['m-1', 'm-2', 'm-3']);
  });

  test('au plus les cinq derniers', () => {
    mount({ messages: [1, 2, 3, 4, 5, 6, 7].map((index) => messageOf(index)), sticky: 'bubbles' });
    expect([...card().querySelectorAll<HTMLElement>('[data-message]')].map((node) => node.dataset.message)).toEqual(['m-3', 'm-4', 'm-5', 'm-6', 'm-7']);
  });

  test('un message chiffré donne un placeholder, jamais son contenu', () => {
    mount({ messages: [messageOf(1), messageOf(2, { isEncrypted: true, content: 'secret-chiffré' })], sticky: 'bubbles' });
    expect(card().querySelector('[data-peek-encrypted]')?.textContent).toContain('Message chiffré');
    expect(card().textContent).not.toContain('secret-chiffré');
  });

  test('toucher la carte ouvre la conversation', () => {
    const { opened } = mount({ messages: THREE });
    act(() => card().querySelector<HTMLButtonElement>('[data-peek-open]')?.click());
    expect(opened).toEqual(['c-lyon']);
  });
});
