import { describe, it, expect } from 'vitest';
import { isVoiceCloningAgeAdmitted, voiceCloningBirthDateLimit } from '../../utils/age.js';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string): Date => new Date(iso);

describe('voiceCloningBirthDateLimit — aujourd’hui moins 18 ans, au calendrier UTC (#17309)', () => {
  it('recule de 18 années civiles au jour près, à minuit UTC', () => {
    expect(voiceCloningBirthDateLimit(at('2026-11-09T15:42:00.000Z'))).toEqual(day('2008-11-09'));
  });

  it('un 29 février vise le 28 février d’une année non bissextile', () => {
    expect(voiceCloningBirthDateLimit(at('2028-02-29T08:00:00.000Z'))).toEqual(day('2010-02-28'));
  });

  it('18 n’étant pas multiple de 4, tout 29 février vise un 28 février', () => {
    expect(voiceCloningBirthDateLimit(at('2024-02-29T08:00:00.000Z'))).toEqual(day('2006-02-28'));
    expect(voiceCloningBirthDateLimit(at('2036-02-29T08:00:00.000Z'))).toEqual(day('2018-02-28'));
  });

  it('n’est pas une approximation à 365 × 18 jours', () => {
    const now = at('2026-11-09T12:00:00.000Z');
    const approx = new Date(now.getTime() - 365 * 18 * 86_400_000);
    expect(voiceCloningBirthDateLimit(now)).not.toEqual(day(approx.toISOString().slice(0, 10)));
  });
});

describe('isVoiceCloningAgeAdmitted — admis si né au plus tard à la date limite', () => {
  const now = at('2026-11-09T23:59:59.999Z');

  it('admet le jour exact des 18 ans', () => {
    expect(isVoiceCloningAgeAdmitted(day('2008-11-09'), now)).toBe(true);
  });

  it('refuse la veille des 18 ans', () => {
    expect(isVoiceCloningAgeAdmitted(day('2008-11-10'), now)).toBe(false);
  });

  it('compare au JOUR : une date stockée avec une heure le jour des 18 ans reste admise', () => {
    expect(isVoiceCloningAgeAdmitted(at('2008-11-09T18:30:00.000Z'), now)).toBe(true);
  });

  it('admet un adulte bien au-delà', () => {
    expect(isVoiceCloningAgeAdmitted(day('1990-01-01'), now)).toBe(true);
  });

  it('un né le 29 février 2008 est majeur le 1er mars 2026, pas le 28 février', () => {
    expect(isVoiceCloningAgeAdmitted(day('2008-02-29'), at('2026-02-28T23:59:59.999Z'))).toBe(false);
    expect(isVoiceCloningAgeAdmitted(day('2008-02-29'), at('2026-03-01T00:00:00.000Z'))).toBe(true);
  });

  it('refuse l’absence de date (fail-closed)', () => {
    expect(isVoiceCloningAgeAdmitted(null, now)).toBe(false);
    expect(isVoiceCloningAgeAdmitted(undefined, now)).toBe(false);
  });

  it('refuse une date illisible', () => {
    expect(isVoiceCloningAgeAdmitted(new Date('invalid'), now)).toBe(false);
  });
});
