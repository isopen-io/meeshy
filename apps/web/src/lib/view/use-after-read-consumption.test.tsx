import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { createAfterReadQueue, type AfterReadStorage } from '@/lib/api/after-read';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useAfterReadConsumption } from './use-after-read-consumption';

/**
 * `useAfterReadConsumption` (#8304) — VU puis QUITTÉ : la flamme-œil reçue
 * quitte le fil local et sa consommation part vers la route de #8302 (mockée
 * ici : la file reçoit un `send` injecté).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

function messageOf(partial: Partial<Message>): Message {
  return {
    id: 'm',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'secret',
    originalLanguage: 'fr',
    messageType: 'text',
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    translations: [],
    createdAt: new Date('2026-09-27T10:00:00Z'),
    ...partial,
  } as unknown as Message;
}

const THREAD = [
  messageOf({ id: 'flamme-recue', effectFlags: AFTER_READ }),
  messageOf({ id: 'ordinaire' }),
  messageOf({ id: 'flamme-mienne', effectFlags: AFTER_READ, senderId: 'u-me' }),
  messageOf({ id: 'flamme-apres', effectFlags: AFTER_READ }),
];

function memoryStorage(): AfterReadStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function setup(options: { readonly online: boolean }) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: THREAD, hasMore: false }], pageParams: [undefined] });
  const sent: { conversationId: string; ids: readonly string[] }[] = [];
  let online = options.online;
  const queue = createAfterReadQueue({
    storage: memoryStorage(),
    key: 'k',
    send: async (conversationId, ids) => {
      if (!online) throw new Error('offline');
      sent.push({ conversationId, ids });
      return { ok: true, status: 200 };
    },
  });
  const threadIds = () =>
    (queryClient.getQueryData(messagesQueryKey('c-a')) as { pages: { messages: Message[] }[] }).pages.flatMap((p) => p.messages.map((m) => m.id));
  let note: ((id: string) => void) | null = null;
  let noteRow: ((id: string) => void) | null = null;
  function Harness({ conversationId }: { readonly conversationId: string }) {
    const { noteSeenUpTo, noteSeen } = useAfterReadConsumption({ conversationId, messages: THREAD, viewerId: 'u-me', queryClient, queue });
    note = noteSeenUpTo;
    noteRow = noteSeen;
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(<Harness conversationId="c-a" />));
  return {
    queryClient,
    queue,
    sent,
    threadIds,
    root,
    goOnline: () => {
      online = true;
    },
    seeUpTo: (id: string) => note?.(id),
    seeRow: (id: string) => noteRow?.(id),
    rerender: (conversationId: string) => act(() => root.render(<Harness conversationId={conversationId} />)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('la flamme-œil VUE puis QUITTÉE disparaît — chez le lecteur seulement', () => {
  test('quitter le fil retire les flammes-œil REÇUES vues et appelle la route avec elles', async () => {
    const s = setup({ online: true });
    s.seeUpTo('flamme-mienne');
    expect(s.threadIds()).toEqual(['flamme-recue', 'ordinaire', 'flamme-mienne', 'flamme-apres']);
    s.unmount();
    await settle();
    expect(s.threadIds()).toEqual(['ordinaire', 'flamme-mienne', 'flamme-apres']);
    expect(s.sent).toEqual([{ conversationId: 'c-a', ids: ['flamme-recue'] }]);
  });

  test('rien de VU ⇒ rien ne part, rien ne disparaît', async () => {
    const s = setup({ online: true });
    s.unmount();
    await settle();
    expect(s.threadIds()).toEqual(['flamme-recue', 'ordinaire', 'flamme-mienne', 'flamme-apres']);
    expect(s.sent).toEqual([]);
  });

  test('changer de conversation vaut sortie', async () => {
    const s = setup({ online: true });
    s.seeUpTo('flamme-apres');
    s.rerender('c-b');
    await settle();
    expect(s.sent).toEqual([{ conversationId: 'c-a', ids: ['flamme-recue', 'flamme-apres'] }]);
    s.unmount();
  });

  test('masquer l’onglet vaut sortie', async () => {
    const s = setup({ online: true });
    s.seeUpTo('flamme-recue');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(s.threadIds()).not.toContain('flamme-recue');
    expect(s.sent).toEqual([{ conversationId: 'c-a', ids: ['flamme-recue'] }]);
    s.unmount();
  });

  test('hors ligne : retrait local tout de même, consommation en FILE, envoyée au retour du réseau', async () => {
    const s = setup({ online: false });
    s.seeUpTo('flamme-recue');
    s.unmount();
    await settle();
    expect(s.threadIds()).not.toContain('flamme-recue');
    expect([...s.queue.pendingFor('c-a')]).toEqual(['flamme-recue']);
    s.goOnline();
    await s.queue.flush();
    expect(s.sent).toEqual([{ conversationId: 'c-a', ids: ['flamme-recue'] }]);
  });

  test('un message encore en file ne REVIENT pas quand le fil se recharge', async () => {
    const s = setup({ online: false });
    s.seeUpTo('flamme-recue');
    s.unmount();
    await settle();
    s.queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: THREAD, hasMore: false }], pageParams: [undefined] });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    function Again() {
      useAfterReadConsumption({ conversationId: 'c-a', messages: THREAD, viewerId: 'u-me', queryClient: s.queryClient, queue: s.queue });
      return null;
    }
    act(() => root.render(<Again />));
    await settle();
    expect(s.threadIds()).toEqual(['ordinaire', 'flamme-mienne', 'flamme-apres']);
    act(() => root.unmount());
    container.remove();
  });
});

describe('noteSeen — une rangée vue par elle-même (#8343)', () => {
  test('une flamme-œil REÇUE vue au milieu du fil part à la sortie, jamais la sienne ni un message ordinaire', async () => {
    const s = setup({ online: true });
    s.seeRow('flamme-apres');
    s.seeRow('flamme-mienne');
    s.seeRow('ordinaire');
    s.unmount();
    await settle();
    expect(s.sent).toEqual([{ conversationId: 'c-a', ids: ['flamme-apres'] }]);
    expect(s.threadIds()).toEqual(['flamme-recue', 'ordinaire', 'flamme-mienne']);
  });
});
