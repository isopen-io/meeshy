import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { flattenFriendRequests, friendRequestsQueryKey, type FriendRequestsData } from '@/lib/api/friend-requests';
import { profileRepaintOfUserUpdated, repaintProfile } from '@/lib/api/my-portrait';
import type { Conversation, Participant } from '@/lib/api/types';
import { friendsOf } from '@/lib/conversation-new/candidates';

import { recipientRows } from './send-sheet-model';

/**
 * #8890 — LA FEUILLE DE TRANSFERT NOMME LES GENS PAR LEUR NOUVEAU NOM, sans
 * relecture. Elle lit deux caches : les conversations (le titre d'un direct est
 * le nom du PAIR, `titleOf`) et les amis acceptés (`friendsOf`). Un pair
 * renommé (`user:updated`) ou mon propre renommage repeignent les deux, et la
 * photo suit par le même chemin (#8889).
 */

const VIEWER = 'u-moi';
const KWAME = 'u-kwame';
const LINA = 'u-lina';

const participant = (userId: string, displayName: string, avatar: string | null = null): Participant =>
  ({
    id: `p-${userId}`,
    conversationId: 'c-direct',
    userId,
    type: 'user',
    displayName,
    role: 'member',
    language: 'fr',
    isActive: true,
    isOnline: false,
    joinedAt: new Date('2026-01-01'),
    user: { id: userId, username: userId, displayName, avatar },
  }) as Participant;

const directWithKwame = {
  id: 'c-direct',
  type: 'direct',
  status: 'active',
  visibility: 'private',
  isActive: true,
  title: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  participants: [participant(VIEWER, 'Moi'), participant(KWAME, 'Kwame', 'kwame-old.webp')],
} as unknown as Conversation;

const acceptedWithLina: FriendRequestsData = {
  pages: [
    {
      requests: [
        {
          id: 'fr-1',
          senderId: VIEWER,
          receiverId: LINA,
          status: 'accepted',
          message: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          sender: { id: VIEWER, username: 'moi', displayName: 'Moi', avatar: null },
          receiver: { id: LINA, username: 'lina', displayName: 'Lina', avatar: null },
        },
      ],
      nextCursor: null,
    },
  ],
  pageParams: [null],
} as unknown as FriendRequestsData;

const seeded = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['conversations'], { pages: [{ conversations: [directWithKwame] }], pageParams: [null] });
  queryClient.setQueryData(friendRequestsQueryKey('accepted'), acceptedWithLina);
  return queryClient;
};

const rowsOf = (queryClient: QueryClient) => {
  const conversations = queryClient.getQueryData<{ pages: { conversations: Conversation[] }[] }>(['conversations'])?.pages[0]?.conversations ?? [];
  const friends = friendsOf({ accepted: flattenFriendRequests(queryClient.getQueryData(friendRequestsQueryKey('accepted'))), viewerId: VIEWER });
  return recipientRows({ conversations, friends, searchResults: undefined, viewerId: VIEWER, query: '' });
};

describe('feuille de transfert — un pair renommé s’y lit sous son nouveau nom', () => {
  test('le direct prend le nom servi par user:updated, et sa photo', () => {
    const queryClient = seeded();
    const update = profileRepaintOfUserUpdated({
      userId: KWAME,
      changes: { displayName: 'Kwame Mensah', firstName: 'Kwame', lastName: 'Mensah', username: 'kwame_m', avatar: 'kwame-new.webp' },
    });
    if (update === null) throw new Error('charge refusée');
    repaintProfile(queryClient, update);

    const [row] = rowsOf(queryClient).conversations;
    expect(row?.label).toBe('Kwame Mensah');
    expect(row?.avatarUrl).toBe('kwame-new.webp');
  });

  test('un ami sans conversation prend aussi son nouveau nom', () => {
    const queryClient = seeded();
    repaintProfile(queryClient, { userId: LINA, name: { displayName: 'Lina K.', firstName: null, lastName: null, username: 'lina' } });

    expect(rowsOf(queryClient).people.map((row) => row.label)).toEqual(['Lina K.']);
  });

  test('sans renommage, les étiquettes sont les anciennes — le témoin part bien de l’état servi', () => {
    const rows = rowsOf(seeded());
    expect(rows.conversations[0]?.label).toBe('Kwame');
    expect(rows.people.map((row) => row.label)).toEqual(['Lina']);
  });
});
