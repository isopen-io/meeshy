import { describe, expect, it } from 'vitest';
import { packWindowState } from '../../types/pack-availability';
import {
  DECORATION_EVENTS,
  GENERATED_WINDOW_REFERENCE,
  MONTHS_AFTER_EVENT,
  MONTHS_BEFORE_EVENT,
  PackEventDeclarationSchema,
  decorationEventWindow,
  effectiveEventWindow,
  materializePackWindow,
  packOfferWindow,
  resolveEventWindow,
} from '../decoration-event-window';

const at = (iso: string): Date => new Date(iso);
const CHRISTMAS = { id: 'christmas', recurrence: 'yearly' } as const;
const NEW_YEAR = { id: 'new-year', recurrence: 'yearly' } as const;

describe('la fenêtre d’une décoration d’événement (#16447)', () => {
  it('la règle : deux mois calendaires avant, un mois calendaire après, en UTC', () => {
    expect({ before: MONTHS_BEFORE_EVENT, after: MONTHS_AFTER_EVENT }).toEqual({ before: 2, after: 1 });
  });

  it('le registre nomme ses événements en anglais (#16450), à date fixe', () => {
    expect(DECORATION_EVENTS).toEqual({
      christmas: { month: 12, day: 25 },
      'new-year': { month: 1, day: 1 },
      'valentines-day': { month: 2, day: 14 },
      'music-day': { month: 6, day: 21 },
      halloween: { month: 10, day: 31 },
    });
  });

  it('Noël 2026 s’ouvre le 25 octobre 2026 et se referme le 25 janvier 2027 (passage d’année à la fin)', () => {
    expect(decorationEventWindow({ id: 'christmas', year: 2026 })).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
  });

  it('le Nouvel An 2027 s’ouvre le 1er novembre 2026 (passage d’année au début) et se referme le 1er février 2027', () => {
    expect(decorationEventWindow({ id: 'new-year', year: 2027 })).toEqual({ startsAt: '2026-11-01T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' });
  });

  it('un jour sans équivalent dans le mois visé est borné au dernier jour de ce mois', () => {
    expect(decorationEventWindow({ date: { month: 8, day: 31 }, year: 2026 })).toEqual({ startsAt: '2026-06-30T00:00:00Z', endsAt: '2026-09-30T00:00:00Z' });
    expect(decorationEventWindow({ date: { month: 1, day: 31 }, year: 2027 }).endsAt).toBe('2027-02-28T00:00:00Z');
    expect(decorationEventWindow({ date: { month: 12, day: 31 }, year: 2026 })).toEqual({ startsAt: '2026-10-31T00:00:00Z', endsAt: '2027-01-31T00:00:00Z' });
  });

  it('29 février : il n’existe que les années bissextiles, sinon le 28', () => {
    expect(decorationEventWindow({ date: { month: 4, day: 30 }, year: 2027 }).startsAt).toBe('2027-02-28T00:00:00Z');
    expect(decorationEventWindow({ date: { month: 4, day: 30 }, year: 2028 }).startsAt).toBe('2028-02-29T00:00:00Z');
    expect(decorationEventWindow({ date: { month: 1, day: 31 }, year: 2028 }).endsAt).toBe('2028-02-29T00:00:00Z');
    expect(resolveEventWindow({ ...NEW_YEAR, endsOn: '02-29' }, at('2026-11-06T00:00:00Z')).endsAt).toBe('2027-02-28T00:00:00Z');
    expect(resolveEventWindow({ ...NEW_YEAR, endsOn: '02-29' }, at('2027-11-06T00:00:00Z')).endsAt).toBe('2028-02-29T00:00:00Z');
  });

  it('un événement inconnu du registre est refusé, jamais deviné', () => {
    expect(() => resolveEventWindow({ id: 'inconnu', recurrence: 'yearly' }, at('2026-11-06T00:00:00Z'))).toThrow(/inconnu/);
  });
});

