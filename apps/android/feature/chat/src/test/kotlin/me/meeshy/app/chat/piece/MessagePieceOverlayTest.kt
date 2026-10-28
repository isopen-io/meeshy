package me.meeshy.app.chat.piece

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13461 : l'appui long sur une tuile montre CETTE pièce, son rang, et un menu qui agit sur elle. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MessagePieceOverlayTest {

    @get:Rule
    val compose = createComposeRule()

    private fun model(canReply: Boolean = true): PieceOverlayModel {
        val pieces = listOf("a", "b", "c").map {
            ApiMessageAttachment(id = it, mimeType = "image/jpeg", fileUrl = "/f/$it", width = 300, height = 200)
        }
        val message = ApiMessage(id = "m1", conversationId = "c1", senderId = "u", content = "", attachments = pieces)
        return PieceOverlayModel.of(message, "b", canReply) { "https://cdn$it" }!!
    }

    @Test
    fun `l'apercu s'ouvre sur la piece pressee et dit son rang`() {
        compose.setContent { MeeshyTheme { MessagePieceOverlay(model(), Color.Blue, onReply = {}, onWholeMessage = {}, onDismiss = {}) } }

        compose.onNode(androidx.compose.ui.test.hasContentDescription("Photo 2 of 3", substring = true)).assertIsDisplayed()
        compose.onNodeWithText("Reply").assertIsDisplayed()
        compose.onNodeWithText("Whole message").assertIsDisplayed()
    }

    @Test
    fun `tout le message ferme l'apercu puis rend la main au message entier`() {
        val calls = mutableListOf<String>()
        compose.setContent {
            MeeshyTheme { MessagePieceOverlay(model(), Color.Blue, onReply = { calls += "reply" }, onWholeMessage = { calls += "whole" }, onDismiss = { calls += "dismiss" }) }
        }

        compose.onNodeWithText("Whole message").performClick()

        assertThat(calls).containsExactly("dismiss", "whole").inOrder()
    }

    @Test
    fun `repondre cite le message et ferme l'apercu`() {
        val calls = mutableListOf<String>()
        compose.setContent {
            MeeshyTheme { MessagePieceOverlay(model(), Color.Blue, onReply = { calls += "reply" }, onWholeMessage = { calls += "whole" }, onDismiss = { calls += "dismiss" }) }
        }

        compose.onNodeWithText("Reply").performClick()

        assertThat(calls).containsExactly("reply", "dismiss").inOrder()
    }

    @Test
    fun `un lecteur sans le droit d'ecrire n'a pas repondre`() {
        compose.setContent { MeeshyTheme { MessagePieceOverlay(model(canReply = false), Color.Blue, onReply = {}, onWholeMessage = {}, onDismiss = {}) } }

        compose.onNodeWithText("Whole message").assertIsDisplayed()
        assertThat(compose.onAllNodesWithTextCount("Reply")).isEqualTo(0)
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTextCount(text: String): Int =
        onAllNodes(androidx.compose.ui.test.hasText(text)).fetchSemanticsNodes().size
}
