import type { FlameStatus } from './flame.js';

/**
 * CE QUE LE JEU SIGNALE HORS DE SES ÉCRANS (#17796) — l'Offrande du jour est prête, la Flamme est à risque.
 *
 * Le client ne recalcule AUCUNE règle : la précocité, le jour du joueur et l'état de la Flamme sont décidés par la
 * passerelle et servis dans le bloc `game` (`chest.status`, `flame.status`). Cette loi ne fait que LIRE ce bloc —
 * le cache d'abord — et dire, en deux booléens, ce qui mérite un point : sur le barreau du menu, sur le bandeau.
 *
 * Miroirs, rejoués sur les mêmes cas : iOS `GameAttention` (`packages/MeeshySDK/.../Game/GameAttention.swift`),
 * Android `GameAttention` (`apps/android/core/model/.../game/GameAttention.kt`).
 *
 * « Jeu masqué » ⇒ rien. Aucun bloc (cache vide, ancien serveur) ⇒ rien. Aucune notification n'en découle (#17368).
 */
export type GameAttention = {
  readonly chestReady: boolean;
  readonly flameAtRisk: boolean;
};

export const NO_GAME_ATTENTION: GameAttention = { chestReady: false, flameAtRisk: false };

/** La part du bloc `game` que la loi lit — rien d'autre. */
export type GameAttentionSource = {
  readonly missions: { readonly unlocked: boolean };
  readonly chest: { readonly status: 'locked' | 'ready' | 'claimed' };
  readonly flame: { readonly status: FlameStatus; readonly days: number };
};

export function gameAttention(game: GameAttentionSource | null | undefined, options: { readonly hidden: boolean }): GameAttention {
  if (options.hidden || game === null || game === undefined) return NO_GAME_ATTENTION;
  return {
    chestReady: game.missions.unlocked && game.chest.status === 'ready',
    flameAtRisk: game.flame.status === 'at-risk' && game.flame.days > 0,
  };
}

/** Au moins un signal à montrer. */
export const hasGameAttention = (attention: GameAttention): boolean => attention.chestReady || attention.flameAtRisk;
