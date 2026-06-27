/**
 * Tests for utils/mention-display.ts
 */

import { buildMentionDisplayMap, resolveDisplayContent } from '@/utils/mention-display';

// ─── buildMentionDisplayMap ───────────────────────────────────────────────────

describe('buildMentionDisplayMap', () => {
  it('returns an empty Map for empty input', () => {
    const map = buildMentionDisplayMap([]);
    expect(map.size).toBe(0);
  });

  it('maps username to displayName when they differ', () => {
    const map = buildMentionDisplayMap([
      { username: 'alice', displayName: 'Alice Smith' } as any,
    ]);
    expect(map.get('alice')).toBe('Alice Smith');
  });

  it('excludes entries where displayName equals username', () => {
    const map = buildMentionDisplayMap([
      { username: 'alice', displayName: 'alice' } as any,
    ]);
    expect(map.has('alice')).toBe(false);
  });

  it('excludes entries with no displayName', () => {
    const map = buildMentionDisplayMap([
      { username: 'alice', displayName: undefined } as any,
    ]);
    expect(map.has('alice')).toBe(false);
  });

  it('lowercases the username key', () => {
    const map = buildMentionDisplayMap([
      { username: 'Alice', displayName: 'Alice Smith' } as any,
    ]);
    expect(map.get('alice')).toBe('Alice Smith');
  });

  it('handles multiple users', () => {
    const map = buildMentionDisplayMap([
      { username: 'alice', displayName: 'Alice' } as any,
      { username: 'bob', displayName: 'Bob Jones' } as any,
    ]);
    expect(map.size).toBe(2);
    expect(map.get('bob')).toBe('Bob Jones');
  });
});

// ─── resolveDisplayContent ────────────────────────────────────────────────────

describe('resolveDisplayContent', () => {
  it('replaces @username with displayName from map', () => {
    const map = new Map([['alice', 'Alice Smith']]);
    expect(resolveDisplayContent('Hello @alice!', map)).toBe('Hello @Alice Smith!');
  });

  it('leaves @username unchanged when not in map', () => {
    const map = new Map<string, string>();
    expect(resolveDisplayContent('Hello @alice!', map)).toBe('Hello @alice!');
  });

  it('handles multiple mentions', () => {
    const map = new Map([['alice', 'Alice'], ['bob', 'Bob Jones']]);
    const result = resolveDisplayContent('@alice and @bob', map);
    expect(result).toBe('@Alice and @Bob Jones');
  });

  it('is case-insensitive for mention lookup', () => {
    const map = new Map([['alice', 'Alice Smith']]);
    // buildMentionDisplayMap lowercases, resolveDisplayContent should also lower
    expect(resolveDisplayContent('Hello @Alice!', map)).toBe('Hello @Alice Smith!');
  });

  it('returns content unchanged when there are no mentions', () => {
    const map = new Map([['alice', 'Alice']]);
    expect(resolveDisplayContent('No mentions here', map)).toBe('No mentions here');
  });

  it('handles empty content', () => {
    const map = new Map([['alice', 'Alice']]);
    expect(resolveDisplayContent('', map)).toBe('');
  });

  it('handles empty map', () => {
    const map = new Map<string, string>();
    expect(resolveDisplayContent('@anyone here', map)).toBe('@anyone here');
  });
});
