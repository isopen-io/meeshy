import type { FeedCardMedia, FeedCardModel, FeedCardScene } from '@/lib/feed/card-model';

import { reelDisplayOf, type ReelDisplay } from './thread';

/**
 * LA LOI D'UN RÉEL COMPOSÉ (#6903) — PURE, miroir de `ReelSceneRouting`,
 * `ReelSceneProgress` et `ReelMediaAutostart` (`ReelPlaybackRules.swift`).
 *
 * **La scène décide AVANT le média** (`reelStageOf`) : un réel qui porte une
 * scène (`FeedCardModel.scene`, D-78) la joue — MÊME si `media` porte aussi
 * une vidéo, la scène en est le fond, coupée si l'auteur l'a coupée
 * (`ReelsPlayerView.swift:900-904`, « la scène AVANT le média, un seul
 * `if` »). Sans scène, le repli est `reelDisplayOf` (`lib/reels/thread.ts`),
 * inchangé.
 */
export type ReelStage<M> = { readonly kind: 'scene'; readonly scene: FeedCardScene } | ReelDisplay<M>;

export function reelStageOf(model: Pick<FeedCardModel, 'scene' | 'media'>): ReelStage<FeedCardMedia> {
  return model.scene !== undefined ? { kind: 'scene', scene: model.scene } : reelDisplayOf(model.media);
}

/**
 * `reelSceneProgress` — miroir `ReelSceneProgress.fraction(elapsed:duration:)`
 * (`ReelPlaybackRules.swift:93-98`) : `0` si `duration ≤ 0`, sinon borné
 * `[0, 1]`.
 */
export function reelSceneProgress(params: { readonly elapsed: number; readonly duration: number }): number {
  const { elapsed, duration } = params;
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, elapsed / duration));
}

/**
 * `reelScenePlays` — la porte du web (§ 1.5.4 de la spécification) : ni
 * révélation liquide ni pile d'appel côté web, donc `active ∧ ¬paused ∧
 * ¬documentHidden`, jamais `ReelMediaAutostart.shouldStart` telle quelle.
 */
export function reelScenePlays(params: { readonly active: boolean; readonly paused: boolean; readonly documentHidden: boolean }): boolean {
  return params.active && !params.paused && !params.documentHidden;
}

/**
 * `reelSceneDuration` — la durée DÉCLARÉE (`timelineDuration`, autoritaire)
 * gagne ; sinon la plus longue durée que le moteur et la piste de son de
 * fond ont REMONTÉE (`onDurationKnown`) ; sinon `null` — aucune durée connue
 * n'affiche aucune barre (loi 4 : un contrôle qui ne bougerait jamais est un
 * contrôle qui ment).
 */
export function reelSceneDuration(params: { readonly declared: number | null; readonly knownMs: readonly number[] }): number | null {
  if (params.declared !== null) return params.declared;
  if (params.knownMs.length === 0) return null;
  return Math.max(...params.knownMs) / 1000;
}
