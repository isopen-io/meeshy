import { detectComposeLanguage } from '@/utils/language-detection';

describe('detectComposeLanguage', () => {
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
});
