import { truncateByCodePoints } from '../truncate-text';

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;

const containsLoneSurrogate = (value: string): boolean => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= HIGH_SURROGATE_START && code <= HIGH_SURROGATE_END) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= LOW_SURROGATE_START && next <= LOW_SURROGATE_END)) return true;
      i += 1;
      continue;
    }
    if (code >= LOW_SURROGATE_START && code <= LOW_SURROGATE_END) return true;
  }
  return false;
};

describe('truncateByCodePoints', () => {
  it('never emits a lone surrogate when the cap falls inside a surrogate pair', () => {
    // 99 ASCII chars then an emoji: code unit 100 splits the pair with substring().
    const content = 'a'.repeat(99) + '😀' + ' tail that is long enough to require cutting';
    const result = truncateByCodePoints(content, 100, '…');

    // The emoji is the 100th code point: kept whole, never split into an orphan.
    expect(containsLoneSurrogate(result)).toBe(false);
    expect(result).toBe('a'.repeat(99) + '😀' + '…');
  });

  it('stops before a boundary emoji that would be the (cap+1)th code point', () => {
    // 100 ASCII then the emoji: substring(0,100) would end mid-'a'/emoji cleanly,
    // but substring(0,101) would split the pair. Cap 100 keeps 100 'a', no emoji.
    const content = 'a'.repeat(100) + '😀 more';
    const result = truncateByCodePoints(content, 101, '…');

    expect(containsLoneSurrogate(result)).toBe(false);
    expect(result).toBe('a'.repeat(100) + '😀' + '…');
  });

  it('drops (never splits) the boundary emoji in a hard cap with no suffix', () => {
    const content = 'ab😀cd';
    // Cap at 3 code points: 'a', 'b', '😀' → keep the whole emoji.
    expect(truncateByCodePoints(content, 3)).toBe('ab😀');
    // Cap at 2 code points: 'a', 'b' → stop before the emoji, no orphan.
    expect(truncateByCodePoints(content, 2)).toBe('ab');
    expect(containsLoneSurrogate(truncateByCodePoints(content, 2))).toBe(false);
  });

  it('counts the cap in code points, not UTF-16 code units', () => {
    const emoji = '😀'.repeat(60); // 60 code points, 120 code units
    // 60 code points <= 100 cap ⇒ returned unchanged (no false truncation).
    expect(truncateByCodePoints(emoji, 100, '…')).toBe(emoji);
  });

  it('appends the ellipsis only when the content is actually truncated', () => {
    expect(truncateByCodePoints('short', 100, '…')).toBe('short');
    expect(truncateByCodePoints('abcdef', 3, '…')).toBe('abc…');
  });

  it('returns the input unchanged when at or under the cap', () => {
    expect(truncateByCodePoints('abc', 3)).toBe('abc');
    expect(truncateByCodePoints('', 100)).toBe('');
  });

  it('defaults to an empty suffix (pure cap)', () => {
    expect(truncateByCodePoints('abcdef', 3)).toBe('abc');
  });
});
