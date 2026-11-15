package me.meeshy.app.chat

import android.content.Context
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.down
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.moveTo
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.up
import androidx.compose.ui.test.width
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleVoicePlayer
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import me.meeshy.ui.R as UiR

/** Glisser sur l'onde d'un vocal déplace la lecture : la rangée ne part pas en « répondre » pendant le scrub. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SwipeToReplyScrubTest {

    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun `un glisse sur l'onde scrubbe le vocal et ne declenche pas la reponse`() {
        var replies = 0
        val seeks = mutableListOf<Double>()
        compose.setContent {
            MeeshyTheme {
                SwipeRowContainer(
                    isOutgoing = false,
                    createdAtIso = "2026-11-04T08:00:00Z",
                    resistance = SwipeResistance.Resistant,
                    onReply = { replies++ },
                    onForward = null,
                ) {
                    BubbleVoicePlayer(
                        audio = voice("a", seconds = 30),
                        playback = null,
                        onColor = Color.Black,
                        accent = Color(0xFF6366F1),
                        callbacks = BubbleCallbacks(onAudioSeekFraction = { _, fraction -> seeks += fraction }),
                    )
                }
            }
        }
        compose.waitForIdle()
        val waveform = compose.onNodeWithContentDescription(context.getString(UiR.string.audio_player_waveform))

        waveform.performTouchInput {
            down(Offset(width * 0.05f, 5f))
            moveTo(Offset(width * 0.5f, 5f))
            moveTo(Offset(width * 0.95f, 5f))
            up()
        }
        compose.waitForIdle()

        assertThat(replies).isEqualTo(0)
        assertThat(seeks).isNotEmpty()
    }
}
