package me.meeshy.app.chat

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.attachment.TranscriptionRequestTracker
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/** #16239 — la piste parlée d'une traduction se joue depuis une adresse ABSOLUE, avec la protection réelle du message. */
class MessageTranscriptionViewModelTest {

    private val engine = mockk<AudioPlaybackEngine> { every { play(any(), any(), any(), any()) } returns true }

    private fun viewModel(): MessageTranscriptionViewModel {
        val session = mockk<SessionRepository> { every { currentUser } returns MutableStateFlow<MeeshyUser?>(null) }
        return MessageTranscriptionViewModel(
            tracker = mockk<TranscriptionRequestTracker>(relaxed = true),
            playback = engine,
            sessionRepository = session,
            config = MeeshyConfig(apiBaseUrl = "https://gate.example.me/api/v1/"),
        )
    }

    @Test
    fun `a relative translated track served by the gateway plays from its absolute address`() {
        viewModel().playTranslation("m1", "fr", "/api/v1/attachments/file/translated/m1_fr.mp3", isProtected = false)

        verify {
            engine.play("m1:tts:fr", "https://gate.example.me/api/v1/attachments/file/translated/m1_fr.mp3", any(), false)
        }
    }

    @Test
    fun `an absolute translated track plays unchanged`() {
        viewModel().playTranslation("m1", "es", "https://cdn.example.me/es.mp3", isProtected = false)

        verify { engine.play("m1:tts:es", "https://cdn.example.me/es.mp3", any(), false) }
    }

    @Test
    fun `a protected message plays its translated track protected`() {
        viewModel().playTranslation("m1", "fr", "/api/v1/attachments/file/translated/m1_fr.mp3", isProtected = true)

        verify { engine.play("m1:tts:fr", any(), any(), true) }
    }
}
