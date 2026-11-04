package me.meeshy.ui.component.bubble

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Un vocal sans transcription propose « Transcrire » ; la demande en cours montre le squelette (annoncé « Transcription en
 * cours »), l'échec ou le plafond de silence rend le bouton ; un vocal protégé ne propose jamais la demande.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleVoiceTranscriptionRequestTest {

    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val requested = mutableListOf<String>()
    private val state = MutableStateFlow(Request.IDLE)

    private fun show(audio: BubbleAudio = voiceNote("a"), offered: Boolean = true) {
        compose.setContent {
            MeeshyTheme {
                BubbleVoicePlayer(
                    audio = audio,
                    playback = null,
                    onColor = Color.Black,
                    accent = Color(0xFF6366F1),
                    callbacks = BubbleCallbacks(
                        onRequestTranscription = { audio: BubbleAudio -> requested += audio.attachmentId }.takeIf { offered },
                        transcriptionRequest = { state },
                    ),
                )
            }
        }
        compose.waitForIdle()
    }

    private val transcribe get() = context.getString(R.string.media_audio_transcribe)

    @Test
    fun `sans transcription le bouton Transcrire demande celle du vocal`() {
        show()

        compose.onNodeWithText(transcribe).performClick()

        assertThat(requested).containsExactly("a")
    }

    @Test
    fun `une demande en cours remplace le bouton par le squelette annonce`() {
        state.value = Request.IN_FLIGHT
        show()

        compose.onNodeWithText(transcribe).assertDoesNotExist()
        compose.onNodeWithContentDescription(context.getString(R.string.media_audio_transcribing)).assertExists()
    }

    @Test
    fun `un echec recu rend le bouton pour reessayer`() {
        state.value = Request.FAILED
        show()

        compose.onNodeWithText(transcribe).performClick()

        assertThat(requested).containsExactly("a")
    }

    @Test
    fun `un vocal protege ne propose jamais la demande`() {
        show(audio = voiceNote("a").copy(isProtected = true))

        compose.onNodeWithText(transcribe).assertDoesNotExist()
    }

    @Test
    fun `sans hote qui l'offre aucun bouton n'apparait`() {
        show(offered = false)

        compose.onNodeWithText(transcribe).assertDoesNotExist()
    }
}
