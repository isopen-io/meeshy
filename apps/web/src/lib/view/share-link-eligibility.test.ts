import { describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { canCreateShareLink, eligibleForShareLink } from './share-link-eligibility';

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    title: 'Sans titre',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

describe('canCreateShareLink — miroir ConversationListView.swift:904-911', () => {
  test('un DIRECT n’est jamais éligible', () => {
    expect(canCreateShareLink(conversation({ type: 'direct' }))).toBe(false);
  });

  test('un GROUPE l’est à partir de MODÉRATEUR', () => {
    expect(canCreateShareLink(conversation({ type: 'group', currentUserRole: 'moderator' }))).toBe(true);
    expect(canCreateShareLink(conversation({ type: 'group', currentUserRole: 'admin' }))).toBe(true);
    expect(canCreateShareLink(conversation({ type: 'group', currentUserRole: 'creator' }))).toBe(true);
  });

  test('un GROUPE ne l’est PAS pour un simple membre', () => {
    expect(canCreateShareLink(conversation({ type: 'group', currentUserRole: 'member' }))).toBe(false);
    expect(canCreateShareLink(conversation({ type: 'group' }))).toBe(false);
  });

  test('public/global restent ouverts à tout membre', () => {
    expect(canCreateShareLink(conversation({ type: 'public' }))).toBe(true);
    expect(canCreateShareLink(conversation({ type: 'global' }))).toBe(true);
  });
});

describe('eligibleForShareLink', () => {
  test('filtre le corpus aux seules conversations éligibles', () => {
    const list = [
      conversation({ id: 'c-direct', type: 'direct' }),
      conversation({ id: 'c-group-admin', type: 'group', currentUserRole: 'admin' }),
      conversation({ id: 'c-group-membre', type: 'group', currentUserRole: 'member' }),
    ];
    expect(eligibleForShareLink(list).map((c) => c.id)).toEqual(['c-group-admin']);
  });
});
