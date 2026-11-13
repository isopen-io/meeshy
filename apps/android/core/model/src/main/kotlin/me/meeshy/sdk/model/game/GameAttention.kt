package me.meeshy.sdk.model.game

/**
 * **Ce que le Jeu signale hors de ses écrans** (#17796) — l'Offrande du jour est prête, la Flamme est à risque.
 *
 * Miroir de `gameAttention` (`packages/shared/utils/game/attention.ts`) et de `GameAttention` iOS
 * (`packages/MeeshySDK/.../Game/GameAttention.swift`), rejoué sur les mêmes cas. Le client ne recalcule AUCUNE règle :
 * il LIT `chest.status` et `flame.status` servis dans le bloc `game` — le cache d'abord. « Jeu masqué » ou aucun bloc
 * ⇒ rien. Aucune notification n'en découle (#17368).
 */
public data class GameAttention(
    /** L'Offrande du jour est prête à s'ouvrir. */
    val chestReady: Boolean,
    /** La Flamme s'éteindra si rien n'est fait aujourd'hui. */
    val flameAtRisk: Boolean,
) {
    /** Au moins un signal à montrer. */
    val isRaised: Boolean get() = chestReady || flameAtRisk

    public companion object {
        public val None: GameAttention = GameAttention(chestReady = false, flameAtRisk = false)

        /** La loi, sur la seule part du bloc qu'elle lit. */
        public fun of(missionsUnlocked: Boolean, chest: ChestStatus, flame: FlameStatus, flameDays: Int): GameAttention =
            GameAttention(
                chestReady = missionsUnlocked && chest == ChestStatus.Ready,
                flameAtRisk = flame == FlameStatus.AtRisk && flameDays > 0,
            )

        public fun of(game: GameBlock?, hidden: Boolean): GameAttention {
            if (hidden || game == null) return None
            return of(game.missions.unlocked, game.chest.status, game.flame.status, game.flame.days)
        }
    }
}
