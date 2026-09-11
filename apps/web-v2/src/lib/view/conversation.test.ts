import { describe, expect, test } from 'bun:test';

import { presenceOf, previewKindOf, titleOf } from './conversation';
import type { Conversation, Message, Participant } from '@/lib/api/types';

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const minutesAgo = (minutes: number): Date => new Date(NOW - minutes * 60_000);

const participant = (partial: Partial<Participant>): Participant =>
  ({
    id: 'p1',
    conversationId: 'c1',
    userId: 'u1',
    type: 'user',
    role: 'member',
    displayName: 'Fatou Bâ',
    language: 'fr',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    joinedAt: minutesAgo(60),
    ...partial,
  }) as Participant;

describe('presenceOf — les fenêtres 1/3/5, `now` INJECTÉ (#5559 T10)', () => {
  test('30 s ⇒ online', () => {
    const p = participant({ isOnline: false, lastActiveAt: minutesAgo(0.5) });
    expect(presenceOf(p, NOW)).toBe('online');
  });

  test('2 min ⇒ away', () => {
    const p = participant({ isOnline: false, lastActiveAt: minutesAgo(2) });
    expect(presenceOf(p, NOW)).toBe('away');
  });

  test('4 min ⇒ idle (le rang que la fixture ne couvrait pas)', () => {
    const p = participant({ isOnline: false, lastActiveAt: minutesAgo(4) });
    expect(presenceOf(p, NOW)).toBe('idle');
  });

  test('6 min ⇒ offline', () => {
    const p = participant({ isOnline: false, lastActiveAt: minutesAgo(6) });
    expect(presenceOf(p, NOW)).toBe('offline');
  });

  test('isOnline: true mais 10 min ⇒ décroissance anti-stale, PAS online', () => {
    const p = participant({ isOnline: true, lastActiveAt: minutesAgo(10) });
    expect(presenceOf(p, NOW)).toBe('offline');
  });

  test('participant undefined ⇒ offline', () => {
    expect(presenceOf(undefined, NOW)).toBe('offline');
  });
});

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: minutesAgo(60),
    updatedAt: minutesAgo(0),
    ...partial,
  }) as Conversation;

describe('titleOf — customName PRIME (#5559 T11)', () => {
  test('customName présent ⇒ prime sur title et sur le pair', () => {
    const c = conversation({
      title: 'Ancien titre',
      userPreferences: [{ customName: 'Sany' }],
      participants: [participant({ userId: 'u-viewer', displayName: 'Vous' }), participant({ userId: 'u1', displayName: 'Fatou Bâ' })],
    });
    expect(titleOf(c, 'u-viewer')).toBe('Sany');
  });

  test('customName absent ⇒ comportement inchangé (title, puis pair, puis identifier)', () => {
    const withTitle = conversation({ title: 'Équipe déploiement' });
    expect(titleOf(withTitle, 'u-viewer')).toBe('Équipe déploiement');

    const withPeer = conversation({
      participants: [participant({ userId: 'u-viewer', displayName: 'Vous' }), participant({ userId: 'u1', displayName: 'Fatou Bâ' })],
    });
    expect(titleOf(withPeer, 'u-viewer')).toBe('Fatou Bâ');
  });

  test('customName chaîne vide ⇒ ignoré, comportement inchangé', () => {
    const c = conversation({ title: 'Équipe déploiement', userPreferences: [{ customName: '' }] });
    expect(titleOf(c, 'u-viewer')).toBe('Équipe déploiement');
  });
});

/**
 * `previewKindOf` — miroir de `LastMessageSummaryKind.swift:22-36` (D-23,
 * #5676) : l'ordre expired → hidden → view-once → ephemeral → standard.
 */
const lastMessage = (partial: Partial<Message>): Message =>
  ({
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    content: 'contenu',
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
    createdAt: minutesAgo(1),
    timestamp: minutesAgo(1),
    translations: [],
    ...partial,
  }) as Message;

describe('previewKindOf — la forme de l’aperçu de liste (D-23, #5676)', () => {
  test('lastMessage absent ⇒ standard', () => {
    expect(previewKindOf(conversation({}), NOW)).toBe('standard');
  });

  test('expiresAt <= now ⇒ expired, AVANT tout', () => {
    const c = conversation({ lastMessage: lastMessage({ expiresAt: minutesAgo(0) }) });
    expect(previewKindOf(c, NOW)).toBe('expired');
  });

  test('isBlurred ⇒ hidden', () => {
    const c = conversation({ lastMessage: lastMessage({ isBlurred: true }) });
    expect(previewKindOf(c, NOW)).toBe('hidden');
  });

  test('isViewOnce ⇒ view-once', () => {
    const c = conversation({ lastMessage: lastMessage({ isViewOnce: true }) });
    expect(previewKindOf(c, NOW)).toBe('view-once');
  });

  test('expiresAt > now ⇒ ephemeral', () => {
    const c = conversation({ lastMessage: lastMessage({ expiresAt: new Date(NOW + 120_000) }) });
    expect(previewKindOf(c, NOW)).toBe('ephemeral');
  });

  test('rien de protégé ⇒ standard', () => {
    const c = conversation({ lastMessage: lastMessage({}) });
    expect(previewKindOf(c, NOW)).toBe('standard');
  });
});
