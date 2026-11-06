import { describe, expect, it } from 'vitest';
import { packWindowState } from '../../types/pack-availability';
import {
  DECORATION_EVENTS,
  MONTHS_AFTER_EVENT,
  MONTHS_BEFORE_EVENT,
  decorationEventWindow,
  effectiveEventWindow,
  materializePackWindow,
} from '../decoration-event-window';

describe('la fenêtre d’une décoration d’événement (#16447)', () => {
  it('la règle : deux mois calendaires avant, un mois calendaire après, en UTC', () => {
    expect({ before: MONTHS_BEFORE_EVENT, after: MONTHS_AFTER_EVENT }).toEqual({ before: 2, after: 1 });
  });

  it('Noël 2026 s’ouvre le 25 octobre 2026 et se referme le 25 janvier 2027 (passage d’année à la fin)', () => {
    expect(decorationEventWindow({ id: 'noel', year: 2026 })).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
  });

  it('le Nouvel An 2027 s’ouvre le 1er novembre 2026 (passage d’année au début) et se referme le 1er février 2027', () => {
    expect(decorationEventWindow({ id: 'nouvel-an', year: 2027 })).toEqual({ startsAt: '2026-11-01T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' });
  });

  it('un jour sans équivalent dans le mois visé est borné au dernier jour de ce mois', () => {
    expect(decorationEventWindow({ date: { month: 8, day: 31 }, year: 2026 })).toEqual({ startsAt: '2026-06-30T00:00:00Z', endsAt: '2026-09-30T00:00:00Z' });
    expect(decorationEventWindow({ date: { month: 1, day: 31 }, year: 2027 }).endsAt).toBe('2027-02-28T00:00:00Z');
    expect(decorationEventWindow({ date: { month: 1, day: 31 }, year: 2028 }).endsAt).toBe('2028-02-29T00:00:00Z');
    expect(decorationEventWindow({ date: { month: 12, day: 31 }, year: 2026 })).toEqual({ startsAt: '2026-10-31T00:00:00Z', endsAt: '2027-01-31T00:00:00Z' });
  });

  it('le registre commence par Noël et le Nouvel An, à date fixe', () => {
    expect(DECORATION_EVENTS.noel).toEqual({ month: 12, day: 25 });
    expect(DECORATION_EVENTS['nouvel-an']).toEqual({ month: 1, day: 1 });
  });

  it('aujourd’hui (6 novembre 2026), une décoration de Noël sans date est déjà offerte', () => {
    expect(packWindowState(decorationEventWindow({ id: 'noel', year: 2026 }), new Date('2026-11-06T12:00:00Z'))).toBe('open');
    expect(packWindowState(decorationEventWindow({ id: 'noel', year: 2026 }), new Date('2026-10-24T23:59:59Z'))).toBe('upcoming');
    expect(packWindowState(decorationEventWindow({ id: 'noel', year: 2026 }), new Date('2027-01-25T00:00:00Z'))).toBe('closed');
  });
});

describe('une date écrite prime sur la règle', () => {
  const noel = { id: 'noel', year: 2026 } as const;

  it('les deux bornes écrites sont gardées telles quelles', () => {
    expect(effectiveEventWindow({ event: noel, availability: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' } })).toEqual({
      startsAt: '2026-12-01T00:00:00Z',
      endsAt: '2027-01-07T00:00:00Z',
    });
  });

  it('aucune borne écrite : les deux viennent de la règle', () => {
    expect(effectiveEventWindow({ event: noel })).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
    expect(effectiveEventWindow({ event: noel, availability: {} })).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
  });

  it('une seule borne écrite s’applique, l’autre vient de la règle', () => {
    expect(effectiveEventWindow({ event: noel, availability: { startsAt: '2026-12-01T00:00:00Z' } })).toEqual({ startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' });
    expect(effectiveEventWindow({ event: noel, availability: { endsAt: '2027-01-07T00:00:00Z' } })).toEqual({ startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' });
  });

  it('sans événement, la fenêtre écrite passe telle quelle, et l’absence reste une absence', () => {
    expect(effectiveEventWindow({ availability: { endsAt: '2027-01-07T00:00:00Z' } })).toEqual({ endsAt: '2027-01-07T00:00:00Z' });
    expect(effectiveEventWindow({})).toBeUndefined();
  });
});

describe('la génération matérialise la fenêtre pour les clients qui ne lisent que startsAt / endsAt', () => {
  it('un pack d’événement sans date reçoit la fenêtre dérivée, et la déclaration ne voyage pas', () => {
    expect(materializePackWindow({ slug: 'x', order: 1, event: { id: 'nouvel-an', year: 2027 } })).toEqual({
      slug: 'x',
      order: 1,
      availability: { startsAt: '2026-11-01T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' },
    });
  });

  it('la fenêtre prend la PLACE de la déclaration : un catalogue régénéré ne déplace aucune clé', () => {
    const served = materializePackWindow({ slug: 'x', event: { id: 'noel', year: 2026 }, rings: [] });
    expect(Object.keys(served)).toEqual(['slug', 'availability', 'rings']);
    const halfDated = materializePackWindow({ slug: 'y', availability: { endsAt: '2027-01-07T00:00:00Z' }, event: { id: 'noel', year: 2026 }, rings: [] });
    expect(Object.keys(halfDated)).toEqual(['slug', 'availability', 'rings']);
    expect(halfDated).toEqual({ slug: 'y', availability: { startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' }, rings: [] });
  });

  it('un pack daté ou hors événement ressort identique, à l’octet près', () => {
    const dated = { slug: 'noel-enneige', order: 2, availability: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-07T00:00:00Z' } };
    const plain = { slug: 'essentiels', order: 1 };
    expect(JSON.stringify(materializePackWindow(dated))).toBe(JSON.stringify(dated));
    expect(JSON.stringify(materializePackWindow(plain))).toBe(JSON.stringify(plain));
  });

  it('un événement inconnu du registre est refusé, jamais deviné', () => {
    expect(() => materializePackWindow({ slug: 'x', event: { id: 'inconnu', year: 2026 } })).toThrow(/inconnu/);
  });
});
