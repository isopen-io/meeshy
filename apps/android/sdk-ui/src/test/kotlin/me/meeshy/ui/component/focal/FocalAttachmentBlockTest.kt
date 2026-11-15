package me.meeshy.ui.component.focal

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleImage
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalAttachmentBlockTest {

    @get:Rule
    val compose = createComposeRule()

    private fun image(id: String, blurred: Boolean = false, viewOnce: Boolean = false) =
        BubbleImage(attachmentId = id, url = "https://x/$id.jpg", isBlurred = blurred, isViewOnce = viewOnce)

    private fun show(images: List<BubbleImage>, callbacks: BubbleCallbacks) {
        val content = BubbleContent(
            messageId = "m1",
            text = "",
            isOutgoing = false,
            isTranslated = false,
            originalText = null,
            senderName = null,
            showSenderName = false,
            isEdited = false,
            isDeleted = false,
            createdAtIso = null,
            images = images,
        )
        compose.setContent {
            MeeshyTheme { FocalAttachmentBlock(content, Color.Black, callbacks, audioPlayback = null) }
        }
    }

    @Test
    fun `une vue unique se montre voilée sans rien du média puis ouvre le plein écran au toucher`() {
        var opened = -1
        show(listOf(image("a", viewOnce = true)), BubbleCallbacks(onImageClick = { opened = it }))
        compose.onNodeWithText("View once", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Tap to view", useUnmergedTree = true).assertIsDisplayed()
        assertThat(compose.onAllNodesWithContentDescription("Image").fetchSemanticsNodes()).isEmpty()
        compose.onNodeWithText("View once", useUnmergedTree = true).performClick()
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `une image floutée se révèle sur place au premier toucher puis s'ouvre au second`() {
        var opened = 0
        show(listOf(image("a", blurred = true)), BubbleCallbacks(onImageClick = { opened++ }))
        compose.onNodeWithText("Hidden content", useUnmergedTree = true).performClick()
        assertThat(opened).isEqualTo(0)
        compose.onNodeWithText("Hidden content", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `le double tap réagit à une pièce parmi d'autres quand l'hôte l'offre`() {
        val reacted = mutableListOf<String>()
        show(
            listOf(image("a"), image("b")),
            BubbleCallbacks(onImageClick = {}, onReactToAttachment = { reacted += it }),
        )
        compose.onAllNodesWithContentDescription("Image")[1].performTouchInput { doubleClick() }
        compose.waitForIdle()
        assertThat(reacted).containsExactly("b")
    }

    @Test
    fun `une pièce seule garde un tap immédiat et ne réagit jamais au double tap`() {
        var opened = 0
        val reacted = mutableListOf<String>()
        show(listOf(image("a")), BubbleCallbacks(onImageClick = { opened++ }, onReactToAttachment = { reacted += it }))
        compose.onAllNodesWithContentDescription("Image")[0].performClick()
        assertThat(opened).isEqualTo(1)
        assertThat(reacted).isEmpty()
    }
}
