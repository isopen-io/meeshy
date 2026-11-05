package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.conversation.MessageMediaWriteBack
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

class MultiAttachmentGraftsTest {

    private fun payload(ids: List<String>): String =
        MeeshyApi.json.encodeToString(
            SendMessageRequest(content = "légende", originalLanguage = "fr", clientMessageId = "cid_1", attachmentIds = ids, messageType = "file"),
        )

    @Test
    fun `une charge a plusieurs pieces recoit une greffe par piece sans toucher aux autres`() {
        val graft = OutboxPayloadGrafts.firstOf(MessageMediaWriteBack::graft)
        val start = payload(listOf("up-1", "up-2", "up-3"))

        val afterFirst = graft(start, "up-2", "real-2")!!
        val afterAll = graft(afterFirst, "up-1", "real-1")!!.let { graft(it, "up-3", "real-3")!! }

        val ids = MeeshyApi.json.decodeFromString<SendMessageRequest>(afterAll).attachmentIds
        assertThat(ids).containsExactly("real-1", "real-2", "real-3").inOrder()
    }

    @Test
    fun `rejouer une greffe deja appliquee ne reecrit rien`() {
        val graft = OutboxPayloadGrafts.firstOf(MessageMediaWriteBack::graft)
        val done = graft(payload(listOf("up-1")), "up-1", "real-1")!!
        assertThat(graft(done, "up-1", "real-1")).isNull()
    }
}
