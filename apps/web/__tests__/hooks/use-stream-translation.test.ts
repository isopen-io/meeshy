/**
 * `useStreamTranslation` fusionne les traductions temps réel reçues dans le cache
 * d'un message et détecte celles pertinentes pour le lecteur. `targetLanguage` et
 * les préférences du lecteur sont verbatim : sans canonicalisation, `fr` et `fr-FR`
 * sont dédupliqués comme deux entrées (doublons) et une traduction pertinente
 * n'est jamais comptée. SSOT : normalizeLanguageForDedup (language-normalize.ts).
 */
import { renderHook } from '@testing-library/react';

const mockIncrement = jest.fn();
jest.mock('@/hooks/useMessageTranslation', () => ({
  useMessageTranslation: () => ({
    stats: {},
    incrementTranslationCount: mockIncrement,
  }),
}));

import { useStreamTranslation } from '@/hooks/use-stream-translation';

const setup = (systemLanguage = 'fr') => {
  const updates: Array<{ id: string; updater: (prev: any) => any }> = [];
  const updateMessage = (id: string, updater: (prev: any) => any) =>
    updates.push({ id, updater });
  const { result } = renderHook(() =>
    useStreamTranslation({
      user: { id: 'u1', systemLanguage } as any,
      updateMessage,
    }),
  );
  return { result, updates };
};

beforeEach(() => mockIncrement.mockClear());

describe('useStreamTranslation — canonicalisation de langue', () => {
  it('fusionne fr-FR sur une entrée fr existante au lieu de créer un doublon', () => {
    const { result, updates } = setup();
    result.current.handleTranslation('m1', [
      { targetLanguage: 'fr-FR', translatedContent: 'Bonjour' },
    ]);
    const prev = {
      id: 'm1',
      originalLanguage: 'en',
      translations: [
        { targetLanguage: 'fr', translatedContent: 'Vieux', id: 'm1_fr' },
      ],
    };
    const next = updates[0].updater(prev);
    expect(next.translations).toHaveLength(1);
    expect(next.translations[0].translatedContent).toBe('Bonjour');
  });

  it('garde deux entrées pour deux langues réellement distinctes', () => {
    const { result, updates } = setup();
    result.current.handleTranslation('m2', [
      { targetLanguage: 'de', translatedContent: 'Hallo' },
    ]);
    const prev = {
      id: 'm2',
      originalLanguage: 'en',
      translations: [
        { targetLanguage: 'fr', translatedContent: 'Bonjour', id: 'm2_fr' },
      ],
    };
    const next = updates[0].updater(prev);
    expect(next.translations).toHaveLength(2);
  });

  it('détecte une traduction fr-FR comme pertinente pour un lecteur fr', () => {
    const { result } = setup('fr');
    result.current.handleTranslation('m3', [
      { targetLanguage: 'fr-FR', sourceLanguage: 'en', translatedContent: 'Bonjour' },
    ]);
    expect(mockIncrement).toHaveBeenCalledWith('en', 'fr-FR');
  });

  it('ne compte pas une traduction dans une langue non lue (fil ≠ fi)', () => {
    const { result } = setup('fi');
    result.current.handleTranslation('m4', [
      { targetLanguage: 'fil', sourceLanguage: 'en', translatedContent: 'Kumusta' },
    ]);
    expect(mockIncrement).not.toHaveBeenCalled();
  });
});
