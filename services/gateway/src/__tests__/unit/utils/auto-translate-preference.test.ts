import { describe, it, expect } from '@jest/globals';
import {
  AUTO_TRANSLATE_PREFERENCE_SELECT,
  resolveAutoTranslateEnabled,
} from '../../../utils/auto-translate-preference';

/**
 * `autoTranslateEnabled` n'a qu'UN store : `UserPreferences.application`.
 * Quatre réponses d'authentification servaient `true` en dur avec un TODO
 * « Load from UserPreferences.application » — ce module est la lecture qu'elles
 * annonçaient, tenue AVEC la forme du `select` qui la rend possible.
 */
describe('resolveAutoTranslateEnabled', () => {
  it('sert la préférence stockée quand elle est false — le rang qui distingue la lecture du défaut', () => {
    expect(
      resolveAutoTranslateEnabled({ userPreferences: { application: { autoTranslateEnabled: false } } })
    ).toBe(false);
  });

  it('sert true quand la préférence stockée est true', () => {
    expect(
      resolveAutoTranslateEnabled({ userPreferences: { application: { autoTranslateEnabled: true } } })
    ).toBe(true);
  });

  it('retombe sur le défaut du schéma partagé quand aucune ligne de préférences n’existe', () => {
    expect(resolveAutoTranslateEnabled({ userPreferences: null })).toBe(true);
    expect(resolveAutoTranslateEnabled({})).toBe(true);
    expect(resolveAutoTranslateEnabled(null)).toBe(true);
    expect(resolveAutoTranslateEnabled(undefined)).toBe(true);
  });

  it('retombe sur le défaut quand le document application ne porte pas la clé', () => {
    expect(resolveAutoTranslateEnabled({ userPreferences: { application: { theme: 'dark' } } })).toBe(true);
    expect(resolveAutoTranslateEnabled({ userPreferences: { application: null } })).toBe(true);
  });

  it('ignore une valeur stockée non booléenne au lieu de la servir telle quelle', () => {
    expect(
      resolveAutoTranslateEnabled({ userPreferences: { application: { autoTranslateEnabled: 'no' } } })
    ).toBe(true);
  });

  it('expose la projection Prisma que tout appelant doit joindre à son select', () => {
    // Un mock Prisma rend ce qu'on lui dit quel que soit le `select` : la
    // descente ne peut être vérifiée en aval que si la projection voyage avec
    // la lecture. Même raison d'être que RECIPIENT_LANG_SELECT.
    expect(AUTO_TRANSLATE_PREFERENCE_SELECT).toEqual({
      userPreferences: { select: { application: true } },
    });
  });
});
