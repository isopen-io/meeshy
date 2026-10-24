import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { accentOf, personalBubbleVars } from '@/lib/accent';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Conversation, Message } from '@/lib/api/types';
import { createHttpTransport } from '@/lib/api/http';
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
  readonly updatedAt?: number;
  readonly served?: readonly Message[];
  readonly fails?: boolean;
  readonly pages?: number;
  readonly seed?: (client: QueryClient) => void;
}) {
  const requests: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    if (options.fails === true) return new Response('{}', { status: 500 });
    const rows = [...(options.served ?? [])].reverse();
    return new Response(JSON.stringify({ success: true, data: rows, cursorPagination: options.pages === undefined ? { limit: 50, hasMore: false, nextCursor: null } : { limit: 50, hasMore: true, nextCursor: `served-${requests.length}` } }), { status: 200 });
  }) as typeof fetch;
  const deps = { source: 'gateway', transport: createHttpTransport({ base: '', fetchImpl }) } as const;
  const conversation = options.conversation ?? conversationOf();
  const client = new QueryClient();
  if (options.messages !== null && options.messages !== undefined) {
    client.setQueryData(messagesQueryKey(conversation.id), {
      pages: Array.from({ length: options.pages ?? 1 }, (_, index) => ({
        messages: options.messages ?? [],
        hasOlder: index < (options.pages ?? 1) - 1,
        nextCursor: index < (options.pages ?? 1) - 1 ? `cursor-${index}` : null,
      })),
      pageParams: Array.from({ length: options.pages ?? 1 }, (_, index) => (index === 0 ? undefined : `cursor-${index - 1}`)),
    }, options.updatedAt === undefined ? undefined : { updatedAt: options.updatedAt });
  }
  options.seed?.(client);
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
        deps={deps}
        store={store}
        readingModesEnabled
        now={() => Date.parse('2026-09-24T10:00:00.000Z')}
      />,
    );
  });
  return { client, opened, requests };
}

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};

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
  test('cache vide ⇒ un squelette le temps de la requête', () => {
    mount({ messages: null });
    expect(card().querySelector('[data-peek-skeleton]')).not.toBeNull();
  });

  test('peek: cache vide, déclenche un fetch des messages et remplace le squelette par les rangées', async () => {
    const { requests } = mount({ messages: null, served: THREE, sticky: 'bubbles' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(requests).toEqual(['/api/v1/conversations/c-lyon/messages?limit=50']);
    expect(card().querySelector('[data-peek-skeleton]')).toBeNull();
    expect([...card().querySelectorAll<HTMLElement>('[data-message]')].map((node) => node.dataset.message)).toEqual(['m-1', 'm-2', 'm-3']);
  });

  test('peek: cache périmé, rend les rangées immédiatement puis revalide sans spinner', async () => {
    const { requests } = mount({ messages: [messageOf(1)], served: THREE, updatedAt: Date.now() - 10 * 60_000, sticky: 'bubbles' });
    expect(card().querySelector('[data-peek-skeleton]')).toBeNull();
    expect([...card().querySelectorAll<HTMLElement>('[data-message]')].map((node) => node.dataset.message)).toEqual(['m-1']);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(requests.length).toBe(1);
    expect(card().querySelector('[data-peek-skeleton]')).toBeNull();
    expect([...card().querySelectorAll<HTMLElement>('[data-message]')].map((node) => node.dataset.message)).toEqual(['m-1', 'm-2', 'm-3']);
  });

  test('cache vide et requête en échec ⇒ un état d’échec dit, plus de squelette éternel', async () => {
    mount({ messages: null, fails: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(card().querySelector('[data-peek-skeleton]')).toBeNull();
    expect(card().querySelector('[data-peek-failed]')?.textContent).toBe('Impossible de charger les messages');
  });

  test('un fil ouvert sur plusieurs pages ne revalide que sa première page', async () => {
    const { requests } = mount({ messages: THREE, pages: 4, served: THREE, updatedAt: Date.now() - 10 * 60_000 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(requests.length).toBe(1);
  });

  test('cache frais ⇒ aucun squelette, aucune requête émise', async () => {
    const { client, requests } = mount({ messages: THREE });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(requests).toEqual([]);
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

describe('conversation-peek.css — le fondu du haut', () => {
  const CSS = readFileSync(new URL('../styles/conversation-peek.css', import.meta.url), 'utf8');

  test('le fondu ne vaut que si le contenu déborde, et reste court (≤ 12px)', () => {
    expect(CSS).toContain('[data-peek-overflowing]');
    const fade = /\[data-peek-overflowing\][^{]*\{[^}]*black (\d+)px/.exec(CSS);
    expect(Number(fade?.[1])).toBeLessThanOrEqual(12);
    expect(CSS).not.toContain('black 28px');
  });

  test('la carte marque son corps débordant quand le contenu dépasse la hauteur offerte', async () => {
    const proto = HTMLElement.prototype;
    const scroll = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
    const client = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 400 });
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 200 });
    try {
      mount({ messages: THREE });
      expect(container.querySelector('[data-peek-overflowing]')).not.toBeNull();
    } finally {
      if (scroll) Object.defineProperty(proto, 'scrollHeight', scroll);
      else Reflect.deleteProperty(proto, 'scrollHeight');
      if (client) Object.defineProperty(proto, 'clientHeight', client);
      else Reflect.deleteProperty(proto, 'clientHeight');
    }
  });
});

describe('ConversationPeekCard — le fond et la peau de la conversation (#12633)', () => {
  const chosen = (background: unknown, accent: string | null = null) => ({ userPreferences: [{ appearance: { v: 1, background, accent, animate: false } }] }) as Partial<Conversation>;
  const backdrop = (): HTMLElement | null => card().querySelector<HTMLElement>(':scope > .thread-backdrop');

  test('une conversation Signature n’ajoute rien : ni fond peint, ni peau personnelle', async () => {
    mount({ messages: THREE, sticky: 'bubbles' });
    await settle();
    expect(backdrop()).toBeNull();
    expect(card().hasAttribute('data-peek-backdrop')).toBe(false);
    expect(card().style.getPropertyValue('--bubble-mine-personal')).toBe('');
  });

  test('une couleur unie se peint sous le corps de la carte, comme dans le fil', async () => {
    mount({ messages: THREE, conversation: conversationOf(chosen({ kind: 'solid', color: 'azur' })) });
    await settle();
    expect(card().getAttribute('data-peek-backdrop')).toBe('solid');
    expect(backdrop()?.dataset['appearance']).toBe('solid');
    expect(backdrop()?.style.backgroundColor).not.toBe('');
  });

  test('un modèle de pack se peint depuis le catalogue embarqué', async () => {
    mount({ messages: THREE, conversation: conversationOf(chosen({ kind: 'design', pack: 'essentiels', design: 'chevrons' })) });
    for (let i = 0; i < 20 && backdrop()?.dataset['appearance'] === undefined; i += 1) await settle();
    expect(card().getAttribute('data-peek-backdrop')).toBe('design');
    expect(backdrop()?.dataset['appearance']).toBe('design');
    expect(backdrop()?.style.backgroundImage).toContain('data:image/svg+xml');
  });

  test('une photo déjà en cache se peint sans aucune requête de plus', async () => {
    const id = 'b'.repeat(24);
    const conversation = conversationOf(chosen({ kind: 'photo', attachmentId: id, veil: 0.3, blur: 4 }));
    const OriginalImage = globalThis.Image;
    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    (globalThis as { Image: unknown }).Image = LoadedImage;
    try {
      const { requests } = mount({ messages: THREE, conversation, seed: (client) => client.setQueryData(['appearance', 'photo', conversation.id, id], { thumb: null, full: 'https://cdn.x/fond.jpg' }) });
      for (let i = 0; i < 10 && backdrop()?.dataset['appearance'] === undefined; i += 1) await settle();
      expect(card().getAttribute('data-peek-backdrop')).toBe('photo');
      expect(backdrop()?.dataset['appearance']).toBe('photo');
      expect(backdrop()?.innerHTML).toContain('cdn.x/fond.jpg');
      expect(requests).toEqual([]);
    } finally {
      (globalThis as { Image: unknown }).Image = OriginalImage;
    }
  });

  test('un accent personnel peint les bulles envoyées de l’aperçu comme celles du fil', async () => {
    const conversation = conversationOf(chosen({ kind: 'signature' }, 'azur'));
    const skin = personalBubbleVars(conversation) as Record<string, string>;
    mount({ messages: THREE, conversation, sticky: 'bubbles' });
    await settle();
    expect(skin['--bubble-mine-personal']).toBeDefined();
    expect(card().style.getPropertyValue('--bubble-mine-personal')).toBe(skin['--bubble-mine-personal'] ?? '');
    expect(card().style.getPropertyValue('--bubble-mine-personal-ink')).toBe(skin['--bubble-mine-personal-ink'] ?? '');
    expect(card().style.getPropertyValue('--bubble-mine-personal-meta')).toBe(skin['--bubble-mine-personal-meta'] ?? '');
    expect(backdrop()).toBeNull();
  });
});

describe('conversation-peek.css — le fond sous la carte (#12633)', () => {
  const CSS = readFileSync(new URL('../styles/conversation-peek.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string): string => {
    const at = CSS.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`règle absente : ${selector}`);
    return CSS.slice(at, CSS.indexOf('}', at));
  };

  test('la carte isole sa pile : le fond reste derrière le contenu, devant la surface', () => {
    expect(rule('.conversation-peek-card')).toContain('isolation: isolate');
    const layer = rule('.conversation-peek-card > .thread-backdrop');
    expect(layer).toContain('position: absolute');
    expect(layer).toContain('z-index: -1');
    expect(layer).toContain('pointer-events: none');
  });

  test('tant que le fond choisi n’est pas prêt, la carte garde sa propre surface', () => {
    expect(rule('.conversation-peek-card > .thread-backdrop:not([data-appearance])')).toContain('display: none');
  });

  test('sur un fond peint, l’en-tête pose un matériau quasi opaque de la surface de la carte', () => {
    const header = rule('.conversation-peek-card[data-peek-backdrop] .conversation-peek-header');
    const mix = /color-mix\(in srgb, var\(--color-ios-card\) (\d+)%, transparent\)/.exec(header);
    expect(Number(mix?.[1])).toBeGreaterThanOrEqual(88);
  });
});
