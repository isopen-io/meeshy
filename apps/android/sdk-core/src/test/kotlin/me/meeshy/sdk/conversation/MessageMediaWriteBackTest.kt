package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

class MessageMediaWriteBackTest {

    private fun payloadOf(attachmentIds: List<String>?, content: String = "hi"): String =
        MeeshyApi.json.encodeToString(
            SendMessageRequest(
                content = content,
                originalLanguage = "en",
                clientMessageId = "cmid_local",
                attachmentIds = attachmentIds,
                messageType = "file",
            ),
        )

    private fun attachmentIdsIn(payload: String): List<String>? =
        MeeshyApi.json.decodeFromString<SendMessageRequest>(payload).attachmentIds

    @Test
    fun `grafts the real id in place of the placeholder`() {
        val payload = payloadOf(listOf("upload-cmid"))

        val rewritten = MessageMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNotNull()
        assertThat(attachmentIdsIn(rewritten!!)).containsExactly("real-99")
    }

    @Test
    fun `preserves the order and the other ids around the placeholder`() {
        val payload = payloadOf(listOf("a", "upload-cmid", "b"))

        val rewritten = MessageMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(attachmentIdsIn(rewritten!!)).containsExactly("a", "real-99", "b").inOrder()
    }

    @Test
    fun `replaces every occurrence of the placeholder`() {
        val payload = payloadOf(listOf("upload-cmid", "x", "upload-cmid"))

        val rewritten = MessageMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(attachmentIdsIn(rewritten!!)).containsExactly("real-99", "x").inOrder()
    }

    @Test
    fun `dedupes when the real id already sits in the list`() {
        val payload = payloadOf(listOf("real-99", "upload-cmid"))

        val rewritten = MessageMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(attachmentIdsIn(rewritten!!)).containsExactly("real-99")
    }

    @Test
    fun `preserves the message body and type through the round-trip`() {
        val payload = payloadOf(listOf("upload-cmid"), content = "the pasted body")

        val rewritten = MessageMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")!!
        val request = MeeshyApi.json.decodeFromString<SendMessageRequest>(rewritten)

        assertThat(request.content).isEqualTo("the pasted body")
        assertThat(request.messageType).isEqualTo("file")
        assertThat(request.clientMessageId).isEqualTo("cmid_local")
    }

    @Test
    fun `returns null when the placeholder is absent`() {
        val payload = payloadOf(listOf("a", "b"))

        val rewritten = MessageMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `returns null when the request carries no attachments`() {
        val payload = payloadOf(attachmentIds = null)

        val rewritten = MessageMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `returns null when the swap would leave the list identical`() {
        val payload = payloadOf(listOf("upload-cmid"))

        val rewritten = MessageMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "upload-cmid")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `returns null on an undecodable payload`() {
        val rewritten = MessageMediaWriteBack.graft("{ not json", placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `ignores a story publish payload it cannot own`() {
        val storyPayload = MeeshyApi.json.encodeToString(
            me.meeshy.sdk.net.api.CreateStoryRequest(content = "s", mediaIds = listOf("upload-cmid")),
        )

        val rewritten = MessageMediaWriteBack.graft(storyPayload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }
}
