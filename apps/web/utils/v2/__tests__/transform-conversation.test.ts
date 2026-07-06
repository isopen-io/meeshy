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
