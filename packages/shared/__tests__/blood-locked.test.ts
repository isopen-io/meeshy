/**
 * CHAQUE PALIER ARRIVE AVEC SES FONCTIONS ACTIVES ; DE SANG À SANG RIEN NE SE COUPE (#20361,
 * directive porteur du 2026-11-22, décision par défaut B de #20367).
 */
import { describe, expect, it } from 'vitest';
import {
  RELATION_BLOOD_LOCKED_FEATURES,
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
    expect(resolveEmitterConsent({ feature: 'location.live', stored: null, effectiveLevel: 'BLOOD' })).toBe('granted');
  });

  it('l\'accord au palier n\'ouvre rien sous le Sang', () => {
    expect(resolveEmitterConsent({ feature: 'device.battery', stored: false, effectiveLevel: 'CLOSE', bloodBundleAccepted: true })).toBe('refused');
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
