jest.mock('tinyld/light');

import { detectAll } from 'tinyld/light';
import { detectComposeLanguage, detectMeasuredLanguage } from '@/utils/language-detection';

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

// #5349 — la mesure SANS repli : `undefined` dit « pas de mesure fiable »,
// jamais une préférence d'interface substituée en silence.
describe('detectMeasuredLanguage', () => {
  beforeEach(() => {
    mockDetectAll.mockReset();
    mockDetectAll.mockImplementation(
      jest.requireActual<typeof import('tinyld/light')>('tinyld/light').detectAll,
    );
  });

  it('detects French content', () => {
    expect(detectMeasuredLanguage("Bonjour, comment vas-tu aujourd'hui ? J'espère que tout va bien.")).toBe('fr');
  });
  it('detects English content', () => {
    expect(detectMeasuredLanguage('How are you doing today? I hope everything is going well.')).toBe('en');
  });
  it('returns undefined on short text — never a guessed fallback', () => {
    expect(detectMeasuredLanguage('Ok')).toBeUndefined();
  });
  it('returns undefined on emoji-only text', () => {
    expect(detectMeasuredLanguage('🙂🙂🙂')).toBeUndefined();
  });
  it('returns undefined on empty string', () => {
    expect(detectMeasuredLanguage('')).toBeUndefined();
  });
  it('does not throw and returns undefined when detectAll throws', () => {
    mockDetectAll.mockImplementation(() => {
      throw new Error('tinyld internal error');
    });
    expect(() => detectMeasuredLanguage('some text here')).not.toThrow();
    expect(detectMeasuredLanguage('some text here')).toBeUndefined();
  });
  it('returns undefined when confidence is below threshold', () => {
    mockDetectAll.mockReturnValue([{ lang: 'fr', accuracy: 0.2 }] as ReturnType<typeof detectAll>);
    expect(detectMeasuredLanguage('quatre mots pas plus')).toBeUndefined();
  });
});
