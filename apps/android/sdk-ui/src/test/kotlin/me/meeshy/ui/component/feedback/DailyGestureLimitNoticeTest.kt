package me.meeshy.ui.component.feedback

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Un refus de limite quotidienne dit la limite et la reprise en une ligne ; la précision « étincelles » vit derrière un (i) (#18099). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DailyGestureLimitNoticeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun message(gesture: DailyGestureLimit.Gesture, resetAt: Long?) =
        dailyGestureLimitMessage(context, DailyGestureLimit(gesture, resetAt))

    @Test
    fun `la limite de commentaires dit la reprise en une ligne, sans la precision`() {
        val text = message(DailyGestureLimit.Gesture.COMMENT, 1_700_000_000_000)
        assertThat(text).startsWith("Daily comment limit reached: resumes at ")
        assertThat(text).doesNotContain("sparks")
        assertThat(text.length).isAtMost(60)
    }

    @Test
    fun `la limite sans heure ne promet aucune reprise mais dit qu elle est du jour`() {
        assertThat(message(DailyGestureLimit.Gesture.REACTION, null)).isEqualTo("Daily reaction limit reached")
        assertThat(message(DailyGestureLimit.Gesture.COMMENT, null)).isEqualTo("Daily comment limit reached")
    }

    @Test
    fun `la precision etincelles passe derriere un i dont le nom est la question`() {
        val info = dailyGestureLimitInfo(context)
        assertThat(info.question).isEqualTo("Does this limit affect my sparks?")
        assertThat(info.text).isEqualTo("It counts your actions, never your sparks.")
    }
}
