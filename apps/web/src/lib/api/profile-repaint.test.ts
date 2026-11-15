import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { conversationMembersQueryKey, type ConversationMembersPage } from './conversation-members';
import { repaintProfile } from './my-portrait';
import { publicProfileQueryKey } from './public-profile';

/**
 * #8889 / #8890 — LE PORTRAIT ET LE NOM DE N'IMPORTE QUI, partout où le cache
 * en garde une copie. La règle de #8886 (un objet DÉSIGNE l'utilisateur par
 * `id` ou `userId`) vaut pour un PAIR comme pour moi, et pour le NOM comme
 * pour la photo.
 *
 * Le nom a deux formes, et la forme de l'objet dit laquelle :
 * - une ligne de PARTICIPANT (désignée par `userId`, son `id` est le sien)
 *   porte le nom COMPOSÉ (`displayName > « Prénom Nom » > username`) — c'est
 *   la copie que la passerelle réécrit et le titre d'une conversation directe ;
 * - un objet COMPTE (désigné par `id`) porte `User.displayName`, effaçable.
 */

const KWAME = 'u-kwame';

const KWAME_RENAMED = { displayName: null, firstName: 'Kwame', lastName: 'Mensah', username: 'kwame_m' } as const;

const conversationsPage = () => ({
  pages: [
    {
      conversations: [
        {
          id: 'c-direct',
          type: 'direct',
          title: null,
          participants: [
            { id: 'p-ada', userId: 'u-ada', displayName: 'Ada', avatar: null, user: { id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: 'ada.webp' } },
            {
              id: 'p-kwame',
              userId: KWAME,
              displayName: 'Kwame',
              firstName: 'Kwame',
              lastName: '',
              username: 'kwame',
              avatar: null,
              user: { id: KWAME, username: 'kwame', displayName: 'Kwame', firstName: 'Kwame', lastName: null, avatar: 'old.webp' },
            },
          ],
          lastMessage: { id: 'm-1', senderId: 'p-kwame', sender: { id: 'p-kwame', userId: KWAME, displayName: 'Kwame', username: 'kwame', avatar: 'old.webp' } },
        },
      ],
    },
  ],
  pageParams: [null],
});

type Row = Record<string, unknown> & { readonly user?: Record<string, unknown> };
type Cache = ReturnType<typeof conversationsPage>;

const seeded = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['conversations'], conversationsPage());
  queryClient.setQueryData(conversationMembersQueryKey('c-direct'), {
    members: [
      { id: 'p-ada', userId: 'u-ada', username: 'ada', displayName: 'Ada', avatar: 'ada.webp', role: 'member' },
      { id: 'p-kwame', userId: KWAME, username: 'kwame', displayName: 'Kwame', avatar: 'old.webp', role: 'member' },
    ],
    nextCursor: null,
    totalCount: 2,
  } satisfies ConversationMembersPage);
  queryClient.setQueryData(publicProfileQueryKey('kwame'), {
    profile: { id: KWAME, username: 'kwame', displayName: 'Kwame', firstName: 'Kwame', lastName: null, avatar: 'old.webp', banner: null },
    relation: 'none',
  });
  queryClient.setQueryData(['friends', 'list'], { users: [{ id: KWAME, username: 'kwame', displayName: 'Kwame', avatar: 'old.webp' }] });
  return queryClient;
};

const conversationOf = (queryClient: QueryClient) => queryClient.getQueryData<Cache>(['conversations'])?.pages[0]?.conversations[0];
const kwameRow = (queryClient: QueryClient) =>
  (conversationOf(queryClient)?.participants as readonly Row[] | undefined)?.find((row) => row.userId === KWAME);

