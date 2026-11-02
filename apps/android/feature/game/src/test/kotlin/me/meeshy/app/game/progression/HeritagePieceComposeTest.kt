package me.meeshy.app.game.progression

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import me.meeshy.sdk.model.game.TreasuryNext
import me.meeshy.sdk.model.game.TreasuryStanding
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.progression.ProgressionHeritagePiece
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LA TÊTE DE L'HÉRITAGE (iOS `GameHeritageHeadView`, #13916) : le contenant, les Meeshes gardées en grand, le contenant
 * suivant et les frappées depuis toujours ; le contenant se touche et ouvre SES précisions (iOS `treasuryTier`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class HeritagePieceComposeTest {

    @get:Rule val compose = createComposeRule()

    private val inSheet = hasAnyAncestor(hasTestTag(GAME_DETAIL_TAG))

    private val coffret = TreasuryStanding(held = 12, tier = TreasuryTierKey.Coffret, next = TreasuryNext(TreasuryTierKey.Coffre, 100, 88))

    @Test
    fun `the head says the container, the kept meeshes, the next container and the struck ones`() {
        compose.setContent { MeeshyTheme { HeritagePiece(ProgressionHeritagePiece.of(12, coffret, minted = 91), coffret) } }

        compose.onNodeWithTag(HERITAGE_PIECE_TAG).assertExists()
        compose.onNodeWithText("TON COFFRET").assertExists()
        compose.onNodeWithText("12 Meeshes").assertExists()
        compose.onNodeWithText("le Coffre s’ouvre à 100").assertExists()
        compose.onNodeWithText("91 frappées depuis toujours").assertExists()
    }

    @Test
    fun `touching the container opens its details`() {
        compose.setContent { MeeshyTheme { HeritagePiece(ProgressionHeritagePiece.of(12, coffret, minted = 91), coffret) } }

        compose.onNodeWithTag(HERITAGE_TIER_TAG).performSemanticsAction(SemanticsActions.OnClick)

        compose.onNodeWithTag(GAME_DETAIL_TAG).assertExists()
        compose.onNode(hasText("Ton héritage grandit", substring = true) and inSheet, useUnmergedTree = true).assertExists()
        compose.onNode(hasText("Contenant suivant") and inSheet, useUnmergedTree = true).assertExists()
    }

    @Test
    fun `without a container nothing opens and nothing struck says nothing`() {
        val bare = TreasuryStanding(held = 0)
        compose.setContent { MeeshyTheme { HeritagePiece(ProgressionHeritagePiece.of(0, bare, minted = 0), bare) } }

        compose.onNodeWithText("TON HÉRITAGE").assertExists()
        compose.onAllNodesWithTag(HERITAGE_TIER_TAG).assertCountEquals(0)
        compose.onAllNodesWithTag(GAME_DETAIL_TAG).assertCountEquals(0)
    }
}
