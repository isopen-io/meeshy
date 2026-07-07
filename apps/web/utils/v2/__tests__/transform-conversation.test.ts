import { transformToConversationItem } from '../transform-conversation';
import type { Conversation } from '@meeshy/shared/types';

const t = (key: string) => key;

const baseOptions = {
  currentUserId: 'me',
  t,
  locale: 'fr',
};

function directConversationWithOtherUser(user: Record<string, unknown>): Conversation {
  return {
    id: 'conv_1',
    type: 'direct',
    participants: [
      { userId: 'me', type: 'registered' },
      { userId: 'other', type: 'registered', user: { id: 'other', ...user } },
    ],
  } as unknown as Conversation;
}

describe('transformToConversationItem — direct conversation name resolution (SSOT)', () => {
  it('prefers displayName when present', () => {
    const item = transformToConversationItem(
      directConversationWithOtherUser({ displayName: 'Ali', firstName: 'Alice', lastName: 'Martin', username: 'amartin_99' }),
      baseOptions
    );
    expect(item.name).toBe('Ali');
  });

  it('falls back to firstName + lastName BEFORE username (regression: username must not win)', () => {
    const item = transformToConversationItem(
      directConversationWithOtherUser({ displayName: null, firstName: 'Alice', lastName: 'Martin', username: 'amartin_99' }),
      baseOptions
    );
    expect(item.name).toBe('Alice Martin');
  });

  it('uses firstName alone when lastName is missing', () => {
    const item = transformToConversationItem(
      directConversationWithOtherUser({ firstName: 'Alice', username: 'amartin_99' }),
      baseOptions
    );
    expect(item.name).toBe('Alice');
  });

  it('falls back to username only when no display/first/last name exist', () => {
    const item = transformToConversationItem(
      directConversationWithOtherUser({ username: 'amartin_99' }),
      baseOptions
    );
    expect(item.name).toBe('amartin_99');
  });

  it('falls back to the participant-level nickname/title when the user object is empty', () => {
    const conversation = {
      id: 'conv_2',
      type: 'direct',
      title: 'Titre de secours',
      participants: [
        { userId: 'me', type: 'registered' },
        { userId: 'other', type: 'anonymous', nickname: 'Anon' },
      ],
    } as unknown as Conversation;
    const item = transformToConversationItem(conversation, baseOptions);
    expect(item.name).toBe('Anon');
  });
});

describe('transformToConversationItem — group last-message senderName (SSOT)', () => {
  function groupConversationWithLastMessageSender(sender: Record<string, unknown>): Conversation {
    return {
      id: 'conv_group',
      type: 'group',
      title: 'Groupe',
      participants: [{ userId: 'me', type: 'registered' }],
      lastMessage: {
        content: 'coucou',
        createdAt: '2024-01-01T00:00:00.000Z',
        sender,
      },
    } as unknown as Conversation;
  }

  it('prefers the sender displayName when present', () => {
    const item = transformToConversationItem(
      groupConversationWithLastMessageSender({ displayName: 'Ali', firstName: 'Alice', lastName: 'Martin', username: 'amartin_99' }),
      baseOptions
    );
    expect(item.lastMessage?.senderName).toBe('Ali');
  });

  it('falls back to firstName + lastName when the sender has no displayName (regression: no longer undefined)', () => {
    const item = transformToConversationItem(
      groupConversationWithLastMessageSender({ displayName: null, firstName: 'Alice', lastName: 'Martin', username: 'amartin_99' }),
      baseOptions
    );
    expect(item.lastMessage?.senderName).toBe('Alice Martin');
  });

  it('falls back to username when the sender has only a username', () => {
    const item = transformToConversationItem(
      groupConversationWithLastMessageSender({ username: 'amartin_99' }),
      baseOptions
    );
    expect(item.lastMessage?.senderName).toBe('amartin_99');
  });
});
