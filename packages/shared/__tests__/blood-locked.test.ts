/**
 * CHAQUE PALIER ARRIVE AVEC SES FONCTIONS ACTIVES ; DE SANG À SANG RIEN NE SE COUPE (#20361,
 * directive porteur du 2026-11-22, décision par défaut B de #20367).
 */
import { describe, expect, it } from 'vitest';
import {
  RELATION_BLOOD_LOCKED_FEATURES,
  RELATION_BUNDLE_ONLY_FEATURES,
  RELATION_CONSENT_FEATURES,
  RELATION_LEVEL_DEFAULT_ON,
} from '../utils/relation-levels';
import {
  relationBloodLocked,
  resolveEmitterConsent,
  resolveReceptionPreference,
} from '../utils/relation-emitter-consent';
import { BLOOD_BUNDLE_FEATURES, BLOOD_BUNDLE_VERSION, isCurrentBloodBundle } from '../utils/blood-bundle';

describe('les défauts de chaque palier', () => {
  it('Proche arrive avec la catégorie d\'écoute, la batterie et l\'injoignabilité actives', () => {
    for (const feature of ['listening.category', 'device.battery', 'device.unreachable'] as const) {
      expect(RELATION_LEVEL_DEFAULT_ON[feature]).toBe('CLOSE');
      expect(resolveEmitterConsent({ feature, stored: null, effectiveLevel: 'CLOSE' })).toBe('granted');
      expect(resolveEmitterConsent({ feature, stored: false, effectiveLevel: 'CLOSE' })).toBe('refused');
    }
  });

  it('Sang arrive avec tout le reste actif, la position temporaire restant un geste par partage', () => {
    for (const feature of ['listening.title', 'location.live', 'location.history', 'location.proximity', 'device.battery.pull', 'safety.inactivity', 'device.call', 'health.fall'] as const) {
      expect(RELATION_LEVEL_DEFAULT_ON[feature]).toBe('BLOOD');
    }
    expect(RELATION_LEVEL_DEFAULT_ON['location.temporary']).toBeUndefined();
  });

  it('sous le palier, une colonne nulle reste un refus', () => {
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: null, effectiveLevel: 'FRIEND' })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'listening.title', stored: null, effectiveLevel: 'CLOSE' })).toBe('refused');
  });
});

describe('le verrou du Sang', () => {
  it('porte toutes les fonctions à consentement sauf la position temporaire, et Ensemble', () => {
    const expected = new Set([...RELATION_CONSENT_FEATURES].filter((feature) => feature !== 'location.temporary'));
    expected.add('together');
    expect(new Set(RELATION_BLOOD_LOCKED_FEATURES)).toEqual(expected);
  });

  it('ne verrouille qu\'au niveau effectif Sang', () => {
    expect(relationBloodLocked({ feature: 'talkie', effectiveLevel: 'BLOOD' })).toBe(true);
    expect(relationBloodLocked({ feature: 'talkie', effectiveLevel: 'CLOSE' })).toBe(false);
    expect(relationBloodLocked({ feature: 'location.temporary', effectiveLevel: 'BLOOD' })).toBe(false);
    expect(relationBloodLocked({ feature: 'dm.direct', effectiveLevel: 'BLOOD' })).toBe(false);
  });

  it('après l\'accord au palier, ni le refus stocké ni la coupure globale ne ferment', () => {
    expect(resolveEmitterConsent({ feature: 'location.live', stored: false, effectiveLevel: 'BLOOD', globallyDisabled: true, bloodBundleAccepted: true })).toBe('granted');
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: false, effectiveLevel: 'BLOOD', bloodBundleAccepted: true })).toBe('granted');
  });

  it('avant l\'accord (décision B), un refus explicite déjà donné reste appliqué, un champ jamais réglé s\'ouvre', () => {
    expect(resolveEmitterConsent({ feature: 'location.live', stored: false, effectiveLevel: 'BLOOD' })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: null, effectiveLevel: 'BLOOD', globallyDisabled: true })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: null, effectiveLevel: 'BLOOD' })).toBe('granted');
  });

  it('sans accord au palier, les partages du rituel ne s\'ouvrent que sur un accord stocké (aucun consentement présumé, C1)', () => {
    for (const feature of ['listening.title', 'location.live', 'location.history', 'location.proximity'] as const) {
      expect(resolveEmitterConsent({ feature, stored: null, effectiveLevel: 'BLOOD' })).toBe('refused');
      expect(resolveEmitterConsent({ feature, stored: true, effectiveLevel: 'BLOOD' })).toBe('granted');
      expect(resolveEmitterConsent({ feature, stored: null, effectiveLevel: 'BLOOD', bloodBundleAccepted: true })).toBe('granted');
    }
  });

  it('un émetteur mineur déclaré : ni verrou ni défaut sur la position et le titre d\'écoute (C7)', () => {
    for (const feature of ['listening.title', 'location.live', 'location.history', 'location.proximity'] as const) {
      expect(resolveEmitterConsent({ feature, stored: null, effectiveLevel: 'BLOOD', bloodBundleAccepted: true, emitterMinor: true })).toBe('refused');
      expect(resolveEmitterConsent({ feature, stored: false, effectiveLevel: 'BLOOD', bloodBundleAccepted: true, emitterMinor: true })).toBe('refused');
      expect(resolveEmitterConsent({ feature, stored: true, effectiveLevel: 'BLOOD', bloodBundleAccepted: true, emitterMinor: true })).toBe('granted');
    }
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: false, effectiveLevel: 'BLOOD', bloodBundleAccepted: true, emitterMinor: true })).toBe('granted');
  });

  it('l\'accord au palier n\'ouvre rien sous le Sang', () => {
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: false, effectiveLevel: 'CLOSE', bloodBundleAccepted: true })).toBe('refused');
  });
});

