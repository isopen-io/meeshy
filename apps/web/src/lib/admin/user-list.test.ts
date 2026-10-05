import { describe, expect, test } from 'bun:test';

import { periodStart } from './period';
import { ADMIN_ROLES, ADMINISTRATION_RANK, USER_LIST_SPEC, userListFiltersOf } from './user-list';

const NOW = new Date('2026-09-30T12:00:00.000Z');

describe('userListFiltersOf — les filtres tels que la passerelle les lit', () => {
  test('un rôle part tel quel', () => {
    expect(userListFiltersOf({ role: 'MODERATOR' }, NOW)).toEqual({ role: 'MODERATOR' });
  });

  test('le rang d’administration devient la liste BIGBOSS,ADMIN — ce que compte la carte « Administrateurs »', () => {
    expect(userListFiltersOf({ role: ADMINISTRATION_RANK }, NOW)).toEqual({ role: 'BIGBOSS,ADMIN' });
  });

  test('le rang d’administration n’est PAS un rôle : il ne se donne à personne', () => {
    expect([...ADMIN_ROLES]).not.toContain(ADMINISTRATION_RANK);
    expect(USER_LIST_SPEC.filters.role).toContain(ADMINISTRATION_RANK);
  });

  test('la période devient une borne createdAfter, et le rang d’administration se combine avec elle', () => {
    expect(userListFiltersOf({ role: ADMINISTRATION_RANK, period: '7d' }, NOW)).toEqual({
      role: 'BIGBOSS,ADMIN',
      createdAfter: periodStart('7d', NOW),
    });
  });

  test('un filtre vide ne part pas', () => {
    expect(userListFiltersOf({}, NOW)).toEqual({});
  });
});
