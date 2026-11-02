package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameLevel
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.sparkLedger

/**
 * LA TÊTE DE LA FICHE DES ÉTINCELLES (miroir de `GameSparksHeadModel`, iOS, #11180) — TA LUMIÈRE lue par son nom : la
 * poche en grand, et en petit ce qui a été reçu depuis toujours (« 12 000 reçues depuis toujours », ou après une
 * renaissance « 4 200 cet Âge · 12 000 en tout ») ; l'Ombre au-dessus de tout quand une dette existe. Le libellé
 * « Ta lumière » est fixe : l'écran le pose lui-même.
 */
public data class GameSparksHead(
    /** L'Ombre, en une ligne, quand elle existe. */
    val shadow: GameText?,
    val pocket: GameText,
    /** Le « depuis toujours » ; `null` devant un serveur d'avant les étincelles. */
    val lifetime: GameText?,
) {
    /** Les faits que la tête montre, dans l'ordre de lecture. */
    val facts: List<ConceptFact>
        get() = listOfNotNull(
            shadow?.let { ConceptFact.SparksDebt },
            ConceptFact.SparksPocket,
            lifetime?.let { ConceptFact.SparksLifetime },
        )

    public companion object {
        public fun of(level: GameLevel): GameSparksHead {
            val ledger = level.sparkLedger
            val debt = level.sparksDebt ?: 0L
            return GameSparksHead(
                shadow = if (debt > 0) GameText.of(GameTextKey.SparksDebt, count(debt)) else null,
                pocket = GameCopyLaws.points(bounded(ledger?.pocket ?: level.score)),
                lifetime = ledger?.let { cumulLine(cycle = it.cycle, lifetime = it.lifetime) },
            )
        }

        /** `GameSparksCopy.cumulLine` : sans renaissance le total seul ; après, cet Âge d'abord, puis le tout. */
        public fun cumulLine(cycle: Long, lifetime: Long): GameText =
            if (cycle < lifetime) {
                GameText.of(GameTextKey.SparksCumulRecord, count(cycle), count(lifetime))
            } else {
                GameText.of(GameTextKey.SparksRecordLine, count(lifetime))
            }

        private fun bounded(value: Long): Int = value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()

        private fun count(value: Long): GameTextArg = GameTextArg.Count(bounded(value))
    }
}
