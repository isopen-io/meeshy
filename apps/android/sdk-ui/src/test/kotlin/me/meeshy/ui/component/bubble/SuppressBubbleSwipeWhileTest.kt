package me.meeshy.ui.component.bubble

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SuppressBubbleSwipeWhileTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a widget suppressing the swipe gives it back when it leaves the composition`() {
        val arbiter = BubbleGestureArbiter()
        var present by mutableStateOf(true)
        compose.setContent {
            CompositionLocalProvider(LocalBubbleGestureArbiter provides arbiter) {
                if (present) SuppressBubbleSwipeWhile(active = true, reason = BubbleGestureReason.MediaScrubbing)
            }
        }
        compose.waitForIdle()
        assertThat(arbiter.suppressSwipe).isTrue()

        present = false
        compose.waitForIdle()

        assertThat(arbiter.suppressSwipe).isFalse()
        assertThat(arbiter.activeReasonCount).isEqualTo(0)
    }

    @Test
    fun `turning the suppression off re-arms the swipe without leaving the composition`() {
        val arbiter = BubbleGestureArbiter()
        var scrubbing by mutableStateOf(true)
        compose.setContent {
            CompositionLocalProvider(LocalBubbleGestureArbiter provides arbiter) {
                SuppressBubbleSwipeWhile(active = scrubbing, reason = BubbleGestureReason.MediaScrubbing)
            }
        }
        compose.waitForIdle()
        assertThat(arbiter.suppressSwipe).isTrue()

        scrubbing = false
        compose.waitForIdle()

        assertThat(arbiter.activeReasonCount).isEqualTo(0)
    }

    @Test
    fun `outside a swipeable host suppressing is a no-op`() {
        compose.setContent {
            SuppressBubbleSwipeWhile(active = true, reason = BubbleGestureReason.Selection)
        }
        compose.waitForIdle()
    }
}
