import { describe, expect, test } from 'bun:test';

import { decodeSharedLocationRoster, encodeSharedLocationRoster, EMPTY_ROSTER, rosterOps } from './shared-location-roster';

/**
 * **À QUI JE MONTRE MA POSITION, ET JUSQU'À QUAND** (#18345, iso `SharedLocationRoster.swift`) —
 * le serveur ne connaît qu'UN partage, d'une durée pour toute la liste ; la liste garde
 * l'échéance de CHAQUE personne, et le terme serveur couvre toujours la plus lointaine.
 */

const AMI = 'a'.repeat(24);
const AUTRE = 'b'.repeat(24);
const NOW = Date.parse('2026-11-14T08:00:00.000Z');
const HOUR = 3_600_000;

describe('la liste', () => {
  test('ajouter pose l’échéance à maintenant + durée, en minuscules', () => {
    const roster = rosterOps.adding(EMPTY_ROSTER, { userId: AMI.toUpperCase(), precision: 'exact', durationMinutes: 60, now: NOW });
    expect(rosterOps.entry(roster, AMI)).toEqual({ precision: 'exact', until: NOW + HOUR });
  });

  test('retirer une personne laisse les autres', () => {
    const both = rosterOps.adding(rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: NOW }), {
      userId: AUTRE,
      precision: 'city',
      durationMinutes: 480,
      now: NOW,
    });
    const left = rosterOps.removing(both, AMI);
    expect(rosterOps.entry(left, AMI)).toBeNull();
    expect(rosterOps.recipients(left)).toEqual([{ userId: AUTRE, precision: 'city' }]);
  });

  test('élaguer retire ceux dont l’échéance est passée', () => {
    const roster = rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: NOW });
    expect(rosterOps.isEmpty(rosterOps.pruned(roster, NOW + HOUR))).toBe(true);
    expect(rosterOps.isEmpty(rosterOps.pruned(roster, NOW + HOUR - 1))).toBe(false);
  });

  test('la durée serveur couvre la plus lointaine des échéances', () => {
    const short = rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: NOW });
    expect(rosterOps.serverDurationMinutes(short, NOW)).toBe(60);
    const long = rosterOps.adding(short, { userId: AUTRE, precision: 'city', durationMinutes: 480, now: NOW });
    expect(rosterOps.serverDurationMinutes(long, NOW)).toBe(480);
    expect(rosterOps.nextDeadline(long)).toBe(NOW + HOUR);
  });

  test('l’union garde toutes les personnes que le serveur peut servir, la seconde l’emportant', () => {
    const a = rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: NOW });
    const b = rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'exact', durationMinutes: 60, now: NOW });
    const c = rosterOps.adding(b, { userId: AUTRE, precision: 'city', durationMinutes: 60, now: NOW });
    expect(rosterOps.entry(rosterOps.union(a, c), AMI)?.precision).toBe('exact');
    expect(rosterOps.recipients(rosterOps.union(a, c))).toHaveLength(2);
  });
});

describe('ce qui survit au rechargement', () => {
  test('identifiants, précisions et échéances, jamais une position', () => {
    const roster = rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'neighborhood', durationMinutes: 60, now: NOW });
    const text = encodeSharedLocationRoster(roster);
    expect(text).not.toContain('latitude');
    expect(decodeSharedLocationRoster(text)).toEqual(roster);
  });

  test('une précision inconnue se relit à la ville, une ligne illisible se saute', () => {
    const text = JSON.stringify({ [AMI]: { precision: 'satellite', until: NOW }, [AUTRE]: { precision: 'exact' }, nope: { precision: 'exact', until: NOW } });
    expect(decodeSharedLocationRoster(text)).toEqual({ [AMI]: { precision: 'city', until: NOW } });
  });

  test('rien, ou du texte corrompu, rend la liste vide', () => {
    expect(decodeSharedLocationRoster(null)).toEqual(EMPTY_ROSTER);
    expect(decodeSharedLocationRoster('{')).toEqual(EMPTY_ROSTER);
  });
});
