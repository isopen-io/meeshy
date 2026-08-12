/**
 * isUrlOnly Unit Tests
 *
 * A "URL-only" content carries no translatable text — it must skip translation
 * so links are preserved verbatim (NLLB would corrupt them). Mixed content
 * (text + link) still translates.
 */

import { isUrlOnly } from '../../../utils/url-content';

describe('isUrlOnly', () => {
  it('returns true for a bare YouTube link (with tracking param)', () => {
    expect(isUrlOnly('https://youtu.be/_AnF5eskiNQ?si=SX6_KUjHW8Zzt5mm')).toBe(true);
  });

  it('returns true for multiple links surrounded by whitespace', () => {
    expect(isUrlOnly('  https://a.com   https://b.com/x?y=1  ')).toBe(true);
  });

  it('returns false for mixed text + link (translation must run)', () => {
    expect(isUrlOnly("Regarde https://youtu.be/_AnF5eskiNQ c'est top")).toBe(false);
  });

  it('returns false for plain text', () => {
    expect(isUrlOnly('bonjour le monde, comment ça va ?')).toBe(false);
  });

  it('returns false for empty or whitespace-only content', () => {
    expect(isUrlOnly('')).toBe(false);
    expect(isUrlOnly('   ')).toBe(false);
  });

  it('returns false for non-HTTP schemes', () => {
    expect(isUrlOnly('mailto:a@b.com')).toBe(false);
    expect(isUrlOnly('ftp://server/file')).toBe(false);
  });

  it('returns false when CJK text is glued to a URL with no space (translation must run)', () => {
    expect(isUrlOnly('https://example.com你好世界')).toBe(false);
    expect(isUrlOnly('你好世界https://example.com')).toBe(false);
  });

  it('returns false when Thai text is glued to a URL with no space', () => {
    expect(isUrlOnly('https://example.comสวัสดีชาวโลก')).toBe(false);
  });

  it('still returns true for a bare URL and for comma-joined URLs', () => {
    expect(isUrlOnly('https://example.com')).toBe(true);
    expect(isUrlOnly('https://a.com,https://b.com')).toBe(true);
  });

  it('treats an auto-capitalized/uppercase scheme as URL-only (RFC 3986 §3.1)', () => {
    // Mobile keyboards auto-capitalize the first letter of a message, so a bare
    // link commonly arrives as "Https://…". The scheme is case-insensitive, so
    // this must still skip translation (else NLLB corrupts the link).
    expect(isUrlOnly('Https://youtu.be/_AnF5eskiNQ')).toBe(true);
    expect(isUrlOnly('HTTPS://EXAMPLE.COM')).toBe(true);
    expect(isUrlOnly('HTTP://example.com/path')).toBe(true);
  });
});
