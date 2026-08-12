import { buildMentionDisplayMap, resolveDisplayContent } from '@/utils/mention-display';
import type { MentionedUser } from '@meeshy/shared/types/mention';

const user = (username: string, displayName: string | null): MentionedUser => ({
  userId: `id-${username}`,
  username,
  displayName,
  avatar: null,
});

describe('buildMentionDisplayMap', () => {
  it('maps username → displayName (lowercased key) when they differ', () => {
    const map = buildMentionDisplayMap([user('alice', 'Alice Cooper')]);
    expect(map.get('alice')).toBe('Alice Cooper');
  });

  it('skips users whose displayName equals the username', () => {
    const map = buildMentionDisplayMap([user('bob', 'bob')]);
    expect(map.has('bob')).toBe(false);
  });

  it('skips users without a displayName', () => {
    const map = buildMentionDisplayMap([user('carol', null)]);
    expect(map.has('carol')).toBe(false);
  });
});

describe('resolveDisplayContent', () => {
  const map = buildMentionDisplayMap([
    user('alice', 'Alice Cooper'),
    user('marie-claire', 'Marie Claire'),
  ]);

  it('replaces a mention with the display name', () => {
    expect(resolveDisplayContent('hey @alice', map)).toBe('hey @Alice Cooper');
  });

  it('resolves a hyphenated username without truncating at the hyphen', () => {
    expect(resolveDisplayContent('cc @marie-claire', map)).toBe('cc @Marie Claire');
  });

  it('leaves an unmapped mention untouched', () => {
    expect(resolveDisplayContent('hey @bob', map)).toBe('hey @bob');
  });

  it('does NOT rewrite an @ glued after a word (email address) — SSOT boundary parity', () => {
    // `bob@alice.com` : le `@` fait partie de l'e-mail — ne doit pas devenir `bob@Alice Cooper.com`.
    expect(resolveDisplayContent('mail bob@alice.com', map)).toBe('mail bob@alice.com');
  });

  it('resolves a real mention but leaves an adjacent email fragment intact', () => {
    expect(resolveDisplayContent('cc @alice et bob@alice.com', map))
      .toBe('cc @Alice Cooper et bob@alice.com');
  });
});
