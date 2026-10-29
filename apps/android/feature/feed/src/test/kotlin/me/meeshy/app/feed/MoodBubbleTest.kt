package me.meeshy.app.feed

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13662 — toucher l'humeur d'un ami ouvre sa bulle : réagir, republier, répondre. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MoodBubbleTest {

    @get:Rule
    val compose = createComposeRule()

    private val reacted = mutableListOf<String>()
    private var republished = 0
    private var replied = 0
    private var dwellEnded = 0

    private fun show(currentUserId: String = "me") {
        val entry = StatusEntry(id = "s1", userId = "u1", username = "amina", moodEmoji = "🔥", content = "En feu")
        compose.setContent {
            MeeshyTheme {
                MoodBubble(
                    model = MoodBubbleModel.of(entry, currentUserId),
                    onReact = { reacted += it },
                    onRepublish = { republished++ },
                    onReply = { replied++ },
                    onDismiss = {},
                    onDwellEnd = { dwellEnded++ },
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `la bulle montre l humeur et ses trois actions`() {
        show()
        compose.onNodeWithText("amina").assertIsDisplayed()
        compose.onNodeWithText("En feu").assertIsDisplayed()
        compose.onNodeWithContentDescription("Reaction ❤️").assertIsDisplayed()
        compose.onNodeWithContentDescription("Reply").assertIsDisplayed()
        compose.onNodeWithContentDescription("Repost").assertIsDisplayed()
    }

    @Test
    fun `chaque geste atteint son rappel`() {
        show()
        compose.onNodeWithContentDescription("Reaction ❤️").performClick()
        compose.onNodeWithContentDescription("Repost").performClick()
        compose.onNodeWithContentDescription("Reply").performClick()
        assertThat(reacted).containsExactly("❤️")
        assertThat(republished).isEqualTo(1)
        assertThat(replied).isEqualTo(1)
    }
}
