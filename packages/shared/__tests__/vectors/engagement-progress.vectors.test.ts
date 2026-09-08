/**
 * Suite de vecteurs pour `resolveEngagementProgress` — la loi de progression
 * des streaks & badges (#5547 web, #5698 iOS).
 *
 * `engagement-progress.vectors.json` est le CONTRAT cross-plateforme des deux
 * rejeux : ce fichier (TS, la source de vérité) et
 * `EngagementProgressVectorTests.swift` (iOS, via `EngagementProgressResolver`).
 * Le catalogue lui-même (axes, paliers, succès) est gardé à part par
 * `engagement-catalog-mirror-parity.test.ts`. Deux témoins, deux questions :
 * « les deux clients connaissent-ils les mêmes paliers ? » et « en tirent-ils
 * la même progression ? ».
 *
 * `expected` est une PROJECTION de la progression, pas l'objet entier : treize
 * axes × cinq paliers rendraient chaque vecteur illisible et chaque évolution
 * de forme une réécriture de fixture. Ce qui est projeté est exactement ce que
 * les deux écrans PEIGNENT — le niveau et sa barre, la série et sa barre, le
 * compte de badges, l'état vide, les succès débloqués, et par axe non vide le
 * nombre de badges, le prochain palier et la barre.
 *
 * @see packages/shared/utils/engagement-progress.ts
 * @see packages/shared/fixtures/reading-modes/engagement-progress.vectors.json
 */

import { runVectors } from './harness.js';
import type { EngagementProgressPayload } from '../../types/engagement.js';
import { resolveEngagementProgress } from '../../utils/engagement-progress.js';

type AxisProjection = {
  readonly reachedCount: number;
  readonly nextThreshold: number | null;
  readonly progress: number;
};

type ProgressProjection = {
  readonly level: number;
  readonly levelNext: number | null;
  readonly levelProgress: number;
  readonly streakNext: number | null;
  readonly streakProgress: number;
  readonly streakReached: number;
  readonly badgesEarned: number;
  readonly isEmpty: boolean;
  readonly achievements: readonly string[];
  readonly axes: Readonly<Record<string, AxisProjection>>;
};

function project(input: EngagementProgressPayload): ProgressProjection {
  const progress = resolveEngagementProgress(input);
  const axes = Object.fromEntries(
    progress.axes
      .filter((axis) => axis.value > 0 || axis.reachedCount > 0)
      .map((axis) => [axis.axisKey, { reachedCount: axis.reachedCount, nextThreshold: axis.nextThreshold, progress: axis.progress }]),
  );
  return {
    level: progress.level.level,
    levelNext: progress.level.nextThreshold,
    levelProgress: progress.level.progress,
    streakNext: progress.streak.nextThreshold,
    streakProgress: progress.streak.progress,
    streakReached: progress.streak.reachedCount,
    badgesEarned: progress.badgesEarned,
    isEmpty: progress.isEmpty,
    achievements: progress.achievements.filter((a) => a.unlocked).map((a) => a.key),
    axes,
  };
}

runVectors<EngagementProgressPayload, ProgressProjection>('engagement-progress', project);
