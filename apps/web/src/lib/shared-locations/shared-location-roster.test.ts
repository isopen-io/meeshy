import { describe, expect, test } from 'bun:test';

import { decodeSharedLocationRoster, encodeSharedLocationRoster, encodeSharedLocationWithdrawals, EMPTY_ROSTER, rosterOps } from './shared-location-roster';

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
    expect(rosterOps.recipients(decodeSharedLocationRoster(text))).toEqual([{ userId: AMI, precision: 'city' }]);
    expect(rosterOps.entry(decodeSharedLocationRoster(text), AMI)).toEqual({ precision: 'city', until: NOW });
  });

  test('rien, ou du texte corrompu, rend la liste vide', () => {
    expect(decodeSharedLocationRoster(null)).toEqual(EMPTY_ROSTER);
    expect(decodeSharedLocationRoster('{')).toEqual(EMPTY_ROSTER);
  });
});

describe('le retrait en attente (#18388, iso #18204)', () => {
  const both = rosterOps.adding(rosterOps.adding(EMPTY_ROSTER, { userId: AMI, precision: 'city', durationMinutes: 60, now: NOW }), {
    userId: AUTRE,
    precision: 'exact',
    durationMinutes: 60,
    now: NOW,
  });

  test('retirer en attente sort la personne de la liste et garde son identifiant au plus 8 h', () => {
    const roster = rosterOps.withdrawing(both, AMI.toUpperCase(), NOW);
    expect(rosterOps.entry(roster, AMI)).toBeNull();
    expect(rosterOps.isWithdrawalPending(roster, AMI)).toBe(true);
    expect(rosterOps.hasPendingWithdrawals(roster)).toBe(true);
    expect(rosterOps.recipients(roster)).toEqual([{ userId: AUTRE, precision: 'exact' }]);
    expect(rosterOps.isWithdrawalPending(rosterOps.pruned(roster, NOW + 8 * HOUR), AMI)).toBe(false);
    expect(rosterOps.isWithdrawalPending(rosterOps.pruned(roster, NOW + 8 * HOUR - 1), AMI)).toBe(true);
  });

  test('retirer quelqu’un qui n’est pas dans la liste ne change rien', () => {
    expect(rosterOps.withdrawing(EMPTY_ROSTER, AMI, NOW)).toEqual(EMPTY_ROSTER);
  });

  test('un retrait seul garde la liste non vide, mais sans personne à qui envoyer', () => {
    const alone = rosterOps.withdrawing(rosterOps.removing(both, AUTRE), AMI, NOW);
    expect(rosterOps.isEmpty(alone)).toBe(false);
    expect(rosterOps.hasRecipients(alone)).toBe(false);
  });

  test('la liste soldée n’a plus de retrait ; une liste soldée et sans échéance passée est réglée', () => {
    const roster = rosterOps.withdrawing(both, AMI, NOW);
    expect(rosterOps.isSettled(roster, NOW)).toBe(false);
    expect(rosterOps.hasPendingWithdrawals(rosterOps.settled(roster))).toBe(false);
    expect(rosterOps.isSettled(rosterOps.settled(roster), NOW)).toBe(true);
    expect(rosterOps.isSettled(both, NOW + HOUR)).toBe(false);
  });

  test('ajouter de nouveau la personne retirée annule son retrait', () => {
    const roster = rosterOps.adding(rosterOps.withdrawing(both, AMI, NOW), { userId: AMI, precision: 'city', durationMinutes: 60, now: NOW });
    expect(rosterOps.isWithdrawalPending(roster, AMI)).toBe(false);
    expect(rosterOps.entry(roster, AMI)).not.toBeNull();
  });

  test('l’union garde les retraits des deux listes, à la borne la plus lointaine', () => {
    const a = rosterOps.withdrawing(both, AMI, NOW);
    const b = rosterOps.withdrawing(both, AMI, NOW + HOUR);
    expect(rosterOps.isWithdrawalPending(rosterOps.pruned(rosterOps.union(a, rosterOps.removing(b, AUTRE)), NOW + 8 * HOUR + 1), AMI)).toBe(true);
  });

  test('le retrait survit au rechargement, sans position, et une liste d’avant se relit sans retrait', () => {
    const roster = rosterOps.withdrawing(both, AMI, NOW);
    const withdrawals = encodeSharedLocationWithdrawals(roster);
    expect(withdrawals).not.toContain('latitude');
    expect(decodeSharedLocationRoster(encodeSharedLocationRoster(roster), withdrawals)).toEqual(roster);
    expect(encodeSharedLocationWithdrawals(both)).toBeNull();
    const before = JSON.stringify({ [AUTRE]: { precision: 'exact', until: NOW + HOUR } });
    expect(rosterOps.hasPendingWithdrawals(decodeSharedLocationRoster(before))).toBe(false);
    expect(rosterOps.entry(decodeSharedLocationRoster(before), AUTRE)).not.toBeNull();
  });

  test('la liste gardée garde le format d’avant : une version d’avant n’y voit que les personnes, et ne peut pas effacer les retraits', () => {
    const text = encodeSharedLocationRoster(rosterOps.withdrawing(both, AMI, NOW));
    expect(Object.keys(JSON.parse(text) as Record<string, unknown>)).toEqual([AUTRE]);
  });

  test('des retraits gardés sans liste (une version d’avant l’a effacée) se relisent quand même', () => {
    const withdrawals = encodeSharedLocationWithdrawals(rosterOps.withdrawing(both, AMI, NOW));
    const roster = decodeSharedLocationRoster(null, withdrawals);
    expect(rosterOps.isWithdrawalPending(roster, AMI)).toBe(true);
    expect(rosterOps.hasRecipients(roster)).toBe(false);
  });
});
