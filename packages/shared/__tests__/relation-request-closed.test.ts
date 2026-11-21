import { describe, it, expect } from 'vitest';
import { RELATION_LEVELS, type RelationLevel } from '../types/relation';
import { CONTACT_REQUESTS_CLOSED, contactRequestsOpen } from '../utils/relation-request';

describe('#19362 — accepter les demandes de connexion', () => {
  it('le code du refus est stable', () => {
    expect(CONTACT_REQUESTS_CLOSED).toBe('CONTACT_REQUESTS_CLOSED');
  });

  it.each(RELATION_LEVELS.map((level) => [level]))('ouvertes ou non précisées, une demande depuis %s passe', (currentLevel) => {
    expect(contactRequestsOpen({ allowContactRequests: true, currentLevel })).toBe(true);
    expect(contactRequestsOpen({ allowContactRequests: undefined, currentLevel })).toBe(true);
  });

  const expected: ReadonlyArray<readonly [RelationLevel, boolean]> = [
    ['PUBLIC', false],
    ['COMMUNITY', false],
    ['ACQUAINTANCE', true],
    ['FRIEND', true],
    ['CLOSE', true],
    ['BLOOD', true],
  ];

  it.each(expected)('fermées : depuis %s, ouvertes = %s (une montée entre personnes liées reste permise)', (currentLevel, open) => {
    expect(contactRequestsOpen({ allowContactRequests: false, currentLevel })).toBe(open);
  });
});
