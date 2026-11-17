import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';
import { inAppBannerStore } from '@/lib/notifications/in-app-banner';
import { createOutboxStore } from '@/lib/send/outbox-store';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  NOTIFICATION_COUNTS_QUERY_KEY,
  notificationListKey,
  type NotificationCounts,
  type NotificationsInfiniteData,
} from './notifications';
import { createRealtimeConnection } from './socket';
import { createTypingStore } from './typing-store';

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  return {
    get connected() { return connected; },
    connect: () => { connected = true; },
    disconnect: () => { connected = false; },
    on: (event, handler) => { const set = handlers.get(event) ?? new Set(); set.add(handler as SocketHandler); handlers.set(event, set); },
    off: (event, handler) => { handlers.get(event)?.delete(handler as SocketHandler); },
    emit: () => undefined,
    fire: (event, payload) => { for (const handler of handlers.get(event) ?? []) handler(payload); },
  };
}

const row = (id: string, type: string, conversationId: string, createdAt: string, isRead = false) => ({
  id, userId: 'u-viewer', type, priority: 'normal', title: 'Awa', content: id,
  actor: { id: 'u-awa', username: 'awa', displayName: 'Awa' },
  context: { conversationId }, metadata: {}, state: { isRead, readAt: null, createdAt },
});

/** Un transport dont on tient la réponse : la requête attend qu'on la libère. */
function heldTransport() {
  const pending: Array<{ path: string; answer: (r: ApiResult<unknown>) => void }> = [];
  const transport = {
    request: (req: HttpRequest) => new Promise<ApiResult<unknown>>((resolve) => pending.push({ path: req.path, answer: resolve })),
  } as unknown as HttpTransport;
  return { transport, pending };
}

function connect(transport: HttpTransport, unread = 3) {
  const socket = fakeSocket();
  const queryClient = new QueryClient();
  const empty: NotificationsInfiniteData = { pages: [{ notifications: [], hasMore: false, nextCursor: null }], pageParams: [undefined] };
  queryClient.setQueryData(notificationListKey('all'), empty);
  queryClient.setQueryData(notificationListKey('unread'), empty);
  queryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: unread, unread, byType: {} });
  createRealtimeConnection({ token: 't', sessionToken: 's' }, {
    base: 'https://gate.staging.meeshy.me', socketFactory: () => socket, queryClient, typing: createTypingStore(),
    conversationStore, outbox: createOutboxStore(), viewerId: () => 'u-viewer', onClearSession: () => undefined,
    notificationsApi: { source: 'gateway', transport },
  });
  return { socket, queryClient };
}

const ids = (qc: QueryClient) => qc.getQueryData<NotificationsInfiniteData>(notificationListKey('all'))?.pages.flatMap((p) => p.notifications.map((n) => n.id));
const unread = (qc: QueryClient) => qc.getQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY)?.unread;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const unreadIds = (qc: QueryClient) => qc.getQueryData<NotificationsInfiniteData>(notificationListKey('unread'))?.pages.flatMap((p) => p.notifications.map((n) => n.id));

/* La passerelle émet `notification:counts` après CHAQUE `new`, `read` et `deleted`
   (`NotificationService.createNotification`, `markAsRead`, `deleteNotification`) : son compte remplace celui de l'écran.
   Un témoin qui ne le rejoue pas atteste un monde qui n'existe pas. */
const echo = (socket: { fire(event: string, payload: unknown): void }, unreadCount: number) =>
  socket.fire(SERVER_EVENTS.NOTIFICATION_COUNTS, { unread: unreadCount, total: unreadCount });

const globals = globalThis as { document?: unknown; window?: unknown };
let saved: { document: unknown; window: unknown };
beforeEach(() => {
  saved = { document: globals.document, window: globals.window };
  globals.document = { hidden: false };
  globals.window = { location: { pathname: '/c/X' }, addEventListener: () => undefined, removeEventListener: () => undefined };
  inAppBannerStore.setState({ current: null });
});
afterEach(() => {
  globals.document = saved.document;
  globals.window = saved.window;
  inAppBannerStore.setState({ current: null });
});

