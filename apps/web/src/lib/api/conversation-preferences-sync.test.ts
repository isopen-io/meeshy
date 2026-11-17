import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { appearanceOf } from '@/lib/appearance/read';
import { createConversationStore, effectiveFlagsOf } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { localMessage, threadPages } from '@/test-support/thread-cache';

import { bindPreferencesLive, createPreferencesSync } from './conversation-preferences-sync';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { APP_PREFERENCES_QUERY_KEY } from './me-keys';
import { messagesQueryKey } from './messages';
import type { MessagesPage, MessagesPageParam } from './messages-pages';
import { categoryIdOf, customNameOf, flagsOf, reactionOf } from './preferences';
import type { Conversation } from './types';

/**
 * **LES PRÉFÉRENCES CHANGÉES SUR UN AUTRE APPAREIL SE VOIENT AUSSITÔT**
 * (#18914, WEB-03 ; #10663 pour l'apparence) — `user:preferences-updated`
 * porte l'instantané COMPLET et versionné des préférences du lecteur pour une
 * conversation ; le web n'en appliquait que l'apparence. Épingler, mettre en
 * sourdine, archiver, renommer pour soi, ranger ou vider l'historique ailleurs
 * laissait la ligne telle quelle jusqu'à la prochaine relecture, et un réglage
 * d'application (`{ userId, category }`) attendait trente minutes.
 */

const SOLID = { v: 1, background: { kind: 'solid', color: 'azur' }, accent: 'corail', animate: true } as const;

const conversation = (partial: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c1',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-11-01T08:00:00.000Z'),
    updatedAt: new Date('2026-11-01T08:00:00.000Z'),
    ...partial,
  }) as Conversation;

const seeded = (c: Conversation = conversation()): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [c], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  queryClient.setQueryData(conversationQueryKey('c1'), c);
  return queryClient;
};

/** L'instantané que `toPreferencesPayload` (passerelle) diffuse — tous ses champs. */
const preferences = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  isPinned: false,
  isMuted: false,
  mentionsOnly: false,
  isArchived: false,
  tags: [],
  categoryId: null,
  orderInCategory: null,
  customName: null,
  reaction: null,
  readingMode: 'auto',
  clearHistoryBefore: null,
  ...overrides,
});

const event = (extra: Readonly<Record<string, unknown>> = {}) => ({
  userId: 'u-ada',
  conversationId: 'c1',
  version: 2,
  reset: false,
  preferences: preferences(),
  ...extra,
});

const syncOn = (queryClient: QueryClient) => {
  const conversations = createConversationStore();
  return { conversations, sync: createPreferencesSync({ queryClient, conversations }) };
};

const listRow = (queryClient: QueryClient): Conversation => {
  const row = findCachedConversation(queryClient, 'c1');
  if (row === undefined) throw new Error('la ligne c1 doit rester en cache');
  return row;
};

const detail = (queryClient: QueryClient): Conversation => {
  const row = queryClient.getQueryData<Conversation>(conversationQueryKey('c1'));
  if (row === undefined) throw new Error('la fiche c1 doit rester en cache');
  return row;
};

const isInvalidated = (queryClient: QueryClient, queryKey: readonly unknown[]): boolean =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true;

