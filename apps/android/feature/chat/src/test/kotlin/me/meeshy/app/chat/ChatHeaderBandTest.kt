package me.meeshy.app.chat

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.runtime.CompositionLocalProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La bande de l'en-tête : le retour dit les non-lus des AUTRES conversations, la pastille dit la série. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatHeaderBandTest {

    @get:Rule
    val compose = createComposeRule()

    private fun showBack(unread: Int, onBack: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    ChatHeaderBackButton(unread = unread, accentColor = MeeshyPalette.Indigo500, onClick = onBack)
                }
            }
        }
    }

    @Test
    fun `the back button is just Back when no other conversation has unread messages`() {
        showBack(unread = 0)
        compose.onNodeWithContentDescription("Back").assertExists()
    }

    @Test
    fun `the back button announces the unread count of the other conversations`() {
        showBack(unread = 150)
        compose.onNodeWithContentDescription("Back, 150 unread messages").assertExists()
    }

    @Test
    fun `tapping the back button leaves the conversation`() {
        var left = 0
        showBack(unread = 1) { left += 1 }
        compose.onNodeWithContentDescription("Back, 1 unread message").performClick()
        assertThat(left).isEqualTo(1)
    }

    @Test
    fun `the engagement pill with a running streak reads the streak and the total`() {
        compose.setContent {
            MeeshyTheme {
                ChatHeaderEngagementPill(ConversationEngagementSnapshot("c1", totalPoints = 120, todayPoints = 9, streakDays = 4, day = "2026-10-01"))
            }
        }
        compose.onNodeWithContentDescription("4 days · Sparks: 120 · Today: 9").assertExists()
    }

    @Test
    fun `the engagement pill without a streak reads the total alone`() {
        compose.setContent {
            MeeshyTheme {
                ChatHeaderEngagementPill(ConversationEngagementSnapshot("c1", totalPoints = 120, day = "2026-10-01"))
            }
        }
        compose.onNodeWithContentDescription("120 sparks earned in this conversation").assertExists()
    }
}
