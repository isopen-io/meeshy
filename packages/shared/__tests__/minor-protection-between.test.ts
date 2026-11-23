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

describe('l\'écart se mesure entre les DATES de naissance, stable toute l\'année (#20503, option A)', () => {
  const between = (emitter: string, other: string, now: string): boolean =>
    minorProtectedBetween({ emitterBirthDate: new Date(`${emitter}T00:00:00Z`), otherBirthDate: new Date(`${other}T00:00:00Z`), now: new Date(`${now}T12:00:00Z`) });
  const CLOCKS = ['2026-01-10', '2026-05-14', '2026-05-16', '2026-08-14', '2026-08-16', '2026-09-14', '2026-09-16', '2026-12-31'];

  it('5 ans et 3 mois d\'écart : protégé à chaque horloge de l\'année, avant et après chaque anniversaire', () => {
    CLOCKS.forEach((now) => {
      expect(between('2012-08-15', '2007-05-15', now)).toBe(true);
      expect(between('2007-05-15', '2012-08-15', now)).toBe(true);
    });
  });
  it('exactement 5 ans d\'écart : jamais protégé', () => {
    CLOCKS.forEach((now) => expect(between('2012-08-15', '2007-08-15', now)).toBe(false));
  });
  it('4 ans et 11 mois d\'écart : jamais protégé', () => {
    CLOCKS.forEach((now) => expect(between('2012-08-15', '2007-09-15', now)).toBe(false));
  });
  it('5 ans et un jour : protégé', () => expect(between('2012-08-16', '2007-08-15', '2026-11-23')).toBe(true));
  it('l\'heure portée par la date ne compte pas : même jour à 23 h, toujours exactement 5 ans', () => {
    expect(minorProtectedBetween({ emitterBirthDate: new Date('2012-08-15T23:59:00Z'), otherBirthDate: new Date('2007-08-15T00:00:00Z'), now: NOW })).toBe(false);
  });
  it('né un 29 février : ses 5 ans tombent le 1er mars, comme ses anniversaires (ageInFullYearsUtc)', () => {
    expect(between('2009-02-28', '2004-02-29', '2026-11-23')).toBe(false);
    expect(between('2009-03-01', '2004-02-29', '2026-11-23')).toBe(false);
    expect(between('2009-03-02', '2004-02-29', '2026-11-23')).toBe(true);
  });
  it('29 février face à un 29 février, 8 ans d\'écart bissextile à bissextile : protégé', () => {
    expect(between('2012-02-29', '2004-02-29', '2026-11-23')).toBe(true);
  });
});
