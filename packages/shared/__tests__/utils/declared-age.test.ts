import { describe, it, expect } from 'vitest';
import {
  ageInFullYearsUtc,
  isDeclaredMinor,
  judgeDeclaredBirthDate,
  parseBirthDateDay,
} from '../../utils/age.js';
import { viewerWriteRestrictionOf } from '../../utils/global-minor-restriction.js';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string): Date => new Date(iso);

describe('ageInFullYearsUtc — années révolues, calendrier UTC', () => {
  it('compte l’anniversaire du jour comme une année de plus', () => {
    expect(ageInFullYearsUtc(day('2008-10-10'), at('2026-10-10T00:00:00.000Z'))).toBe(18);
  });

  it('la veille de l’anniversaire, l’année n’est pas encore faite', () => {
    expect(ageInFullYearsUtc(day('2008-10-10'), at('2026-10-09T23:59:59.999Z'))).toBe(17);
  });

  it('un 29 février prend son année le 1er mars d’une année non bissextile', () => {
    expect(ageInFullYearsUtc(day('2008-02-29'), at('2026-02-28T12:00:00.000Z'))).toBe(17);
    expect(ageInFullYearsUtc(day('2008-02-29'), at('2026-03-01T00:00:00.000Z'))).toBe(18);
  });

  it('un 29 février prend son année le 29 février d’une année bissextile', () => {
    expect(ageInFullYearsUtc(day('2012-02-29'), at('2030-02-28T23:00:00.000Z'))).toBe(17);
    expect(ageInFullYearsUtc(day('2012-02-29'), at('2032-02-29T00:00:00.000Z'))).toBe(20);
  });
});

describe('isDeclaredMinor — l’inconnu est ADMIS (aucune restriction sans déclaration)', () => {
  const now = at('2026-10-10T12:00:00.000Z');

  it('âge non renseigné ⇒ pas mineur', () => {
    expect(isDeclaredMinor(null, now)).toBe(false);
    expect(isDeclaredMinor(undefined, now)).toBe(false);
  });

  it('13 ans ⇒ mineur', () => {
    expect(isDeclaredMinor(day('2013-10-10'), now)).toBe(true);
  });

  it('17 ans et 364 jours ⇒ mineur', () => {
    expect(isDeclaredMinor(day('2008-10-11'), now)).toBe(true);
  });

  it('18 ans le jour même ⇒ majeur', () => {
    expect(isDeclaredMinor(day('2008-10-10'), now)).toBe(false);
  });

  it('une date illisible ne fabrique pas un mineur', () => {
    expect(isDeclaredMinor(new Date('not a date'), now)).toBe(false);
  });
});

describe('parseBirthDateDay — AAAA-MM-JJ, jour calendaire réel, minuit UTC', () => {
  it('rend minuit UTC du jour déclaré', () => {
    expect(parseBirthDateDay('2008-02-29')?.toISOString()).toBe('2008-02-29T00:00:00.000Z');
  });

  it('refuse un jour qui n’existe pas', () => {
    expect(parseBirthDateDay('2009-02-29')).toBeNull();
    expect(parseBirthDateDay('2010-13-01')).toBeNull();
    expect(parseBirthDateDay('2010-04-31')).toBeNull();
  });

  it('refuse toute autre forme', () => {
    expect(parseBirthDateDay('2010-4-1')).toBeNull();
    expect(parseBirthDateDay('2010-04-01T00:00:00Z')).toBeNull();
    expect(parseBirthDateDay('')).toBeNull();
  });
});

describe('judgeDeclaredBirthDate — la loi d’une déclaration', () => {
  const now = at('2026-10-10T12:00:00.000Z');

  it('12 ans et 364 jours ⇒ sous le minimum', () => {
    expect(judgeDeclaredBirthDate(day('2013-10-11'), now)).toBe('below-minimum');
  });

  it('13 ans le jour même ⇒ admis', () => {
    expect(judgeDeclaredBirthDate(day('2013-10-10'), now)).toBe('admitted');
  });

  it('une date future ⇒ refusée', () => {
    expect(judgeDeclaredBirthDate(day('2026-10-11'), now)).toBe('in-future');
  });

  it('plus de 120 ans ⇒ improbable', () => {
    expect(judgeDeclaredBirthDate(day('1905-10-10'), now)).toBe('implausible');
    expect(judgeDeclaredBirthDate(day('1905-10-11'), now)).toBe('admitted');
  });
});

describe('viewerWriteRestrictionOf — Global en lecture seule pour un mineur déclaré', () => {
  const now = at('2026-10-10T12:00:00.000Z');

  it('mineur dans Global ⇒ minor-global', () => {
    expect(viewerWriteRestrictionOf({ conversationType: 'global', birthDate: day('2010-01-01'), now })).toBe('minor-global');
  });

  it('mineur hors de Global ⇒ aucune restriction', () => {
    expect(viewerWriteRestrictionOf({ conversationType: 'group', birthDate: day('2010-01-01'), now })).toBeNull();
    expect(viewerWriteRestrictionOf({ conversationType: 'direct', birthDate: day('2010-01-01'), now })).toBeNull();
  });

  it('majeur ou âge inconnu dans Global ⇒ aucune restriction', () => {
    expect(viewerWriteRestrictionOf({ conversationType: 'global', birthDate: day('2008-10-10'), now })).toBeNull();
    expect(viewerWriteRestrictionOf({ conversationType: 'global', birthDate: null, now })).toBeNull();
  });
});