describe('user:preferences-updated (portée conversation) — TOUTE la charge, pas la seule apparence (WEB-03)', () => {
  test('épingler, mettre en sourdine et renommer pour soi sur un autre appareil repeint la ligne', () => {
    const queryClient = seeded();
    const { sync } = syncOn(queryClient);

    sync(event({ preferences: preferences({ isPinned: true, isMuted: true, customName: 'Les cousins' }) }));

    expect(flagsOf(listRow(queryClient))).toEqual({ isPinned: true, isMuted: true, isArchived: false });
    expect(customNameOf(listRow(queryClient))).toBe('Les cousins');
  });

  test('les huit champs que la ligne déclare suivent, sur la ligne ET la fiche du fil', () => {
    const queryClient = seeded();
    const { sync } = syncOn(queryClient);

    sync(event({ preferences: preferences({ isArchived: true, tags: ['travail'], categoryId: 'cat-1', reaction: '⭐', appearance: SOLID }) }));

    for (const row of [listRow(queryClient), detail(queryClient)]) {
      expect(flagsOf(row).isArchived).toBe(true);
      expect(categoryIdOf(row)).toBe('cat-1');
      expect(reactionOf(row)).toBe('⭐');
      expect(appearanceOf(row)).toEqual(SOLID);
    }
    expect(listRow(queryClient).userPreferences).toEqual([
      { isPinned: false, isMuted: false, isArchived: true, tags: ['travail'], categoryId: 'cat-1', customName: null, reaction: '⭐', appearance: SOLID },
    ]);
  });

  test('ce que la ligne servie ne déclare pas n’y entre pas : une relecture de la liste l’effacerait aussitôt', () => {
    const queryClient = seeded();
    const { sync } = syncOn(queryClient);

    sync(event({ preferences: preferences({ mentionsOnly: true, orderInCategory: 3, readingMode: 'focal' }) }));

    const served = listRow(queryClient).userPreferences;
    const keys = Array.isArray(served) ? Object.keys(served[0] ?? {}) : [];
    expect(keys).toContain('isPinned');
    expect(keys).not.toContain('mentionsOnly');
    expect(keys).not.toContain('orderInCategory');
    expect(keys).not.toContain('readingMode');
  });

  test('un geste local CONFIRMÉ par la valeur servie quitte l’override : la valeur serveur reprend la main', () => {
    const queryClient = seeded();
    const { conversations, sync } = syncOn(queryClient);
    conversations.getState().togglePin('c1', false);
    conversations.getState().setPreference('c1', { customName: 'Les cousins' });

    sync(event({ preferences: preferences({ isPinned: true, customName: 'Les cousins' }) }));

    expect(conversations.getState().overrides['c1']).toBeUndefined();
  });

  test('un override CONTRAIRE à la valeur servie reste : l’écho d’un geste plus ancien ne défait pas le suivant', () => {
    const queryClient = seeded(conversation({ userPreferences: [{ isPinned: true }] }));
    const { conversations, sync } = syncOn(queryClient);
    conversations.getState().togglePin('c1', true);

    sync(event({ preferences: preferences({ isPinned: true }) }));

    expect(flagsOf(listRow(queryClient)).isPinned).toBe(true);
    expect(effectiveFlagsOf(listRow(queryClient), conversations.getState().overrides).isPinned).toBe(false);
  });

  test('une version en retard ne défait pas un état plus frais', () => {
    const queryClient = seeded();
    const { sync } = syncOn(queryClient);

    sync(event({ version: 5, preferences: preferences({ isPinned: true, appearance: SOLID }) }));
    sync(event({ version: 3, preferences: preferences({ isPinned: false, appearance: null }) }));

    expect(flagsOf(listRow(queryClient)).isPinned).toBe(true);
    expect(appearanceOf(listRow(queryClient))).toEqual(SOLID);
  });

  test('une remise à zéro rend les défauts du serveur : désépinglée, audible, sans nom personnel, Signature', () => {
    const queryClient = seeded(conversation({ userPreferences: [{ isPinned: true, isMuted: true, customName: 'Les cousins', appearance: SOLID }] }));
    const { sync } = syncOn(queryClient);

    sync(event({ reset: true, preferences: null }));

    expect(flagsOf(listRow(queryClient))).toEqual({ isPinned: false, isMuted: false, isArchived: false });
    expect(customNameOf(listRow(queryClient))).toBeUndefined();
    expect(appearanceOf(listRow(queryClient)).background).toEqual({ kind: 'signature' });
  });

  test('une charge illisible, ou d’une communauté, ne touche rien', () => {
    const queryClient = seeded(conversation({ userPreferences: [{ appearance: SOLID }] }));
    const { sync } = syncOn(queryClient);

    sync('x');
    sync({ userId: 'u-ada', communityId: 'k1', reset: false, preferences: { isPinned: true } });

    expect(listRow(queryClient).userPreferences).toEqual([{ appearance: SOLID }]);
  });
});

