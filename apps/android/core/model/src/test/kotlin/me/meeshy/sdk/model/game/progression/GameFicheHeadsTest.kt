package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.TreasuryNext
import me.meeshy.sdk.model.game.TreasuryStanding
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.ceremony.GameHeritageHold
import me.meeshy.sdk.model.game.ceremony.GameMintSettlement
import me.meeshy.sdk.model.game.ceremony.MintSettlementOutcome
import org.junit.Test

/** Les têtes des fiches des Étincelles et de l'Héritage (iOS `GameFicheHeads`, #11180). */
class GameFicheHeadsTest {

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private val coffret = TreasuryStanding(held = 12, tier = TreasuryTierKey.Coffret, next = TreasuryNext(TreasuryTierKey.Coffre, 100, 88))

    @Test
    fun `l Ombre passe avant tout et la poche se lit par son nom`() {
        val level = game().level.copy(sparks = 976, sparksCycle = 976, sparksLifetime = 12_000, sparksDebt = 40)
        val head = GameSparksHead.of(level)

        assertThat(head.shadow).isEqualTo(GameText.of(GameTextKey.SparksDebt, GameTextArg.Count(40)))
        assertThat(head.facts).containsExactly(ConceptFact.SparksDebt, ConceptFact.SparksPocket, ConceptFact.SparksLifetime).inOrder()
    }

    @Test
    fun `sans dette ni etincelles servies la tete ne dit que la poche`() {
        val head = GameSparksHead.of(game().level.copy(sparks = null, sparksCycle = null, sparksLifetime = null, sparksDebt = null))

        assertThat(head.shadow).isNull()
        assertThat(head.lifetime).isNull()
        assertThat(head.facts).containsExactly(ConceptFact.SparksPocket)
    }

    @Test
    fun `l Heritage dit le contenant les Meesh gardees le contenant suivant et les frappees`() {
        val head = ProgressionHeritagePiece.of(12, coffret, minted = 91)

        assertThat(head.opens).isEqualTo(GameText.of(GameTextKey.FicheHeritageOpensCoffre, GameTextArg.Count(100)))
        assertThat(head.minted).isEqualTo(GameText.of(GameTextKey.FicheHeritageMinted, GameTextArg.Count(91)))
        assertThat(ProgressionHeritagePiece.of(12, coffret.copy(next = null), minted = 91).opens).isNull()
    }

    @Test
    fun `la retenue garde le compte du toucher puis rattrape a la fin`() {
        val before = ProgressionHeritagePiece.of(12, coffret, minted = 91)
        val after = ProgressionHeritagePiece.of(13, coffret.copy(held = 13), minted = 92)
        val hold = GameHeritageHold.of(before, GameMintSettlement(MintSettlementOutcome.Minted(91), 4))
        val answer = GameMintSettlement(MintSettlementOutcome.Minted(92), 5)

        assertThat(GameHeritageHold.shown(after, hold, answer)).isEqualTo(before)
        assertThat(GameHeritageHold.shown(after, hold.ended(), answer)).isEqualTo(after)
    }
}
