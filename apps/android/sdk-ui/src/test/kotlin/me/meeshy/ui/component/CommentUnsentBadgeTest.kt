package me.meeshy.ui.component

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.comments.CommentUnsentBadge
import me.meeshy.ui.component.comments.CommentUnsentState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CommentUnsentBadgeTest {

    @get:Rule
    val compose = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun show(state: CommentUnsentState) {
        compose.setContent {
            MeeshyTheme {
                CommentUnsentBadge(
                    state = state,
                    accent = Color(0xFF6366F1),
                    onRetry = { calls += "retry" },
                    onResume = { calls += "resume" },
                    onDelete = { calls += "delete" },
                )
            }
        }
    }

    @Test
    fun `un echec se reessaie d un toucher`() {
        show(CommentUnsentState.Failed(reason = "Limite du jour"))

        compose.onNodeWithText("Limite du jour").assertIsDisplayed()
        compose.onNodeWithText("Retry").performClick()

        assertThat(calls).containsExactly("retry")
    }

    @Test
    fun `une ligne heritee se reprend au lieu de se reessayer`() {
        show(CommentUnsentState.Inherited())

        compose.onNodeWithText("Resume").performClick()

        assertThat(calls).containsExactly("resume")
        compose.onNodeWithText("Retry").assertDoesNotExist()
    }

    @Test
    fun `un echec se supprime`() {
        show(CommentUnsentState.Failed())

        compose.onNodeWithText("Delete").performClick()

        assertThat(calls).containsExactly("delete")
    }

    @Test
    fun `un commentaire en attente s annule`() {
        show(CommentUnsentState.Pending)

        compose.onNodeWithText("Waiting to send").assertIsDisplayed()
        compose.onNodeWithText("Cancel sending").performClick()

        assertThat(calls).containsExactly("delete")
    }
}
