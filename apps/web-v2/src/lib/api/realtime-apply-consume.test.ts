import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { localMessage, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import {
  applyMessageConsumed,
  applyMessageViewOncePurged,
  isMessageConsumedEvent,
  isMessageViewOncePurgedEvent,
} from './realtime-apply';

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

  test('rejette une charge qui ne dit pas QUI a ouvert (#7580 : la consommation est par personne)', () => {
    expect(
      isMessageConsumedEvent({
        messageId: 'm-1',
        conversationId: 'c-a',
        viewOnceCount: 1,
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

const VIEWER = 'u-moi';
const consumedBy = (userId: string, messageId = 'm-1', conversationId = 'c-a') => ({
  messageId,
  conversationId,
  userId,
  viewOnceCount: 1,
  maxViewOnceCount: 1,
  isFullyConsumed: false,
});
const cachedMessages = (client: QueryClient, conversationId = 'c-a') =>
  client.getQueryData<ReturnType<typeof threadPages>>(messagesQueryKey(conversationId))?.pages[0]?.messages;

describe('applyMessageConsumed — la vue unique se consomme PAR PERSONNE (#7578, #7580)', () => {
  test('un AUTRE participant l\'ouvre : rien ne change chez moi, pas même la référence du fil', () => {
    const client = new QueryClient();
    const target = localMessage({ id: 'm-1', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 0, content: 'secret' });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([target]));

    applyMessageConsumed(client, consumedBy('u-autre'), VIEWER);

    expect(cachedMessages(client)?.find((m) => m.id === 'm-1')).toBe(target);
  });

  test('je l\'ouvre sur un AUTRE appareil : la rangée passe « déjà ouverte » et son contenu est purgé', () => {
    const client = new QueryClient();
    const target = localMessage({ id: 'm-1', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 0, content: 'secret' });
    const other = localMessage({ id: 'm-2', conversationId: 'c-a', createdAt: new Date('2026-09-21T09:05:00.000Z') });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([target, other]));

    applyMessageConsumed(client, consumedBy(VIEWER), VIEWER);

    const sealed = cachedMessages(client)?.find((m) => m.id === 'm-1');
    expect(sealed?.consumedByMe).toBe(true);
    expect(sealed?.content).toBe('');
    expect(sealed?.attachments).toEqual([]);
    expect(cachedMessages(client)?.find((m) => m.id === 'm-2')).toBe(other);
  });

  test('fil non ouvert (aucun cache pour cette conversation) : NO-OP, aucune exception', () => {
    const client = new QueryClient();
    expect(() => applyMessageConsumed(client, consumedBy(VIEWER, 'm-1', 'c-inconnue'), VIEWER)).not.toThrow();
  });

  test('messageId absent du cache : NO-OP, ne touche aucune autre rangée', () => {
    const client = new QueryClient();
    const m1 = localMessage({ id: 'm-1', conversationId: 'c-a' });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([m1]));

    applyMessageConsumed(client, consumedBy(VIEWER, 'introuvable'), VIEWER);

    expect(cachedMessages(client)?.find((m) => m.id === 'm-1')).toBe(m1);
  });

  test('viewer inconnu (session pas encore résolue) : NO-OP', () => {
    const client = new QueryClient();
    const target = localMessage({ id: 'm-1', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 0 });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([target]));

    applyMessageConsumed(client, consumedBy(''), '');

    expect(cachedMessages(client)?.find((m) => m.id === 'm-1')).toBe(target);
  });
});

describe('applyMessageViewOncePurged — le contenu part, la bulle reste (#7578)', () => {
  test('la rangée passe « déjà ouverte », purgée, et reste dans le fil', () => {
    const client = new QueryClient();
    const target = localMessage({ id: 'm-1', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 0, content: 'secret' });
    client.setQueryData(messagesQueryKey('c-a'), threadPages([target]));

    applyMessageViewOncePurged(client, { messageId: 'm-1', conversationId: 'c-a' });

    const row = cachedMessages(client)?.find((m) => m.id === 'm-1');
    expect(row?.consumedByMe).toBe(true);
    expect(row?.content).toBe('');
  });

  test('garde de forme : une charge sans conversation est rejetée', () => {
    expect(isMessageViewOncePurgedEvent({ messageId: 'm-1' })).toBe(false);
    expect(isMessageViewOncePurgedEvent({ messageId: 'm-1', conversationId: 'c-a' })).toBe(true);
  });
});
