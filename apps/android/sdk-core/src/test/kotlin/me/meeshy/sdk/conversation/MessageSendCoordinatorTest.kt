package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxDependencyKey
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Characterisation of the send lifecycle as it behaved inside the monolithic repository: the
 * optimistic `SENDING` bubble, the queued `SEND_MESSAGE`, the ACK, the failure and the retry.
 */
@RunWith(RobolectricTestRunner::class)
class MessageSendCoordinatorTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth", avatar = "https://cdn/a.png")

    private fun coordinator(harness: MessageCollaboratorHarness) =
        MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock)

    private suspend fun MessageCollaboratorHarness.queuedRequest(conversationId: String = "c1"): SendMessageRequest =
        MeeshyApi.json.decodeFromString<SendMessageRequest>(
            outbox.deliverable(OutboxLanes.forMessage(conversationId)).last().payload,
        )

    @Test
    fun `the bubble, the wire request and the outbox row share one cid identity`() = runHarnessTest { harness ->
        val cid = coordinator(harness).sendOptimistic("c1", "salut", "fr", sender)

        assertThat(cid).startsWith("cid_")
        assertThat(harness.cachedMessage(cid).clientMessageId).isEqualTo(cid)
        assertThat(harness.queuedRequest().clientMessageId).isEqualTo(cid)
        assertThat(harness.outbox.deliverable("message:c1").map { it.cmid }).containsExactly(cid)
    }

    @Test
    fun `the bubble appears as SENDING at the clock instant, signed by the sender`() = runHarnessTest { harness ->
        val cid = coordinator(harness).sendOptimistic("c1", "salut", "fr", sender)

        val row = harness.database.messageDao().find(cid)!!
        assertThat(row.sendState).isEqualTo(LocalSendState.SENDING.name)
        assertThat(row.createdAt).isEqualTo(harness.clock.now)
        assertThat(row.cachedAt).isEqualTo(harness.clock.now)
        val bubble = harness.cachedMessage(cid)
        assertThat(bubble.createdAt).isEqualTo(Instant.ofEpochMilli(harness.clock.now).toString())
        assertThat(bubble.senderId).isEqualTo("me")
        assertThat(bubble.content).isEqualTo("salut")
        assertThat(bubble.originalLanguage).isEqualTo("fr")
        assertThat(bubble.sender).isEqualTo(
            ApiMessageSender(userId = "me", displayName = "Atabeth", username = "atabeth", avatar = "https://cdn/a.png"),
        )
    }

    @Test
    fun `a send is queued as SEND_MESSAGE on its own conversation lane and no other`() = runHarnessTest { harness ->
        coordinator(harness).sendOptimistic("c1", "salut", "fr", sender)

        val queued = harness.outbox.deliverable("message:c1").single()
        assertThat(queued.kindEnum).isEqualTo(OutboxKind.SEND_MESSAGE)
        assertThat(queued.targetId).isEqualTo("c1")
        assertThat(harness.outbox.deliverable("message:c2")).isEmpty()
    }

    @Test
    fun `reply, story reply and forward references travel on the bubble and on the request`() = runHarnessTest { harness ->
        val cid = coordinator(harness).sendOptimistic(
            "c1", "salut", "fr", sender,
            replyToId = "r1",
            storyReplyToId = "s1",
            forwardedFromId = "f1",
            forwardedFromConversationId = "fc1",
        )

        val bubble = harness.cachedMessage(cid)
        assertThat(bubble.replyToId).isEqualTo("r1")
        assertThat(bubble.storyReplyToId).isEqualTo("s1")
        assertThat(bubble.forwardedFromId).isEqualTo("f1")
        assertThat(bubble.forwardedFromConversationId).isEqualTo("fc1")
        val request = harness.queuedRequest()
        assertThat(request.replyToId).isEqualTo("r1")
        assertThat(request.storyReplyToId).isEqualTo("s1")
        assertThat(request.forwardedFromId).isEqualTo("f1")
        assertThat(request.forwardedFromConversationId).isEqualTo("fc1")
    }

    @Test
    fun `a text-only send carries no attachment ids and waits for nothing`() = runHarnessTest { harness ->
        val cid = coordinator(harness).sendOptimistic("c1", "salut", "fr", sender)

        val row = harness.outbox.deliverable("message:c1").single { it.cmid == cid }
        assertThat(OutboxDependencyKey.decode(row.dependsOn)).isEmpty()
        assertThat(harness.queuedRequest().attachmentIds).isNull()
        assertThat(harness.cachedMessage(cid).messageType).isEqualTo("text")
    }

    @Test
    fun `each distinct non-blank upload cmid becomes a placeholder id and a dependency`() = runHarnessTest { harness ->
        val attachment = ApiMessageAttachment(id = "u1", fileName = "paste.txt", mimeType = "text/plain")

        val cid = coordinator(harness).sendOptimistic(
            "c1", "", "fr", sender,
            messageType = "file",
            attachmentUploadCmids = listOf("  ", "u1", "u1", "u2"),
            attachments = listOf(attachment),
        )

        val row = harness.outbox.deliverable("message:c1").single { it.cmid == cid }
        assertThat(OutboxDependencyKey.decode(row.dependsOn)).containsExactly("u1", "u2")
        val request = harness.queuedRequest()
        assertThat(request.attachmentIds).containsExactly("u1", "u2").inOrder()
        assertThat(request.messageType).isEqualTo("file")
        assertThat(harness.cachedMessage(cid).attachments).containsExactly(attachment)
    }

    @Test
    fun `the chosen effects are encoded onto the request and surfaced on the bubble`() = runHarnessTest(startMillis = 0L) { harness ->
        val effects = MessageEffects(
            flags = MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.EPHEMERAL,
            ephemeralDuration = 300,
            maxViewOnceCount = 2,
        )

        val cid = coordinator(harness).sendOptimistic("c1", "secret", "fr", sender, effects = effects)

        val request = harness.queuedRequest()
        assertThat(request.effectFlags)
            .isEqualTo((MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.EPHEMERAL).toInt())
        assertThat(request.isViewOnce).isTrue()
        assertThat(request.ephemeralDuration).isEqualTo(300)
        assertThat(request.expiresAt).isEqualTo("1970-01-01T00:05:00Z")
        assertThat(request.maxViewOnceCount).isEqualTo(2)
        val bubble = harness.cachedMessage(cid)
        assertThat(bubble.isViewOnce).isTrue()
        assertThat(bubble.expiresAt).isEqualTo("1970-01-01T00:05:00Z")
    }

    @Test
    fun `the server ACK swaps the local bubble for the authoritative message`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "salut", "fr", sender)
        val server = ApiMessage(
            id = "srv1",
            conversationId = "c1",
            content = "salut",
            createdAt = "2026-06-01T10:00:00Z",
            clientMessageId = cid,
        )

        coordinator.reconcileSent(cid, server)

        assertThat(harness.database.messageDao().find(cid)).isNull()
        val row = harness.database.messageDao().find("srv1")!!
        assertThat(row.sendState).isNull()
        assertThat(row.conversationId).isEqualTo("c1")
        assertThat(row.createdAt).isEqualTo(Instant.parse("2026-06-01T10:00:00Z").toEpochMilli())
        assertThat(harness.cachedMessage("srv1")).isEqualTo(server)
    }

    @Test
    fun `an exhausted outbox flips the bubble to FAILED`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "salut", "fr", sender)

        coordinator.markSendFailed(cid)

        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.FAILED.name)
    }

    @Test
    fun `retry revives the exhausted outbox row and flips the bubble back to SENDING`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic("c1", "salut", "fr", sender)
        harness.outbox.markExhausted(cid, "gave up")
        coordinator.markSendFailed(cid)

        coordinator.retrySend(cid)

        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.SENDING.name)
        val row = harness.outbox.deliverable("message:c1").single()
        assertThat(row.cmid).isEqualTo(cid)
        assertThat(row.stateEnum).isEqualTo(OutboxState.PENDING)
    }

    @Test
    fun `retry re-enqueues from the cached bubble when the outbox row is gone`() = runHarnessTest { harness ->
        val coordinator = coordinator(harness)
        val cid = coordinator.sendOptimistic(
            "c1", "secret", "es", sender,
            replyToId = "r1",
            forwardedFromId = "f1",
            effects = MessageEffects(flags = MessageEffectFlags.VIEW_ONCE),
        )
        harness.outbox.markSucceeded(cid)
        coordinator.markSendFailed(cid)

        coordinator.retrySend(cid)

        val request = harness.queuedRequest()
        assertThat(request.clientMessageId).isEqualTo(cid)
        assertThat(request.content).isEqualTo("secret")
        assertThat(request.originalLanguage).isEqualTo("es")
        assertThat(request.replyToId).isEqualTo("r1")
        assertThat(request.forwardedFromId).isEqualTo("f1")
        assertThat(request.isViewOnce).isTrue()
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.SENDING.name)
    }

    @Test
    fun `retrying a bubble that is not cached does nothing`() = runHarnessTest { harness ->
        coordinator(harness).retrySend("cid_ghost")

        assertThat(harness.outbox.deliverable("message:c1")).isEmpty()
        assertThat(harness.database.messageDao().find("cid_ghost")).isNull()
    }
}
