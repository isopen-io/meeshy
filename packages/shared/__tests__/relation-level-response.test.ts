import { describe, it, expect } from 'vitest';
import { RELATION_LEVELS } from '../types/relation.js';
import { relationLevelResponseSchema } from '../types/relation-level-response.js';

const USER_ID = '507f1f77bcf86cd799439011';

describe('relationLevelResponseSchema (GET /relations/:userId)', () => {
  it.each(RELATION_LEVELS)('accepte le niveau %s', (effectiveLevel) => {
    expect(relationLevelResponseSchema.parse({ userId: USER_ID, effectiveLevel })).toEqual({
      userId: USER_ID,
      effectiveLevel,
    });
  });

  it("refuse un niveau hors de l'échelle, ATOM compris (réservé, jamais servi)", () => {
    expect(relationLevelResponseSchema.safeParse({ userId: USER_ID, effectiveLevel: 'ATOM' }).success).toBe(false);
    expect(relationLevelResponseSchema.safeParse({ userId: USER_ID, effectiveLevel: 'friend' }).success).toBe(false);
  });

  it('exige les deux champs', () => {
    expect(relationLevelResponseSchema.safeParse({ userId: USER_ID }).success).toBe(false);
    expect(relationLevelResponseSchema.safeParse({ effectiveLevel: 'FRIEND' }).success).toBe(false);
  });

  it("retire un champ inconnu : un client plus ancien lit un serveur plus récent sans l'échouer", () => {
    const lu = relationLevelResponseSchema.parse({ userId: USER_ID, effectiveLevel: 'CLOSE', since: '2026-10-31' });
    expect(Object.keys(lu).sort()).toEqual(['effectiveLevel', 'userId']);
  });
});
