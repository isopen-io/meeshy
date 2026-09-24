import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { topActiveMembers } from './top-active-members';

const message = (id: string, senderId: string, overrides: Partial<Message> = {}): Message =>
  ({
    id,
    conversationId: 'c1',
    senderId,
    content: 'x',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    createdAt: new Date('2026-09-24T09:00:00.000Z'),
    translations: [],
    sender: {
      id: `p-${senderId}`,
      conversationId: 'c1',
      userId: senderId,
      displayName: `Nom ${senderId}`,
      type: 'user',
      role: 'member',
      language: 'fr',
      isActive: true,
      isOnline: false,
      joinedAt: new Date('2026-01-01'),
      user: { id: senderId, username: senderId, avatar: `${senderId}.png` },
    },
    ...overrides,
  }) as Message;

const ids = (messages: readonly Message[], viewerId = 'moi') => topActiveMembers(messages, viewerId).map((member) => member.id);

describe('topActiveMembers — les trois qui parlent le plus (#7830)', () => {
  test('compte les messages chargés par expéditeur, décroissant, trois au plus', () => {
    const messages = [
      message('1', 'ali'),
      message('2', 'nour'),
      message('3', 'nour'),
      message('4', 'sara'),
      message('5', 'nour'),
      message('6', 'ali'),
      message('7', 'leo'),
    ];
    expect(ids(messages)).toEqual(['nour', 'ali', 'leo']);
    expect(topActiveMembers(messages, 'moi')[0]).toEqual({ id: 'nour', name: 'Nom nour', username: 'nour', avatar: 'nour.png', count: 3 });
  });

  test('le lecteur ne se compte pas, même s’il parle le plus', () => {
    expect(ids([message('1', 'moi'), message('2', 'moi'), message('3', 'ali')])).toEqual(['ali']);
  });

  test('une égalité se départage par l’activité la plus récente', () => {
    expect(ids([message('1', 'ali'), message('2', 'sara'), message('3', 'leo')])).toEqual(['leo', 'sara', 'ali']);
  });

  test('un message système ne compte pas comme une prise de parole', () => {
    const systeme = message('1', 'ali', { messageType: 'system', messageSource: 'system' });
    expect(ids([systeme, systeme, message('2', 'nour')])).toEqual(['nour']);
  });

  test('aucun message chargé ⇒ aucune pile', () => {
    expect(ids([])).toEqual([]);
  });
});
