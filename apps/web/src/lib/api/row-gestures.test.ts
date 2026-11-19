import { readFileSync } from 'node:fs';

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createConversationStore, effectiveFlagsOf, effectiveUnreadOf } from '@/lib/conversation-store';
import type { SafeStorage } from '@/lib/storage';

import { performPreferenceAction, performRowAction } from './conversation-actions';
import { createPreferencesSync } from './conversation-preferences-sync';
import { CONVERSATIONS_QUERY_KEY, findCachedConversation } from './conversations';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { customNameOf, flagsOf } from './preferences';
import { replayRowGestures, restoreRowGestureOverrides, rowGestureQueueFor } from './row-gestures';
import type { Conversation } from './types';

/**
 * **UN GESTE DE RANGÉE FAIT SANS RÉSEAU PART AU RETOUR DU RÉSEAU** (#18917,
 * option A, décision prise par défaut — révision de D-26). Épingler,
 * sourdine, archiver, lu/non-lu, nom personnel : sans réseau (ou sur un 5xx),
 * l'override restait SANS que rien ne reparte — les autres appareils ne
 * voyaient jamais le geste, et le rechargement l'effaçait sans explication.
 * Le geste entre désormais dans une file PERSISTÉE par compte, rejouée en
 * FIFO au retour du réseau et à la reconnexion ; l'override tient jusqu'à
 * l'accusé ; une valeur servie plus récente (un autre appareil, en temps
 * réel) le retire ; la file se vide quand le compte change.
 */

const row = (partial: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c-famille',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 4,
    participants: [],
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    unreadCount: 2,
    userPreferences: [{ isPinned: false, isMuted: false, isArchived: false }],
    ...partial,
  }) as Conversation;

function seeded(conversation: Conversation = row()): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [conversation], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  return queryClient;
}

function memoryStorage(): SafeStorage & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

/** La passerelle : hors ligne tant que `online` est faux (le `fetch` lève), puis elle répond `reply`. */
function gateway(reply: (req: HttpRequest) => ApiResult<unknown> = (req) => ({ ok: true, status: 200, data: req.body ?? {} })) {
  const state = { online: false };
  const sent: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    if (!state.online) throw new TypeError('Failed to fetch');
    sent.push(req);
    return reply(req);
  }) as HttpTransport['request'];
  const callable = Object.assign((req: HttpRequest) => transport.request(req), transport) as unknown as HttpTransport;
  return { transport: callable, state, sent };
}

/** Une passerelle dont chaque réponse attend le témoin : `answer(i)` rend la i-ème, `cut(i)` la coupe (la forme que rend le transport réel). */
function heldGateway() {
  const held: { readonly req: HttpRequest; readonly settle: (result: ApiResult<unknown>) => void }[] = [];
  const request = (req: HttpRequest): Promise<ApiResult<unknown>> => new Promise((settle) => held.push({ req, settle }));
  const transport = Object.assign((req: HttpRequest) => request(req), { request }) as unknown as HttpTransport;
  return {
    transport,
    sent: (): readonly HttpRequest[] => held.map((entry) => entry.req),
    answer: (index: number): void => held[index]?.settle({ ok: true, status: 200, data: held[index]?.req.body ?? {} }),
    cut: (index: number): void => held[index]?.settle({ ok: false, status: 0, error: 'Failed to fetch' }),
  };
}

const setup = (conversation: Conversation = row(), reply?: (req: HttpRequest) => ApiResult<unknown>) => {
  const queryClient = seeded(conversation);
  const store = createConversationStore();
  const storage = memoryStorage();
  const gestures = rowGestureQueueFor(storage, 'u-ada');
  const api = gateway(reply);
  const deps = { source: 'gateway' as const, transport: api.transport, store, queryClient, gestures };
  return { queryClient, store, storage, gestures, api, deps };
};

const listed = (queryClient: QueryClient): Conversation => {
  const found = findCachedConversation(queryClient, 'c-famille');
  if (found === undefined) throw new Error('la rangée doit rester en cache');
  return found;
};

