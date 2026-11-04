package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.AudioTranslationEvent
import me.meeshy.sdk.model.TranscriptionReadyEvent
import me.meeshy.sdk.model.TranslationEvent
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

class TranslationRealtimeApplierTest {

    private val translation = MutableSharedFlow<TranslationEvent>()
    private val transcription = MutableSharedFlow<TranscriptionReadyEvent>()
    private val audio = MutableSharedFlow<AudioTranslationEvent>()
    private val messages = mockk<MessageRepository>(relaxed = true)
    private val registrar = RecordingRegistrar().also {
        val socket = mockk<MessageSocketManager> {
            every { translationReceived } returns translation
            every { transcriptionReady } returns transcription
            every { audioTranslationReady } returns audio
        }
        TranslationRealtimeApplier(socket, messages).subscribe(it)
    }

    @Test
    fun `une traduction recue est fusionnee dans sa langue exacte`() = runTest {
        registrar.deliver(translation, TranslationEvent("m1", "c1", "de", "Hallo"))
        coVerify(exactly = 1) { messages.applyTranslation("m1", "de", "Hallo") }
        coVerify(exactly = 0) { messages.applyTranslation(any(), neq("de"), any()) }
    }

    @Test
    fun `la meme traduction rejouee passe deux fois par la fusion idempotente`() = runTest {
        val event = TranslationEvent("m1", "c1", "de", "Hallo")
        registrar.deliver(translation, event)
        registrar.deliver(translation, event)
        coVerify(exactly = 2) { messages.applyTranslation("m1", "de", "Hallo") }
    }

    @Test
    fun `les enrichissements partent sur la voie d'enrichissement`() {
        val lane = OrderedEventLane.Family.ENRICHMENT
        assertThat(registrar.familyOf(translation)).isEqualTo(lane)
        assertThat(registrar.familyOf(transcription)).isEqualTo(lane)
        assertThat(registrar.familyOf(audio)).isEqualTo(lane)
    }
}