describe('vider l’historique sur un autre appareil — le fil ouvert se relit, et lui seul', () => {
  test('un `clearHistoryBefore` nouveau périme le fil de la conversation, ni la liste ni la fiche', () => {
    const queryClient = seeded();
    queryClient.setQueryData(messagesQueryKey('c1'), threadPages([localMessage({ id: 'm-avant', conversationId: 'c1', createdAt: new Date('2026-11-17T08:00:00.000Z') })]));
    const { sync } = syncOn(queryClient);

    sync(event({ preferences: preferences({ clearHistoryBefore: '2026-11-17T09:00:00.000Z' }) }));

    expect(isInvalidated(queryClient, messagesQueryKey('c1'))).toBe(true);
    expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
    expect(isInvalidated(queryClient, conversationQueryKey('c1'))).toBe(false);
  });

  test('un `clearHistoryBefore` inchangé ne relit pas le fil : une épingle n’est pas un effacement', () => {
    const queryClient = seeded();
    queryClient.setQueryData(messagesQueryKey('c1'), threadPages([]));
    const { sync } = syncOn(queryClient);
    sync(event({ version: 2, preferences: preferences({ clearHistoryBefore: '2026-11-17T09:00:00.000Z' }) }));
    queryClient.setQueryData(messagesQueryKey('c1'), threadPages([]));

    sync(event({ version: 3, preferences: preferences({ isPinned: true, clearHistoryBefore: '2026-11-17T09:00:00.000Z' }) }));

    expect(isInvalidated(queryClient, messagesQueryKey('c1'))).toBe(false);
  });

  test('un historique vidé qui ne retire RIEN du fil en cache ne le relit pas — même reçu par un puits neuf (#19116)', () => {
    const queryClient = seeded();
    queryClient.setQueryData(messagesQueryKey('c1'), threadPages([localMessage({ id: 'm-apres', conversationId: 'c1', createdAt: new Date('2026-11-17T10:00:00.000Z') })]));
    const { sync } = syncOn(queryClient);

    sync(event({ preferences: preferences({ isPinned: true, clearHistoryBefore: '2026-11-17T09:00:00.000Z' }) }));

    expect(isInvalidated(queryClient, messagesQueryKey('c1'))).toBe(false);
  });

  test('un fil persisté (dates en chaîne) dont un message précède l’effacement se relit', () => {
    const queryClient = seeded();
    const rehydrated = { ...localMessage({ id: 'm-avant', conversationId: 'c1' }), createdAt: '2026-11-17T08:59:59.000Z' };
    queryClient.setQueryData(messagesQueryKey('c1'), threadPages([rehydrated as unknown as ReturnType<typeof localMessage>]));
    const { sync } = syncOn(queryClient);

    sync(event({ preferences: preferences({ clearHistoryBefore: '2026-11-17T09:00:00.000Z' }) }));

    expect(isInvalidated(queryClient, messagesQueryKey('c1'))).toBe(true);
  });

  test('sans effacement connu, une préférence ne relit pas le fil', () => {
    const queryClient = seeded();
    queryClient.setQueryData(messagesQueryKey('c1'), threadPages([]));
    const { sync } = syncOn(queryClient);

    sync(event({ preferences: preferences({ isMuted: true }) }));

    expect(isInvalidated(queryClient, messagesQueryKey('c1'))).toBe(false);
  });
});

describe('user:preferences-updated (portée catégorie) — un réglage d’application changé ailleurs', () => {
  test('`{ userId, category }` périme les réglages d’application, rien d’autre', () => {
    const queryClient = seeded();
    queryClient.setQueryData(APP_PREFERENCES_QUERY_KEY, { theme: 'auto' });
    const { sync } = syncOn(queryClient);

    sync({ userId: 'u-ada', category: 'privacy' });

    expect(isInvalidated(queryClient, APP_PREFERENCES_QUERY_KEY)).toBe(true);
    expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
  });
});

/**
 * **UN SEUL PUITS PAR CONNEXION, MÊME QUAND UN FIL EST OUVERT** (#19116,
 * réserve C4 de l'audit de #19081). Le fond du fil montait un SECOND puits,
 * avec sa propre mémoire de version, à côté de celui de la connexion : une
 * diffusion v5 arrivée en retard après une v6 était rejouée par le puits neuf
 * (la sourdine retombait), et un historique vidé relançait le fil deux fois.
 * Le faux socket garde ici TOUS les écouteurs d'un nom — celui d'avant n'en
 * gardait qu'un par nom (`Map`), et ne pouvait pas voir le doublon.
 */
