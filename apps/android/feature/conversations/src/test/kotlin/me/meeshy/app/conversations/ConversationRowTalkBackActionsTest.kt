package me.meeshy.app.conversations

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationRowTalkBackActionsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun customActionLabels(): List<String> = compose
        .onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.CustomActions), useUnmergedTree = true)
        .fetchSemanticsNodes()
        .flatMap { node -> node.config[SemanticsActions.CustomActions].map { it.label } }

    @Test
    fun `every swipe action is also a TalkBack custom action of the row`() {
        compose.setContent { SwipeTestHost(rows = listOf(swipeTestConversation("a", unreadCount = 1) to ConversationRowActions())) }

        assertThat(customActionLabels()).containsAtLeast("Pin", "Mute", "Lock", "Archive", "Read", "Hide")
    }

    @Test
    fun `a custom action runs the same callback as its button`() {
        val muted = mutableListOf<String>()
        compose.setContent {
            SwipeTestHost(rows = listOf(swipeTestConversation("a") to ConversationRowActions(onToggleMute = { muted += "a" })))
        }

        compose
            .onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.CustomActions), useUnmergedTree = true)
            .fetchSemanticsNodes()
            .flatMap { it.config[SemanticsActions.CustomActions] }
            .first { it.label == "Mute" }
            .action()

        assertThat(muted).containsExactly("a")
    }
}
