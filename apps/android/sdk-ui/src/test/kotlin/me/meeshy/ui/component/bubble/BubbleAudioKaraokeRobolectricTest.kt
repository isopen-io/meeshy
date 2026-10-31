package me.meeshy.ui.component.bubble

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.text.font.FontWeight
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13878 : la transcription d'un vocal s'allume segment par segment pendant la lecture, comme iOS `AudioPlayerView`. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BubbleAudioKaraokeRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private val audio = BubbleAudio(
        attachmentId = "a1",
        url = "https://cdn.meeshy.me/a1.m4a",
        durationSeconds = 4,
        transcriptionText = "bonjour tout le monde",
        transcriptionSegments = listOf(
            MessageTranscriptionSegment(text = "bonjour", startTime = 0.0, endTime = 1.0),
            MessageTranscriptionSegment(text = "tout", startTime = 1.0, endTime = 2.0),
            MessageTranscriptionSegment(text = "le", startTime = 2.0, endTime = 3.0),
            MessageTranscriptionSegment(text = "monde", startTime = 3.0, endTime = 4.0),
        ),
    )

    private fun playback(seconds: Double, isPlaying: Boolean = true) = BubbleAudioPlayback(
        attachmentId = "a1",
        isPlaying = isPlaying,
        isLoading = false,
        progress = (seconds / 4).toFloat(),
        timeLabel = "0:01 / 0:04",
        currentSeconds = seconds,
    )

    private fun SemanticsNodeInteraction.boldWords(): List<String> {
        val text = fetchSemanticsNode().config.getOrNull(SemanticsProperties.Text).orEmpty().single()
        return text.spanStyles.filter { it.item.fontWeight == FontWeight.Bold }.map { text.text.substring(it.start, it.end) }
    }

    @Test
    fun `the word being played is lit in the bubble`() {
        compose.setContent {
            MeeshyTheme { AudioBubble(audio = audio, playback = playback(1.5), onColor = Color.White, onClick = {}) }
        }

        assertThat(compose.onNodeWithText("bonjour tout le monde", useUnmergedTree = true).boldWords()).containsExactly("tout")
    }

    @Test
    fun `nothing is lit once the voice note is paused`() {
        compose.setContent {
            MeeshyTheme { AudioBubble(audio = audio, playback = playback(1.5, isPlaying = false), onColor = Color.White, onClick = {}) }
        }

        assertThat(compose.onNodeWithText("bonjour tout le monde", useUnmergedTree = true).boldWords()).isEmpty()
    }

    @Test
    fun `a touch on a word of the voice note being played seeks there`() {
        val seeks = mutableListOf<Double>()
        var toggles = 0
        compose.setContent {
            MeeshyTheme {
                AudioBubble(
                    audio = audio,
                    playback = playback(2.5),
                    onColor = Color.White,
                    onClick = { toggles++ },
                    onSeek = { seeks += it },
                )
            }
        }

        compose.onNodeWithText("bonjour tout le monde", useUnmergedTree = true).performTouchInput { click(Offset(2f, centerY)) }

        assertThat(seeks).containsExactly(0.0)
        assertThat(toggles).isEqualTo(0)
    }

    @Test
    fun `a touch on the transcript of a voice note not yet loaded plays it`() {
        val seeks = mutableListOf<Double>()
        var toggles = 0
        compose.setContent {
            MeeshyTheme {
                AudioBubble(audio = audio, playback = null, onColor = Color.White, onClick = { toggles++ }, onSeek = { seeks += it })
            }
        }

        compose.onNodeWithText("bonjour tout le monde", useUnmergedTree = true).performTouchInput { click(Offset(2f, centerY)) }

        assertThat(seeks).isEmpty()
        assertThat(toggles).isEqualTo(1)
    }
}
