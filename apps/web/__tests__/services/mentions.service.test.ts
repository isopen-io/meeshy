import { mentionsService } from '@/services/mentions.service';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: { get: jest.fn() },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

const VALID_CONV_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VALID_MSG_ID = 'b1c2d3e4f5a6b1c2d3e4f5a6';

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    avatar: null,
    badge: 'conversation' as const,
    inConversation: true,
    isFriend: false,
    ...overrides,
  };
}

function makeMentionItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mention-1',
    messageId: VALID_MSG_ID,
    mentionedUserId: 'user-1',
    mentionedAt: new Date('2025-01-01'),
    mentionedUser: { id: 'user-1', username: 'alice', displayName: 'Alice', avatar: null },
    ...overrides,
  };
}

function makeUserMention(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mention-2',
    messageId: VALID_MSG_ID,
    mentionedAt: new Date('2025-01-01'),
    message: {
      id: VALID_MSG_ID,
      content: 'hello @alice',
      conversationId: VALID_CONV_ID,
      senderId: 'participant-1',
      createdAt: new Date('2025-01-01'),
      sender: { id: 'participant-1', username: 'bob', displayName: 'Bob', avatar: null },
      conversation: { id: VALID_CONV_ID, title: 'Group Chat', type: 'GROUP' },
    },
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('mentionsService.getSuggestions', () => {
  it('returns empty array for invalid conversationId (not 24-char hex)', async () => {
    const result = await mentionsService.getSuggestions('not-valid-id');
    expect(result).toEqual([]);
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('returns empty array for conversationId shorter than 24 chars', async () => {
    const result = await mentionsService.getSuggestions('a1b2c3');
    expect(result).toEqual([]);
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('calls correct endpoint with conversationId', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } } as any);

    await mentionsService.getSuggestions(VALID_CONV_ID);

    expect(mockApi.get).toHaveBeenCalledWith(
      '/mentions/suggestions',
      expect.objectContaining({ conversationId: VALID_CONV_ID })
    );
  });

  it('includes query param when provided', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } } as any);

    await mentionsService.getSuggestions(VALID_CONV_ID, 'alice');

    expect(mockApi.get).toHaveBeenCalledWith(
      '/mentions/suggestions',
      expect.objectContaining({ conversationId: VALID_CONV_ID, query: 'alice' })
    );
  });

  it('does not include query param when not provided', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } } as any);

    await mentionsService.getSuggestions(VALID_CONV_ID);

    const callArgs = mockApi.get.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('query');
  });

  it('returns suggestions array on success', async () => {
    const suggestions = [makeSuggestion()];
    mockApi.get.mockResolvedValue({ data: { success: true, data: suggestions } } as any);

    const result = await mentionsService.getSuggestions(VALID_CONV_ID);

    expect(result).toEqual(suggestions);
  });

  it('returns empty array when success is false', async () => {
    mockApi.get.mockResolvedValue({ data: { success: false, data: null } } as any);

    const result = await mentionsService.getSuggestions(VALID_CONV_ID);

    expect(result).toEqual([]);
  });

  it('returns empty array when response.data is undefined', async () => {
    mockApi.get.mockResolvedValue({ data: undefined } as any);

    const result = await mentionsService.getSuggestions(VALID_CONV_ID);

    expect(result).toEqual([]);
  });

  it('returns empty array and swallows error on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('network error'));

    const result = await mentionsService.getSuggestions(VALID_CONV_ID);

    expect(result).toEqual([]);
  });
});

describe('mentionsService.getMessageMentions', () => {
  it('calls correct endpoint with messageId', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } } as any);

    await mentionsService.getMessageMentions(VALID_MSG_ID);

    expect(mockApi.get).toHaveBeenCalledWith(`/mentions/messages/${VALID_MSG_ID}`);
  });

  it('returns mention items on success', async () => {
    const items = [makeMentionItem()];
    mockApi.get.mockResolvedValue({ data: { success: true, data: items } } as any);

    const result = await mentionsService.getMessageMentions(VALID_MSG_ID);

    expect(result).toEqual(items);
  });

  it('returns empty array when success is false', async () => {
    mockApi.get.mockResolvedValue({ data: { success: false } } as any);

    const result = await mentionsService.getMessageMentions(VALID_MSG_ID);

    expect(result).toEqual([]);
  });

  it('returns empty array and swallows error on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('timeout'));

    const result = await mentionsService.getMessageMentions(VALID_MSG_ID);

    expect(result).toEqual([]);
  });
});

describe('mentionsService.getUserMentions', () => {
  it('calls /mentions/me with default limit', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } } as any);

    await mentionsService.getUserMentions();

    expect(mockApi.get).toHaveBeenCalledWith('/mentions/me', { limit: 50 });
  });

  it('calls /mentions/me with custom limit', async () => {
    mockApi.get.mockResolvedValue({ data: { success: true, data: [] } } as any);

    await mentionsService.getUserMentions(10);

    expect(mockApi.get).toHaveBeenCalledWith('/mentions/me', { limit: 10 });
  });

  it('returns user mention items on success', async () => {
    const mentions = [makeUserMention()];
    mockApi.get.mockResolvedValue({ data: { success: true, data: mentions } } as any);

    const result = await mentionsService.getUserMentions();

    expect(result).toEqual(mentions);
  });

  it('returns empty array when success is false', async () => {
    mockApi.get.mockResolvedValue({ data: { success: false, data: null } } as any);

    const result = await mentionsService.getUserMentions();

    expect(result).toEqual([]);
  });

  it('returns empty array and swallows error on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('server down'));

    const result = await mentionsService.getUserMentions();

    expect(result).toEqual([]);
  });
});

describe('mentionsService.hasMentions', () => {
  it('returns true for message containing @username', () => {
    expect(mentionsService.hasMentions('hello @alice!')).toBe(true);
  });

  it('returns true for message with multiple mentions', () => {
    expect(mentionsService.hasMentions('@bob and @carol')).toBe(true);
  });

  it('returns false for message with no mentions', () => {
    expect(mentionsService.hasMentions('hello world')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(mentionsService.hasMentions('')).toBe(false);
  });

  it('detects an accented @DisplayName (Unicode parity with parseMentions)', () => {
    expect(mentionsService.hasMentions('coucou @Éric')).toBe(true);
    expect(mentionsService.hasMentions('salut @André Tabeth')).toBe(true);
  });

  it('does not treat an email address (@ followed by space) as a mention', () => {
    expect(mentionsService.hasMentions('write to test@ domain.com')).toBe(false);
  });
});

describe('mentionsService.extractMentions', () => {
  it('returns array of usernames without @ prefix', () => {
    expect(mentionsService.extractMentions('hello @alice and @bob')).toEqual(['alice', 'bob']);
  });

  it('returns single username', () => {
    expect(mentionsService.extractMentions('@carol')).toEqual(['carol']);
  });

  it('returns empty array when no mentions', () => {
    expect(mentionsService.extractMentions('no mentions here')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(mentionsService.extractMentions('')).toEqual([]);
  });

  it('handles underscore and digits in username', () => {
    expect(mentionsService.extractMentions('@user_42 hello')).toEqual(['user_42']);
  });
});
