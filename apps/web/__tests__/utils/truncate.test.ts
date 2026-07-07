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
});
