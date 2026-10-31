package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameLevel
import me.meeshy.sdk.model.game.GameLevelStep
import me.meeshy.sdk.model.game.GameSparks
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelStepKind
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MythicSeatRef
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementCatalog
import me.meeshy.sdk.model.game.guide.GameGuideEvents

/** Une puce de « Comment gagner » : une famille et ce qu'un de ses gestes rapporte au plus (iOS `GameHero.EarnItem`). */
public data class LevelEarnItem(val family: EngagementAxisFamily, val weight: Int)

/** La prochaine épreuve des niveaux sous la barre (iOS `GameLevelStepRow`) : sa ligne, son état, faite ou non. */
public data class LevelStepLine(val line: GameText, val state: GameText, val met: Boolean)

/**
 * L'ANNEAU DU NIVEAU, en tête de sa fiche (miroir de `GameHeroView`, iOS #5841) — OÙ J'EN SUIS puis COMMENT JE GAGNE :
 * l'anneau, le palier, « Niveau N », ce qui sépare du suivant (ou pourquoi le niveau attend, ou le plafond), la barre et
 * la prochaine épreuve ; les deux paires des étincelles (ta lumière / reçues depuis toujours, niveau / au plus haut) ;
 * le blason, le rang et la gloire ; une puce par famille, DÉRIVÉE du barème. Tout est lu sur la VÉRITÉ du niveau
 * (`level.shown`, #9688) : rien n'est calculé ici que la passerelle sert.
 */
public data class ProgressionLevelPiece(
    val level: Int,
    val progress: Double,
    val tier: LevelTierKey,
    val prestige: Int,
    /** Redescendu sous son record : le repère fantôme reste au bout de la barre et de l'anneau. */
    val belowRecord: Boolean,
    val tierName: GameText,
    val title: GameText,
    val toNext: GameText,
    val step: LevelStepLine?,
    val pocket: GameText,
    val cumul: GameText,
    val levelShown: GameText,
    val levelRecord: GameText,
    val rank: GloryRank,
    val division5: Int?,
    val mythic: MythicSeatRef?,
    val rankLabel: GameText,
    val glory: GameText,
    /** L'ordre de la marche tenue (iOS `GameGuideEvents.standingOrder`) : l'écu ne monte que quand il GRANDIT. */
    val standingOrder: Int,
    val earn: List<LevelEarnItem>,
) {
    public companion object {
        public fun of(game: GameBlock): ProgressionLevelPiece {
            val block = game.level
            val shown = block.shown
            val ledger = ledger(block)
            val glory = game.glory
            return ProgressionLevelPiece(
                level = shown.level,
                progress = shown.progress,
                tier = shown.tier,
                prestige = block.prestige,
                belowRecord = shown.record > shown.level,
                tierName = GameCopyLaws.tierName(shown.tier),
                title = GameText.of(GameTextKey.HeroLevel, count(shown.level)),
                toNext = toNext(block),
                step = shown.step?.let(::stepLine),
                pocket = GameText(GameTextKey.JoinedBySpace, listOf(count(ledger.pocket))),
                cumul = GameSparksHead.cumulLine(cycle = ledger.cycle, lifetime = ledger.lifetime),
                levelShown = GameText(GameTextKey.JoinedBySpace, listOf(count(shown.level))),
                levelRecord = GameText.of(GameTextKey.SparksLevelRecordLine, count(block.shownLevelMaxLifetime)),
                rank = glory.rank,
                division5 = glory.shownDivision,
                mythic = glory.mythicSeat,
                rankLabel = ProgressionConceptModel.rankLabel(glory),
                glory = GameCopyLaws.gloryAmount(count(glory.glory)),
                standingOrder = GameGuideEvents.standingOrder(game),
                earn = earnItems(),
            )
        }

        /** Les étincelles servies, lues comme iOS `sparkFacts` : la poche, le cycle, le total à vie. */
        internal fun ledger(block: GameLevel): GameSparks.Ledger =
            GameSparks.ledgerOf(block.sparks ?: block.score, block.sparksCycle ?: block.score, block.sparksLifetime)

        /** Retenu par une épreuve, la ligne dit POURQUOI le niveau attend ; au plafond, ce qui ouvre la suite. */
        internal fun toNext(block: GameLevel): GameText {
            val shown = block.shown
            val step = shown.step
            if (shown.held && step != null) return ProgressionConceptStatesMore.levelHeld(step)
            if (shown.nextThreshold == null) return ProgressionConceptStatesMore.levelTop(shown.cap)
            return GameCopyLaws.levelToNext(bounded(shown.pointsToNext), shown.level + 1)
        }

        /** « Épreuve du niveau 10 : frapper ta première Meesh », puis « réussie » ou où elle en est. */
        private fun stepLine(step: GameLevelStep): LevelStepLine {
            val line = GameText.of(GameTextKey.LevelStepLine, count(step.level), GameTextArg.Nested(ProgressionConceptStatesMore.levelStepGoal(step)))
            val ratio = GameText.of(GameTextKey.Ratio, count(minOf(step.current, step.target)), count(step.target))
            val progress = if (step.kind == LevelStepKind.Rank) GameCopyLaws.gloryAmount(GameTextArg.Nested(ratio)) else ratio
            return LevelStepLine(line, if (step.met) GameText(GameTextKey.LevelStepDone) else progress, step.met)
        }

        /** « Comment gagner » : une puce par famille, par gain maximal DÉCROISSANT — jamais un barème recopié. */
        public fun earnItems(): List<LevelEarnItem> =
            EngagementCatalog.familiesByTopPoints().map { LevelEarnItem(it, EngagementCatalog.familyTopPoints.getValue(it)) }

        private fun bounded(value: Long): Int = value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()

        private fun count(value: Int): GameTextArg = GameTextArg.Count(value)

        private fun count(value: Long): GameTextArg = GameTextArg.Count(bounded(value))
    }
}
