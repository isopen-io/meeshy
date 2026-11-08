package me.meeshy.app.conversations

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeRight
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.swipe.SwipeRowCoordinator
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ConversationSwipeActionsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun swipeFirstRowOpen() {
        compose.onAllNodesWithTag(ROW_TEST_TAG)[0].performTouchInput { swipeRight() }
        compose.waitForIdle()
    }

    @Test
    fun `swiping toward the reading start reveals pin, mute and lock and the panel stays open`() {
        compose.setContent { SwipeTestHost(rows = listOf(swipeTestConversation("a") to ConversationRowActions())) }

        swipeFirstRowOpen()

        compose.onNodeWithText("Pin").assertExists()
        compose.onNodeWithText("Mute").assertExists()
        compose.onNodeWithText("Lock").assertExists()
    }

    @Test
    fun `tapping a revealed action runs it and closes the panel`() {
        val pinned = mutableListOf<String>()
        val coordinator = SwipeRowCoordinator()
        compose.setContent {
            SwipeTestHost(
                rows = listOf(swipeTestConversation("a") to ConversationRowActions(onTogglePin = { pinned += "a" })),
                coordinator = coordinator,
            )
        }
        swipeFirstRowOpen()

        compose.onNodeWithText("Pin").performClick()
        compose.waitForIdle()

        assertThat(pinned).containsExactly("a")
        assertThat(coordinator.hasOpenRow).isFalse()
        compose.onAllNodesWithText("Pin").assertCountEquals(0)
    }

    @Test
    fun `opening a second row closes the first so a single panel is open`() {
        val coordinator = SwipeRowCoordinator()
        compose.setContent {
            SwipeTestHost(
                rows = listOf(
                    swipeTestConversation("a") to ConversationRowActions(),
                    swipeTestConversation("b") to ConversationRowActions(),
                ),
                coordinator = coordinator,
            )
        }
        swipeFirstRowOpen()
        compose.onAllNodesWithText("Pin").assertCountEquals(1)

        compose.onAllNodesWithTag(ROW_TEST_TAG)[1].performTouchInput { swipeRight() }
        compose.waitForIdle()

        compose.onAllNodesWithText("Pin").assertCountEquals(1)
        assertThat(coordinator.hasOpenRow).isTrue()
    }
}
