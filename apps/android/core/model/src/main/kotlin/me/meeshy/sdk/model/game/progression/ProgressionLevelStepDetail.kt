package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameLevelStep
import me.meeshy.sdk.model.game.GameLevelSteps
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.LevelStepFacts
import me.meeshy.sdk.model.game.LevelStepKind

/** La fiche du GESTE qui fait l'étape (iOS `LevelStepKind.concept`) : la frappe, les rêves, la Flamme, la Gloire. */
public val LevelStepKind.concept: ProgressionConcept
    get() = when (this) {
        LevelStepKind.Mint -> ProgressionConcept.Meesh
        LevelStepKind.Missions -> ProgressionConcept.Missions
        LevelStepKind.Flame -> ProgressionConcept.Flame
        LevelStepKind.Rank -> ProgressionConcept.Glory
    }

/** Les faits des épreuves que la passerelle sert (iOS `GameBlock.levelStepFacts`) ; `null` devant un serveur d'avant. */
public val GameBlock.levelStepFacts: LevelStepFacts?
    get() = level.ladder?.steps?.let { LevelStepFacts(it, glory.glory, glory.rank) }

/**
 * LES PRÉCISIONS D'UNE ÉPREUVE DES NIVEAUX (miroir de `GameElementDetails.levelStep`, iOS #9706) : son nom (« Épreuve
 * du niveau 10 : frapper ta première Meesh »), réussie, ou verrouillée avec où elle en est et sa jauge ; puis les dix
 * épreuves, une ligne chacune (« Niveau 10 » → « frapper ta première Meesh · réussie »), quand leurs faits sont servis.
 * Tout est lu sur l'épreuve et les faits servis : rien n'est recalculé ici que la passerelle sert.
 */
public data class LevelStepDetail(
    val level: Int,
    val concept: ProgressionConcept,
    val name: GameText,
    val met: Boolean,
    /** « Tu en es à 0 / 1 pour cette épreuve » ; `null` quand elle est réussie. */
    val missing: GameText?,
    /** La part parcourue d'une épreuve à faire ; `null` réussie ou sans cible. */
    val progress: Double?,
    val facts: List<PieceDetailFact>,
) {
    public companion object {
        public fun of(step: GameLevelStep, facts: LevelStepFacts?): LevelStepDetail = LevelStepDetail(
            level = step.level,
            concept = step.kind.concept,
            name = ProgressionLevelPiece.stepLine(step).line,
            met = step.met,
            missing = if (step.met) null else GameText.of(GameTextKey.DetailLevelStepProgress, GameTextArg.Nested(ProgressionLevelPiece.stepProgress(step))),
            progress = if (step.met) null else share(step.current, step.target),
            facts = facts?.let(GameLevelSteps::all).orEmpty().map(::row),
        )

        private fun row(step: GameLevelStep): PieceDetailFact = PieceDetailFact(
            label = GameText.of(GameTextKey.BannerLevel, GameTextArg.Count(step.level)),
            value = GameText(
                GameTextKey.JoinedBySpace,
                listOf(
                    GameTextArg.Nested(ProgressionConceptStatesMore.levelStepGoal(step)),
                    GameTextArg.Verbatim("·"),
                    GameTextArg.Nested(ProgressionLevelPiece.stepLine(step).state),
                ),
            ),
        )

        private fun share(done: Long, total: Long): Double? = if (total > 0) (done.toDouble() / total).coerceIn(0.0, 1.0) else null
    }
}
