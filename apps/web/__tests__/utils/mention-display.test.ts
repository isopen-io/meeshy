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

  it('maps username→displayName when displayName differs from username', () => {
    const map = buildMentionDisplayMap([
      { username: 'alice99', displayName: 'Alice Smith' } as any,
    ]);
    expect(map.get('alice99')).toBe('Alice Smith');
  });

  it('skips entries where displayName equals username', () => {
    const map = buildMentionDisplayMap([
      { username: 'bob', displayName: 'bob' } as any,
    ]);
    expect(map.has('bob')).toBe(false);
  });

  it('skips entries without displayName', () => {
    const map = buildMentionDisplayMap([
      { username: 'charlie', displayName: undefined } as any,
    ]);
    expect(map.has('charlie')).toBe(false);
  });

  it('keys are lowercased for case-insensitive lookup', () => {
    const map = buildMentionDisplayMap([
      { username: 'DaveUpper', displayName: 'Dave U' } as any,
    ]);
    expect(map.get('daveupper')).toBe('Dave U');
  });

  it('handles multiple entries', () => {
    const map = buildMentionDisplayMap([
      { username: 'alice', displayName: 'Alice' } as any,
      { username: 'bob', displayName: 'Robert' } as any,
    ]);
    expect(map.size).toBe(2);
    expect(map.get('alice')).toBe('Alice');
    expect(map.get('bob')).toBe('Robert');
  });
});

// ─── resolveDisplayContent ────────────────────────────────────────────────────

describe('resolveDisplayContent', () => {
  const makeMap = (entries: [string, string][]): Map<string, string> => new Map(entries);

  it('returns content unchanged when no mentions', () => {
    expect(resolveDisplayContent('Hello world', new Map())).toBe('Hello world');
  });

  it('replaces @mention with displayName from map', () => {
    const map = makeMap([['alice99', 'Alice Smith']]);
    expect(resolveDisplayContent('Hi @alice99!', map)).toBe('Hi @Alice Smith!');
  });

  it('leaves mention unchanged when not in map', () => {
    expect(resolveDisplayContent('Hi @unknown!', new Map())).toBe('Hi @unknown!');
  });

  it('is case-insensitive for lookup', () => {
    const map = makeMap([['alice99', 'Alice']]);
    expect(resolveDisplayContent('Hi @ALICE99', map)).toBe('Hi @Alice');
  });

  it('replaces multiple mentions in a single string', () => {
    const map = makeMap([['alice', 'Alice'], ['bob', 'Robert']]);
    expect(resolveDisplayContent('@alice and @bob', map)).toBe('@Alice and @Robert');
  });

  it('limits mention match to max 30 word-chars', () => {
    const longUsername = 'a'.repeat(30);
    const map = makeMap([[longUsername, 'Long Name']]);
    expect(resolveDisplayContent(`@${longUsername}`, map)).toBe('@Long Name');
  });
});
