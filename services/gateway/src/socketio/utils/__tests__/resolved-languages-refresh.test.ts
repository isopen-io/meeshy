import { applyResolvedLanguagesRefresh } from '../resolved-languages-refresh';

type Entry = { resolvedLanguages: string[]; language: string; userId?: string };

const makeMap = (entries: Record<string, Entry>) =>
  new Map<string, Entry>(Object.entries(entries));

describe('applyResolvedLanguagesRefresh', () => {
  it('recomputes resolvedLanguages from new prefs (system > regional > custom)', () => {
    const m = makeMap({ u1: { resolvedLanguages: ['en', 'fr'], language: 'en' } });
    const updated = applyResolvedLanguagesRefresh(m, 'u1', {
      systemLanguage: 'es', regionalLanguage: 'pt', customDestinationLanguage: null,
    });
    expect(updated).toBe(true);
    expect(m.get('u1')!.resolvedLanguages).toEqual(['es', 'pt']);
    expect(m.get('u1')!.language).toBe('es');
  });

  it('includes deviceLocale in 4th position', () => {
    const m = makeMap({ u1: { resolvedLanguages: [], language: 'fr' } });
    applyResolvedLanguagesRefresh(m, 'u1', {
      systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null,
      deviceLocale: 'en-US',
    });
    expect(m.get('u1')!.resolvedLanguages).toEqual(['fr', 'en']);
  });

  it('no-ops (returns false) when the user is not connected', () => {
    const m = makeMap({ u1: { resolvedLanguages: ['en'], language: 'en' } });
    const updated = applyResolvedLanguagesRefresh(m, 'ghost', { systemLanguage: 'es' });
    expect(updated).toBe(false);
    expect(m.has('ghost')).toBe(false);
    expect(m.get('u1')!.resolvedLanguages).toEqual(['en']);
  });

  it('preserves other entry fields (userId) when updating', () => {
    const m = makeMap({ u1: { resolvedLanguages: ['en'], language: 'en', userId: 'u1' } });
    applyResolvedLanguagesRefresh(m, 'u1', { systemLanguage: 'de' });
    expect(m.get('u1')!.userId).toBe('u1');
    expect(m.get('u1')!.resolvedLanguages).toEqual(['de']);
  });
});
