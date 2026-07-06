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

function directConversationWithLastMessage(lastMessage: Record<string, unknown>): Conversation {
  return {
    id: 'conv_lm',
    type: 'direct',
    participants: [
      { userId: 'me', type: 'registered' },
      { userId: 'other', type: 'registered', user: { id: 'other', username: 'other' } },
    ],
    lastMessage,
  } as unknown as Conversation;
}

describe('transformToConversationItem — lastMessage type classification by attachment MIME', () => {
  const attachmentOf = (mimeType: string) => ({
    content: 'caption',
    createdAt: '2026-07-06T00:00:00.000Z',
    attachments: [{ mimeType }],
  });

  it('classifies image/* attachments as photo', () => {
    const item = transformToConversationItem(directConversationWithLastMessage(attachmentOf('image/png')), baseOptions);
    expect(item.lastMessage.type).toBe('photo');
  });

  it('classifies audio/* attachments as voice', () => {
    const item = transformToConversationItem(directConversationWithLastMessage(attachmentOf('audio/mp3')), baseOptions);
    expect(item.lastMessage.type).toBe('voice');
  });

  it('classifies video/* attachments as video (not the generic file)', () => {
    const item = transformToConversationItem(directConversationWithLastMessage(attachmentOf('video/mp4')), baseOptions);
    expect(item.lastMessage.type).toBe('video');
  });

  it('classifies other attachment types (e.g. application/pdf) as file', () => {
    const item = transformToConversationItem(directConversationWithLastMessage(attachmentOf('application/pdf')), baseOptions);
    expect(item.lastMessage.type).toBe('file');
  });

  it('classifies a message without attachments as text', () => {
    const item = transformToConversationItem(
      directConversationWithLastMessage({ content: 'hello', createdAt: '2026-07-06T00:00:00.000Z' }),
      baseOptions
    );
    expect(item.lastMessage.type).toBe('text');
  });
});
