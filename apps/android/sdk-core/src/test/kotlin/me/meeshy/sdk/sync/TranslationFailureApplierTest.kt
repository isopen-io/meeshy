package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AudioTranslationEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.TranscriptionFailedEvent
import me.meeshy.sdk.model.TranscriptionPayload
import me.meeshy.sdk.model.TranscriptionReadyEvent
import me.meeshy.sdk.model.TranslationEntry
import me.meeshy.sdk.model.TranslationEvent
import me.meeshy.sdk.model.TranslationFailedEvent
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

class TranslationFailureApplierTest {

    private val translation = MutableSharedFlow<TranslationEvent>()
    private val transcription = MutableSharedFlow<TranscriptionReadyEvent>()
    private val audio = MutableSharedFlow<AudioTranslationEvent>()
    private val conversation = MutableSharedFlow<ConversationSocketEvent>()
    private val store = TranslationFailureStore()
    private val registrar = RecordingRegistrar().also {
        val socket = mockk<MessageSocketManager> {
            every { translationReceived } returns translation
            every { transcriptionReady } returns transcription
            every { audioTranslationReady } returns audio
        }
        val events = mockk<ConversationSocketEventsManager> { every { events } returns conversation }
        TranslationFailureApplier(socket, events, store).subscribe(it)
    }

    @Test
    fun `un echec de traduction pose l'etat puis la traduction recue l'efface`() = runTest {
        registrar.deliver(conversation, TranslationFailedEvent("m1", "c1", "boom"))
        assertThat(store.ledger.value.hasFailure("m1")).isTrue()
        registrar.deliver(translation, TranslationEvent("m1", listOf(TranslationEntry(targetLanguage = "fr", translatedContent = "Bonjour"))))
        assertThat(store.ledger.value.hasFailure("m1")).isFalse()
    }

    @Test
    fun `un echec de transcription tombe quand la transcription arrive`() = runTest {
        registrar.deliver(conversation, TranscriptionFailedEvent("m1", "a1", "c1"))
        assertThat(store.ledger.value.hasFailure("m1")).isTrue()
        registrar.deliver(transcription, TranscriptionReadyEvent("m1", "c1", "a1", TranscriptionPayload()))
        assertThat(store.ledger.value.hasFailure("m1")).isFalse()
    }

    @Test
    fun `l'echec d'un message ne touche pas un autre message`() = runTest {
        registrar.deliver(conversation, TranslationFailedEvent("m1", "c1"))
        registrar.deliver(translation, TranslationEvent("m2", listOf(TranslationEntry(targetLanguage = "fr", translatedContent = "Salut"))))
        assertThat(store.ledger.value.hasFailure("m1")).isTrue()
    }
}
