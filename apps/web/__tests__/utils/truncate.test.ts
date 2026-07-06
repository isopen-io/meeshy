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
