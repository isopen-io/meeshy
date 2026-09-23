import { describe, it, expect } from '@jest/globals';
import { resolveConversationLastReaction } from '../last-reaction';

const NOW = new Date('2026-09-23T12:00:00Z');

const makeRow = (message: Record<string, unknown> = {}) => ({
  id: 'r1',
  emoji: '❤️',
  createdAt: new Date('2026-09-23T11:00:00Z'),
  participantId: 'p-alice',
  participant: { id: 'p-alice', userId: 'u-alice', displayName: 'Alice', user: { displayName: 'Alice L.' } },
  message: {
    id: 'm1',
    senderId: 'p-bob',
    createdAt: new Date('2026-09-23T10:00:00Z'),
    deletedAt: null,
    content: 'Bonjour, le code du portail est 4521',
    originalLanguage: 'fr',
    translations: { en: { text: 'Hello, the gate code is 4521' } },
    isViewOnce: false,
    isBlurred: false,
    isEncrypted: false,
    expiresAt: null,
    ephemeralDuration: null,
    sender: { userId: 'u-bob' },
    ...message,
  },
});

const reader = { viewerLanguages: ['es', 'en'], historyFloor: null };

describe('resolveConversationLastReaction (#7545)', () => {
  it('dit qui a réagi, avec quoi, à quel message et de qui', () => {
    expect(resolveConversationLastReaction(makeRow(), reader, NOW)).toEqual({
      emoji: '❤️',
      reactorId: 'p-alice',
      reactorUserId: 'u-alice',
      reactorName: 'Alice',
      messageId: 'm1',
      targetSenderId: 'p-bob',
      targetSenderUserId: 'u-bob',
      excerpt: 'Bonjour, le code du portail est 4521',
      excerptOriginalLanguage: 'fr',
      excerptTranslations: { en: 'Hello, the gate code is 4521' },
      excerptProtection: null,
      createdAt: '2026-09-23T11:00:00.000Z',
    });
  });

  it('Prisme au rang 2 : la carte de l’extrait sert la langue secondaire quand la primaire manque', () => {
    const lastReaction = resolveConversationLastReaction(makeRow(), reader, NOW);
    expect(lastReaction?.excerptTranslations).toEqual({ en: 'Hello, the gate code is 4521' });
  });

  it.each([
    ['view-once', { isViewOnce: true }],
    ['blurred', { isBlurred: true }],
    ['encrypted', { isEncrypted: true }],
    ['expired', { expiresAt: new Date('2026-09-23T11:30:00Z') }],
  ])('message réagi %s : l’extrait ne part pas, la protection le dit', (protection, flags) => {
    const lastReaction = resolveConversationLastReaction(makeRow(flags), reader, NOW);
    expect(lastReaction?.excerpt).toBeNull();
    expect(lastReaction?.excerptTranslations).toBeNull();
    expect(lastReaction?.excerptOriginalLanguage).toBeNull();
    expect(lastReaction?.excerptProtection).toBe(protection);
    expect(JSON.stringify(lastReaction)).not.toContain('4521');
  });

  it('un message réagi supprimé n’a plus de dernière réaction', () => {
    expect(resolveConversationLastReaction(makeRow({ deletedAt: new Date() }), reader, NOW)).toBeNull();
  });

  it('un message antérieur au plancher d’historique du lecteur ne se révèle pas par sa réaction', () => {
    const floored = { ...reader, historyFloor: new Date('2026-09-23T10:30:00Z') };
    expect(resolveConversationLastReaction(makeRow(), floored, NOW)).toBeNull();
  });

  it('sans ligne, pas de réaction', () => {
    expect(resolveConversationLastReaction(null, reader, NOW)).toBeNull();
  });
});
