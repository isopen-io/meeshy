import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { appearanceOf } from '@/lib/appearance/read';

import { bindAppearanceLive, chooseAppearance, createAppearanceSync } from './conversation-appearance';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import { createHttpTransport } from './http';
import type { Conversation } from './types';

const conversation = (partial: Partial<Conversation> = {}): Conversation =>
  ({ id: 'c1', type: 'group', status: 'active', visibility: 'private', isActive: true, memberCount: 3, participants: [], createdAt: new Date(), updatedAt: new Date(), ...partial }) as Conversation;

const seeded = (c: Conversation): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [c], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  queryClient.setQueryData(conversationQueryKey('c1'), c);
  return queryClient;
};

const transportWith = (status: number) => {
  const sent: { method: string; url: string; body: unknown }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ method: init?.method ?? 'GET', url: String(input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify(status < 400 ? { success: true, data: {} } : { success: false, error: 'no', code: status === 403 ? 'PACK_NOT_OWNED' : 'X' }), { status });
  }) as typeof fetch;
  return { sent, transport: createHttpTransport({ base: '', fetchImpl }) };
};

const SOLID = { v: 1, background: { kind: 'solid', color: 'azur' }, accent: 'corail', animate: true } as const;
const read = (queryClient: QueryClient) => appearanceOf(findCachedConversation(queryClient, 'c1')!);

describe('chooseAppearance', () => {
  test('le choix se lit AVANT la réponse, part en PUT, et reste après un 2xx', async () => {
    const queryClient = seeded(conversation({ userPreferences: [{ isPinned: true }] }));
    const { sent, transport } = transportWith(200);
    const pending = chooseAppearance({ conversationId: 'c1', appearance: SOLID, deps: { source: 'gateway', transport, queryClient } });
    expect(read(queryClient)).toEqual(SOLID);
    expect(appearanceOf(queryClient.getQueryData<Conversation>(conversationQueryKey('c1'))!)).toEqual(SOLID);
    expect(await pending).toEqual({ ok: true });
    expect(sent).toEqual([{ method: 'PUT', url: '/api/v1/user-preferences/conversations/c1', body: { appearance: SOLID } }]);
    expect(findCachedConversation(queryClient, 'c1')?.userPreferences).toEqual([{ isPinned: true, appearance: SOLID }]);
  });

  test('un refus rétablit l’état d’avant et rend le code', async () => {
    const queryClient = seeded(conversation({ userPreferences: [{ isPinned: true }] }));
    const { transport } = transportWith(403);
    const outcome = await chooseAppearance({ conversationId: 'c1', appearance: SOLID, deps: { source: 'gateway', transport, queryClient } });
    expect(outcome).toEqual({ ok: false, code: 'PACK_NOT_OWNED' });
    expect(findCachedConversation(queryClient, 'c1')?.userPreferences).toEqual([{ isPinned: true }]);
  });

  test('une panne réseau rétablit aussi', async () => {
    const queryClient = seeded(conversation());
    const transport = createHttpTransport({ base: '', fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    const outcome = await chooseAppearance({ conversationId: 'c1', appearance: SOLID, deps: { source: 'gateway', transport, queryClient } });
    expect(outcome.ok).toBe(false);
    expect(read(queryClient).background).toEqual({ kind: 'signature' });
  });

  test('un second choix plus rapide que l’échec du premier n’est pas écrasé', async () => {
    const queryClient = seeded(conversation());
    const second = { ...SOLID, accent: null };
    const fetchImpl = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ success: false, error: 'no' }), { status: 500 });
    }) as unknown as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl });
    const first = chooseAppearance({ conversationId: 'c1', appearance: SOLID, deps: { source: 'gateway', transport, queryClient } });
    void chooseAppearance({ conversationId: 'c1', appearance: second, deps: { source: 'fixtures', transport, queryClient } });
    await first;
    expect(read(queryClient)).toEqual(second);
  });

  test('null remet Signature et l’accent calculé', async () => {
    const queryClient = seeded(conversation({ userPreferences: [{ appearance: SOLID }] }));
    const { sent, transport } = transportWith(200);
    await chooseAppearance({ conversationId: 'c1', appearance: null, deps: { source: 'gateway', transport, queryClient } });
    expect(sent[0]?.body).toEqual({ appearance: null });
    expect(read(queryClient)).toEqual({ v: 1, background: { kind: 'signature' }, accent: null, animate: true });
  });

  test('en fixtures, le choix reste local et rien ne part', async () => {
    const queryClient = seeded(conversation());
    const { sent, transport } = transportWith(200);
    await chooseAppearance({ conversationId: 'c1', appearance: SOLID, deps: { source: 'fixtures', transport, queryClient } });
    expect(sent).toEqual([]);
    expect(read(queryClient)).toEqual(SOLID);
  });
});

describe('un autre appareil', () => {
  const event = (extra: Record<string, unknown>) => ({ userId: 'u', conversationId: 'c1', version: 2, reset: false, preferences: { appearance: SOLID }, ...extra });

  test('user:preferences-updated s’applique', () => {
    const queryClient = seeded(conversation());
    createAppearanceSync(queryClient)(event({}));
    expect(read(queryClient)).toEqual(SOLID);
  });

  test('une version en retard ne défait pas un état plus frais', () => {
    const queryClient = seeded(conversation());
    const sync = createAppearanceSync(queryClient);
    sync(event({ version: 5 }));
    sync(event({ version: 3, preferences: { appearance: null } }));
    expect(read(queryClient)).toEqual(SOLID);
  });

  test('une remise à zéro rend Signature', () => {
    const queryClient = seeded(conversation({ userPreferences: [{ appearance: SOLID }] }));
    createAppearanceSync(queryClient)(event({ reset: true, preferences: null }));
    expect(read(queryClient).background).toEqual({ kind: 'signature' });
  });

  test('une charge d’un autre scope ou illisible est ignorée', () => {
    const queryClient = seeded(conversation({ userPreferences: [{ appearance: SOLID }] }));
    const sync = createAppearanceSync(queryClient);
    sync({ userId: 'u', category: 'privacy' });
    sync('x');
    sync(event({ preferences: { isPinned: true }, version: 9 }));
    expect(read(queryClient)).toEqual(SOLID);
  });

  test('l’écoute se pose sur user:preferences-updated et se défait', () => {
    const handlers = new Map<string, (v: unknown) => void>();
    const socket = {
      connected: true, connect: () => undefined, disconnect: () => undefined, emit: () => undefined,
      on: (e: string, h: (v: unknown) => void) => void handlers.set(e, h),
      off: (e: string) => void handlers.delete(e),
    };
    const off = bindAppearanceLive({ socket: socket as never, queryClient: seeded(conversation()) });
    expect([...handlers.keys()]).toEqual(['user:preferences-updated']);
    off();
    expect(handlers.size).toBe(0);
  });
});
