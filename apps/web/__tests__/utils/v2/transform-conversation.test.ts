/**
 * Tests for utils/v2/transform-conversation.ts
 */

import {
  transformToConversationItem,
  transformConversations,
  groupConversationsByCategory,
} from '@/utils/v2/transform-conversation';

const t = (key: string, params?: Record<string, unknown>) => {
  if (params?.count !== undefined) return `${params.count} ${key}`;
  return key;
};

const makeConv = (overrides: Record<string, unknown> = {}): any => ({
  id: 'conv-1',
  type: 'direct',
  title: null,
  image: null,
  avatar: null,
  participants: [],
  lastMessage: null,
  createdAt: new Date().toISOString(),
  memberCount: null,
  unreadCount: 0,
  userPreferences: null,
  ...overrides,
});

const makeParticipant = (userId: string, overrides: Record<string, unknown> = {}): any => ({
  userId,
  type: 'registered',
  avatar: null,
  displayName: null,
  ...overrides,
});

const makeMessage = (overrides: Record<string, unknown> = {}): any => ({
  id: 'msg-1',
  content: 'Hello',
  createdAt: new Date().toISOString(),
  attachments: [],
  sender: null,
  ...overrides,
});

const baseOptions = { t, locale: 'fr', currentUserId: 'me' };

// ─── transformToConversationItem ──────────────────────────────────────────────

describe('transformToConversationItem', () => {
  it('maps id from conversation', () => {
    const item = transformToConversationItem(makeConv({ id: 'abc-123' }), baseOptions);
    expect(item.id).toBe('abc-123');
  });

  it('uses displayName from other participant for direct conv', () => {
    const participants = [
      makeParticipant('me'),
      makeParticipant('other', { user: { displayName: 'Alice', avatar: '/alice.jpg' } }),
    ];
    const item = transformToConversationItem(makeConv({ participants }), baseOptions);
    expect(item.name).toBe('Alice');
  });

  it('falls back to username if no displayName', () => {
    const participants = [
      makeParticipant('me'),
      makeParticipant('other', { user: { username: 'alice99' } }),
    ];
    const item = transformToConversationItem(makeConv({ participants }), baseOptions);
    expect(item.name).toBe('alice99');
  });

  it('uses title for group conversation', () => {
    const item = transformToConversationItem(
      makeConv({ type: 'group', title: 'Team Chat' }),
      baseOptions
    );
    expect(item.name).toBe('Team Chat');
    expect(item.isGroup).toBe(true);
    expect(item.languageCode).toBe('multi');
  });

  it('isGroup=true for public type', () => {
    const item = transformToConversationItem(makeConv({ type: 'public' }), baseOptions);
    expect(item.isGroup).toBe(true);
  });

  it('isGroup=true for global type', () => {
    const item = transformToConversationItem(makeConv({ type: 'global' }), baseOptions);
    expect(item.isGroup).toBe(true);
  });

  it('isOnline=true when other participant is online', () => {
    const participants = [
      makeParticipant('me'),
      makeParticipant('other-1'),
    ];
    const item = transformToConversationItem(
      makeConv({ participants }),
      { ...baseOptions, onlineUserIds: new Set(['other-1']) }
    );
    expect(item.isOnline).toBe(true);
  });

  it('isOnline=false for group conversation even if participant online', () => {
    const participants = [makeParticipant('me'), makeParticipant('other-1')];
    const item = transformToConversationItem(
      makeConv({ type: 'group', participants }),
      { ...baseOptions, onlineUserIds: new Set(['other-1']) }
    );
    expect(item.isOnline).toBe(false);
  });

  it('isTyping=true when other participant is typing', () => {
    const participants = [makeParticipant('me'), makeParticipant('typer')];
    const item = transformToConversationItem(
      makeConv({ participants }),
      { ...baseOptions, typingUserIds: new Set(['typer']) }
    );
    expect(item.isTyping).toBe(true);
  });

  it('returns unreadCount from conversation', () => {
    const item = transformToConversationItem(makeConv({ unreadCount: 5 }), baseOptions);
    expect(item.unreadCount).toBe(5);
  });

  it('defaults unreadCount to 0 when undefined', () => {
    const item = transformToConversationItem(makeConv({ unreadCount: undefined }), baseOptions);
    expect(item.unreadCount).toBe(0);
  });

  it('returns userPreferences: isPinned', () => {
    const item = transformToConversationItem(
      makeConv({ userPreferences: { isPinned: true } }),
      baseOptions
    );
    expect(item.isPinned).toBe(true);
  });

  it('returns userPreferences: isMuted', () => {
    const item = transformToConversationItem(
      makeConv({ userPreferences: { isMuted: true } }),
      baseOptions
    );
    expect(item.isMuted).toBe(true);
  });

  it('returns draft from userPreferences', () => {
    const item = transformToConversationItem(
      makeConv({ userPreferences: { draft: 'half written msg' } }),
      baseOptions
    );
    expect(item.draft).toBe('half written msg');
  });

  it('maps lastMessage text content', () => {
    const item = transformToConversationItem(
      makeConv({ lastMessage: makeMessage({ content: 'Hello world' }) }),
      baseOptions
    );
    expect(item.lastMessage?.content).toBe('Hello world');
    expect(item.lastMessage?.type).toBe('text');
  });

  it('returns photo type for image attachment', () => {
    const msg = makeMessage({
      attachments: [{ mimeType: 'image/jpeg', url: '/img.jpg' }],
    });
    const item = transformToConversationItem(makeConv({ lastMessage: msg }), baseOptions);
    expect(item.lastMessage?.type).toBe('photo');
  });

  it('returns voice type for audio attachment', () => {
    const msg = makeMessage({
      attachments: [{ mimeType: 'audio/mp3', url: '/voice.mp3' }],
    });
    const item = transformToConversationItem(makeConv({ lastMessage: msg }), baseOptions);
    expect(item.lastMessage?.type).toBe('voice');
  });

  it('returns file type for generic attachment', () => {
    const msg = makeMessage({
      attachments: [{ mimeType: 'application/pdf', url: '/doc.pdf' }],
    });
    const item = transformToConversationItem(makeConv({ lastMessage: msg }), baseOptions);
    expect(item.lastMessage?.type).toBe('file');
  });

  it('hasAnonymousParticipants for groups with anonymous members', () => {
    const participants = [
      makeParticipant('me'),
      { userId: null, type: 'anonymous', avatar: null, displayName: null },
    ];
    const item = transformToConversationItem(
      makeConv({ type: 'group', participants }),
      baseOptions
    );
    expect(item.hasAnonymousParticipants).toBe(true);
  });

  it('transforms tags with color', () => {
    const item = transformToConversationItem(
      makeConv({ tags: [{ id: 't1', name: 'Work', color: '#FF0000' }] }),
      baseOptions
    );
    expect(item.tags).toEqual([{ id: 't1', name: 'Work', color: '#FF0000' }]);
  });

  it('uses default gray color for tags without color', () => {
    const item = transformToConversationItem(
      makeConv({ tags: [{ id: 't2', name: 'Personal' }] }),
      baseOptions
    );
    expect(item.tags?.[0].color).toBe('#6B7280');
  });
});