function multiSocket() {
  const handlers: Array<readonly [string, SocketHandler]> = [];
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
    on: (name, handler) => void handlers.push([name, handler as SocketHandler]),
    off: (name, handler) => {
      const index = handlers.findIndex(([n, h]) => n === name && h === handler);
      if (index !== -1) handlers.splice(index, 1);
    },
  };
  const fire = (name: string, payload: unknown): void => {
    for (const [n, handler] of [...handlers]) if (n === name) handler(payload);
  };
  const listeners = (name: string): number => handlers.filter(([n]) => n === name).length;
  return { socket, fire, listeners };
}

const SOURCES = fileURLToPath(new URL('../../', import.meta.url));

const sourcesOf = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesOf(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

describe('un seul puits de préférences par connexion, même quand un fil est ouvert (#19116)', () => {
  test('l’application ne pose le puits qu’à UN endroit : la connexion, jamais un écran', () => {
    const binders = sourcesOf(SOURCES)
      .filter((path) => /\bbindPreferencesLive\(/.test(readFileSync(path, 'utf8')) && !path.endsWith('conversation-preferences-sync.ts'))
      .map((path) => relative(SOURCES, path).split('\\').join('/'));

    expect(binders).toEqual(['lib/api/preferences-live.ts']);
  });

  test('sur un socket à écouteurs multiples, une diffusion v5 en retard après une v6 ne rejoue rien', () => {
    const queryClient = seeded();
    const { socket, fire, listeners } = multiSocket();
    const off = bindPreferencesLive({ socket, queryClient, conversations: createConversationStore() });

    fire(SERVER_EVENTS.USER_PREFERENCES_UPDATED, event({ version: 6, preferences: preferences({ isMuted: true }) }));
    fire(SERVER_EVENTS.USER_PREFERENCES_UPDATED, event({ version: 5, preferences: preferences({ isMuted: false }) }));

    expect(listeners(SERVER_EVENTS.USER_PREFERENCES_UPDATED)).toBe(1);
    expect(flagsOf(listRow(queryClient)).isMuted).toBe(true);
    off();
  });

  test('sur un socket à écouteurs multiples, un historique vidé relit le fil observé UNE seule fois', async () => {
    const queryClient = seeded();
    queryClient.setQueryData(messagesQueryKey('c1'), threadPages([localMessage({ id: 'm-avant', conversationId: 'c1', createdAt: new Date('2026-11-17T08:00:00.000Z') })]));
    const reads = { count: 0 };
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: messagesQueryKey('c1'),
      queryFn: (): Promise<MessagesPage> => {
        reads.count += 1;
        return Promise.resolve({ messages: [], hasOlder: false, nextCursor: null });
      },
      initialPageParam: undefined as MessagesPageParam,
      getNextPageParam: () => undefined,
      staleTime: 60_000,
    });
    const stop = observer.subscribe(() => undefined);
    const { socket, fire } = multiSocket();
    const off = bindPreferencesLive({ socket, queryClient, conversations: createConversationStore() });

    fire(SERVER_EVENTS.USER_PREFERENCES_UPDATED, event({ version: 7, preferences: preferences({ clearHistoryBefore: '2026-11-17T09:00:00.000Z' }) }));
    for (let i = 0; i < 20 && queryClient.isFetching() > 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reads.count).toBe(1);
    off();
    stop();
  });
});

describe('l’écoute', () => {
  test('se pose sur user:preferences-updated et se défait', () => {
    const handlers = new Map<string, SocketHandler>();
    const socket: SocketClient = {
      connected: true,
      connect: () => undefined,
      disconnect: () => undefined,
      emit: () => undefined,
      on: (name, handler) => void handlers.set(name, handler as SocketHandler),
      off: (name) => void handlers.delete(name),
    };
    const off = bindPreferencesLive({ socket, queryClient: seeded(), conversations: createConversationStore() });

    expect([...handlers.keys()]).toEqual([SERVER_EVENTS.USER_PREFERENCES_UPDATED]);
    off();
    expect(handlers.size).toBe(0);
  });
});