describe('la récurrence annuelle (#16450) : l’occurrence EN COURS, sinon la PROCHAINE', () => {
  it('Noël, le 6 novembre 2026 : l’occurrence 2026 est ouverte', () => {
    const window = resolveEventWindow(CHRISTMAS, at('2026-11-06T12:00:00Z'));
    expect(window).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
    expect(packWindowState(window, at('2026-11-06T12:00:00Z'))).toBe('open');
  });

  it('passage d’année : le 24 janvier 2027, c’est encore Noël 2026', () => {
    expect(resolveEventWindow(CHRISTMAS, at('2027-01-24T23:59:59Z')).startsAt).toBe('2026-10-25T00:00:00Z');
  });

  it('occurrence fermée : le 25 janvier 2027, Noël renvoie à l’occurrence 2027, à venir', () => {
    const now = at('2027-01-25T00:00:00Z');
    const window = resolveEventWindow(CHRISTMAS, now);
    expect(window).toEqual({ startsAt: '2027-10-25T00:00:00Z', endsAt: '2028-01-25T00:00:00Z' });
    expect(packWindowState(window, now)).toBe('upcoming');
  });

  it('occurrence à venir : le 1er octobre 2026, le Nouvel An est celui de 2027, l’année suivante', () => {
    const now = at('2026-10-01T00:00:00Z');
    expect(resolveEventWindow(NEW_YEAR, now)).toEqual({ startsAt: '2026-11-01T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' });
    expect(packWindowState(resolveEventWindow(NEW_YEAR, now), now)).toBe('upcoming');
  });

  it('le 15 janvier 2026, le Nouvel An 2026 est encore ouvert (occurrence commencée l’année précédente)', () => {
    expect(resolveEventWindow(NEW_YEAR, at('2026-01-15T00:00:00Z'))).toEqual({ startsAt: '2025-11-01T00:00:00Z', endsAt: '2026-02-01T00:00:00Z' });
  });

  it('des bornes écrites en mois-jour priment, chaque année ; une seule écrite, l’autre vient de la règle', () => {
    const now = at('2026-11-06T00:00:00Z');
    expect(resolveEventWindow({ ...CHRISTMAS, startsOn: '12-01', endsOn: '01-07' }, now)).toEqual({ startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' });
    expect(resolveEventWindow({ ...CHRISTMAS, startsOn: '12-01' }, now)).toEqual({ startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
    expect(resolveEventWindow({ ...NEW_YEAR, startsOn: '12-26' }, now)).toEqual({ startsAt: '2026-12-26T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' });
    expect(resolveEventWindow({ ...NEW_YEAR, endsOn: '01-16' }, at('2027-01-16T00:00:00Z'))).toEqual({ startsAt: '2027-11-01T00:00:00Z', endsAt: '2028-01-16T00:00:00Z' });
  });

  it('une occurrence unique (`year`) reste supportée et ne se répète pas', () => {
    expect(resolveEventWindow({ id: 'christmas', year: 2026 }, at('2030-01-01T00:00:00Z'))).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
  });

  it('le schéma accepte les deux formes et refuse un mois-jour illisible ou une récurrence inconnue', () => {
    expect(PackEventDeclarationSchema.safeParse(CHRISTMAS).success).toBe(true);
    expect(PackEventDeclarationSchema.safeParse({ ...CHRISTMAS, startsOn: '12-01', endsOn: '01-07' }).success).toBe(true);
    expect(PackEventDeclarationSchema.safeParse({ id: 'christmas', year: 2026 }).success).toBe(true);
    expect(PackEventDeclarationSchema.safeParse({ ...CHRISTMAS, startsOn: '13-01' }).success).toBe(false);
    expect(PackEventDeclarationSchema.safeParse({ id: 'christmas', recurrence: 'monthly' }).success).toBe(false);
  });
});

describe('une date écrite prime sur la règle', () => {
  const christmas2026 = { id: 'christmas', year: 2026 } as const;

  it('les deux bornes écrites sont gardées telles quelles', () => {
    expect(effectiveEventWindow({ event: christmas2026, availability: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' } })).toEqual({
      startsAt: '2026-12-01T00:00:00Z',
      endsAt: '2027-01-07T00:00:00Z',
    });
  });

  it('aucune borne écrite : les deux viennent de la règle', () => {
    expect(effectiveEventWindow({ event: christmas2026 })).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
  });

  it('une seule borne écrite s’applique, l’autre vient de la règle', () => {
    expect(effectiveEventWindow({ event: christmas2026, availability: { startsAt: '2026-12-01T00:00:00Z' } })).toEqual({ startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
    expect(effectiveEventWindow({ event: christmas2026, availability: { endsAt: '2027-01-07T00:00:00Z' } })).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' });
  });

  it('sans événement, la fenêtre écrite passe telle quelle, et l’absence reste une absence', () => {
    expect(effectiveEventWindow({ availability: { endsAt: '2027-01-07T00:00:00Z' } })).toEqual({ endsAt: '2027-01-07T00:00:00Z' });
    expect(effectiveEventWindow({})).toBeUndefined();
  });
});

describe('la fenêtre d’OFFRE lue par la passerelle et les clients', () => {
  it('un pack récurrent se recalcule à la date du jour : l’instantané `availability` du générateur ne compte pas', () => {
    const pack = { event: CHRISTMAS, availability: { startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' } };
    expect(packOfferWindow(pack, at('2027-06-01T00:00:00Z'))).toEqual({ startsAt: '2027-10-25T00:00:00Z', endsAt: '2028-01-25T00:00:00Z' });
  });

  it('un pack daté ou à occurrence unique garde sa fenêtre servie', () => {
    const availability = { startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' };
    expect(packOfferWindow({ availability }, at('2027-06-01T00:00:00Z'))).toEqual(availability);
    expect(packOfferWindow({ event: { id: 'christmas', year: 2026 }, availability }, at('2027-06-01T00:00:00Z'))).toEqual(availability);
    expect(packOfferWindow({}, at('2027-06-01T00:00:00Z'))).toBeUndefined();
  });
});

describe('la génération écrit TOUJOURS `availability` pour les anciens clients, et transmet `event` aux nouveaux', () => {
  it('l’instantané d’un pack récurrent est l’occurrence en cours ou prochaine à la date de référence', () => {
    expect(GENERATED_WINDOW_REFERENCE).toBe('2026-11-06T00:00:00Z');
    expect(materializePackWindow({ slug: 'x', event: NEW_YEAR, rings: [] })).toEqual({
      slug: 'x',
      availability: { startsAt: '2026-11-01T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' },
      event: NEW_YEAR,
      rings: [],
    });
    expect(materializePackWindow({ slug: 'x', event: CHRISTMAS }, at('2027-02-01T00:00:00Z')).availability).toEqual({ startsAt: '2027-10-25T00:00:00Z', endsAt: '2028-01-25T00:00:00Z' });
  });

  it('la fenêtre se pose juste avant la déclaration, à sa place : un catalogue régénéré ne déplace aucune clé', () => {
    expect(Object.keys(materializePackWindow({ slug: 'x', event: CHRISTMAS, rings: [] }))).toEqual(['slug', 'availability', 'event', 'rings']);
    const halfDated = materializePackWindow({ slug: 'y', availability: { endsAt: '2027-01-07T00:00:00Z' }, event: { id: 'christmas', year: 2026 }, rings: [] });
    expect(Object.keys(halfDated)).toEqual(['slug', 'availability', 'event', 'rings']);
    expect(halfDated.availability).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' });
  });

  it('un pack daté sans événement, ou hors événement, ressort identique, à l’octet près', () => {
    const dated = { slug: 'z', order: 2, availability: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' } };
    const plain = { slug: 'essentiels', order: 1 };
    expect(JSON.stringify(materializePackWindow(dated))).toBe(JSON.stringify(dated));
    expect(JSON.stringify(materializePackWindow(plain))).toBe(JSON.stringify(plain));
  });
});
