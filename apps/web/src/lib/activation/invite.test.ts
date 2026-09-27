import { describe, expect, test } from 'bun:test';

import { daysLeft, inviteDue, localDay, rememberInviteShown, wasInviteShownToday } from './invite';

/**
 * **L'INVITATION, AU PLUS UNE FOIS PAR JOUR ET PAR APPAREIL** (#8239). La
 * modal ne s'ouvre qu'en phase `invite` ; `quiet`, `done`, `blocked` et une
 * passerelle muette n'ouvrent rien. Le jour est celui de l'APPAREIL (sa date
 * locale), l'horloge est injectée.
 */
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('les jours restants', () => {
  test('arrondis au jour supérieur, jamais négatifs', () => {
    expect(daysLeft(new Date(NOW + 21 * DAY).toISOString(), NOW)).toBe(21);
    expect(daysLeft(new Date(NOW + 20 * DAY + 1).toISOString(), NOW)).toBe(21);
    expect(daysLeft(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe(1);
    expect(daysLeft(new Date(NOW - DAY).toISOString(), NOW)).toBe(0);
  });

  test('sans échéance lisible ⇒ null', () => {
    expect(daysLeft(null, NOW)).toBeNull();
    expect(daysLeft('pas une date', NOW)).toBeNull();
  });
});

describe('quand inviter', () => {
  const invite = { phase: 'invite', deadline: null, missing: ['email'] } as const;

  test('seulement en phase invite', () => {
    expect(inviteDue(invite)).toBe(true);
    expect(inviteDue({ ...invite, phase: 'quiet' })).toBe(false);
    expect(inviteDue({ ...invite, phase: 'blocked' })).toBe(false);
    expect(inviteDue({ phase: 'done', deadline: null, missing: ['phone'] })).toBe(false);
    expect(inviteDue(null)).toBe(false);
  });

  test('une invitation sans rien à demander ne s’ouvre pas', () => {
    expect(inviteDue({ ...invite, missing: [] })).toBe(false);
  });
});

describe('une fois par jour et par appareil', () => {
  test('montrée aujourd’hui ⇒ pas avant demain', () => {
    const storage = memoryStorage();
    expect(wasInviteShownToday(storage, NOW)).toBe(false);
    rememberInviteShown(storage, NOW);
    expect(wasInviteShownToday(storage, NOW)).toBe(true);
    expect(wasInviteShownToday(storage, NOW + 2 * 3_600_000)).toBe(localDay(NOW) === localDay(NOW + 2 * 3_600_000));
    expect(wasInviteShownToday(storage, NOW + DAY)).toBe(false);
  });

  test('le jour est la date LOCALE de l’appareil', () => {
    const local = new Date(NOW);
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    expect(localDay(NOW)).toBe(expected);
  });
});
