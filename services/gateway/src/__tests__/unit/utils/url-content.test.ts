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
});
