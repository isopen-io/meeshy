package me.meeshy.app.feed

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedPendingPublicationChipTest {

    @get:Rule
    val compose = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun show(canRetry: Boolean) {
        compose.setContent {
            MeeshyTheme {
                FeedPendingPublicationChip(
                    PendingSendActions(
                        canRetry = canRetry,
                        canReopen = false,
                        onRetry = { calls += "retry" },
                        onReopen = {},
                        onCancel = { calls += "cancel" },
                    ),
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `a publication on its way is marked pending and can only be canceled`() {
        show(canRetry = false)

        compose.onNodeWithText("Pending").assertExists()
        compose.onAllNodesWithText("Try again").assertCountEquals(0)
        compose.onNodeWithContentDescription("Cancel sending").performClick()

        assertThat(calls).containsExactly("cancel")
    }

    @Test
    fun `a publication that gave up offers to try again`() {
        show(canRetry = true)

        compose.onNodeWithText("Try again").performClick()

        assertThat(calls).containsExactly("retry")
    }
}
