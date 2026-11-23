/**
 * LA PROTECTION DU MINEUR ENTRE SANGS NE VAUT QUE SI L'ÉCART D'ÂGE DÉPASSE 5 ANS
 * (directive porteur du 2026-11-23, #20359, constat A de l'audit).
 */
import { describe, expect, it } from 'vitest';
import { MINOR_PEER_AGE_GAP_YEARS, minorProtectedBetween } from '../utils/age';
import { resolveEmitterConsent } from '../utils/relation-emitter-consent';

const NOW = new Date('2026-11-23T12:00:00Z');
const bornYearsAgo = (years: number, now: Date = NOW): Date => new Date(Date.UTC(now.getUTCFullYear() - years, 0, 1));
const protectedAt = (emitterAge: number | null, otherAge: number | null, now: Date = NOW): boolean =>
  minorProtectedBetween({
    emitterBirthDate: emitterAge === null ? null : bornYearsAgo(emitterAge),
    otherBirthDate: otherAge === null ? null : bornYearsAgo(otherAge),
    now,
  });

describe('minorProtectedBetween', () => {
  it('le seuil est de 5 ans', () => expect(MINOR_PEER_AGE_GAP_YEARS).toBe(5));
  it('14 et 16 ans : aucune protection, la loi du Sang s\'applique entière', () => expect(protectedAt(14, 16)).toBe(false));
  it('16 et 20 ans : écart de 4, aucune protection', () => expect(protectedAt(16, 20)).toBe(false));
  it('15 et 20 ans : écart de 5 au plus, aucune protection', () => expect(protectedAt(15, 20)).toBe(false));
  it('14 et 30 ans : protection', () => expect(protectedAt(14, 30)).toBe(true));
  it('14 et 20 ans : écart de 6, protection', () => expect(protectedAt(14, 20)).toBe(true));
  it('un mineur de 17 ans face à un enfant de 10 ans : protection (écart de 7)', () => expect(protectedAt(17, 10)).toBe(true));
  it('mineur et âge inconnu : aucune protection, la loi du Sang est entière (décision porteur)', () => {
    expect(protectedAt(14, null)).toBe(false);
    expect(protectedAt(null, 14)).toBe(false);
  });
  it('l\'un des deux est mineur, dans un sens comme dans l\'autre : 30 et 14 ans, protection', () => {
    expect(protectedAt(30, 14)).toBe(true);
    expect(protectedAt(14, 30)).toBe(true);
  });
  it('deux adultes, même à 30 ans d\'écart : aucune protection', () => expect(protectedAt(50, 20)).toBe(false));
  it('un adulte qui se déclare 17 ans face à un mineur de 14 : écart de 3, pas de protection', () => expect(protectedAt(14, 17)).toBe(false));
});

describe('constat A : un accord pris sous protection ne lève jamais un refus stocké', () => {
  it('à 14 ans avec quelqu\'un de 30 ans, accord NON enregistré : cinq ans plus tard, le refus tient', () => {
    const later = new Date('2031-11-23T12:00:00Z');
    const protegeAvant = minorProtectedBetween({ emitterBirthDate: bornYearsAgo(14), otherBirthDate: bornYearsAgo(30), now: NOW });
    expect(protegeAvant).toBe(true);
    // la protection empêche l'enregistrement de l'accord : plus tard, `bloodBundleAccepted` vaut false.
    expect(resolveEmitterConsent({ feature: 'location.live', stored: false, effectiveLevel: 'BLOOD', bloodBundleAccepted: false })).toBe('refused');
    expect(later.getUTCFullYear()).toBe(2031);
  });
});