describe('une garde LÉGALE ne se lève jamais par le verrou du Sang', () => {
  it('un Sang sans accord de santé (art. 9) ou sous l\'âge minimum n\'émet jamais la chute, même après l\'accord au palier', () => {
    expect(resolveEmitterConsent({ feature: 'health.fall', stored: true, effectiveLevel: 'BLOOD', bloodBundleAccepted: true, legallyBlocked: true })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'health.fall', stored: null, effectiveLevel: 'BLOOD', legallyBlocked: true })).toBe('refused');
  });

  it('la chute ne s\'évalue jamais sans garde légale explicite : un appel qui l\'oublie est refusé', () => {
    expect(resolveEmitterConsent({ feature: 'health.fall', stored: true, effectiveLevel: 'BLOOD', bloodBundleAccepted: true })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'health.fall', stored: null, effectiveLevel: 'BLOOD' })).toBe('refused');
  });

  it('un Sang qui a donné l\'accord de santé émet la chute par défaut ; un refus donné à une personne précise survit à l\'accord au palier (constat B, fail-closed jusqu\'à #20406)', () => {
    expect(resolveEmitterConsent({ feature: 'health.fall', stored: false, effectiveLevel: 'BLOOD', bloodBundleAccepted: true, legallyBlocked: false })).toBe('refused');
    expect(resolveEmitterConsent({ feature: 'health.fall', stored: null, effectiveLevel: 'BLOOD', legallyBlocked: false })).toBe('granted');
  });
});

describe('la préférence de réception (Bring, talkie, Ensemble)', () => {
  it('active par défaut, coupée par personne ou globalement sous le Sang', () => {
    expect(resolveReceptionPreference({ feature: 'talkie', cut: false, effectiveLevel: 'CLOSE' })).toBe('granted');
    expect(resolveReceptionPreference({ feature: 'talkie', cut: true, effectiveLevel: 'CLOSE' })).toBe('refused');
  });

  it('entre Sangs après l\'accord, une coupure ne ferme plus ; avant, elle reste appliquée', () => {
    expect(resolveReceptionPreference({ feature: 'bring', cut: true, effectiveLevel: 'BLOOD', bloodBundleAccepted: true })).toBe('granted');
    expect(resolveReceptionPreference({ feature: 'bring', cut: true, effectiveLevel: 'BLOOD' })).toBe('refused');
  });
});

describe('la liste versionnée de ce que le Sang ouvre', () => {
  it('nomme chaque fonction verrouillée, et seulement elles', () => {
    expect(new Set(BLOOD_BUNDLE_FEATURES)).toEqual(new Set(RELATION_BLOOD_LOCKED_FEATURES));
  });

  it('reconnaît la version courante et refuse toute autre', () => {
    expect(isCurrentBloodBundle(BLOOD_BUNDLE_VERSION)).toBe(true);
    expect(isCurrentBloodBundle('2020-01-01')).toBe(false);
    expect(isCurrentBloodBundle(undefined)).toBe(false);
  });
});

describe('une fonction ajoutée à la liste ne s\'ouvre pas en silence (C5)', () => {
  it('les fonctions du Sang actives SANS accord au palier sont exactement celles d\'avant le 2026-11-22', () => {
    const sansAccord = BLOOD_BUNDLE_FEATURES.filter((feature) => RELATION_LEVEL_DEFAULT_ON[feature] === 'BLOOD' && !RELATION_BUNDLE_ONLY_FEATURES.has(feature));
    expect(new Set(sansAccord)).toEqual(new Set(['device.battery.pull', 'safety.inactivity', 'device.call', 'health.fall']));
  });
});

describe('constat E — le verrou se lit sur le lien RÉEL, jamais sur le niveau d\'équipe', () => {
  it('paire d\'équipe sans lien réel (niveau effectif Sang, lien réel Public), accord périmé : la coupure s\'applique', () => {
    for (const feature of ['device.battery', 'device.unreachable', 'safety.inactivity', 'device.call'] as const) {
      expect(resolveEmitterConsent({ feature, stored: false, effectiveLevel: 'BLOOD', realLevel: 'PUBLIC', bloodBundleAccepted: true })).toBe('refused');
    }
    expect(resolveReceptionPreference({ feature: 'bring', cut: true, effectiveLevel: 'BLOOD', realLevel: 'PUBLIC', bloodBundleAccepted: true })).toBe('refused');
  });

  it('au Sang réel, l\'accord lève toujours le refus', () => {
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: false, effectiveLevel: 'BLOOD', realLevel: 'BLOOD', bloodBundleAccepted: true })).toBe('granted');
    expect(resolveReceptionPreference({ feature: 'bring', cut: true, effectiveLevel: 'BLOOD', realLevel: 'BLOOD', bloodBundleAccepted: true })).toBe('granted');
  });
});

describe('constat B — la chute (art. 9) : l\'accord au palier ne lève jamais un refus par personne', () => {
  it('accord au palier + refus explicite pour ce Sang, garde légale levée : refusé', () => {
    expect(resolveEmitterConsent({ feature: 'health.fall', stored: false, effectiveLevel: 'BLOOD', realLevel: 'BLOOD', bloodBundleAccepted: true, legallyBlocked: false })).toBe('refused');
  });
  it('accord au palier sans refus stocké : la chute s\'ouvre par défaut au Sang', () => {
    expect(resolveEmitterConsent({ feature: 'health.fall', stored: null, effectiveLevel: 'BLOOD', realLevel: 'BLOOD', bloodBundleAccepted: true, legallyBlocked: false })).toBe('granted');
  });
});