describe('repaintProfile — la photo d’un PAIR (#8889)', () => {
  test('chaque copie qui le désigne prend la photo servie — participant, compte lié, expéditeur, membres, fiche, amis', () => {
    const queryClient = seeded();
    repaintProfile(queryClient, { userId: KWAME, avatar: 'new.webp' });

    expect(kwameRow(queryClient)?.user?.avatar).toBe('new.webp');
    expect(conversationOf(queryClient)?.lastMessage.sender.avatar).toBe('new.webp');
    const members = queryClient.getQueryData<ConversationMembersPage>(conversationMembersQueryKey('c-direct'))?.members ?? [];
    expect(members.map((member) => member.avatar)).toEqual(['ada.webp', 'new.webp']);
    expect(queryClient.getQueryData<{ profile: { avatar: string } }>(publicProfileQueryKey('kwame'))?.profile.avatar).toBe('new.webp');
    expect(queryClient.getQueryData<{ users: { avatar: string }[] }>(['friends', 'list'])?.users[0]?.avatar).toBe('new.webp');
  });

  test('les autres gardent leur photo, et une requête qui ne le porte pas garde son identité', () => {
    const queryClient = seeded();
    const others = { id: 'u-lina', avatar: 'lina.webp' };
    queryClient.setQueryData(['lina'], others);
    repaintProfile(queryClient, { userId: KWAME, avatar: 'new.webp' });

    const ada = (conversationOf(queryClient)?.participants as readonly Row[]).find((row) => row.userId === 'u-ada');
    expect(ada?.user?.avatar).toBe('ada.webp');
    expect(queryClient.getQueryData(['lina'])).toBe(others);
  });

  test('un changement de NOM seul ne touche aucune photo', () => {
    const queryClient = seeded();
    repaintProfile(queryClient, { userId: KWAME, name: KWAME_RENAMED });
    expect(kwameRow(queryClient)?.user?.avatar).toBe('old.webp');
  });
});

describe('repaintProfile — le NOM se propage comme la photo (#8890)', () => {
  test('la ligne de participant porte le nom COMPOSÉ — le titre d’une conversation directe suit', () => {
    const queryClient = seeded();
    repaintProfile(queryClient, { userId: KWAME, name: KWAME_RENAMED });

    const row = kwameRow(queryClient);
    expect(row?.displayName).toBe('Kwame Mensah');
    expect(row?.username).toBe('kwame_m');
    expect(row?.lastName).toBe('Mensah');
    expect(conversationOf(queryClient)?.lastMessage.sender.displayName).toBe('Kwame Mensah');
  });

  test('le compte lié porte le nom SERVI — un nom d’affichage effacé reste effacé', () => {
    const queryClient = seeded();
    repaintProfile(queryClient, { userId: KWAME, name: KWAME_RENAMED });

    expect(kwameRow(queryClient)?.user).toMatchObject({ displayName: null, firstName: 'Kwame', lastName: 'Mensah', username: 'kwame_m' });
    expect(queryClient.getQueryData<{ profile: Row }>(publicProfileQueryKey('kwame'))?.profile).toMatchObject({
      displayName: null,
      username: 'kwame_m',
    });
  });

  test('la liste des membres et la liste d’amis', () => {
    const queryClient = seeded();
    repaintProfile(queryClient, { userId: KWAME, name: { ...KWAME_RENAMED, displayName: 'K.M.' } });

    const members = queryClient.getQueryData<ConversationMembersPage>(conversationMembersQueryKey('c-direct'))?.members ?? [];
    expect(members.map((member) => member.displayName)).toEqual(['Ada', 'K.M.']);
    expect(members.map((member) => member.username)).toEqual(['ada', 'kwame_m']);
    expect(queryClient.getQueryData<{ users: Row[] }>(['friends', 'list'])?.users[0]).toMatchObject({ displayName: 'K.M.', username: 'kwame_m' });
  });

  test('un prénom EFFACÉ garde la forme de sa case : vide pour une chaîne, null pour un nul', () => {
    const queryClient = seeded();
    repaintProfile(queryClient, { userId: KWAME, name: { displayName: 'K', firstName: null, lastName: null, username: 'kwame' } });

    expect(kwameRow(queryClient)?.firstName).toBe('');
    expect(kwameRow(queryClient)?.user?.firstName).toBe('');
    expect(kwameRow(queryClient)?.user?.lastName).toBeNull();
  });

  test('un pair renommé ne renomme personne d’autre', () => {
    const queryClient = seeded();
    repaintProfile(queryClient, { userId: KWAME, name: KWAME_RENAMED });
    const ada = (conversationOf(queryClient)?.participants as readonly Row[]).find((row) => row.userId === 'u-ada');
    expect(ada?.displayName).toBe('Ada');
    expect(ada?.user?.username).toBe('ada');
  });
});
