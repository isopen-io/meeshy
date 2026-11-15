package me.meeshy.ui.component.audio

import android.content.Context
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Les paroles du plein écran audio (iOS `transcriptBlock`) : le texte servi (serveur d'abord, sinon local), le mot dit posé à
 * l'ancre de la bande, et les trois états de la page — vide avec « Transcrire », en cours, résultat.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AudioFullscreenLyricsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun text(id: Int) = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun timed(count: Int) = List(count) { MessageTranscriptionSegment(text = "w%03d-aaaaaaaaaaaa".format(it), startTime = it.toDouble(), endTime = it + 1.0) }

    private val reading = LyricsPlacement(mode = LyricsMode.READING, fontSize = 20.sp, maxHeight = 300f)

    private fun lyricsPlacement(anchor: Float) = LyricsPlacement(
        mode = LyricsMode.LYRICS,
        fontSize = 28.sp,
        contentPadding = PaddingValues(),
        anchor = anchor,
    )

    private fun show(
        source: AudioFullscreenSource = audioSource("a", 1_000L),
        port: AudioFullscreenTranscriptPort? = FakeTranscriptPort(),
        playback: AudioPlaybackState = AudioPlaybackState(),
        placement: LyricsPlacement = reading,
        seeks: MutableList<Double> = mutableListOf(),
    ) {
        compose.setContent {
            MeeshyTheme {
                AudioFullscreenLyrics(source, playback, port, Color.Magenta, placement, Modifier.height(400.dp)) { seeks += it }
            }
        }
    }

    @Test
    fun `sans transcription une page de conversation propose Transcrire`() {
        show()

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIPT_EMPTY_TAG).assertExists()
        compose.onNodeWithText(text(R.string.audio_fullscreen_transcription_empty)).assertExists()
        compose.onNodeWithText(text(R.string.audio_fullscreen_transcription_action)).assertExists()
    }

    @Test
    fun `toucher Transcrire transcrit sur l appareil`() {
        val port = FakeTranscriptPort()
        show(port = port)

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIBE_TAG).performClick()

        assertThat(port.onDevice).containsExactly("a")
        assertThat(port.onServer).isEmpty()
    }

    @Test
    fun `l appui long offre l appareil ou le serveur`() {
        val port = FakeTranscriptPort()
        show(port = port)

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIBE_TAG).performTouchInput { longClick() }
        compose.onNodeWithText(text(R.string.audio_fullscreen_transcription_local)).assertExists()
        compose.onNodeWithText(text(R.string.audio_fullscreen_transcription_server)).performClick()

        assertThat(port.onServer).containsExactly("a")
        assertThat(port.onDevice).isEmpty()
    }

    @Test
    fun `une demande en cours desactive la capsule`() {
        val port = FakeTranscriptPort(initial = AudioFullscreenTranscriptState(request = Request.IN_FLIGHT))
        compose.mainClock.autoAdvance = false
        show(port = port)

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIBE_TAG).assertIsNotEnabled()
    }

    @Test
    fun `un echec laisse la capsule active pour reessayer`() {
        val port = FakeTranscriptPort(initial = AudioFullscreenTranscriptState(request = Request.FAILED))
        show(port = port)

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIBE_TAG).performClick()

        assertThat(port.onDevice).containsExactly("a")
    }

    @Test
    fun `un hote sans transcription ne montre aucun etat vide ni aucune action`() {
        show(port = null)

        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIPT_EMPTY_TAG).assertDoesNotExist()
    }

    @Test
    fun `la transcription du serveur est servie et remplace l etat vide`() {
        val served = audioSource("a", 1_000L).copy(transcriptionText = "bonjour tout le monde")
        show(source = served)

        compose.onNodeWithText("bonjour tout le monde", substring = true).assertExists()
        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIPT_EMPTY_TAG).assertDoesNotExist()
    }

    @Test
    fun `la transcription locale est servie quand le serveur n en a pas`() {
        val port = FakeTranscriptPort(
            initial = AudioFullscreenTranscriptState(localSegments = listOf(MessageTranscriptionSegment(text = "fait sur place", startTime = 0.0, endTime = 2.0)), localText = "fait sur place"),
        )
        show(port = port)

        compose.onNodeWithText("fait sur place", substring = true).assertExists()
        compose.onNodeWithTag(AUDIO_FULLSCREEN_TRANSCRIPT_EMPTY_TAG).assertDoesNotExist()
    }

    @Test
    fun `le serveur passe avant le local`() {
        val port = FakeTranscriptPort(initial = AudioFullscreenTranscriptState(localText = "version locale"))
        show(source = audioSource("a", 1_000L).copy(transcriptionText = "version serveur"), port = port)

        compose.onNodeWithText("version serveur", substring = true).assertExists()
        compose.onNodeWithText("version locale", substring = true).assertDoesNotExist()
    }

    @Test
    fun `un segment touche cherche son debut`() {
        val seeks = mutableListOf<Double>()
        val served = audioSource("a", 1_000L).copy(transcriptionSegments = timed(3))
        show(source = served, seeks = seeks)

        compose.onNodeWithText("w002", substring = true).performClick()

        assertThat(seeks).containsExactly(2.0)
    }

    private fun scrollNode() = compose.onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange))

    /** Où le centre du segment dit se pose dans la bande, depuis son haut (px). */
    private fun litSegmentCentreInViewport(): Float {
        val viewport = scrollNode().fetchSemanticsNode()
        val lit = compose.onNodeWithText("w150", substring = true).fetchSemanticsNode()
        return lit.positionInRoot.y + lit.size.height / 2f - viewport.positionInRoot.y
    }

    private fun playingAtSegment150() = AudioPlaybackState(attachmentId = "a", isPlaying = true, currentTimeMs = 150_500L, durationMs = 400_000L)

    @Test
    fun `par defaut le mot dit se pose au centre de la bande`() {
        show(
            source = audioSource("a", 1_000L).copy(transcriptionSegments = timed(400)),
            playback = playingAtSegment150(),
            placement = lyricsPlacement(0.5f),
        )
        compose.waitForIdle()

        val viewportHeight = scrollNode().fetchSemanticsNode().size.height.toFloat()
        assertThat(litSegmentCentreInViewport()).isWithin(60f).of(viewportHeight * 0.5f)
    }

    @Test
    fun `l ancre du premier tiers pose le mot dit plus haut et la suivre le deplace`() {
        var anchor by mutableFloatStateOf(0.2f)
        compose.setContent {
            MeeshyTheme {
                AudioFullscreenLyrics(
                    source = audioSource("a", 1_000L).copy(transcriptionSegments = timed(400)),
                    playback = playingAtSegment150(),
                    transcripts = null,
                    accent = Color.Magenta,
                    placement = lyricsPlacement(anchor),
                    modifier = Modifier.height(400.dp),
                    onSeek = {},
                )
            }
        }
        compose.waitForIdle()
        val viewportHeight = scrollNode().fetchSemanticsNode().size.height.toFloat()
        val high = litSegmentCentreInViewport()

        compose.runOnIdle { anchor = 0.8f }
        compose.waitForIdle()
        val low = litSegmentCentreInViewport()

        assertThat(high).isWithin(60f).of(viewportHeight * 0.2f)
        assertThat(low).isWithin(60f).of(viewportHeight * 0.8f)
        assertThat(high).isLessThan(low)
    }
}
