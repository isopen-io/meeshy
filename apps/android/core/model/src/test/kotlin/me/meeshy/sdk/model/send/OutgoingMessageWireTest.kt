package me.meeshy.sdk.model.send

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.QuotedAttachmentSend
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class OutgoingMessageWireTest {

    private val cid = "cid_11111111-1111-4111-8111-111111111111"
    private val json = Json { encodeDefaults = false }

    private fun context(effects: MessageEffects = MessageEffects(), reusing: String? = null) =
        SendAttemptContext.begin(nowMillis = 0L, effects = effects, language = "fr", reusing = reusing ?: cid)

    private fun message(relation: MessageRelation = MessageRelation.None) =
        OutgoingMessage(conversationId = "c1", content = "  salut  ", relation = relation)

    @Test
    fun `une reponse sur une piece precise serialise replyToId et attachmentReplyTo`() {
        val request = message(MessageRelation.Reply("m1", QuotedAttachmentSend("a1"))).wireRequest(context())
        assertThat(request.replyToId).isEqualTo("m1")
        assertThat(request.attachmentReplyTo).isEqualTo(QuotedAttachmentSend("a1"))
        assertThat(request.content).isEqualTo("salut")
        val body = json.parseToJsonElement(json.encodeToString(request)).jsonObject
        assertThat(body["attachmentReplyTo"]!!.jsonObject["attachmentId"].toString()).isEqualTo("\"a1\"")
    }

    @Test
    fun `une reponse ordinaire n'a aucune cle attachmentReplyTo ni de transfert`() {
        val body = json.encodeToString(message(MessageRelation.Reply("m1")).wireRequest(context()))
        assertThat(body).doesNotContain("attachmentReplyTo")
        assertThat(body).doesNotContain("forwardedFromId")
    }

    @Test
    fun `une reponse de story et un transfert sont exclusifs sur le fil`() {
        val story = message(MessageRelation.StoryReply("s1")).wireRequest(context())
        assertThat(story.storyReplyToId).isEqualTo("s1")
        assertThat(story.replyToId).isNull()
        assertThat(story.forwardedFromId).isNull()

        val forward = message(MessageRelation.Forward("m2", "c9")).wireRequest(context())
        assertThat(forward.forwardedFromId).isEqualTo("m2")
        assertThat(forward.forwardedFromConversationId).isEqualTo("c9")
        assertThat(forward.replyToId).isNull()
    }

    @Test
    fun `un ephemere porte la duree et le bit mais jamais d'expiresAt`() {
        val effects = MessageEffects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 300)
        val request = message().wireRequest(context(effects))
        assertThat(request.ephemeralDuration).isEqualTo(300)
        assertThat(request.effectFlags).isEqualTo(MessageEffectFlags.EPHEMERAL.toInt())
        assertThat(request.expiresAt).isNull()
    }

    @Test
    fun `la protection vue unique et floutee voyage avec son compteur`() {
        val effects = MessageEffects(flags = MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.BLURRED, maxViewOnceCount = 2)
        val request = message().wireRequest(context(effects))
        assertThat(request.isViewOnce).isTrue()
        assertThat(request.isBlurred).isTrue()
        assertThat(request.maxViewOnceCount).isEqualTo(2)
    }

    @Test
    fun `lieu sticker et pieces transferees sont serialises`() {
        val place = SharedPlace(48.85, 2.35, name = "Paris")
        val sticker = MessageSticker(emoji = "🎉")
        val out = message().copy(
            location = place, sticker = sticker, copyAttachmentsFromMessageId = "m7",
            forwardedAttachmentIds = listOf("a1", "a1", " ", "a2"), attachments = OutgoingAttachments(listOf("p1")),
        )
        val request = out.wireRequest(context())
        assertThat(request.location).isEqualTo(place)
        assertThat(request.sticker).isEqualTo(sticker)
        assertThat(request.copyAttachmentsFromMessageId).isEqualTo("m7")
        assertThat(request.forwardedAttachmentIds).containsExactly("a1", "a2").inOrder()
        assertThat(request.attachmentIds).containsExactly("p1")
    }

    @Test
    fun `un renvoi reutilise a l'identique le clientMessageId`() {
        val ctx = context(reusing = cid)
        assertThat(ctx.reusesExistingRow).isTrue()
        assertThat(message().wireRequest(ctx).clientMessageId).isEqualTo(cid)
        val fresh = SendAttemptContext.begin(0L, MessageEffects(), "fr")
        assertThat(fresh.reusesExistingRow).isFalse()
        assertThat(fresh.clientMessageId).startsWith("cid_")
    }

    @Test
    fun `le chiffrement est un true ou rien`() {
        assertThat(message().wireRequest(context()).isEncrypted).isNull()
        val sealed = message().wireRequest(context(), encryptionMode = "e2ee")
        assertThat(sealed.isEncrypted).isTrue()
        assertThat(sealed.encryptionMode).isEqualTo("e2ee")
    }

    @Test
    fun `le socket refuse ce qu'il perdrait en silence`() {
        assertThat(message().socketFallbackEligible(context())).isTrue()
        assertThat(message(MessageRelation.Reply("m", QuotedAttachmentSend("a"))).socketFallbackEligible(context())).isFalse()
        assertThat(message(MessageRelation.Forward("m")).socketFallbackEligible(context())).isFalse()
        assertThat(message().socketFallbackEligible(context(MessageEffects(flags = MessageEffectFlags.VIEW_ONCE)))).isFalse()
    }
}
