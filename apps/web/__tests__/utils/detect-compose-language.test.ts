jest.mock('tinyld/light');

import { detectAll } from 'tinyld/light';
import { detectComposeLanguage } from '@/utils/language-detection';

const mockDetectAll = jest.mocked(detectAll);

describe('detectComposeLanguage', () => {
  beforeEach(() => {
    mockDetectAll.mockReset();
    // Default: delegate to real implementation via a passthrough
    mockDetectAll.mockImplementation(
      jest.requireActual<typeof import('tinyld/light')>('tinyld/light').detectAll,
    );
  });

  it('detects French content', () => {
    expect(detectComposeLanguage("Bonjour, comment vas-tu aujourd'hui ? J'espère que tout va bien.", 'en')).toBe('fr');
  });
  it('detects English content', () => {
    expect(detectComposeLanguage('How are you doing today? I hope everything is going well.', 'fr')).toBe('en');
  });
  it('falls back to the provided language on short text', () => {
    expect(detectComposeLanguage('Ok', 'fr')).toBe('fr');
  });
  it('falls back on emoji-only text', () => {
    expect(detectComposeLanguage('🙂🙂🙂', 'fr')).toBe('fr');
  });
  it('normalizes the fallback (fr-FR → fr)', () => {
    expect(detectComposeLanguage('Ok', 'fr-FR')).toBe('fr');
  });
  it('returns fallback on empty string', () => {
    expect(detectComposeLanguage('', 'fr')).toBe('fr');
  });
  it('does not throw and returns fallback when detectAll throws', () => {
    mockDetectAll.mockImplementation(() => {
      throw new Error('tinyld internal error');
    });
    expect(() => detectComposeLanguage('some text here', 'fr')).not.toThrow();
    expect(detectComposeLanguage('some text here', 'fr')).toBe('fr');
  });
});