// ─── formatRelativeTime (via transformToConversationItem) ─────────────────────

describe('formatRelativeTime', () => {
  it('returns timeCompact.now for < 1 minute ago', () => {
    const now = new Date();
    const msg = makeMessage({ createdAt: now.toISOString() });
    const item = transformToConversationItem(makeConv({ lastMessage: msg }), baseOptions);
    expect(item.lastMessage?.timestamp).toBe('timeCompact.now');
  });

  it('returns minutes key for < 60 minutes ago', () => {
    const past = new Date(Date.now() - 30 * 60000);
    const msg = makeMessage({ createdAt: past.toISOString() });
    const item = transformToConversationItem(makeConv({ lastMessage: msg }), baseOptions);
    expect(item.lastMessage?.timestamp).toContain('timeCompact.minutes');
  });

  it('returns hours key for same-day messages', () => {
    const past = new Date(Date.now() - 3 * 3600000);
    const msg = makeMessage({ createdAt: past.toISOString() });
    const item = transformToConversationItem(makeConv({ lastMessage: msg }), baseOptions);
    expect(item.lastMessage?.timestamp).toContain('timeCompact.hours');
  });

  it('returns days key for messages within the week', () => {
    const past = new Date(Date.now() - 3 * 86400000);
    const msg = makeMessage({ createdAt: past.toISOString() });
    const item = transformToConversationItem(makeConv({ lastMessage: msg }), baseOptions);
    expect(item.lastMessage?.timestamp).toContain('timeCompact.days');
  });

  it('returns empty string for undefined date', () => {
    const msg = makeMessage({ createdAt: undefined });
    const item = transformToConversationItem(makeConv({ lastMessage: msg }), baseOptions);
    expect(item.lastMessage?.timestamp).toBe('');
  });
});

// ─── transformConversations ───────────────────────────────────────────────────

describe('transformConversations', () => {
  it('returns empty array for empty input', () => {
    expect(transformConversations([], baseOptions)).toEqual([]);
  });

  it('maps each conversation', () => {
    const convs = [makeConv({ id: 'c1' }), makeConv({ id: 'c2' })];
    const result = transformConversations(convs, baseOptions);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('c1');
    expect(result[1].id).toBe('c2');
  });
});

// ─── groupConversationsByCategory ─────────────────────────────────────────────

describe('groupConversationsByCategory', () => {
  const makeItem = (overrides: Record<string, unknown> = {}): any => ({
    id: 'c1',
    isPinned: false,
    categoryId: undefined,
    ...overrides,
  });

  it('separates pinned conversations', () => {
    const items = [makeItem({ id: 'p1', isPinned: true }), makeItem({ id: 'u1' })];
    const { pinned, uncategorized } = groupConversationsByCategory(items);
    expect(pinned).toHaveLength(1);
    expect(pinned[0].id).toBe('p1');
    expect(uncategorized).toHaveLength(1);
  });

  it('groups conversations by categoryId', () => {
    const items = [
      makeItem({ id: 'c1', categoryId: 'work' }),
      makeItem({ id: 'c2', categoryId: 'work' }),
      makeItem({ id: 'c3', categoryId: 'personal' }),
    ];
    const { categorized } = groupConversationsByCategory(items);
    expect(categorized.get('work')).toHaveLength(2);
    expect(categorized.get('personal')).toHaveLength(1);
  });

  it('places uncategorized non-pinned conversations in uncategorized', () => {
    const items = [makeItem({ id: 'u1' }), makeItem({ id: 'u2' })];
    const { uncategorized } = groupConversationsByCategory(items);
    expect(uncategorized).toHaveLength(2);
  });

  it('returns empty groups for empty input', () => {
    const { pinned, categorized, uncategorized } = groupConversationsByCategory([]);
    expect(pinned).toHaveLength(0);
    expect(categorized.size).toBe(0);
    expect(uncategorized).toHaveLength(0);
  });
});
