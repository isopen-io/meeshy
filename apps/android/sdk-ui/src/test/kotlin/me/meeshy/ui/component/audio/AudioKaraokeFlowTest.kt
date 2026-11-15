package me.meeshy.ui.component.audio

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AudioKaraokeFlowTest {

    @get:Rule
    val compose = createComposeRule()

    private val segments = listOf(
        MessageTranscriptionSegment(text = "bonjour", startTime = 0.0, endTime = 1.0),
        MessageTranscriptionSegment(text = "tout", startTime = 1.0, endTime = 2.0),
        MessageTranscriptionSegment(text = "le", startTime = 2.0, endTime = 3.0),
        MessageTranscriptionSegment(text = "monde", startTime = 3.0, endTime = 4.0),
    )

    @Test
    fun `un toucher sur un segment cherche son startTime`() {
        val seeks = mutableListOf<Double>()
        compose.setContent {
            MeeshyTheme {
                AudioKaraokeFlow(segments, activeIndex = null, accent = Color.Red, ink = Color.White, onSeek = { seeks += it })
            }
        }

        compose.onNodeWithText("le", substring = true).performClick()
        compose.onNodeWithText("monde", substring = true).performClick()

        assertThat(seeks).containsExactly(2.0, 3.0).inOrder()
    }

    @Test
    fun `un segment sans minutage cherche le debut`() {
        val seeks = mutableListOf<Double>()
        compose.setContent {
            MeeshyTheme {
                AudioKaraokeFlow(
                    listOf(MessageTranscriptionSegment(text = "seul")),
                    activeIndex = null,
                    accent = Color.Red,
                    ink = Color.White,
                    onSeek = { seeks += it },
                )
            }
        }

        compose.onNodeWithText("seul", substring = true).performClick()

        assertThat(seeks).containsExactly(0.0)
    }

    @Test
    fun `le segment actif est celui de l'index et rien n'est allume a l'arret`() {
        assertThat(karaokeSegmentPhase(1, activeIndex = 1)).isEqualTo(KaraokeSegmentPhase.Active)
        assertThat(karaokeSegmentPhase(0, activeIndex = 1)).isEqualTo(KaraokeSegmentPhase.Past)
        assertThat(karaokeSegmentPhase(2, activeIndex = 1)).isEqualTo(KaraokeSegmentPhase.Ahead)
        assertThat((0..3).map { karaokeSegmentPhase(it, activeIndex = null) }).containsExactly(
            KaraokeSegmentPhase.Ahead, KaraokeSegmentPhase.Ahead, KaraokeSegmentPhase.Ahead, KaraokeSegmentPhase.Ahead,
        )
    }

    @Test
    fun `la carte plein ecran porte tous les segments et un toucher y cherche`() {
        val seeks = mutableListOf<Double>()
        compose.setContent {
            MeeshyTheme {
                MediaTranscriptionView(
                    segments = segments,
                    currentSeconds = 1.5,
                    isPlaying = true,
                    accent = Color.Red,
                    ink = Color.White,
                    onSeek = { seeks += it },
                )
            }
        }

        compose.onNodeWithText("tout", substring = true).performClick()

        assertThat(seeks).containsExactly(1.0)
    }
}
