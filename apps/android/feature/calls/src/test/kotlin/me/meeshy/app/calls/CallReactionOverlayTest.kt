package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallReactionEmoji
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CallReactionOverlayTest {
    @get:Rule val rule = createComposeRule()

    private val fire = FloatingCallReaction(1L, CallReactionEmoji.FIRE, lane = 2)

    @Test
    fun `a reaction is announced by its glyph, rising or not`() {
        listOf(false, true).forEach { reduceMotion ->
            rule.setContent { MeeshyTheme { CallReactionOverlay(listOf(fire), reduceMotion, onFinished = {}) } }
            rule.onNodeWithContentDescription("Reaction 🔥").assertExists()
        }
    }

    @Test
    fun `enqueue caps the number of simultaneous emojis and remove drops one`() {
        val full = (1L..15L).fold(emptyList<FloatingCallReaction>()) { acc, id ->
            CallReactionOverlayLaw.enqueue(acc, FloatingCallReaction(id, CallReactionEmoji.HEART, CallReactionOverlayLaw.laneFor(id)))
        }
        assertThat(full).hasSize(12)
        assertThat(full.first().id).isEqualTo(4L)
        assertThat(CallReactionOverlayLaw.remove(full, 4L)).hasSize(11)
    }
}
