import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { LensRow, type LensRowProps } from '@/components/lens-row';
import type { ConversationFlags } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { createRouter, navigate, useParams } from '@/lib/router';
import { floatingMenusReady } from '@/test-support/floating-menus-ready';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SPLIT_QUERY, splitPaneOf } from '@/lib/view/split-query';

import { DeferredSplitFrame } from './route-table';
import { emptyPaneLabels } from './split-empty-pane';

/**
 * SUR GRAND ÉCRAN, LA LISTE ET LE FIL CÔTE À CÔTE (#10073) — à partir de
 * 1024 px, `/chats` et `/c/:id` se rendent dans UN cadre : la liste à gauche,
 * MONTÉE UNE FOIS, le fil (ou l'état « choisissez une conversation ») à
 * droite. Les adresses ne changent pas ; sous 1024 px, rien ne change.
 *
 * Le routeur est monté avec le cadre que la table des routes lui remet
 * VRAIMENT (`DeferredSplitFrame`, #10086) : le cadre arrive par un import
 * différé, et chaque scénario ci-dessous prouve que ce détour ne change rien
 * à ce que le lecteur voit.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Listener = (event: { matches: boolean }) => void;
const media = { wide: true, listeners: new Set<Listener>() };
let originalMatchMedia: typeof window.matchMedia;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  originalMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === SPLIT_QUERY ? media.wide : false;
    },
    media: query,
    addEventListener: (_: string, listener: Listener) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => media.listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  await floatingMenusReady();
});

afterAll(async () => {
  window.matchMedia = originalMatchMedia;
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
  media.wide = true;
  media.listeners.clear();
  navigate('/', true);
});

const mounts = { list: 0 };

function ListStub() {
  useEffect(() => {
    mounts.list += 1;
  }, []);
  return <ul data-list-stub />;
}

function ThreadStub() {
  const { conversation } = useParams<'/c/$conversation'>();
  return <main data-thread-stub={conversation} />;
}

const TABLE = {
  list: { pattern: '/chats', screen: () => Promise.resolve({ default: ListStub }) },
  thread: { pattern: '/c/$conversation', screen: () => Promise.resolve({ default: ThreadStub }) },
  feed: { pattern: '/feed', screen: () => Promise.resolve({ default: () => <div data-feed-stub /> }) },
} as const;

function NotFound() {
  return null;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountAt(path: string): Promise<HTMLDivElement> {
  navigate(path, true);
  const { Router } = createRouter(TABLE, NotFound, { frame: DeferredSplitFrame });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Router wrap={(screen) => screen} skeleton={<div data-route-pending />} />));
  await settle();
  return container;
}

async function go(path: string): Promise<void> {
  act(() => navigate(path));
  await settle();
}

describe('à partir de 1024 px, la liste et le fil côte à côte', () => {
  test('/c/:id rend la liste ET le fil, dans le cadre scindé', async () => {
    const el = await mountAt('/c/abc');
    expect(el.querySelector('[data-split-frame]')).not.toBeNull();
    expect(el.querySelector('[data-split-list] [data-list-stub]')).not.toBeNull();
    expect(el.querySelector('[data-split-detail] [data-thread-stub="abc"]')).not.toBeNull();
  });

  test('/chats rend la liste et l’état dessiné « choisissez une conversation »', async () => {
    const el = await mountAt('/chats');
    expect(el.querySelector('[data-split-list] [data-list-stub]')).not.toBeNull();
    const empty = el.querySelector('[data-split-detail] [data-split-empty]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain(emptyPaneLabels('fr').title);
  });

  test('changer de conversation ne remonte pas la liste ; le fil suit l’adresse', async () => {
    mounts.list = 0;
    const el = await mountAt('/chats');
    await go('/c/abc');
    await go('/c/def');
    await go('/chats');
    expect(mounts.list).toBe(1);
    await go('/c/def');
    expect(el.querySelector('[data-thread-stub="def"]')).not.toBeNull();
    expect(el.querySelector('[data-thread-stub="abc"]')).toBeNull();
    expect(mounts.list).toBe(1);
  });

  test('le retour arrière rend la même vue scindée', async () => {
    const el = await mountAt('/chats');
    await go('/c/abc');
    await go('/c/def');
    act(() => {
      window.history.back();
    });
    await settle();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await settle();
    expect(el.querySelector('[data-split-frame]')).not.toBeNull();
    expect(el.querySelector('[data-split-list] [data-list-stub]')).not.toBeNull();
  });

  test('une autre route n’est jamais scindée', async () => {
    const el = await mountAt('/feed');
    expect(el.querySelector('[data-split-frame]')).toBeNull();
    expect(el.querySelector('[data-feed-stub]')).not.toBeNull();
  });
});

describe('sous 1024 px, strictement inchangé', () => {
  test('/c/:id ne rend que le fil', async () => {
    media.wide = false;
    const el = await mountAt('/c/abc');
    expect(el.querySelector('[data-split-frame]')).toBeNull();
    expect(el.querySelector('[data-list-stub]')).toBeNull();
    expect(el.querySelector('[data-thread-stub="abc"]')).not.toBeNull();
  });

  test('/chats ne rend que la liste, sans volet', async () => {
    media.wide = false;
    const el = await mountAt('/chats');
    expect(el.querySelector('[data-split-frame]')).toBeNull();
    expect(el.querySelector('[data-split-empty]')).toBeNull();
    expect(el.querySelector('[data-list-stub]')).not.toBeNull();
  });

  test('franchir 1024 px bascule la vue sans rechargement', async () => {
    media.wide = false;
    const el = await mountAt('/c/abc');
    media.wide = true;
    act(() => {
      for (const listener of media.listeners) listener({ matches: true });
    });
    await settle();
    expect(el.querySelector('[data-split-frame]')).not.toBeNull();
    expect(el.querySelector('[data-thread-stub="abc"]')).not.toBeNull();
  });
});

describe('qui a droit au cadre scindé', () => {
  test('la liste et le fil, sur grand écran, pour qui a une liste', () => {
    expect(splitPaneOf({ routeKey: 'list', wide: true, guest: false })).toBe('empty');
    expect(splitPaneOf({ routeKey: 'thread', wide: true, guest: false })).toBe('thread');
  });

  test('l’invité d’un lien (World Wide, sans compte) garde son fil seul', () => {
    expect(splitPaneOf({ routeKey: 'thread', wide: true, guest: true })).toBeNull();
  });

  test('ni sous 1024 px, ni sur une autre route', () => {
    expect(splitPaneOf({ routeKey: 'thread', wide: false, guest: false })).toBeNull();
    expect(splitPaneOf({ routeKey: 'feed', wide: true, guest: false })).toBeNull();
  });
});

describe('l’état vide du volet parle les sept langues', () => {
  test('un titre et une indication par langue, jamais vides', () => {
    for (const language of ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const) {
      const labels = emptyPaneLabels(language);
      expect(labels.title.length).toBeGreaterThan(0);
      expect(labels.hint.length).toBeGreaterThan(0);
    }
    expect(emptyPaneLabels('en').title).not.toBe(emptyPaneLabels('fr').title);
  });
});

const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };
const LANGUAGES: readonly string[] = ['fr'];

function rowProps(id: string): LensRowProps {
  const conversation = {
    id,
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: `Conversation ${id}`,
    lastMessageAt: new Date('2026-01-01T10:00:00Z'),
  } as unknown as Conversation;
  return { conversation, languages: LANGUAGES, viewerId: 'u-viewer', flags: FLAGS, unreadCount: 0, onRowAction: () => {} };
}

describe('la rangée de la conversation ouverte est marquée', () => {
  test('aria-current="page" sur la rangée du fil courant, et sur elle seule', async () => {
    navigate('/c/c1', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <ul>
          <LensRow {...rowProps('c1')} />
          <LensRow {...rowProps('c2')} />
        </ul>,
      ),
    );
    const current = () => [...container!.querySelectorAll('[aria-current="page"]')].map((a) => a.closest('[data-row]')?.getAttribute('data-row'));
    expect(current()).toEqual(['c1']);
    expect(container.querySelector('[data-row="c1"] .lens-row')?.hasAttribute('data-active')).toBe(true);
    act(() => navigate('/c/c2'));
    expect(current()).toEqual(['c2']);
    expect(container.querySelector('[data-row="c1"] .lens-row')?.hasAttribute('data-active')).toBe(false);
  });
});
