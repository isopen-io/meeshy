import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import type { ApiResult, HttpRequest } from './http';
import { messagesQueryKey } from './messages';
import { performPinGesture } from './pin-message';
import { applyMessagePinnedEvent } from './realtime-message-pin';

/**
 * #7558 — ÉPINGLER / DÉTACHER : l'épingle se voit TOUT DE SUITE (optimiste),
 * part sur la route d'iOS, et un refus ou une coupure la RETIRE — sans écraser
 * ce que le temps réel a appris pendant le vol.
 */

const NOW = new Date('2026-10-14T10:00:00.000Z');

const seeded = (pinned = false): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    messagesQueryKey('c-a'),
    threadPages([
      localMessage({ id: 'm-1', senderId: 'u-other', ...(pinned ? { pinnedAt: new Date('2026-10-01T08:00:00.000Z'), pinnedBy: 'u-other' } : {}) }),
    ]),
  );
  return queryClient;
};

const pinOf = (queryClient: QueryClient) => {
  const row = threadOf(queryClient, 'c-a')?.messages[0];
  return row?.pinnedAt === undefined ? null : { pinnedAt: row.pinnedAt, pinnedBy: row.pinnedBy };
};

function transport(answer: ApiResult<unknown> | (() => Promise<ApiResult<unknown>>)) {
  const requests: HttpRequest[] = [];
  return {
    requests,
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return (typeof answer === 'function' ? await answer() : answer) as ApiResult<T>;
    },
  };
}

const gesture = (queryClient: QueryClient, on: boolean, t: ReturnType<typeof transport>) =>
  performPinGesture({ queryClient, conversationId: 'c-a', messageId: 'm-1', on, viewerId: 'u-viewer', transport: t, now: NOW });

describe('performPinGesture', () => {
  test('épingler part en PUT sur la route d’iOS, et l’épingle est posée par le lecteur', async () => {
    const queryClient = seeded();
    const t = transport({ ok: true, data: { pinnedAt: NOW.toISOString(), pinnedBy: 'u-viewer' } });
    expect(await gesture(queryClient, true, t)).toBe('done');
    expect(t.requests).toEqual([{ method: 'PUT', path: '/api/v1/conversations/c-a/messages/m-1/pin' }]);
    expect(pinOf(queryClient)).toEqual({ pinnedAt: NOW, pinnedBy: 'u-viewer' });
  });

  test('l’épingle se voit AVANT la réponse du serveur', async () => {
    const queryClient = seeded();
    let release!: (value: ApiResult<unknown>) => void;
    const t = transport(() => new Promise((resolve) => (release = resolve)));
    const pending = gesture(queryClient, true, t);
    await new Promise((r) => setTimeout(r, 0));
    expect(pinOf(queryClient)?.pinnedBy).toBe('u-viewer');
    release({ ok: true, data: null });
    expect(await pending).toBe('done');
  });

  test('détacher part en DELETE et retire l’épingle', async () => {
    const queryClient = seeded(true);
    const t = transport({ ok: true, data: null });
    expect(await gesture(queryClient, false, t)).toBe('done');
    expect(t.requests).toEqual([{ method: 'DELETE', path: '/api/v1/conversations/c-a/messages/m-1/pin' }]);
    expect(pinOf(queryClient)).toBeNull();
  });

  test('un refus rend l’état d’avant — épingle d’origine comprise', async () => {
    const queryClient = seeded(true);
    const t = transport({ ok: false, status: 403, error: 'Access denied' });
    expect(await gesture(queryClient, false, t)).toBe('failed');
    expect(pinOf(queryClient)).toEqual({ pinnedAt: new Date('2026-10-01T08:00:00.000Z'), pinnedBy: 'u-other' });
  });

  test('une coupure rend l’état d’avant et se dit hors ligne', async () => {
    const queryClient = seeded();
    const t = transport({ ok: false, status: 0, error: 'offline' });
    expect(await gesture(queryClient, true, t)).toBe('offline');
    expect(pinOf(queryClient)).toBeNull();
  });

  test('un transport qui lève est une coupure, jamais une promesse rejetée', async () => {
    const queryClient = seeded();
    const t = transport(() => Promise.reject(new Error('boom')));
    expect(await gesture(queryClient, true, t)).toBe('offline');
    expect(pinOf(queryClient)).toBeNull();
  });

  test('ce que le temps réel a appris pendant le vol n’est pas écrasé par le retour arrière', async () => {
    const queryClient = seeded();
    let release!: (value: ApiResult<unknown>) => void;
    const t = transport(() => new Promise((resolve) => (release = resolve)));
    const pending = gesture(queryClient, true, t);
    await new Promise((r) => setTimeout(r, 0));
    applyMessagePinnedEvent(queryClient, { messageId: 'm-1', conversationId: 'c-a', pinnedAt: '2026-10-14T10:00:05.000Z', pinnedBy: 'u-other' });
    release({ ok: false, status: 500, error: 'boom' });
    expect(await pending).toBe('failed');
    expect(pinOf(queryClient)).toEqual({ pinnedAt: new Date('2026-10-14T10:00:05.000Z'), pinnedBy: 'u-other' });
  });
});
