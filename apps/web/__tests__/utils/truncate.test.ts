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
    expect(out.length).toBeLessThanOrEqual(20);
  });

  it('handles a filename with no extension', () => {
    const out = truncateFilename('averylongnamewithoutanyextensionhere', 16);
    expect(out).toContain('...');
  });

  it('never returns a string longer than the input for an extensionless name', () => {
    const input = 'finalpresentationdocument';
    const out = truncateFilename(input, 15);
    expect(out.length).toBeLessThanOrEqual(15);
    expect(out.length).toBeLessThanOrEqual(input.length);
    // Must not fabricate a bogus extension separator for a name that has none.
    expect(out.startsWith('....')).toBe(false);
  });

  it('clamps to maxLength when the extension is longer than the budget', () => {
    const out = truncateFilename('report.superlongextension', 12);
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it('handles dotfiles (a leading dot is not an extension)', () => {
    const out = truncateFilename('.gitignore-with-a-very-long-name', 10);
    expect(out.length).toBeLessThanOrEqual(10);
  });

  it('handles a trailing dot without emitting an empty extension', () => {
    const out = truncateFilename('myfilename-that-is-long.', 10);
    expect(out.length).toBeLessThanOrEqual(10);
    // The ellipsis ('...') legitimately ends with a dot; what must NOT happen is
    // an empty extension appended after it (a dangling fourth dot).
    expect(out.endsWith('....')).toBe(false);
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
