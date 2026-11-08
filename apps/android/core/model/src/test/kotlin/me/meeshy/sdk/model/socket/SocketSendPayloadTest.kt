package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.QuotedAttachmentSend
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StickerAnimation
import org.junit.Test

class SocketSendPayloadTest {

    private fun request(
        content: String = "salut",
        attachmentIds: List<String>? = null,
        isEncrypted: Boolean? = null,
        build: (SendMessageRequest) -> SendMessageRequest = { it },
    ) = build(
        SendMessageRequest(
            content = content,
            originalLanguage = "fr",
            clientMessageId = "cid_1",
            attachmentIds = attachmentIds,
            isEncrypted = isEncrypted,
        ),
    )

    @Test
    fun `un texte clair part par message send avec son identifiant client`() {
        val payload = SocketSendPayloads.from("c1", request())!!

        assertThat(payload.event).isEqualTo(SocketEventNames.MESSAGE_SEND)
        assertThat(payload.body["conversationId"]?.jsonPrimitive?.content).isEqualTo("c1")
        assertThat(payload.body["content"]?.jsonPrimitive?.content).isEqualTo("salut")
        assertThat(payload.body["clientMessageId"]?.jsonPrimitive?.content).isEqualTo("cid_1")
        assertThat(payload.body["originalLanguage"]?.jsonPrimitive?.content).isEqualTo("fr")
        assertThat(payload.body.containsKey("attachmentIds")).isFalse()
    }

    @Test
    fun `un texte chiffre sans piece jointe n'est jamais emis`() {
        assertThat(SocketSendPayloads.from("c1", request(isEncrypted = true))).isNull()
        assertThat(SocketSendPayloads.from("c1", request(isEncrypted = true, attachmentIds = emptyList()))).isNull()
    }

    @Test
    fun `un message avec pieces jointes part par message send-with-attachments`() {
        val payload = SocketSendPayloads.from("c1", request(attachmentIds = listOf("a1", "a2"), isEncrypted = true))!!

        assertThat(payload.event).isEqualTo(SocketEventNames.MESSAGE_SEND_WITH_ATTACHMENTS)
        assertThat(payload.body["attachmentIds"]?.jsonArray?.map { it.jsonPrimitive.content }).containsExactly("a1", "a2").inOrder()
        assertThat(payload.body["isEncrypted"]?.jsonPrimitive?.boolean).isTrue()
    }

    @Test
    fun `une piece jointe en clair declare isEncrypted false`() {
        val payload = SocketSendPayloads.from("c1", request(attachmentIds = listOf("a1")))!!

        assertThat(payload.body["isEncrypted"]?.jsonPrimitive?.boolean).isFalse()
    }

    @Test
    fun `la charge porte tous les champs du message`() {
        val full = request(attachmentIds = listOf("a1")) {
            it.copy(
                messageType = "image",
                replyToId = "m0",
                storyReplyToId = "s0",
                forwardedFromId = "m9",
                forwardedFromConversationId = "c9",
                isBlurred = true,
                expiresAt = "2026-11-03T10:00:00.000Z",
                ephemeralDuration = 60,
                effectFlags = 5,
                isViewOnce = true,
                maxViewOnceCount = 2,
                location = SharedPlace(48.85, 2.35, name = "Paris"),
                sticker = MessageSticker(templateId = "t1", slots = mapOf("a" to "b"), animation = StickerAnimation.PULSE, emoji = "x"),
            )
        }

        val body = SocketSendPayloads.from("c1", full)!!.body

        assertThat(body.keys).containsAtLeast(
            "conversationId", "content", "attachmentIds", "replyToId", "storyReplyToId", "forwardedFromId",
            "originalLanguage", "messageType", "isBlurred", "expiresAt", "effectFlags", "isViewOnce",
            "maxViewOnceCount", "isEncrypted", "clientMessageId", "location", "sticker", "ephemeralDuration",
        )
        assertThat(body["effectFlags"]?.jsonPrimitive?.int).isEqualTo(5)
        assertThat(body["location"]?.jsonObject?.get("name")?.jsonPrimitive?.content).isEqualTo("Paris")
        assertThat(body["location"]?.jsonObject?.containsKey("address")).isFalse()
        assertThat(body["sticker"]?.jsonObject?.get("animation")?.jsonPrimitive?.content).isEqualTo("pulse")
        assertThat(body["sticker"]?.jsonObject?.get("slots")?.jsonObject?.get("a")?.jsonPrimitive?.content).isEqualTo("b")
    }

    @Test
    fun `un champ absent de la requete est absent de la charge`() {
        val body = SocketSendPayloads.from("c1", request())!!.body

        assertThat(body.keys).containsExactly("conversationId", "content", "clientMessageId", "originalLanguage", "messageType")
    }

    @Test
    fun `une citation de piece jointe, propre au REST, n'est pas emise par la socket`() {
        val quoted = request { it.copy(replyToId = "m0", attachmentReplyTo = QuotedAttachmentSend("a0")) }

        assertThat(SocketSendPayloads.from("c1", quoted)).isNull()
    }
}
