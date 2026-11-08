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
    const lu = relationLevelResponseSchema.parse({ userId: USER_ID, effectiveLevel: 'CLOSE', futureField: '2026-10-31' });
    expect(Object.keys(lu).sort()).toEqual(['effectiveLevel', 'userId']);
  });

  it('lit la forme élargie (#14910) : vue du lien, canRaise et raiseBlockedUntil', () => {
    const servi = {
      userId: USER_ID,
      effectiveLevel: 'FRIEND',
      grantedByMe: 'CLOSE',
      since: '2026-10-01T00:00:00.000Z',
      progress: { activeWeeks: 2, needed: 4, missing: [] },
      eligibleFor: null,
      canRaise: false,
      raiseBlockedUntil: '2026-11-30T00:00:00.000Z',
    };
    expect(relationLevelResponseSchema.parse(servi)).toEqual(servi);
  });

  it('refuse un canRaise qui n’est pas un booléen', () => {
    expect(relationLevelResponseSchema.safeParse({ userId: USER_ID, effectiveLevel: 'FRIEND', canRaise: 'oui' }).success).toBe(false);
  });
});
