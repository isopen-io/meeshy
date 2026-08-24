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

  // Cycle 125 — les quatre témoins ci-dessus épinglent tous le RANG 1, où la
  // lecture directe (`prefs.systemLanguage`) et la descente rendent le même
  // verdict. Aucun ne pouvait donc voir que `language` était écrit brut pendant
  // que `resolvedLanguages`, dans la MÊME instruction, descendait le Prisme.
  it('écrit la langue de cadrage au rang 2 quand le rang 1 est vide', () => {
    const m = makeMap({ u1: { resolvedLanguages: ['en'], language: 'en' } });

    applyResolvedLanguagesRefresh(m, 'u1', {
      systemLanguage: null, regionalLanguage: 'es', customDestinationLanguage: null,
    });

    expect(m.get('u1')!.language).toBe('es');
    expect(m.get('u1')!.language).toBe(m.get('u1')!.resolvedLanguages[0]);
  });

  it('normalise la langue de cadrage comme la liste ordonnée', () => {
    const m = makeMap({ u1: { resolvedLanguages: ['en'], language: 'en' } });

    applyResolvedLanguagesRefresh(m, 'u1', { systemLanguage: 'pt-BR' });

    // Non normalisée, cette valeur ne matche aucune clé de traduction : le
    // filtre socket la sert à côté de la liste, qui porte déjà « pt ».
    expect(m.get('u1')!.language).toBe('pt');
  });

  it('un rafraîchissement qui ne résout RIEN ne détruit pas la langue connue', () => {
    const m = makeMap({ u1: { resolvedLanguages: ['de'], language: 'de' } });

    applyResolvedLanguagesRefresh(m, 'u1', {
      systemLanguage: null, regionalLanguage: null, customDestinationLanguage: null,
    });

    expect(m.get('u1')!.resolvedLanguages).toEqual([]);
    expect(m.get('u1')!.language).toBe('de');
  });

  it('preserves other entry fields (userId) when updating', () => {
    const m = makeMap({ u1: { resolvedLanguages: ['en'], language: 'en', userId: 'u1' } });
    applyResolvedLanguagesRefresh(m, 'u1', { systemLanguage: 'de' });
    expect(m.get('u1')!.userId).toBe('u1');
    expect(m.get('u1')!.resolvedLanguages).toEqual(['de']);
  });
});
