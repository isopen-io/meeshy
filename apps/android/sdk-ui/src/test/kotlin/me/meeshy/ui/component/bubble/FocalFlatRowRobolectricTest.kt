package me.meeshy.ui.component.bubble

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalFlatRowRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private fun content(
        text: String = "Bonsoir à tous",
        isOutgoing: Boolean = false,
        isFirstInGroup: Boolean = true,
        isDeleted: Boolean = false,
    ) = BubbleContent(
        messageId = "m1",
        text = text,
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = "Mégane",
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = "2026-10-01T07:48:00Z",
        isFirstInGroup = isFirstInGroup,
    )

    private fun show(content: BubbleContent, callbacks: BubbleCallbacks = BubbleCallbacks.None) {
        compose.setContent {
            MeeshyTheme {
                FocalFlatRow(content = content, accentColor = Color.Blue, callbacks = callbacks)
            }
        }
    }

    @Test
    fun `the head of a group carries its author, the text sits under it`() {
        show(content())
        compose.onNodeWithText("Mégane", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Bonsoir à tous", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `my own group head reads You, a continuation has no header`() {
        show(content(isOutgoing = true))
        compose.onNodeWithText("You", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `a continuation of the group repeats no identity`() {
        show(content(isFirstInGroup = false))
        assertThat(
            compose.onAllNodes(androidx.compose.ui.test.hasText("Mégane"), useUnmergedTree = true)
                .fetchSemanticsNodes(),
        ).isEmpty()
    }

    @Test
    fun `a long press on the text opens the message menu`() {
        var pressed = 0
        show(content(), BubbleCallbacks(onLongPress = { pressed++ }))
        compose.onNodeWithText("Bonsoir à tous", useUnmergedTree = true).performTouchInput { longClick() }
        assertThat(pressed).isEqualTo(1)
    }

    @Test
    fun `a long message opens on an excerpt that unfolds in place`() {
        val long = (1..140).joinToString(" ") { "mot$it" }
        show(content(text = long))
        compose.onNodeWithText("Read more", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Show less", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `a deleted message is a muted line`() {
        show(content(isDeleted = true))
        compose.onNodeWithText("Message deleted", substring = true, useUnmergedTree = true).assertIsDisplayed()
    }
}
