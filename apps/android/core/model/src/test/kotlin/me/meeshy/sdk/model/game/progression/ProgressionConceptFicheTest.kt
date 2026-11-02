package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.AtlasPending
import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GameAtlasBlock
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GameTrophiesBlock
import me.meeshy.sdk.model.game.GameTrophyItem
import me.meeshy.sdk.model.game.GameVisibility
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

/**
 * « OÙ J'EN SUIS » NE REDIT RIEN (iOS `ProgressionConceptFiche`, #11180) : un fait ne paraît qu'une fois par écran. La
 * phrase d'état disparaît dès qu'elle enchâsse un fait que la tête ou les gestes montrent déjà ; les lignes ne redisent
 * ni l'écran, ni la phrase. On compare des IDENTITÉS ([ConceptFact]), jamais des chaînes.
 */
class ProgressionConceptFicheTest {

    private val moment = SeasonMoment("2026-10-20", 600)
    private val now = 1_792_000_000_000L

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun progress(game: GameBlock? = null): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = game))

    private fun fiche(concept: ProgressionConcept, game: GameBlock?, progress: EngagementProgress = progress(game)) =
        ProgressionConceptFiches.make(concept, progress, game, now, moment)

    private fun GameBlock.withFlame(status: FlameStatus) = copy(flame = flame.copy(status = status))

    @Test
    fun `la fiche des Etincelles a sa tete et ne redit jamais la poche`() {
        val block = game()
        val points = fiche(ProgressionConcept.Points, block)

        assertThat(points.head).isEqualTo(FicheHead.Sparks(GameSparksHead.of(block.level)))
        assertThat(points.heroLine).isNull()
        assertThat(points.state).isNull()
        assertThat(points.hasWhere).isFalse()
    }

    @Test
    fun `la gloire dit son rang dans la phrase et les lignes ne la redisent pas`() {
        val glory = fiche(ProgressionConcept.Glory, game())

        assertThat(glory.head).isEqualTo(FicheHead.Generic)
        assertThat(glory.state).isNull()
        assertThat(glory.facts.map { it.identity })
            .containsExactly(ConceptFact.RankNext, ConceptFact.GloryMissing).inOrder()
        assertThat(glory.facts.map { it.label.key })
            .containsExactly(GameTextKey.FactNextRank, GameTextKey.FactMissingForRank).inOrder()
    }

    @Test
    fun `une Flamme eteinte se dit dans la phrase et son etat ne se redit pas en ligne`() {
        val flame = fiche(ProgressionConcept.Flame, game().withFlame(FlameStatus.Out))

        assertThat(flame.state?.text?.key).isEqualTo(GameTextKey.StateFlameOut)
        assertThat(flame.facts.map { it.identity }).containsExactly(ConceptFact.StreakRecord)
    }

    @Test
    fun `une Flamme allumee laisse ses tuiles aux gestes et garde son record`() {
        val flame = fiche(ProgressionConcept.Flame, game())

        assertThat(flame.state).isNull()
        assertThat(flame.heroLine).isNull()
        assertThat(flame.facts.map { it.label.key }).containsExactly(GameTextKey.FactRecord)
    }

    @Test
    fun `une Flamme sans geste aujourd hui dit son etat en ligne`() {
        val flame = fiche(ProgressionConcept.Flame, game().withFlame(FlameStatus.None))

        assertThat(flame.state?.text?.key).isEqualTo(GameTextKey.StateFlameNone)
        assertThat(flame.facts.map { it.value.key }).contains(GameTextKey.FlameStatusNone)
    }

    @Test
    fun `l Atlas laisse ses tampons a la tete et dit les echanges a moitie faits et qui le voit`() {
        val block = game().copy(
            atlas = GameAtlasBlock(stamped = 3, total = 83, stamps = emptyList(), pending = listOf(AtlasPending("sw", true, false))),
            visibility = GameVisibility(ShowcaseVisibility.Friends, ShowcaseVisibility.Friends, ShowcaseVisibility.Me, ShowcaseVisibility.Me),
        )
        val atlas = fiche(ProgressionConcept.Atlas, block)

        assertThat(atlas.state).isNull()
        assertThat(atlas.facts.map { it.identity }).containsExactly(ConceptFact.AtlasPending, ConceptFact.AtlasVisibility).inOrder()
        assertThat(atlas.facts.map { it.label.key }).containsExactly(GameTextKey.FactPending, GameTextKey.FactVisible).inOrder()
    }

    @Test
    fun `une vitrine vide se dit une fois et une vitrine pleine dit qui la voit`() {
        val empty = fiche(ProgressionConcept.Showcase, game().copy(trophies = GameTrophiesBlock(emptyList(), emptyList())))
        assertThat(empty.state).isNull()

        val full = fiche(
            ProgressionConcept.Showcase,
            game().copy(
                trophies = GameTrophiesBlock(listOf(GameTrophyItem("trophy.flame.100", "2026-10-01T10:00:00.000Z")), emptyList()),
                visibility = GameVisibility(ShowcaseVisibility.Everyone, ShowcaseVisibility.Friends, ShowcaseVisibility.Me, ShowcaseVisibility.Me),
            ),
        )
        assertThat(full.state).isNull()
        assertThat(full.facts).isEmpty()
        assertThat(full.hasWhere).isFalse()
    }

    @Test
    fun `les medailles disent chaque famille sans redire le compte ni ce qui reste`() {
        val badges = fiche(ProgressionConcept.Badges, null)

        assertThat(badges.state).isNull()
        assertThat(badges.facts).isNotEmpty()
        assertThat(badges.facts.map { it.identity }).doesNotContain(ConceptFact.Left)
        assertThat(badges.facts.map { it.label.key }.toSet())
            .containsAnyOf(GameTextKey.FamilyContent, GameTextKey.FamilyConversation, GameTextKey.FamilySocial)
        assertThat(badges.facts.map { it.value.key }.toSet()).containsExactly(GameTextKey.Ratio)
    }

    @Test
    fun `les defis disent ce qui reste quand la tete ne le dit pas`() {
        val defis = ProgressionConceptFiches.rows(ProgressionConcept.Defis, progress(), null, now)

        assertThat(defis.map { it.identity }).containsExactly(ConceptFact.Left)
    }

    @Test
    fun `la phrase seule ecarte deja les faits que l ecran montre`() {
        val block = game().withFlame(FlameStatus.AtRisk)
        val said = ProgressionConceptStates.stateLine(ProgressionConcept.Flame, progress(block), block)

        assertThat(said?.text?.key).isEqualTo(GameTextKey.StateFlameAtRisk)
        assertThat(said?.facts).containsExactly(ConceptFact.Streak, ConceptFact.FlameState).inOrder()
        assertThat(fiche(ProgressionConcept.Flame, block).state).isNull()
    }

    @Test
    fun `une piece de jeu qui dit tout efface la section`() {
        val level = ProgressionConceptFiches.make(ProgressionConcept.Level, progress(game()), game(), now, moment, pieceIsHero = true)

        assertThat(level.head).isEqualTo(FicheHead.Piece)
        assertThat(level.hasWhere).isFalse()
    }
}
