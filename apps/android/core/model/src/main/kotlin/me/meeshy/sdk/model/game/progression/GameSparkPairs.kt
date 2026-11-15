package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameLevel
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey

/**
 * LES DEUX PAIRES DES ÉTINCELLES (miroir de `GameSparkPairs`, iOS #10846, #10860) — TA LUMIÈRE (la poche, la seule valeur
 * réelle et la base du niveau) en grand et, en petit, ce qui a été reçu depuis toujours ; le niveau actuel et TA PLUS
 * HAUTE LUMIÈRE, qui survit à la Renaissance. TOUJOURS montrées, même quand la plus haute lumière égale le niveau.
 */
public data class GameSparkPairs(
    val pocket: Long,
    val cycle: Long,
    val lifetime: Long,
    val level: Int,
    val levelMax: Int,
) {
    /** « 12 000 reçues depuis toujours » — ou « 4 200 cet Âge · 12 000 en tout » après une renaissance. */
    val cumulLine: GameText get() = GameSparksHead.cumulLine(cycle = cycle, lifetime = lifetime)

    /** La phrase en petit sous le niveau : « Plus haute lumière : N ». */
    val levelRecordLine: GameText get() = GameText.of(GameTextKey.SparksLevelRecordLine, count(levelMax))

    /** Les quatre faits, dans l'ordre : ta lumière, reçues depuis toujours, niveau, ta plus haute lumière. */
    val facts: List<PieceDetailFact>
        get() = listOf(
            PieceDetailFact(GameText(GameTextKey.SparksPocketLabel), GameCopyLaws.points(bounded(pocket))),
            PieceDetailFact(GameText(GameTextKey.SparksLifetimeLabel), cumulValue()),
            PieceDetailFact(GameText(GameTextKey.SparksLevelLabel), number(level)),
            PieceDetailFact(GameText(GameTextKey.SparksLevelMaxLabel), number(levelMax)),
        )

    private fun cumulValue(): GameText =
        if (cycle < lifetime) {
            GameText.of(GameTextKey.SparksCumulRecord, count(cycle), count(lifetime))
        } else {
            number(bounded(lifetime))
        }

    public companion object {
        public fun of(block: GameLevel): GameSparkPairs {
            val ledger = ProgressionLevelPiece.ledger(block)
            return GameSparkPairs(ledger.pocket, ledger.cycle, ledger.lifetime, block.shown.level, block.shownLevelMaxLifetime)
        }

        private fun number(value: Int): GameText = GameText(GameTextKey.JoinedBySpace, listOf(GameTextArg.Count(value)))

        private fun count(value: Long): GameTextArg = GameTextArg.Count(bounded(value))

        private fun count(value: Int): GameTextArg = GameTextArg.Count(value)

        private fun bounded(value: Long): Int = value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
    }
}
