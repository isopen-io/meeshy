import { describe, it, expect } from 'vitest';
import { PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS } from '../../types/preferences/privacy';
import { autoAcquaintanceEnabled } from '../auto-acquaintance-preference';

describe('autoAcquaintanceEnabled — « Je peux refuser que Meeshy crée des Connaissances automatiquement » (#14406)', () => {
  it('sans choix stocké : activée pour un majeur et pour un âge inconnu, désactivée pour un mineur déclaré', () => {
    expect(autoAcquaintanceEnabled({ stored: undefined, ageClass: 'adult' })).toBe(true);
    expect(autoAcquaintanceEnabled({ stored: undefined, ageClass: 'unknown' })).toBe(true);
    expect(autoAcquaintanceEnabled({ stored: undefined, ageClass: 'minor' })).toBe(false);
  });

  it('le choix stocké l’emporte sur le défaut, dans les deux sens et à tout âge', () => {
    expect(autoAcquaintanceEnabled({ stored: false, ageClass: 'adult' })).toBe(false);
    expect(autoAcquaintanceEnabled({ stored: false, ageClass: 'unknown' })).toBe(false);
    expect(autoAcquaintanceEnabled({ stored: true, ageClass: 'minor' })).toBe(true);
  });

  it('une valeur stockée illisible vaut absence de choix, jamais un oui', () => {
    expect(autoAcquaintanceEnabled({ stored: 'true', ageClass: 'minor' })).toBe(false);
    expect(autoAcquaintanceEnabled({ stored: null, ageClass: 'adult' })).toBe(true);
  });

  it('le schéma l’accepte sans le fabriquer : un document qui ne le porte pas ne le gagne pas', () => {
    expect(PrivacyPreferenceSchema.strict().parse({ autoAcquaintance: false }).autoAcquaintance).toBe(false);
    expect('autoAcquaintance' in PrivacyPreferenceSchema.parse({})).toBe(false);
    expect('autoAcquaintance' in PRIVACY_PREFERENCE_DEFAULTS).toBe(false);
  });
});
