package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.QuotedAttachmentSend
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxLanes
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** L'envoi optimiste transporte la relation typée, le lieu, le sticker et la durée éphémère — et le renvoi les reconstruit à l'identique. */
@RunWith(RobolectricTestRunner::class)
class MessageSendRelationTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth", avatar = null)

    private fun coordinator(harness: MessageCollaboratorHarness) =
        MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock)

    private suspend fun MessageCollaboratorHarness.queuedRequest(): SendMessageRequest =
        MeeshyApi.json.decodeFromString<SendMessageRequest>(outbox.deliverable(OutboxLanes.forMessage("c1")).last().payload)

    @Test
    fun `une reponse sur une piece precise part avec son ancre et la reconstruction la garde`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "vu", "fr", sender, replyToId = "m1", attachmentReplyToId = "att-9")

        assertThat(harness.queuedRequest().attachmentReplyTo).isEqualTo(QuotedAttachmentSend("att-9"))

        harness.outbox.discard(cid)
        coordinator.markSendFailed(cid)
        coordinator.retrySend(cid)

        val retried = harness.queuedRequest()
        assertThat(retried.clientMessageId).isEqualTo(cid)
        assertThat(retried.replyToId).isEqualTo("m1")
        assertThat(retried.attachmentReplyTo).isEqualTo(QuotedAttachmentSend("att-9"))
    }

    @Test
    fun `un ephemere n'envoie jamais d'echeance locale et son renvoi garde la duree`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val effects = MessageEffects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 300)
        val cid = coordinator.sendOptimistic("c1", "secret", "fr", sender, effects = effects)

        assertThat(harness.queuedRequest().expiresAt).isNull()
        assertThat(harness.cachedMessage(cid).expiresAt).isNotNull()

        harness.outbox.discard(cid)
        coordinator.markSendFailed(cid)
        coordinator.retrySend(cid)

        val retried = harness.queuedRequest()
        assertThat(retried.ephemeralDuration).isEqualTo(300)
        assertThat(retried.expiresAt).isNull()
        assertThat(retried.effectFlags).isEqualTo(MessageEffectFlags.EPHEMERAL.toInt())
    }

    @Test
    fun `lieu, sticker, type et source de partage survivent a la reconstruction`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val place = SharedPlace(48.85, 2.35, name = "Paris")
        val sticker = MessageSticker(emoji = "🎉")
        val cid = coordinator.sendOptimistic(
            "c1", "", "fr", sender,
            messageType = "location", location = place, sticker = sticker, copyAttachmentsFromMessageId = "src",
        )
        val original = harness.queuedRequest()
        assertThat(original.copyAttachmentsFromMessageId).isEqualTo("src")

        harness.outbox.discard(cid)
        coordinator.markSendFailed(cid)
        coordinator.retrySend(cid)

        val retried = harness.queuedRequest()
        assertThat(retried).isEqualTo(original)
    }
}
