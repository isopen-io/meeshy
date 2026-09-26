import { describe, expect, test } from 'bun:test';

import { notificationCallBack } from './call-back';
import { decodeNotification } from './record';

/**
 * « RAPPELER » DEPUIS LA CLOCHE (A6, C12) — la notification d'appel manqué
 * (`NotificationService.createMissedCallNotification`) porte la conversation,
 * le type d'appel (`metadata.callType`) et l'appelant (`actor`) : tout ce qu'il
 * faut pour rappeler, du même type, sans ouvrir le fil (iOS n'ouvre que le fil,
 * `NotificationActionHandler.swift:362` — le web fait le geste en un tap).
 */

const served = (overrides: Readonly<Record<string, unknown>> = {}) =>
  decodeNotification({
    id: 'n-1',
    type: 'missed_call',
    content: '📹 Appel vidéo manqué',
    actor: { id: 'u-ada', username: 'ada', displayName: 'Ada Lovelace', avatar: 'a.jpg' },
    context: { conversationId: 'c-ada', conversationType: 'direct', callSessionId: 'call-1' },
    metadata: { action: 'view_conversation', callType: 'video' },
    state: { isRead: false, createdAt: '2026-09-26T09:00:00.000Z' },
    ...overrides,
  })!;

describe('rappeler depuis une notification d’appel manqué', () => {
  test('du même type, vers la conversation, nommé par l’appelant', () => {
    expect(notificationCallBack(served())).toEqual({ conversationId: 'c-ada', media: 'video', title: 'Ada Lovelace', avatar: 'a.jpg', isGroup: false });
  });

  test('un type absent ou inconnu rappelle en vocal ; les deux autres graphies du manqué rappellent aussi', () => {
    expect(notificationCallBack(served({ metadata: {} }))?.media).toBe('audio');
    expect(notificationCallBack(served({ type: 'CALL_MISSED' }))).not.toBeNull();
    expect(notificationCallBack(served({ type: 'call_declined' }))).not.toBeNull();
  });

  test('un appel de groupe se rappelle dans le groupe, nommé par lui', () => {
    expect(notificationCallBack(served({ context: { conversationId: 'c-g', conversationType: 'group', conversationTitle: 'Équipe' } }))).toMatchObject({
      conversationId: 'c-g',
      title: 'Équipe',
      isGroup: true,
    });
  });

  test('aucune autre notification ne rappelle ; sans conversation, rien', () => {
    expect(notificationCallBack(served({ type: 'new_message' }))).toBeNull();
    expect(notificationCallBack(served({ type: 'incoming_call' }))).toBeNull();
    expect(notificationCallBack(served({ context: {} }))).toBeNull();
  });
});
