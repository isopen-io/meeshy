package me.meeshy.ui.component.feedback

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Un refus de limite quotidienne dit la limite et la reprise en une ligne, et garde le repère « étincelles » (#18099). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DailyGestureLimitNoticeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun message(gesture: DailyGestureLimit.Gesture, resetAt: Long?) =
        dailyGestureLimitMessage(context, DailyGestureLimit(gesture, resetAt))

    @Test
    fun `la limite de commentaires dit la reprise et l etincelle tient en une ligne`() {
        val text = message(DailyGestureLimit.Gesture.COMMENT, 1_700_000_000_000)
        assertThat(text).startsWith("Comment limit reached: resumes at ")
        assertThat(text).endsWith("It counts your actions, never your sparks.")
        assertThat(text.length).isAtMost(100)
    }

    @Test
    fun `la limite de reactions sans heure ne promet aucune reprise`() {
        assertThat(message(DailyGestureLimit.Gesture.REACTION, null))
            .isEqualTo("Reaction limit reached. It counts your actions, never your sparks.")
    }
}
