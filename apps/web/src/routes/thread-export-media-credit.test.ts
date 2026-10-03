import { describe, expect, test } from 'bun:test';

import { INITIAL_MESSAGE_CARD_FORMAT } from '@/lib/export/message-card-format';
import type { MessageCardSubject } from '@/lib/export/message-card-subject';

import { messageCardInputOf } from './thread-export-sheet';

/**
 * #9236 — LE CRÉDIT D'UN MÉDIA se nomme comme les autres noms de la carte :
 * anonyme avec son bloc (un média cité avec la citation, les autres avec la
 * réponse), @pseudo au choix, et rien tant qu'on ne l'a pas demandé.
 */

const subject: MessageCardSubject = {
  quoted: { author: 'Awa Diallo', text: 'Question ?', handle: 'awa' },
  reply: { author: 'Jacques Martin', text: 'Réponse.', handle: 'jacques' },
  sentAt: new Date('2026-10-03T09:00:00.000Z'),
  quotedAt: null,
  media: [
    { id: 'r1', card: { kind: 'image', width: 10, height: 10 }, url: '/r1.jpg', mimeType: 'image/jpeg', posterUrl: null, author: { name: 'Jacques Martin', handle: 'jacques', quoted: false } },
    { id: 'q1', card: { kind: 'image', width: 10, height: 10 }, url: '/q1.jpg', mimeType: 'image/jpeg', posterUrl: null, author: { name: 'Awa Diallo', handle: null, quoted: true } },
    { id: 'a1', card: { kind: 'audio', durationMs: 1000, name: 'n.m4a', peaks: [1] }, url: '/a1.m4a', mimeType: 'audio/mp4', posterUrl: null, author: { name: 'Awa Diallo', handle: 'awa', quoted: true } },
  ],
};

const creditsOf = (overrides: Partial<typeof INITIAL_MESSAGE_CARD_FORMAT>, featured: string | null = null) => {
  const input = messageCardInputOf({
    subject,
    format: { ...INITIAL_MESSAGE_CARD_FORMAT, ...overrides },
    handle: 'jacques',
    conversationTitle: null,
    anonymousLabel: 'Anonyme',
    formatDate: () => '',
    featured,
  });
  return { credits: input.media?.map((item) => (item.kind === 'audio' ? 'audio' : (item.credit ?? null))), featured: input.featuredMedia };
};

describe('messageCardInputOf — le nom de qui a posté chaque visuel (#9236)', () => {
  test('rien tant que « Auteur du média » n’est pas demandé', () => {
    expect(creditsOf({}).credits).toEqual([null, null, 'audio']);
  });

  test('le nom affiché, puis le pseudo quand on le préfère et qu’on le connaît', () => {
    expect(creditsOf({ showsMediaAuthor: true }).credits).toEqual(['Jacques Martin', 'Awa Diallo', 'audio']);
    expect(creditsOf({ showsMediaAuthor: true, usePseudonyms: true }).credits).toEqual(['@jacques', 'Awa Diallo', 'audio']);
  });

  test('l’anonymat suit le bloc d’où vient le média', () => {
    expect(creditsOf({ showsMediaAuthor: true, anonymizeQuoted: true }).credits).toEqual(['Jacques Martin', 'Anonyme', 'audio']);
    expect(creditsOf({ showsMediaAuthor: true, anonymizeReply: true }).credits).toEqual(['Anonyme', 'Awa Diallo', 'audio']);
  });

  test('le média choisi voyage par son rang ; un choix inconnu ne désigne rien', () => {
    expect(creditsOf({}, 'q1').featured).toBe(1);
    expect(creditsOf({}, 'gone').featured).toBeNull();
    expect(creditsOf({}).featured).toBeNull();
  });
});