describe('un geste de rangée fait sans réseau part au retour du réseau (#18917)', () => {
  test('épingler réseau coupé : l’override tient, et le geste part EXACTEMENT une fois au retour du réseau', async () => {
    const { queryClient, store, gestures, api, deps } = setup();

    await performRowAction({ conversationId: 'c-famille', action: 'pin', deps });
    expect(effectiveFlagsOf(listed(queryClient), store.getState().overrides).isPinned).toBe(true);
    expect(gestures.size()).toBe(1);

    api.state.online = true;
    await replayRowGestures(deps);
    await replayRowGestures(deps);

    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.method).toBe('PUT');
    expect(api.sent[0]?.body).toEqual({ isPinned: true });
    expect(gestures.size()).toBe(0);
    expect(store.getState().overrides['c-famille']).toBeUndefined();
    expect(flagsOf(listed(queryClient)).isPinned).toBe(true);
  });

  test('épingler puis désépingler hors ligne : seul le DERNIER état part', async () => {
    const { gestures, api, deps } = setup();

    await performRowAction({ conversationId: 'c-famille', action: 'pin', deps });
    await performRowAction({ conversationId: 'c-famille', action: 'pin', deps });
    api.state.online = true;
    await replayRowGestures(deps);

    expect(api.sent.map((req) => req.body)).toEqual([{ isPinned: false }]);
    expect(gestures.size()).toBe(0);
  });

  test('marquer lu, puis renommer pour soi, hors ligne : rejoués dans l’ordre, chacun une fois', async () => {
    const { queryClient, store, api, deps } = setup();

    await performRowAction({ conversationId: 'c-famille', action: 'read', deps });
    await performPreferenceAction({ conversationId: 'c-famille', patch: { customName: 'Les miens' }, deps });
    expect(effectiveUnreadOf(listed(queryClient), store.getState().overrides)).toBe(0);
    api.state.online = true;
    await replayRowGestures(deps);

    expect(api.sent.map((req) => req.method)).toEqual(['POST', 'PUT']);
    expect(api.sent[1]?.body).toEqual({ customName: 'Les miens' });
    expect(listed(queryClient).unreadCount).toBe(0);
    expect(customNameOf(listed(queryClient))).toBe('Les miens');
    expect(store.getState().overrides['c-famille']).toBeUndefined();
  });

  test('rejoué et REFUSÉ (4xx) : l’override est retiré, le geste ne repart plus', async () => {
    const { queryClient, store, gestures, api, deps } = setup(row(), () => ({ ok: false, status: 403, error: 'refus' }));

    await performRowAction({ conversationId: 'c-famille', action: 'mute', deps });
    api.state.online = true;
    await replayRowGestures(deps);
    await replayRowGestures(deps);

    expect(api.sent).toHaveLength(1);
    expect(gestures.size()).toBe(0);
    expect(effectiveFlagsOf(listed(queryClient), store.getState().overrides).isMuted).toBe(false);
  });

  test('toujours en panne au rejeu : le geste reste en file, l’override tient', async () => {
    const { queryClient, store, gestures, api, deps } = setup(row(), () => ({ ok: false, status: 503, error: 'indisponible' }));

    await performRowAction({ conversationId: 'c-famille', action: 'archive', deps });
    api.state.online = true;
    await replayRowGestures(deps);

    expect(gestures.size()).toBe(1);
    expect(effectiveFlagsOf(listed(queryClient), store.getState().overrides).isArchived).toBe(true);
  });

  test('la file survit au rechargement : l’override revient au démarrage, et le geste part au retour du réseau', async () => {
    const { storage, api, deps } = setup();
    await performRowAction({ conversationId: 'c-famille', action: 'pin', deps });

    const reloadedStore = createConversationStore();
    const reloadedQueue = rowGestureQueueFor(storage, 'u-ada');
    restoreRowGestureOverrides(reloadedStore, reloadedQueue);
    const reloaded = { ...deps, store: reloadedStore, gestures: reloadedQueue };

    expect(effectiveFlagsOf(row(), reloadedStore.getState().overrides).isPinned).toBe(true);
    api.state.online = true;
    await replayRowGestures(reloaded);
    expect(api.sent.map((req) => req.body)).toEqual([{ isPinned: true }]);
    expect(reloadedQueue.size()).toBe(0);
  });

  test('la file d’un compte ne se lit pas sous un autre compte', async () => {
    const { storage, deps } = setup();
    await performRowAction({ conversationId: 'c-famille', action: 'pin', deps });

    expect(rowGestureQueueFor(storage, 'u-bob').size()).toBe(0);
    expect(rowGestureQueueFor(storage, 'u-ada').size()).toBe(1);
  });

  test('deux pannes arrivées dans le désordre : c’est l’intention la plus RÉCENTE qui reste en file', async () => {
    const { gestures, deps } = setup();
    const api = heldGateway();
    const stalled = { ...deps, transport: api.transport };

    const pin = performRowAction({ conversationId: 'c-famille', action: 'pin', deps: stalled });
    const unpin = performRowAction({ conversationId: 'c-famille', action: 'pin', deps: stalled });
    api.cut(1);
    await unpin;
    api.cut(0);
    await pin;

    expect(gestures.pending()).toEqual([{ kind: 'flag', conversationId: 'c-famille', field: 'isPinned', value: false }]);
  });

  test('un geste neuf pendant le rejeu de la même clé : le rejeu qui aboutit ne défait pas le geste neuf', async () => {
    const { queryClient, store, gestures, deps } = setup();
    await performRowAction({ conversationId: 'c-famille', action: 'pin', deps });
    const api = heldGateway();
    const online = { ...deps, transport: api.transport };

    const replay = replayRowGestures(online);
    const unpin = performRowAction({ conversationId: 'c-famille', action: 'pin', deps: online });
    api.answer(0);
    await replay;

    expect(effectiveFlagsOf(listed(queryClient), store.getState().overrides).isPinned).toBe(false);
    api.answer(1);
    await unpin;
    expect(flagsOf(listed(queryClient)).isPinned).toBe(false);
    expect(store.getState().overrides['c-famille']).toBeUndefined();
    expect(gestures.size()).toBe(0);
  });

  test('un geste qui aboutit fait partir à sa suite ceux restés en file : une panne 5xx ne déclenche aucun « online »', async () => {
    const server = { failing: true };
    const { gestures, api, deps } = setup(row(), (req) => (server.failing ? { ok: false, status: 503, error: 'indisponible' } : { ok: true, status: 200, data: req.body ?? {} }));
    api.state.online = true;

    await performRowAction({ conversationId: 'c-famille', action: 'mute', deps });
    expect(gestures.size()).toBe(1);
    server.failing = false;
    await performRowAction({ conversationId: 'c-famille', action: 'pin', deps });

    expect(api.sent.map((req) => req.body)).toEqual([{ isMuted: true }, { isPinned: true }, { isMuted: true }]);
    expect(gestures.size()).toBe(0);
  });

  test('un nom personnel qui aboutit fait partir, lui aussi, les gestes restés en file', async () => {
    const server = { failing: true };
    const { gestures, api, deps } = setup(row(), (req) => (server.failing ? { ok: false, status: 502, error: 'passerelle' } : { ok: true, status: 200, data: req.body ?? {} }));
    api.state.online = true;

    await performRowAction({ conversationId: 'c-famille', action: 'archive', deps });
    server.failing = false;
    await performPreferenceAction({ conversationId: 'c-famille', patch: { customName: 'Les miens' }, deps });

    expect(api.sent.map((req) => req.body)).toEqual([{ isArchived: true }, { customName: 'Les miens' }, { isArchived: true }]);
    expect(gestures.size()).toBe(0);
  });

  test('une valeur servie PLUS RÉCENTE (un autre appareil, en temps réel) retire l’override et le geste en file', async () => {
    const { queryClient, store, gestures, api, deps } = setup();
    await performRowAction({ conversationId: 'c-famille', action: 'pin', deps });
    const sync = createPreferencesSync({ queryClient, conversations: store, gestures: () => gestures });

    sync({ userId: 'u-ada', conversationId: 'c-famille', version: 4, reset: false, preferences: { isPinned: false, isMuted: false, isArchived: false } });
    api.state.online = true;
    await replayRowGestures(deps);

    expect(gestures.size()).toBe(0);
    expect(api.sent).toHaveLength(0);
    expect(effectiveFlagsOf(listed(queryClient), store.getState().overrides).isPinned).toBe(false);
  });
});

/**
 * **LA FILE EST BRANCHÉE DANS L'APPLICATION** — `realtime.ts` n'est importé
 * par aucun témoin (ses abonnements de module toucheraient les singletons de
 * toute la suite) : on lit les sources, motif `served-profile-session.test.ts`.
 */
describe('la file des gestes de rangée est branchée', () => {
  test('le geste de rangée de la liste et celui des options du fil portent la file du compte', () => {
    const query = readFileSync(new URL('./query.ts', import.meta.url), 'utf8');
    const options = readFileSync(new URL('../../components/conversation-options-section.tsx', import.meta.url), 'utf8');

    expect(query).toContain('gestures: appRowGestures()');
    expect(options).toContain('gestures: appRowGestures()');
  });

  test('chaque (ré)authentification du temps réel rejoue la file, et le puits des préférences la consulte', () => {
    const realtime = readFileSync(new URL('./realtime.ts', import.meta.url), 'utf8');

    expect(realtime).toContain('SERVER_EVENTS.AUTHENTICATED, replayAppRowGestures');
    expect(realtime).toContain('gestures: appRowGestures');
  });
});
