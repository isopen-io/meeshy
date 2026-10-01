import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { participantAvatarOf } from '../view/conversation';
import { conversationMembersQueryKey, type ConversationMembersPage } from './conversation-members';
import { friendRequestsQueryKey } from './friend-requests';
import { repaintMyPortrait } from './my-portrait';
import { publicProfileQueryKey } from './public-profile';

/**
 * #8886 — MON PORTRAIT, PARTOUT OÙ LE CACHE EN GARDE UNE COPIE. Chaque charge
 * servie recopie la photo de son auteur : participants d'une conversation (sa
 * surcharge locale ET le compte lié), expéditeurs d'un fil, membres, demandes
 * d'amis, suggestions de mention, fiche publique. Après un changement de photo
 * confirmé, chaque copie qui me DÉSIGNE montre la nouvelle — et rien d'autre ne
 * bouge.
 */

const ME = 'u-ada';
const OLD = '2026/08/u-ada/ancien.webp';
const NEW = '2026/09/u-ada/avatar_2.webp';
const NEW_BANNER = '2026/09/u-ada/banner_2.webp';

const conversationsPage = () => ({
  pages: [
    {
      conversations: [
        {
          id: 'c-groupe',
          type: 'group',
          avatar: 'groupe.webp',
          participants: [
            { id: 'p-ada', userId: ME, displayName: 'Ada', avatar: OLD, user: { id: ME, username: 'ada', avatar: OLD } },
            { id: 'p-kwame', userId: 'u-kwame', displayName: 'Kwame', avatar: null, user: { id: 'u-kwame', avatar: 'kwame.webp' } },
          ],
          lastMessage: { id: 'm-1', senderId: 'p-ada', sender: { id: 'p-ada', userId: ME, avatar: OLD } },
        },
      ],
    },
  ],
  pageParams: [null],
});

const seeded = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['conversations'], conversationsPage());
  queryClient.setQueryData(conversationMembersQueryKey('c-groupe'), {
    members: [
      { id: 'p-ada', userId: ME, username: 'ada', displayName: 'Ada', avatar: undefined, role: 'admin' },
      { id: 'p-kwame', userId: 'u-kwame', username: 'kwame', displayName: 'Kwame', avatar: 'kwame.webp', role: 'member' },
    ],
    nextCursor: null,
    totalCount: 2,
  } satisfies ConversationMembersPage);
  queryClient.setQueryData(friendRequestsQueryKey('sent'), {
    pages: [{ requests: [{ id: 'fr-1', sender: { id: ME, username: 'ada', avatar: OLD }, receiver: { id: 'u-lina', avatar: 'lina.webp' } }] }],
    pageParams: [null],
  });
  queryClient.setQueryData(['mentions', 'c-groupe', 'a'], [{ id: ME, username: 'ada', avatar: OLD }]);
  queryClient.setQueryData(publicProfileQueryKey('ada'), {
    profile: { id: ME, username: 'ada', avatar: OLD, banner: 'ancienne.webp' },
    relation: 'self',
  });
  return queryClient;
};

type Participant = { readonly userId: string; readonly avatar: string | null; readonly user: { readonly avatar: string | null } };
type ConversationsCache = ReturnType<typeof conversationsPage>;

describe('repaintMyPortrait — chaque copie de MON portrait montre la nouvelle photo', () => {
  test('dans une conversation, ma ligne de participant résout la nouvelle photo — la surcharge recopiée comprise', () => {
    const queryClient = seeded();
    repaintMyPortrait(queryClient, { userId: ME, avatar: NEW, banner: null });

    const conversation = queryClient.getQueryData<ConversationsCache>(['conversations'])?.pages[0]?.conversations[0];
    const participants = (conversation?.participants ?? []) as readonly Participant[];
    expect(participantAvatarOf(participants.find((p) => p.userId === ME))).toBe(NEW);
    expect(participantAvatarOf(participants.find((p) => p.userId === 'u-kwame'))).toBe('kwame.webp');
    expect(conversation?.lastMessage.sender.avatar).toBe(NEW);
    expect(conversation?.avatar).toBe('groupe.webp');
  });

  test('la liste des membres, les demandes d’amis, les mentions et ma fiche publique', () => {
    const queryClient = seeded();
    repaintMyPortrait(queryClient, { userId: ME, avatar: NEW, banner: NEW_BANNER });

    const members = queryClient.getQueryData<ConversationMembersPage>(conversationMembersQueryKey('c-groupe'))?.members ?? [];
    expect(members.map((member) => member.avatar)).toEqual([NEW, 'kwame.webp']);

    const sent = queryClient.getQueryData<{ pages: { requests: { sender: { avatar: string }; receiver: { avatar: string } }[] }[] }>(
      friendRequestsQueryKey('sent'),
    );
    expect(sent?.pages[0]?.requests[0]?.sender.avatar).toBe(NEW);
    expect(sent?.pages[0]?.requests[0]?.receiver.avatar).toBe('lina.webp');

    expect(queryClient.getQueryData<{ avatar: string }[]>(['mentions', 'c-groupe', 'a'])?.[0]?.avatar).toBe(NEW);

    const mine = queryClient.getQueryData<{ profile: { avatar: string; banner: string } }>(publicProfileQueryKey('ada'))?.profile;
    expect(mine).toEqual({ id: ME, username: 'ada', avatar: NEW, banner: NEW_BANNER });
  });

  test('une requête qui ne me porte pas garde son identité — aucun rendu inutile', () => {
    const queryClient = seeded();
    const others = { id: 'u-kwame', avatar: 'kwame.webp', friends: [{ id: 'u-lina', avatar: 'lina.webp' }] };
    queryClient.setQueryData(['friends', 'list'], others);
    repaintMyPortrait(queryClient, { userId: ME, avatar: NEW, banner: null });
    expect(queryClient.getQueryData(['friends', 'list'])).toBe(others);
  });

  test('une photo ABSENTE n’efface rien : aucune copie n’est remplacée par un vide', () => {
    const queryClient = seeded();
    const before = queryClient.getQueryData(['conversations']);
    repaintMyPortrait(queryClient, { userId: ME, avatar: null, banner: null });
    expect(queryClient.getQueryData(['conversations'])).toBe(before);
  });
});
