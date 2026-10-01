import { describe, expect, test } from 'bun:test';

import { isRestrictedVisibility, postStateOf, RESTRICTED_POST_VISIBILITIES, withPostRemoved } from './post-state';

/**
 * L'ÉTAT D'UNE PUBLICATION (#8876) — la passerelle ne sert ni « retirée » ni
 * « expirée » : elle sert `deletedAt` et `expiresAt`, et c'est l'écran qui dit
 * l'état. Un seul état prioritaire, comme `accountStateOf`.
 */
const NOW = new Date('2026-09-30T12:00:00.000Z');

describe('postStateOf — un seul état prioritaire : retirée > expirée > publiée', () => {
  test('une publication sans date de retrait ni d’expiration est publiée', () => {
    expect(postStateOf({ deletedAt: null, expiresAt: null }, NOW)).toBe('published');
  });

  test('une date de retrait la dit retirée, même si elle avait aussi expiré', () => {
    expect(postStateOf({ deletedAt: '2026-09-29T08:00:00.000Z', expiresAt: '2026-09-29T20:00:00.000Z' }, NOW)).toBe('deleted');
  });

  test('une story dont l’expiration est passée est expirée', () => {
    expect(postStateOf({ deletedAt: null, expiresAt: '2026-09-30T11:59:59.000Z' }, NOW)).toBe('expired');
  });

  test('l’instant exact de l’expiration compte comme expiré', () => {
    expect(postStateOf({ deletedAt: null, expiresAt: '2026-09-30T12:00:00.000Z' }, NOW)).toBe('expired');
  });

  test('une expiration à venir n’ôte rien : la story est encore publiée', () => {
    expect(postStateOf({ deletedAt: null, expiresAt: '2026-09-30T20:00:00.000Z' }, NOW)).toBe('published');
  });

  test('une date illisible ne fabrique pas d’état : publiée', () => {
    expect(postStateOf({ deletedAt: null, expiresAt: 'bientôt' }, NOW)).toBe('published');
  });
});

describe('withPostRemoved — l’effet optimiste du retrait sur la fiche en cache', () => {
  const fiche = { id: 'x', type: 'POST', deletedAt: null };

  test('pose la date de retrait sans muter l’original', () => {
    expect(withPostRemoved(fiche, '2026-09-30T12:00:00.000Z')).toEqual({ id: 'x', type: 'POST', deletedAt: '2026-09-30T12:00:00.000Z' });
    expect(fiche.deletedAt).toBeNull();
  });

  test('un cache illisible est rendu tel quel', () => {
    expect(withPostRemoved(null, '2026-09-30T12:00:00.000Z')).toBeNull();
  });
});

describe('isRestrictedVisibility — les trois audiences que la LISTE ne lit pas', () => {
  test('PRIVATE, ONLY et EXCEPT sont restreintes', () => {
    expect([...RESTRICTED_POST_VISIBILITIES]).toEqual(['PRIVATE', 'ONLY', 'EXCEPT']);
    for (const visibility of RESTRICTED_POST_VISIBILITIES) expect(isRestrictedVisibility(visibility)).toBe(true);
  });

  test('PUBLIC, FRIENDS et COMMUNITY ne le sont pas, ni une valeur absente', () => {
    for (const visibility of ['PUBLIC', 'FRIENDS', 'COMMUNITY', null, undefined, '']) expect(isRestrictedVisibility(visibility)).toBe(false);
  });

  test('la casse du serveur ne compte pas', () => {
    expect(isRestrictedVisibility('private')).toBe(true);
  });
});
