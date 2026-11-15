package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.TreasuryNext
import me.meeshy.sdk.model.game.TreasuryStanding
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

/**
 * LA TÊTE DE L'HÉRITAGE (iOS `GameHeritageHeadModel`, #13916) : le contenant, les Meeshes gardées en grand, le
 * contenant suivant, les frappées depuis toujours et la DERNIÈRE pièce frappée dans son édition dessinée ; elle tient
 * la tête de la fiche de la Meesh, qui n'a plus aucune ligne, et le contenant ouvre ses précisions.
 */
class ProgressionHeritagePieceTest {

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun progress(game: GameBlock?, meesh: ApiEngagementProgress.Meesh? = null): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = game, meesh = meesh))

    private fun wallet(balance: Int, minted: Int) = ApiEngagementProgress.Meesh(
        balance = balance, mintedLifetime = minted, debitablePoints = 0, floorPoints = 0, missingPoints = 0, mintCost = 1000,
    )

    private val coffret = TreasuryStanding(held = 12, tier = TreasuryTierKey.Coffret, next = TreasuryNext(TreasuryTierKey.Coffre, 100, 88))

    @Test
    fun `the head says the container, the kept meeshes, the next container and the struck ones`() {
        val head = ProgressionHeritagePiece.of(balance = 12, treasury = coffret, minted = 91)
        assertThat(head.label).isEqualTo(GameText(GameTextKey.FicheHeritageHeldCoffret))
        assertThat(head.tierOpens).isTrue()
        assertThat(head.held).isEqualTo(GameText.of(GameTextKey.Meeshes, GameTextArg.Count(12)))
        assertThat(head.opens).isEqualTo(GameText.of(GameTextKey.FicheHeritageOpensCoffre, GameTextArg.Count(100)))
        assertThat(head.minted).isEqualTo(GameText.of(GameTextKey.FicheHeritageMinted, GameTextArg.Count(91)))
        assertThat(head.coin).isEqualTo(HeritageCoin(91, MeeshEdition.Silver))
        assertThat(head.facts).containsExactly(
            ConceptFact.TreasuryTier, ConceptFact.MeeshHeld, ConceptFact.TreasuryNext, ConceptFact.Minted,
        ).inOrder()
    }

    @Test
    fun `the last struck coin is drawn in its display edition`() {
        assertThat(ProgressionHeritagePiece.of(0, coffret, 247).coin).isEqualTo(HeritageCoin(247, MeeshEdition.Gold))
        assertThat(ProgressionHeritagePiece.of(0, coffret, 1000).coin?.edition).isEqualTo(MeeshEdition.Prism)
    }

    @Test
    fun `nothing struck and no container leave the blank coin and no line`() {
        val head = ProgressionHeritagePiece.of(0, TreasuryStanding(held = 0), minted = 0)
        assertThat(head.label).isEqualTo(GameText(GameTextKey.FicheHeritageHeldNone))
        assertThat(head.tierOpens).isFalse()
        assertThat(head.held).isEqualTo(GameText(GameTextKey.MeeshesNone))
        assertThat(head.opens).isNull()
        assertThat(head.minted).isNull()
        assertThat(head.coin).isNull()
        assertThat(head.facts).containsExactly(ConceptFact.MeeshHeld)
    }

    @Test
    fun `the head reads the wallet first and the treasury otherwise`() {
        val block = game()
        assertThat(ProgressionHeritagePiece.served(progress(block, wallet(30, 7)), block).held)
            .isEqualTo(GameText.of(GameTextKey.Meeshes, GameTextArg.Count(30)))
        val bare = ProgressionHeritagePiece.served(progress(block), block)
        assertThat(bare.held).isEqualTo(GameText.of(GameTextKey.Meeshes, GameTextArg.Count(12)))
        assertThat(bare.minted).isNull()
    }

    @Test
    fun `the container opens its details with what misses for the next one`() {
        val detail = ProgressionPieceDetails.treasuryTier(coffret)
        assertThat(detail.kind).isEqualTo(PieceDetailKind.TreasuryTier)
        assertThat(detail.name).isEqualTo(GameText(GameTextKey.TreasuryCoffret))
        assertThat(detail.value).isEqualTo(GameText.of(GameTextKey.Meeshes, GameTextArg.Count(12)))
        assertThat(detail.progress).isEqualTo(0.12)
        assertThat(detail.facts.single().label).isEqualTo(GameText(GameTextKey.FactNextTreasury))
        assertThat(detail.facts.single().value.key).isEqualTo(GameTextKey.TreasuryNext)
        val last = ProgressionPieceDetails.treasuryTier(TreasuryStanding(held = 900, tier = TreasuryTierKey.Reserve))
        assertThat(last.progress).isNull()
        assertThat(last.facts).isEmpty()
        assertThat(ProgressionPieceDetails.treasuryTier(TreasuryStanding(held = 0)).name).isEqualTo(GameText(GameTextKey.FactTreasury))
    }

    @Test
    fun `the heritage holds the head with a game block and the fiche then has no line`() {
        val block = game()
        val served = progress(block)
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Meesh, served, block)).isTrue()
        assertThat(ProgressionConceptPieces.isHero(ProgressionConcept.Meesh, progress(null), null)).isFalse()
        val fiche = ProgressionConceptFiches.make(
            ProgressionConcept.Meesh, served, block, 0L, SeasonMoment("2026-10-20", 600),
            pieceIsHero = ProgressionConceptPieces.isHero(ProgressionConcept.Meesh, served, block),
        )
        assertThat(fiche.head).isEqualTo(FicheHead.Piece)
        assertThat(fiche.hasWhere).isFalse()
    }
}
