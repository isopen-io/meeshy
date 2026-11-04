package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.attachment.TranscriptionRefetchScheduler
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatTranscriptionRetryControllerTest {

    private val openedAt = isoToEpochMillisOrNull("2026-11-04T10:00:00Z")!!

    private class FakeHost(override val scope: CoroutineScope, start: List<LocalMessage>) : ChatControllerHost {
        override val conversationId: String = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1"))
        override val messages = MutableStateFlow(start)
        override fun reportError(message: String?) = Unit
    }

    private fun voice(id: String, createdAt: String, transcription: String? = null, state: LocalSendState = LocalSendState.SYNCED, mode: String? = null) =
        LocalMessage(
            ApiMessage(
                id = id,
                conversationId = "c1",
                createdAt = createdAt,
                isEncrypted = mode?.let { true },
                encryptionMode = mode,
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "att_$id",
                        mimeType = "audio/m4a",
                        transcription = transcription?.let { ApiAttachmentTranscription(text = it) },
                    ),
                ),
            ),
            sendState = state,
        )

    private val before = "2026-11-04T09:00:00Z"
    private val after = "2026-11-04T10:00:30Z"

    private class Rig(scope: TestScope, start: List<LocalMessage>, openedAt: Long) {
        val reads = mutableListOf<Pair<String, String>>()
        val host = FakeHost(scope.backgroundScope, start)
        val scheduler = TranscriptionRefetchScheduler(refresh = { c, m, _ ->
            reads += c to m
            true
        })
        val controller = ChatTranscriptionRetryController(scheduler, nowMillis = { openedAt })

        init {
            controller.attach(host)
            scope.runCurrent()
        }
    }

    @Test
    fun `a voice message already there without transcription is read once after five seconds`() = runTest {
        val rig = Rig(this, listOf(voice("m1", before)), openedAt)

        advanceTimeBy(4_999L)
        runCurrent()
        assertThat(rig.reads).isEmpty()
        advanceTimeBy(1L)
        runCurrent()

        assertThat(rig.reads).containsExactly("c1" to "m1")
    }

    @Test
    fun `a voice message that arrives live is left to transcription ready`() = runTest {
        val rig = Rig(this, emptyList(), openedAt)

        rig.host.messages.value = listOf(voice("m2", after))
        advanceTimeBy(60_000L)
        runCurrent()

        assertThat(rig.reads).isEmpty()
    }

    @Test
    fun `a transcribed message is not read`() = runTest {
        val rig = Rig(this, listOf(voice("m1", before, transcription = "salut")), openedAt)

        advanceTimeBy(60_000L)
        runCurrent()

        assertThat(rig.reads).isEmpty()
    }

    @Test
    fun `an unsent bubble and an end to end message are never read`() = runTest {
        val rig = Rig(
            this,
            listOf(voice("m1", before, state = LocalSendState.SENDING), voice("m2", before, mode = "e2ee")),
            openedAt,
        )

        advanceTimeBy(60_000L)
        runCurrent()

        assertThat(rig.reads).isEmpty()
    }

    @Test
    fun `an id is planned once per screen, however many times the window changes`() = runTest {
        val rig = Rig(this, listOf(voice("m1", before)), openedAt)
        advanceTimeBy(5_000L)
        runCurrent()

        rig.host.messages.value = listOf(voice("m1", before), voice("m0", before))
        advanceTimeBy(5_000L)
        runCurrent()
        rig.host.messages.value = listOf(voice("m1", before), voice("m0", before), voice("mx", before, transcription = "ok"))
        advanceTimeBy(60_000L)
        runCurrent()

        assertThat(rig.reads.map { it.second }).containsExactly("m1", "m0").inOrder()
    }
}
