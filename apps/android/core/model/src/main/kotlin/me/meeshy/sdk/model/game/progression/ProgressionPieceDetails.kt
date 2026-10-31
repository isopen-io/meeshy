package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameGlory
import me.meeshy.sdk.model.game.GameLevel
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey

/** Ce qu'une PIÈCE de tête ouvre quand on la touche (iOS `GameElementKind`) : l'anneau, le blason. */
public enum class PieceDetailKind { LevelRing, Rank }

/** Une ligne « libellé → valeur » de la feuille d'une pièce. */
public data class PieceDetailFact(val label: GameText, val value: GameText)

/**
 * LES PRÉCISIONS D'UNE PIÈCE DE TÊTE (miroir de `GameElementDetails.levelRing` / `.rank`, iOS) : le nom, la valeur
 * en grand avec sa jauge quand il y a une suite, et les lignes — rien d'inventé, ce qui n'est pas servi ne se dit pas.
 */
public data class PieceDetail(
    val kind: PieceDetailKind,
    val key: String,
    val name: GameText,
    val value: GameText,
    val progress: Double?,
    val facts: List<PieceDetailFact>,
)

public object ProgressionPieceDetails {

    /**
     * L'anneau : « Niveau 34 · Éclat », ce qui sépare du suivant (ou le plafond, sans jauge), puis les deux paires des
     * étincelles — la poche, base du niveau (#10892), et le cumul indicatif —, le rang qui ouvre la suite au plafond et
     * le record quand on a redescendu.
     */
    public fun levelRing(block: GameLevel): PieceDetail {
        val level = block.shown
        val atTop = level.nextThreshold == null
        val ledger = ProgressionLevelPiece.ledger(block)
        val pairs = listOf(
            PieceDetailFact(GameText(GameTextKey.SparksPocketLabel), GameCopyLaws.points(bounded(ledger.pocket))),
            PieceDetailFact(GameText(GameTextKey.SparksLifetimeLabel), cumulValue(ledger.cycle, ledger.lifetime)),
            PieceDetailFact(GameText(GameTextKey.SparksLevelLabel), number(level.level)),
            PieceDetailFact(GameText(GameTextKey.SparksLevelMaxLabel), number(block.shownLevelMaxLifetime)),
        )
        val top = if (atTop) PieceDetailFact(GameText(GameTextKey.FactNextLevel), ProgressionConceptModel.levelTopShort(level.cap)) else null
        val record = if (level.record > level.level) {
            PieceDetailFact(GameText(GameTextKey.FactRecord), GameText.of(GameTextKey.BannerLevel, GameTextArg.Count(level.record)))
        } else {
            null
        }
        return PieceDetail(
            kind = PieceDetailKind.LevelRing,
            key = "${level.level}",
            name = GameText(
                GameTextKey.JoinedBySpace,
                listOf(
                    GameTextArg.Nested(GameText.of(GameTextKey.BannerLevel, GameTextArg.Count(level.level))),
                    GameTextArg.Verbatim("·"),
                    GameTextArg.Nested(GameCopyLaws.tierName(level.tier)),
                ),
            ),
            value = if (atTop) {
                ProgressionConceptStatesMore.levelTop(level.cap)
            } else {
                GameCopyLaws.levelToNext(bounded(level.pointsToNext), level.level + 1)
            },
            progress = if (atTop) null else level.progress,
            facts = pairs + listOfNotNull(top, record),
        )
    }

    /** Le blason : le rang et sa division, la gloire en grand, le rang suivant et ce qu'il manque pour lui. */
    public fun rank(glory: GameGlory): PieceDetail {
        val next = glory.next?.let { ProgressionConceptModel.rankLabel(it.rank, it.division5 ?: it.division) }
        val missing = next?.let { name ->
            glory.gloryMissing?.let {
                PieceDetailFact(GameText.of(GameTextKey.FactMissingForRank, GameTextArg.Nested(name)), GameCopyLaws.gloryAmount(GameTextArg.Count(it)))
            }
        }
        return PieceDetail(
            kind = PieceDetailKind.Rank,
            key = glory.rank.name + (glory.shownDivision?.let { ".$it" } ?: ""),
            name = ProgressionConceptModel.rankLabel(glory),
            value = GameCopyLaws.gloryAmount(GameTextArg.Count(glory.glory)),
            progress = if (glory.next == null) null else glory.progress,
            facts = listOfNotNull(next?.let { PieceDetailFact(GameText(GameTextKey.FactNextRank), it) }, missing),
        )
    }

    /** `GameSparksCopy.cumulValue` : sans renaissance le total seul ; après, cet Âge d'abord, puis le tout. */
    private fun cumulValue(cycle: Long, lifetime: Long): GameText =
        if (cycle < lifetime) {
            GameText.of(GameTextKey.SparksCumulRecord, GameTextArg.Count(bounded(cycle)), GameTextArg.Count(bounded(lifetime)))
        } else {
            number(bounded(lifetime))
        }

    private fun number(value: Int): GameText = GameText(GameTextKey.JoinedBySpace, listOf(GameTextArg.Count(value)))

    private fun bounded(value: Long): Int = value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
}
