package me.meeshy.sdk.e2ee.libsignal

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * #18977 (AND-07), audit de #19077 P6 — un téléphone qui ne tient pas de coffre durable le DIT : l'envoi chiffré échoue avec
 * sa raison propre, jamais confondu avec un clair perdu, et rien ne repart en clair.
 */
class EndToEndSendHandlerTest {
    private val alice = "64f0c0ffee0000000000aaaa"

    private fun row(): OutboxEntity = OutboxEntity(
        cmid = "cid_1",
        lane = "messages",
        kind = "SEND_E2EE_MESSAGE",
        targetId = "64f0c0ffee000000000c0001",
        payload = """{"conversationId":"64f0c0ffee000000000c0001","peerUserId":"64f0c0ffee0000000000bbbb","clientMessageId":"cid_1"}""",
        dependsOn = null,
        attempts = 0,
        state = "PENDING",
        createdAt = 0L,
        updatedAt = 0L,
    )

    @Test
    fun aVaultThisPhoneCannotKeep_failsTheSendWithItsOwnReason() = runTest {
        val runtime = mockk<EndToEndMessagingRuntime>()
        coEvery { runtime.plaintext(any(), any()) } throws E2eeVaultUnavailableException(IllegalStateException("no usable keystore"))
        val session = mockk<SessionRepository> { every { currentUserId } returns alice }
        val handler = EndToEndSendHandler(runtime, session, mockk<MessageRepository>(relaxed = true), Json)

        val result = handler.send(row())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(EndToEndSendHandler.REASON_UNAVAILABLE))
    }
}
