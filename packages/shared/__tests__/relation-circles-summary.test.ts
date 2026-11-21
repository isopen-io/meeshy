/**
 * #19375 — la rangée « Mes cercles » : un agrégat sans identité, cinq niveaux et les demandes en attente.
 */
import { describe, it, expect } from 'vitest';
import { RELATION_SUMMARY_LEVELS, relationCirclesSummarySchema } from '../types/relation-circles-summary.js';
import { RELATION_LEVELS } from '../types/relation.js';

const servie = {
  counts: { COMMUNITY: 128, ACQUAINTANCE: 46, FRIEND: 31, CLOSE: 9, BLOOD: 3 },
  pendingRequests: 2,
};

describe('#19375 — relationCirclesSummarySchema', () => {
  it('compte les cinq cercles, dans l’ordre des niveaux, sans Public', () => {
    expect(RELATION_SUMMARY_LEVELS).toEqual(RELATION_LEVELS.filter((level) => level !== 'PUBLIC'));
  });

  it('lit la forme servie', () => {
    expect(relationCirclesSummarySchema.parse(servie)).toEqual(servie);
  });

  it('retire tout champ inconnu : un identifiant ne traverse jamais la frontière', () => {
    const parsed = relationCirclesSummarySchema.parse({ ...servie, userIds: ['507f1f77bcf86cd799439011'] });
    expect(Object.keys(parsed).sort()).toEqual(['counts', 'pendingRequests']);
  });

  it('refuse un compte négatif ou fractionnaire', () => {
    expect(relationCirclesSummarySchema.safeParse({ ...servie, pendingRequests: -1 }).success).toBe(false);
    expect(relationCirclesSummarySchema.safeParse({ ...servie, counts: { ...servie.counts, FRIEND: 1.5 } }).success).toBe(false);
  });
});
