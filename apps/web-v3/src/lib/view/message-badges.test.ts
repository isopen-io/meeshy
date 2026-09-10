import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { badgesOf, bodyKindOf, isEmojiOnly, systemRowOf } from './message-badges';

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c-a',
    senderId: 'u-bruno',
    content: 'Bonjour',
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
    createdAt: new Date('2026-09-10T09:02:00.000Z'),
    ...partial,
  }) as Message;

describe('badgesOf', () => {
  test('un message ordinaire ne porte aucun badge', () => {
    expect(badgesOf(message())).toEqual([]);
  });

  test('épinglé + transféré (titre servi) + modifié, dans cet ordre', () => {
    const badges = badgesOf(
      message({
        pinnedAt: new Date('2026-09-10T09:00:00.000Z'),
        forwardedFromId: 'm0',
        forwardedFromConversationId: 'c-salon',
        forwardedFromConversation: { id: 'c-salon', title: 'Salon' },
        isEdited: true,
      }),
    );
    expect(badges).toEqual([
      { kind: 'pinned' },
      { kind: 'forwarded', label: 'Transféré depuis Salon' },
      { kind: 'edited' },
    ]);
  });

  test('transféré sans titre servi ⇒ « Transféré » seul, jamais un identifiant', () => {
    const badges = badgesOf(
      message({
        forwardedFromId: 'm0',
        forwardedFromConversationId: 'c-salon',
        forwardedFromConversation: { id: 'c-salon', identifier: 'salon-slug' },
      }),
    );
    expect(badges).toEqual([{ kind: 'forwarded', label: 'Transféré' }]);
  });

  test('transféré sans objet enrichi (charge socket) ⇒ « Transféré » quand même', () => {
    const badges = badgesOf(message({ forwardedFromConversationId: 'c-salon' }));
    expect(badges).toEqual([{ kind: 'forwarded', label: 'Transféré' }]);
  });

  test('titre blanc ⇒ traité comme absent', () => {
    const badges = badgesOf(
      message({
        forwardedFromConversationId: 'c-salon',
        forwardedFromConversation: { id: 'c-salon', title: '   ' },
      }),
    );
    expect(badges).toEqual([{ kind: 'forwarded', label: 'Transféré' }]);
  });

  test('éphémère seul', () => {
    const badges = badgesOf(message({ expiresAt: new Date('2026-09-10T10:00:00.000Z') }));
    expect(badges).toEqual([{ kind: 'ephemeral' }]);
  });

  test('les quatre badges, dans l’ordre iOS', () => {
    const badges = badgesOf(
      message({
        pinnedAt: new Date('2026-09-10T09:00:00.000Z'),
        forwardedFromConversationId: 'c-salon',
        forwardedFromConversation: { id: 'c-salon', title: 'Salon' },
        isEdited: true,
        expiresAt: new Date('2026-09-10T10:00:00.000Z'),
      }),
    );
    expect(badges.map((b) => b.kind)).toEqual(['pinned', 'forwarded', 'edited', 'ephemeral']);
  });
});

describe('systemRowOf', () => {
  test('messageSource user ⇒ pas de rangée système', () => {
    expect(systemRowOf(message({ messageSource: 'user' }))).toBeNull();
  });

  test('messageSource system ⇒ rangée « notice »', () => {
    expect(systemRowOf(message({ messageSource: 'system' }))).toBe('notice');
  });
});

describe('isEmojiOnly / bodyKindOf', () => {
  test('un seul emoji', () => {
    expect(isEmojiOnly('🎉')).toBe(true);
    expect(bodyKindOf('🎉')).toBe('emoji-only');
  });

  test('plusieurs emoji, avec ou sans espace', () => {
    expect(isEmojiOnly('🎉🎊🥳')).toBe(true);
    expect(isEmojiOnly('🎉 🎊 🥳')).toBe(true);
  });

  test('une chaîne ZWJ (famille) compte comme UN seul cluster', () => {
    expect(isEmojiOnly('👨‍👩‍👧‍👦')).toBe(true);
  });

  test('un drapeau (paire d’indicateurs régionaux)', () => {
    expect(isEmojiOnly('🇫🇷')).toBe(true);
  });

  test('un emoji à carnation', () => {
    expect(isEmojiOnly('👍🏽')).toBe(true);
  });

  test('texte simple ⇒ pas emoji seul', () => {
    expect(isEmojiOnly('Bonjour')).toBe(false);
    expect(bodyKindOf('Bonjour')).toBe('text');
  });

  test('emoji mêlé à du texte ⇒ pas emoji seul', () => {
    expect(isEmojiOnly('Bonjour 🎉')).toBe(false);
  });

  test('chaîne vide ⇒ pas emoji seul', () => {
    expect(isEmojiOnly('')).toBe(false);
    expect(isEmojiOnly('   ')).toBe(false);
  });
});
