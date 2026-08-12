import { truncateFilename, truncateText } from '@/utils/truncate';

describe('truncateFilename', () => {
  it('leaves short filenames untouched', () => {
    expect(truncateFilename('report.pdf')).toBe('report.pdf');
    expect(truncateFilename('report.pdf', 32)).toBe('report.pdf');
  });

  it('truncates the name while preserving the extension', () => {
    const out = truncateFilename('a-very-long-annual-report-name-2026.pdf', 20);
    expect(out.endsWith('.pdf')).toBe(true);
    expect(out).toContain('...');
    expect(out.length).toBe(20);
    expect(out.startsWith('....')).toBe(false);
  });

  it('never overflows maxLength for a filename with no extension', () => {
    const out = truncateFilename('averylongnamewithoutanyextensionhere', 16);
    expect(out).toContain('...');
    // Regression: the previous impl emitted "....{wholeName}" — longer than the input.
    expect(out.length).toBeLessThanOrEqual(16);
    expect(out.startsWith('....')).toBe(false);
    expect(out.endsWith('...')).toBe(true);
  });

  it('does not overflow when the extension alone exceeds the budget', () => {
    const out = truncateFilename('abcdefghijklmnop.superlongextension', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).toContain('...');
    expect(out.startsWith('....')).toBe(false);
  });

  it('treats a leading-dot dotfile as having no usable extension', () => {
    const out = truncateFilename('.averylonghiddenconfigfilename', 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.endsWith('...')).toBe(true);
  });

  it('hard-truncates without an ellipsis when maxLength is too small to hold one', () => {
    // "..." needs 3 chars + at least 1 content char = 4. Below that, an ellipsis
    // form can only overflow, so degrade gracefully to a bare slice.
    for (const max of [1, 2, 3]) {
      expect(truncateFilename('abcdef', max)).toBe('abcdef'.slice(0, max));
      expect(truncateFilename('a.pdf', max)).toBe('a.pdf'.slice(0, max));
      expect(truncateFilename('abcdef', max).length).toBe(max);
      expect(truncateFilename('a.pdf', max).length).toBe(max);
    }
  });

  it('never exceeds maxLength across mixed names and budgets', () => {
    const names = ['Makefile', 'no_ext_at_all_here_very_long', 'x.tar.gz', 'déjà-vu-café.pdf', 'file.superextralongextension'];
    for (const name of names) {
      for (const max of [1, 2, 3, 8, 12, 16, 20, 32]) {
        const out = truncateFilename(name, max);
        if (name.length <= max) {
          expect(out).toBe(name);
        } else {
          expect(out.length).toBeLessThanOrEqual(max);
          expect(out.startsWith('....')).toBe(false);
        }
      }
    }
  });

  it('never emits a lone surrogate when the cut lands inside an astral char', () => {
    // 🎉 is a surrogate PAIR (2 UTF-16 units). A raw .slice() cut between them
    // yields a lone high surrogate → a broken "�" glyph. The truncation must cut
    // on a code-point boundary (drop the whole emoji), like the sibling initials.ts.
    // maxLength 18 → name budget 11 → a raw slice cuts BETWEEN 🎉's two units.
    const out = truncateFilename('aaaaaaaaaa🎉bbbbbbbbbb.pdf', 18);
    expect(out.endsWith('.pdf')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(18);
    // No unpaired surrogate anywhere in the output.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false);
  });
});

describe('truncateText', () => {
  it('reports not-truncated for short text', () => {
    expect(truncateText('hello', 10)).toEqual({ truncated: 'hello', isTruncated: false });
  });

  it('truncates and flags long text, trimming trailing space', () => {
    expect(truncateText('hello world foo', 6)).toEqual({ truncated: 'hello...', isTruncated: true });
  });

  it('treats exact-length text as not truncated', () => {
    expect(truncateText('abcdef', 6)).toEqual({ truncated: 'abcdef', isTruncated: false });
  });

  it('truncates at the maxLength + 1 boundary', () => {
    expect(truncateText('abcdefg', 6)).toEqual({ truncated: 'abcdef...', isTruncated: true });
  });

  // CONTRACT: maxLength is a CONTENT budget — the ellipsis is appended on top, so
  // the returned string can legitimately exceed maxLength by the ellipsis length.
  // This is the core distinction from truncateFilename and must stay pinned so a
  // future "unify the two helpers" refactor can't silently clamp it.
  it('appends the ellipsis on top of the content budget (output may exceed maxLength)', () => {
    const { truncated } = truncateText('abcdefghij', 6);
    expect(truncated).toBe('abcdef...');
    expect(truncated.length).toBe(9); // 6 content + 3 ellipsis > maxLength
    expect(truncated.length).toBeGreaterThan(6);
  });

  it('trims a trailing space before the ellipsis', () => {
    // slice(0, 6) of "hello world" is "hello " (trailing space) → trimmed to "hello".
    expect(truncateText('hello world', 6)).toEqual({ truncated: 'hello...', isTruncated: true });
  });

  it('counts astral chars as one and never splits a surrogate pair', () => {
    // Budget is a CONTENT budget in characters (code points). Five 🎉 = 5 chars,
    // so a budget of 5 keeps them all; a budget of 3 keeps exactly three whole
    // emoji — never a lone surrogate.
    expect(truncateText('🎉🎉🎉🎉🎉', 5)).toEqual({ truncated: '🎉🎉🎉🎉🎉', isTruncated: false });
    const { truncated, isTruncated } = truncateText('🎉🎉🎉🎉🎉', 3);
    expect(isTruncated).toBe(true);
    expect(truncated).toBe('🎉🎉🎉...');
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(truncated)).toBe(false);
  });

  // Explicit contrast: SAME input + budget, opposite length guarantees.
  it('contrasts with truncateFilename: content-budget (may exceed) vs total-budget (never exceeds)', () => {
    const input = 'abcdefghij';
    const budget = 6;

    const text = truncateText(input, budget).truncated;
    expect(text.length).toBeGreaterThan(budget); // truncateText: content budget + ellipsis

    const filename = truncateFilename(input, budget);
    expect(filename.length).toBeLessThanOrEqual(budget); // truncateFilename: never exceeds
  });
});
