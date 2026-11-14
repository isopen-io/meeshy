import { gameActsRing, type GameActsRingSource } from './acts-ring.js';
import { gameAttention, type GameAttention, type GameAttentionSource } from './attention.js';

/**
 * LE BANDEAU REVIENT QUAND QUELQUE CHOSE CHANGE (#17366, retouche 3 — décision porteur du 2026-11-11).
 *
 * Le bandeau du joueur paraît à l'ouverture de l'app (#9536), puis s'en va. Il REVIENT quelques secondes, puis repart
 * seul, quand le bloc `game` servi dit qu'un acte du Rêve vient d'être réalisé, que l'Offrande vient d'être prête, ou
 * que la Flamme vient de passer à risque. Rien de permanent sur l'écran des conversations (#17365).
 *
 * Le client ne recalcule AUCUNE règle : il compare deux lectures successives du bloc servi (`gameActsRing`,
 * `gameAttention`) et dit ce qui vient de NAÎTRE. Un signal déjà levé ne rappelle pas deux fois ; ce qui retombe
 * (nouveau jour, Offrande ouverte, Flamme sauvée) ne rappelle rien ; la première lecture non plus, puisque l'ouverture
 * montre déjà le bandeau. Aucune notification n'en découle (#17368).
 *
 * Miroirs, rejoués sur les mêmes cas : iOS `GameBannerRecall` (`packages/MeeshySDK/.../Game/GameAttention.swift`),
 * Android `GameBannerRecall` (`apps/android/core/model/.../game/GameBannerRecall.kt`).
 */
export type BannerRecallReason = 'offering-ready' | 'act' | 'flame-at-risk';

/** Ce que le bandeau compare d'une lecture à l'autre. */
export type BannerMoment = {
  readonly actsDone: number;
  readonly attention: GameAttention;
};

export type BannerMomentSource = GameActsRingSource & GameAttentionSource;

export { PLAYER_BANNER_RECALL_MS } from './banner-recall-timing.js';

export function bannerMoment(game: BannerMomentSource | null | undefined, options: { readonly hidden: boolean }): BannerMoment | null {
  if (options.hidden || game === null || game === undefined) return null;
  return { actsDone: gameActsRing(game, options)?.done ?? 0, attention: gameAttention(game, options) };
}

/** Ce qui vient de naître entre deux lectures, par ordre d'importance ; `null` ⇒ le bandeau ne revient pas. */
export function bannerRecall(before: BannerMoment | null, after: BannerMoment | null): BannerRecallReason | null {
  if (before === null || after === null) return null;
  if (after.attention.chestReady && !before.attention.chestReady) return 'offering-ready';
  if (after.actsDone > before.actsDone) return 'act';
  if (after.attention.flameAtRisk && !before.attention.flameAtRisk) return 'flame-at-risk';
  return null;
}
