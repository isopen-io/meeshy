package me.meeshy.app.conversations

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.unit.LayoutDirection
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ConversationSwipeRtlTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(direction: LayoutDirection) {
        compose.setContent {
            SwipeTestHost(
                rows = listOf(swipeTestConversation("a", unreadCount = 2) to ConversationRowActions()),
                direction = direction,
            )
        }
    }

    @Test
    fun `in right-to-left the leading actions are revealed by a swipe to the left`() {
        show(LayoutDirection.Rtl)

        compose.onAllNodesWithTag(ROW_TEST_TAG)[0].performTouchInput { swipeLeft() }
        compose.waitForIdle()

        compose.onNodeWithText("Pin").assertExists()
    }

    @Test
    fun `in right-to-left the trailing actions are revealed by a swipe to the right`() {
        show(LayoutDirection.Rtl)

        compose.onAllNodesWithTag(ROW_TEST_TAG)[0].performTouchInput { swipeRight() }
        compose.waitForIdle()

        compose.onNodeWithText("Read").assertExists()
    }

    @Test
    fun `in left-to-right the trailing actions are revealed by a swipe to the left`() {
        show(LayoutDirection.Ltr)

        compose.onAllNodesWithTag(ROW_TEST_TAG)[0].performTouchInput { swipeLeft() }
        compose.waitForIdle()

        compose.onNodeWithText("Hide").assertExists()
    }
}
