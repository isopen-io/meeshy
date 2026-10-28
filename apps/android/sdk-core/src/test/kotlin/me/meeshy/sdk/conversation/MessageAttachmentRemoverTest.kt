package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.MediaApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageAttachmentRemoverTest {

    private fun photo(id: String, reactions: Map<String, Int>? = null) =
        ApiMessageAttachment(id = id, mimeType = "image/jpeg", reactionSummary = reactions)

    private fun message(vararg pieces: ApiMessageAttachment) =
        ApiMessage(id = "m1", conversationId = "c1", content = "", attachments = pieces.toList(), createdAt = "2026-06-01T10:00:00Z")

    private fun remover(harness: MessageCollaboratorHarness, api: MediaApi) = MessageAttachmentRemover(harness.updater, api)

    @Test
    fun `the piece leaves the cached row at once and the gateway deletes it`() = runHarnessTest { harness ->
        harness.seedSynced(message(photo("a"), photo("b")))
        val api = mockk<MediaApi>()
        coEvery { api.delete("a") } returns ApiResponse(success = true, data = JsonObject(emptyMap()))

        val outcome = remover(harness, api).remove("m1", "a")

        assertThat(outcome).isEqualTo(PieceRemoval.REMOVED)
        assertThat(harness.cachedMessage("m1").attachments.map { it.id }).containsExactly("b")
        coVerify(exactly = 1) { api.delete("a") }
    }

    @Test
    fun `a refusal puts the piece back where it was, and keeps what arrived meanwhile on the others`() = runHarnessTest { harness ->
        harness.seedSynced(message(photo("a"), photo("b"), photo("c")))
        val api = mockk<MediaApi>()
        coEvery { api.delete("b") } coAnswers {
            // Une réaction d'un autre membre arrive sur « c » pendant la requête.
            harness.updater.update("m1", requireSynced = false) { m ->
                m.copy(attachments = m.attachments.map { if (it.id == "c") it.copy(reactionSummary = mapOf("👍" to 1)) else it })
            }
            throw IOException("offline")
        }

        val outcome = remover(harness, api).remove("m1", "b")

        assertThat(outcome).isEqualTo(PieceRemoval.FAILED)
        val restored = harness.cachedMessage("m1").attachments
        assertThat(restored.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(restored.first { it.id == "c" }.reactionSummary).containsExactly("👍", 1)
    }

    @Test
    fun `a bubble the gateway does not know yet, or an unknown piece, tries nothing`() = runHarnessTest { harness ->
        harness.database.messageDao().upsertAll(
            listOf(MessageEntityFactory.local(message(photo("a")).copy(id = "cid_1"), harness.clock.now, LocalSendState.SENDING)),
        )
        harness.seedSynced(message(photo("a")))
        val api = mockk<MediaApi>(relaxed = true)

        assertThat(remover(harness, api).remove("cid_1", "a")).isEqualTo(PieceRemoval.UNKNOWN)
        assertThat(remover(harness, api).remove("m1", "ghost")).isEqualTo(PieceRemoval.UNKNOWN)
        assertThat(remover(harness, api).remove("nope", "a")).isEqualTo(PieceRemoval.UNKNOWN)
        coVerify(exactly = 0) { api.delete(any()) }
    }
}