describe('lecture à l’arrivée, sur la séquence réelle de la passerelle', () => {
  test('pendant le POST, l’écho du compte ne remonte pas la pastille ; la confirmation la tient', async () => {
    const { transport, pending } = heldTransport();
    const { socket, queryClient } = connect(transport, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('r1', 'message_reaction', 'X', '2026-11-17T09:00:00.000Z'));
    echo(socket, 4);
    expect(unread(queryClient)).toBe(3);

    pending[0]?.answer({ ok: true, data: undefined });
    await settle();
    socket.fire(SERVER_EVENTS.NOTIFICATION_READ, { notificationId: 'r1' });
    echo(socket, 3);
    expect(unread(queryClient)).toBe(3);
  });

  test('un refus : la ligne revient non lue dans « Toutes » et « Non lues », et la pastille dit ce que dit la passerelle', async () => {
    const { transport, pending } = heldTransport();
    const { socket, queryClient } = connect(transport, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('r1', 'message_reaction', 'X', '2026-11-17T09:00:00.000Z'));
    echo(socket, 4);

    pending[0]?.answer({ ok: false, status: 503, error: 'unavailable' });
    await settle();
    expect(unread(queryClient)).toBe(4);
    expect(ids(queryClient)).toContain('r1');
    expect(unreadIds(queryClient)).toContain('r1');
  });

  test('un refus n’efface pas une notification d’une AUTRE conversation arrivée pendant la requête', async () => {
    const { transport, pending } = heldTransport();
    const { socket, queryClient } = connect(transport, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('r1', 'message_reaction', 'X', '2026-11-17T09:00:00.000Z'));
    echo(socket, 4);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('n3', 'new_message', 'Y', '2026-11-17T09:00:01.000Z'));
    echo(socket, 5);
    expect(unread(queryClient)).toBe(4);

    pending[0]?.answer({ ok: false, status: 503, error: 'unavailable' });
    await settle();
    expect(ids(queryClient)).toEqual(['n3', 'r1']);
    expect(unread(queryClient)).toBe(5);
  });

  test('la passerelle a LU la ligne pendant le POST, puis la réponse se perd : rien ne revient non lu', async () => {
    const { transport, pending } = heldTransport();
    const { socket, queryClient } = connect(transport, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('m1', 'user_mentioned', 'X', '2026-11-17T09:00:00.000Z'));
    echo(socket, 4);
    socket.fire(SERVER_EVENTS.NOTIFICATION_READ, { notificationId: 'm1' });
    echo(socket, 3);

    pending[0]?.answer({ ok: false, status: 0, error: 'network' });
    await settle();
    expect(unread(queryClient)).toBe(3);
    expect(unreadIds(queryClient)).not.toContain('m1');
  });

  test('l’accusé de lecture du fil marque le contexte lu (read-bulk) pendant le POST, puis un 429 : rien ne revient', async () => {
    const { transport, pending } = heldTransport();
    const { socket, queryClient } = connect(transport, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('p1', 'user_mentioned', 'X', '2026-11-17T09:00:00.000Z'));
    echo(socket, 4);
    socket.fire(SERVER_EVENTS.NOTIFICATION_READ_BULK, { scope: { kind: 'context', contextKey: 'conversationId', contextValue: 'X' } });
    echo(socket, 3);

    pending[0]?.answer({ ok: false, status: 429, error: 'too many' });
    await settle();
    expect(unread(queryClient)).toBe(3);
    expect(unreadIds(queryClient)).not.toContain('p1');
  });

  test('supprimée pour tous pendant le POST, puis un 503 : la ligne ne ressuscite pas', async () => {
    const { transport, pending } = heldTransport();
    const { socket, queryClient } = connect(transport, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, { ...row('n1', 'new_message', 'X', '2026-11-17T09:00:00.000Z'), content: 'texte retiré pour tous' });
    echo(socket, 4);
    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });
    echo(socket, 3);

    pending[0]?.answer({ ok: false, status: 503, error: 'unavailable' });
    await settle();
    expect(ids(queryClient)).toEqual([]);
    expect(unread(queryClient)).toBe(3);
  });

  test('supprimée pendant le POST, puis un 404 : la ligne ne ressuscite pas', async () => {
    const { transport, pending } = heldTransport();
    const { socket, queryClient } = connect(transport, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('n1', 'new_message', 'X', '2026-11-17T09:00:00.000Z'));
    echo(socket, 4);
    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n1' });
    echo(socket, 3);

    pending[0]?.answer({ ok: false, status: 404, error: 'Notification not found' });
    await settle();
    expect(ids(queryClient)).toEqual([]);
    expect(unread(queryClient)).toBe(3);
  });

  test('une édition pendant le POST (supprimée puis recréée, non lue) : un seul décompte, et le refus du premier POST ne défait pas le second', async () => {
    const { transport, pending } = heldTransport();
    const { socket, queryClient } = connect(transport, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('r1', 'user_mentioned', 'X', '2026-11-17T09:00:00.000Z'));
    echo(socket, 4);
    socket.fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'r1' });
    echo(socket, 3);
    socket.fire(SERVER_EVENTS.NOTIFICATION_NEW, row('r1', 'user_mentioned', 'X', '2026-11-17T09:00:00.000Z'));
    echo(socket, 4);
    expect(pending).toHaveLength(2);
    expect(unread(queryClient)).toBe(3);

    pending[0]?.answer({ ok: false, status: 503, error: 'unavailable' });
    await settle();
    expect(unread(queryClient)).toBe(3);

    pending[1]?.answer({ ok: true, data: undefined });
    await settle();
    socket.fire(SERVER_EVENTS.NOTIFICATION_READ, { notificationId: 'r1' });
    echo(socket, 3);
    expect(unread(queryClient)).toBe(3);
  });
});
