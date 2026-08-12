import { createTrackingLinkSchema } from '../../../../routes/tracking-links/types';
import { isHttpUrl } from '@meeshy/shared/utils/validation';

/**
 * `originalUrl` is the destination every reader of a tracking link is sent to.
 * Zod's `z.url()` only asks that the value PARSE as a URL — `javascript:` and
 * `data:` parse fine. Stored unchallenged, such a link turns any conversation
 * into a script-execution primitive against whoever clicks it, so the scheme
 * has to be constrained where the link is minted, not only where it is read.
 */
const DANGEROUS_URLS = [
  'javascript:alert(document.domain)',
  'JavaScript:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'blob:https://meeshy.me/1234',
];

const LEGITIMATE_URLS = [
  'https://example.com/promo?utm=1',
  'http://example.com/',
  'https://meeshy.me/post/507f1f77bcf86cd799439011',
];

describe('createTrackingLinkSchema originalUrl scheme', () => {
  it.each(DANGEROUS_URLS)('rejects %s', (originalUrl) => {
    expect(createTrackingLinkSchema.safeParse({ originalUrl }).success).toBe(false);
  });

  it.each(LEGITIMATE_URLS)('accepts %s', (originalUrl) => {
    expect(createTrackingLinkSchema.safeParse({ originalUrl }).success).toBe(true);
  });

  it('still rejects values that are not URLs at all', () => {
    expect(createTrackingLinkSchema.safeParse({ originalUrl: 'not a url' }).success).toBe(false);
    expect(createTrackingLinkSchema.safeParse({ originalUrl: '' }).success).toBe(false);
  });
});

// The edit route validates imperatively rather than through a Zod schema; it
// shares this predicate so editing a link cannot reopen what creating one forbids.
describe('isHttpUrl (guard shared with the tracking-link edit route)', () => {
  it.each(DANGEROUS_URLS)('rejects %s', (originalUrl) => {
    expect(isHttpUrl(originalUrl)).toBe(false);
  });

  it.each(LEGITIMATE_URLS)('accepts %s', (originalUrl) => {
    expect(isHttpUrl(originalUrl)).toBe(true);
  });

  it('rejects non-string and empty values', () => {
    expect(isHttpUrl(undefined)).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
  });
});
