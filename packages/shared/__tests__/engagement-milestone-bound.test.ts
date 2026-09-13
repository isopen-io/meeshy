/**
 * **La borne de lecture des paliers se CALCULE (#5847).**
 *
 * `GET /me/engagement` lisait `take: 200` avec, juste au-dessus, un
 * commentaire annonçant « 82 aujourd'hui ». Le chiffre était juste le jour où
 * il a été écrit ; quatre axes sociaux et cent quatorze succès composés sont
 * arrivés depuis. La route tronquait donc, et son `orderBy: reachedAt desc`
 * faisait tomber les paliers les plus ANCIENS — les premiers succès de
 * l'utilisateur, ceux qui comptent le plus.
 *
 * Ces témoins n'épinglent pas un nombre : ils vérifient que la borne SUIT ses
 * catalogues. Un nombre épinglé serait exactement le défaut qu'on corrige.
 */

import { describe, it, expect } from 'vitest';
import {
  BADGE_THRESHOLDS,
  ENGAGEMENT_ACHIEVEMENT_KEYS,
  ENGAGEMENT_AXES,
  LEVEL_THRESHOLDS,
  STREAK_THRESHOLDS,
  maxEngagementMilestonesPerUser,
} from '../types/engagement.js';
import { ACHIEVEMENT_FAMILIES } from '../types/achievement-families.js';
import { ACHIEVEMENT_COUNT_TIERS, ACHIEVEMENT_SIZE_TIERS } from '../types/achievement-catalog.js';

describe('la borne de lecture des paliers', () => {
  const borne = maxEngagementMilestonesPerUser(ACHIEVEMENT_FAMILIES);

  it('compte TOUT ce qu\'un compte peut graver — recomposé indépendamment', () => {
    const composes = ACHIEVEMENT_FAMILIES.filter((f) => f.scale === 'count').length * ACHIEVEMENT_COUNT_TIERS.length
      + ACHIEVEMENT_FAMILIES.filter((f) => f.scale === 'size').length * ACHIEVEMENT_SIZE_TIERS.length;

    expect(borne).toBe(
      ENGAGEMENT_AXES.length * BADGE_THRESHOLDS.length
        + STREAK_THRESHOLDS.length
        + LEVEL_THRESHOLDS.length
        + ENGAGEMENT_ACHIEVEMENT_KEYS.length
        + composes,
    );
  });

  it("a DÉPASSÉ le 200 écrit à la main — c'est le défaut mesuré", () => {
    expect(borne).toBeGreaterThan(200);
  });

  it('SUIT le catalogue : une famille de plus élargit la borne', () => {
    const avec = maxEngagementMilestonesPerUser([
      ...ACHIEVEMENT_FAMILIES,
      { section: 'cercles', subject: 'licorne', verb: 'invoke', scale: 'size', baseDifficulty: 9 },
    ]);
    expect(avec).toBe(borne + ACHIEVEMENT_SIZE_TIERS.length);
  });
});
