package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

/**
 * LA PIÈCE DES ÉLANS (iOS `ProgressionElansHero`, #13912) : le titre (« Tes élans », ou « Élan ×N » quand il accélère),
 * les familles ACTIVES de la fenêtre servie, puis la phrase — vide, conseil, ou ce qui porte l'élan. Elle tient la tête
 * de la fiche (iOS `ProgressionConceptGestures.isHero`) : « Où j'en suis » ne redit ni le facteur ni les familles.
 */
class ProgressionElansPieceTest {

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun elan(factor: Double, families: List<EngagementAxisFamily>, standing: Boolean = true) = EngagementElanProgress(
        factor = factor, activeFamilyCount = families.size, hasStanding = standing, windowDays = 7,
        isAccelerated = factor > 1.0, activeFamilies = families,
    )

    private val three = listOf(EngagementAxisFamily.CONTENT, EngagementAxisFamily.COMMENT, EngagementAxisFamily.SOCIAL)

    @Test
    fun `without any active family the piece invites to start`() {
        val piece = ProgressionElansPiece.of(null)
        assertThat(piece.factor).isNull()
        assertThat(piece.families).isEmpty()
        assertThat(piece.line).isEqualTo(ElansLine.Empty)
        assertThat(ProgressionElansPiece.of(elan(1.0, emptyList())).line).isEqualTo(ElansLine.Empty)
    }

    @Test
    fun `active families without acceleration give the hint and keep the served order`() {
        val piece = ProgressionElansPiece.of(elan(1.0, listOf(EngagementAxisFamily.SOCIAL, EngagementAxisFamily.CONTENT)))
        assertThat(piece.factor).isNull()
        assertThat(piece.families).containsExactly(EngagementAxisFamily.SOCIAL, EngagementAxisFamily.CONTENT).inOrder()
        assertThat(piece.line).isEqualTo(ElansLine.Hint)
    }

    @Test
    fun `an accelerated momentum names its factor and what carries it`() {
        val piece = ProgressionElansPiece.of(elan(2.0, three, standing = true))
        assertThat(piece.factor).isEqualTo(2)
        assertThat(piece.line).isEqualTo(ElansLine.Explained(factor = 2, families = 3, windowDays = 7, standing = true))
        assertThat(ProgressionElansPiece.of(elan(2.6, three, standing = false)).line)
            .isEqualTo(ElansLine.Explained(factor = 3, families = 3, windowDays = 7, standing = false))
    }

    @Test
    fun `the Elans piece holds the head and where says neither factor nor families`() {
        val block = game()
        val progress: EngagementProgress = EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = block))
        val concept = ProgressionConcept.Elans
        assertThat(ProgressionConceptPieces.isHero(concept)).isTrue()
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Glory)).isFalse()
        val fiche = ProgressionConceptFiches.make(
            concept, progress, block, 0L, SeasonMoment("2026-10-20", 600), pieceIsHero = ProgressionConceptPieces.isHero(concept),
        )
        assertThat(fiche.head).isEqualTo(FicheHead.Piece)
        assertThat(fiche.heroLine).isNull()
        assertThat(fiche.state?.facts.orEmpty()).containsNoneOf(ConceptFact.Factor, ConceptFact.ElanFamilies)
        assertThat(fiche.facts.mapNotNull { it.identity }).containsNoneOf(ConceptFact.Factor, ConceptFact.ElanFamilies)
    }
}
