import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { localMessage, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { applyMessageConsumed, isMessageConsumedEvent } from './realtime-apply';

/**
 * `message:consumed` (#7354, V6) — L'ÉVÉNEMENT PAIR DE `consumeViewOnceOptimistic`
 * (`view-once.ts:20-26`, doc-comment qui l'annonçait déjà : « un seul réducteur
 * pour la réponse REST et l'événement socket »). Ce fichier ferme la moitié
 * SOCKET, encore inexistante avant ce lot (mesuré : `grep MESSAGE_CONSUMED
 * src/lib/api/socket.ts` rendait vide).
 *
 * Motif `realtime-apply-receipts.test.ts` (extraction PAR RESPONSABILITÉ,
 * jamais ajoutée à `realtime-apply.test.ts`) : ce fichier ne teste QUE la
 * garde de forme et le puits, jamais le câblage socket lui-même
 * (`socket-consume-realtime.test.ts`, fichier frère).
 */
describe('isMessageConsumedEvent — garde de forme FAIL-CLOSED (motif isAttachmentUpdated)', () => {
  test('une charge complète est acceptée', () => {
    expect(
      isMessageConsumedEvent({
        messageId: 'm-1',
        conversationId: 'c-a',
        userId: 'u-b',
        viewOnceCount: 1,
        maxViewOnceCount: 1,
        isFullyConsumed: true,
      }),
    ).toBe(true);
  });

  test('rejette une charge sans messageId', () => {
    expect(
      isMessageConsumedEvent({
        conversationId: 'c-a',
        userId: 'u-b',
        viewOnceCount: 1,
        maxViewOnceCount: 1,
        isFullyConsumed: true,
      }),
    ).toBe(false);
  });

  test('rejette un viewOnceCount qui ne serait pas un nombre', () => {
    expect(
      isMessageConsumedEvent({
        messageId: 'm-1',
        conversationId: 'c-a',
        userId: 'u-b',
        viewOnceCount: '1',
        maxViewOnceCount: 1,
        isFullyConsumed: true,
      }),
    ).toBe(false);
  });

  test('rejette null et les formes non-objet', () => {
    expect(isMessageConsumedEvent(null)).toBe(false);
    expect(isMessageConsumedEvent('message:consumed')).toBe(false);
    expect(isMessageConsumedEvent(undefined)).toBe(false);
  });
});

describe('applyMessageConsumed — la bulle SUIT le direct (#7354)', () => {
  test('patch le viewOnceCount du message NOMMÉ, les autres rangées restent `toBe`-identiques', () => {
    const client = new QueryClient();
    const target = localMessage({ id: 'm-1', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 0 });
    const other = localMessage({ id: 'm-2', conversationId: 'c-a', createdAt: new Date('2026-09-21T09:05:00.000Z') });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([target, other]));

    applyMessageConsumed(client, {
      messageId: 'm-1',
      conversationId: 'c-a',
      userId: 'u-b',
      viewOnceCount: 1,
      maxViewOnceCount: 1,
      isFullyConsumed: true,
    });

    const messages = client.getQueryData<ReturnType<typeof threadPages>>(messagesQueryKey('c-a'))?.pages[0]?.messages;
    expect(messages?.find((m) => m.id === 'm-1')?.viewOnceCount).toBe(1);
    // Immuable : la rangée NON concernée garde sa référence (zéro re-rendu inutile).
    expect(messages?.find((m) => m.id === 'm-2')).toBe(other);
  });

  test('fil non ouvert (aucun cache pour cette conversation) : NO-OP, aucune exception', () => {
    const client = new QueryClient();
    expect(() =>
      applyMessageConsumed(client, {
        messageId: 'm-1',
        conversationId: 'c-inconnue',
        userId: 'u-b',
        viewOnceCount: 1,
        maxViewOnceCount: 1,
        isFullyConsumed: true,
      }),
    ).not.toThrow();
  });

  test('messageId absent du cache : NO-OP, ne touche aucune autre rangée', () => {
    const client = new QueryClient();
    const m1 = localMessage({ id: 'm-1', conversationId: 'c-a' });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([m1]));

    applyMessageConsumed(client, {
      messageId: 'introuvable',
      conversationId: 'c-a',
      userId: 'u-b',
      viewOnceCount: 3,
      maxViewOnceCount: 3,
      isFullyConsumed: true,
    });

    const messages = client.getQueryData<ReturnType<typeof threadPages>>(messagesQueryKey('c-a'))?.pages[0]?.messages;
    expect(messages?.find((m) => m.id === 'm-1')?.viewOnceCount).toBe(0);
  });

  test('un événement EN RETARD ne fait jamais REDESCENDRE le compte — une vue brûlée ne se rouvre pas', () => {
    const client = new QueryClient();
    const burned = localMessage({ id: 'm-1', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 2, maxViewOnceCount: 2 });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([burned]));

    applyMessageConsumed(client, {
      messageId: 'm-1',
      conversationId: 'c-a',
      userId: 'u-b',
      viewOnceCount: 1,
      maxViewOnceCount: 2,
      isFullyConsumed: false,
    });

    const messages = client.getQueryData<ReturnType<typeof threadPages>>(messagesQueryKey('c-a'))?.pages[0]?.messages;
    expect(messages?.find((m) => m.id === 'm-1')?.viewOnceCount).toBe(2);
  });
});
