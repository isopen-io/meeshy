import { beforeAll, describe, expect, test } from 'bun:test';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';

import { stepDetail } from './game-detail';
import { afterSeasonClaim } from './game-optimistic-v2';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

/**
 * LES POINTS D'ÉTAPE DE LA SAISON SERVIE (#10232) — la fiche d'une étape et la
 * prochaine récompense du geste optimiste lisent `stepPoints` du bloc servi ;
 * sans lui (ancien serveur), la loi (100).
 */
beforeAll(async () => {
  await loadGameCatalog('fr');
});

const game = gameBlockWithExtrasFixture();
const season = (stepPoints?: number) => {
  const block = game.season;
  if (block === undefined || block === null) throw new Error('fixture');
  const { stepPoints: _drop, ...rest } = block;
  return stepPoints === undefined ? rest : { ...rest, stepPoints };
};
const view = (stepPoints?: number): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: { ...game, season: { ...season(stepPoints), steps: 14, claimedSteps: [1, 2, 3] } },
});

describe('la fiche d’une étape', () => {
  test('annonce les points de LA saison', () => {
    expect(JSON.stringify(stepDetail(season(150), 6).facts)).toContain('150');
  });

  test('sans stepPoints : les 100 de la loi', () => {
    expect(JSON.stringify(stepDetail(season(), 6).facts)).toContain('100');
  });
});

describe('réclamer une étape, de façon optimiste', () => {
  test('la prochaine récompense (une étape ordinaire) porte les points de la saison', () => {
    const next = afterSeasonClaim(view(150), 3 + 1);
    expect(next.game?.season?.nextReward).toEqual({ step: 5, reward: { kind: 'fragment', amount: 1 } });
    const further = afterSeasonClaim({ ...next, game: { ...next.game!, season: { ...next.game!.season!, claimedSteps: [1, 2, 3, 4, 5] } } }, 6);
    expect(further.game?.season?.nextReward).toEqual({ step: 7, reward: { kind: 'points', amount: 150 } });
  });
});
