import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { checkStatusOf, deliveryOf } from './message';

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: 'bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-09T10:00:00.000Z'),
    timestamp: new Date('2026-09-09T10:00:00.000Z'),
    ...partial,
  }) as Message;

describe('checkStatusOf — l’accusé qu’une peau a le droit de peindre', () => {
  /**
   * LE POINT DE CE TÉMOIN (#5813, revue-correction). Un envoi ÉCHOUÉ porte
   * `deliveredCount: 0` — et `deliveryOf` lit `0` comme « envoyé ». La bande
   * de reprise disait donc « Non envoyé · Réessayer » pendant qu'une coche ✓
   * s'affichait à dix pixels de là, avec `title="envoyé"`
   * (`STATUS_LABEL.sent`). Deux affirmations contraires sur le MÊME message,
   * dont l'une est fausse. iOS ne peint jamais l'accusé d'un `.sendFailed`
   * (`BubbleFooter.swift:186-197` sert `exclamationmark.circle.fill`, jamais
   * la coche). `null` ⇒ la peau ne peint RIEN : la bande porte seule l'état.
   */
  test('local failed ⇒ null — jamais la coche « envoyé » à côté de « Non envoyé »', () => {
    expect(checkStatusOf(message(), 'failed')).toBeNull();
    expect(deliveryOf(message())).toBe('sent');
  });

  test('local pending ⇒ pending', () => {
    expect(checkStatusOf(message(), 'pending')).toBe('pending');
  });

  test('aucune opinion locale ⇒ l’accusé SERVI, inchangé', () => {
    expect(checkStatusOf(message(), undefined)).toBe('sent');
    expect(checkStatusOf(message({ deliveredCount: 2, recipientCount: 2 }), undefined)).toBe('delivered');
    expect(checkStatusOf(message({ readCount: 2, deliveredCount: 2, recipientCount: 2 }), undefined)).toBe('read');
  });

  test('un échec LOCAL ne peut pas être masqué par un accusé SERVI — le local prime', () => {
    expect(checkStatusOf(message({ deliveredCount: 5, recipientCount: 5 }), 'failed')).toBeNull();
  });
});
