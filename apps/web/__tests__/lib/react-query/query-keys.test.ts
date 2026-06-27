/**
 * Tests for lib/react-query/query-keys.ts
 */

import { queryKeys } from '@/lib/react-query/query-keys';

// ─── conversations ────────────────────────────────────────────────────────────

describe('queryKeys.conversations', () => {
  it('all is the base key', () => {
    expect(queryKeys.conversations.all).toEqual(['conversations']);
  });

  it('lists() nests under all', () => {
    expect(queryKeys.conversations.lists()).toEqual(['conversations', 'list']);
  });

  it('detail(id) includes the id', () => {
    const key = queryKeys.conversations.detail('c1');
    expect(key).toContain('c1');
    expect(key[0]).toBe('conversations');
  });

  it('participants(conversationId) includes conversationId', () => {
    const key = queryKeys.conversations.participants('c2');
    expect(key).toContain('c2');
    expect(key).toContain('participants');
  });

  it('list(filters) includes filters object', () => {
    const filters = { type: 'group', search: 'test' };
    const key = queryKeys.conversations.list(filters);
    expect(key).toContain(filters);
  });
});

// ─── messages ─────────────────────────────────────────────────────────────────

describe('queryKeys.messages', () => {
  it('all is the base key', () => {
    expect(queryKeys.messages.all).toEqual(['messages']);
  });

  it('list(conversationId) includes the conversationId', () => {
    const key = queryKeys.messages.list('conv1');
    expect(key).toContain('conv1');
  });

  it('infinite(conversationId) includes conversationId and infinite marker', () => {
    const key = queryKeys.messages.infinite('conv1');
    expect(key).toContain('conv1');
    expect(key).toContain('infinite');
  });

  it('statusDetails(messageId) includes messageId', () => {
    const key = queryKeys.messages.statusDetails('msg1');
    expect(key).toContain('msg1');
    expect(key).toContain('status-details');
  });
});

// ─── users ────────────────────────────────────────────────────────────────────

describe('queryKeys.users', () => {
  it('all is the base key', () => {
    expect(queryKeys.users.all).toEqual(['users']);
  });

  it('current() nests under all', () => {
    const key = queryKeys.users.current();
    expect(key[0]).toBe('users');
    expect(key).toContain('current');
  });

  it('detail(id) includes the id', () => {
    const key = queryKeys.users.detail('u1');
    expect(key).toContain('u1');
  });

  it('settings() nests under current', () => {
    const key = queryKeys.users.settings();
    expect(key).toContain('settings');
    expect(key[0]).toBe('users');
  });
});

// ─── preferences ──────────────────────────────────────────────────────────────

describe('queryKeys.preferences', () => {
  it('all is the base key', () => {
    expect(queryKeys.preferences.all).toEqual(['user-preferences']);
  });

  it('category(cat) includes the category', () => {
    const key = queryKeys.preferences.category('notification');
    expect(key).toContain('notification');
  });

  it('conversation(id) includes the conversationId', () => {
    const key = queryKeys.preferences.conversation('c1');
    expect(key).toContain('c1');
  });
});

// ─── posts ────────────────────────────────────────────────────────────────────

describe('queryKeys.posts', () => {
  it('all is the base key', () => {
    expect(queryKeys.posts.all).toEqual(['posts']);
  });

  it('detail(id) includes the id', () => {
    const key = queryKeys.posts.detail('p1');
    expect(key).toContain('p1');
  });

  it('comments(postId) includes the postId', () => {
    const key = queryKeys.posts.comments('p1');
    expect(key).toContain('p1');
    expect(key).toContain('comments');
  });

  it('feed() nests under lists', () => {
    const key = queryKeys.posts.feed();
    expect(key).toContain('feed');
    expect(key[0]).toBe('posts');
  });
});
