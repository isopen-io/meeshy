package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxDependencyKey
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxState
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SendBootReconcilerTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

    private fun reconciler(harness: MessageCollaboratorHarness, sends: MessageSendCoordinator = sends(harness)) =
        SendBootReconciler(harness.database.messageDao(), harness.database.outboxDao(), OrphanedUploadResumer { sends.resumeOrphanedUploads(it) })

    private fun sends(harness: MessageCollaboratorHarness) =
        MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock)

    @Test
    fun `a sending bubble without an outbox row becomes failed`() = runHarnessTest { harness ->
        val cid = sends(harness).sendOptimistic("c1", "salut", "fr", sender)
        harness.database.outboxDao().deleteAll(listOf(cid))

        val changed = reconciler(harness).reconcile()

        assertThat(changed).isEqualTo(1)
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.FAILED.name)
    }

    @Test
    fun `a failed bubble whose outbox restarted becomes sending`() = runHarnessTest { harness ->
        val cid = sends(harness).sendOptimistic("c1", "salut", "fr", sender)
        harness.database.messageDao().updateSendState(cid, LocalSendState.FAILED.name)

        reconciler(harness).reconcile()

        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.SENDING.name)
    }

    @Test
    fun `a coherent sending bubble and an exhausted failed one are left alone`() = runHarnessTest { harness ->
        val live = sends(harness).sendOptimistic("c1", "un", "fr", sender)
        val dead = sends(harness).sendOptimistic("c1", "deux", "fr", sender)
        harness.database.outboxDao().updateState(dead, OutboxState.EXHAUSTED.name, 5, harness.clock.now)
        harness.database.messageDao().updateSendState(dead, LocalSendState.FAILED.name)

        val changed = reconciler(harness).reconcile()

        assertThat(changed).isEqualTo(0)
        assertThat(harness.cachedSendState(live)).isEqualTo(LocalSendState.SENDING.name)
        assertThat(harness.cachedSendState(dead)).isEqualTo(LocalSendState.FAILED.name)
    }

    private val photo = ApiMessageAttachment(id = "up_1", mimeType = "image/jpeg")

    private suspend fun MessageCollaboratorHarness.photoBubbleWhoseMessageRowDied(sends: MessageSendCoordinator): String {
        val cid = sends.sendOptimistic("c1", "", "fr", sender, messageType = "image", attachmentUploadCmids = listOf("up_1"), attachments = listOf(photo))
        database.outboxDao().deleteAll(listOf(cid))
        return cid
    }

    private suspend fun MessageCollaboratorHarness.survivingUpload(cid: String) {
        outbox.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPLOAD_MEDIA,
                lane = OutboxLanes.MEDIA,
                targetId = "up_1",
                payload = """{"conversationId":"c1","messageCid":"$cid"}""",
                cmid = "up_1",
            ),
        )
    }

    @Test
    fun `#16168 a photo bubble killed before its message was queued leaves at boot behind its surviving upload`() = runHarnessTest { harness ->
        val sends = sends(harness)
        val cid = harness.photoBubbleWhoseMessageRowDied(sends)
        harness.survivingUpload(cid)

        reconciler(harness, sends).reconcile()

        val message = harness.outbox.deliverable("message:c1").single { it.cmid == cid }
        assertThat(OutboxDependencyKey.decode(message.dependsOn)).containsExactly("up_1")
        assertThat(MeeshyApi.json.decodeFromString<SendMessageRequest>(message.payload).attachmentIds).containsExactly("up_1")
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.SENDING.name)
    }

    @Test
    fun `#16168 a photo bubble killed before its message was queued and without any upload stays failed at boot`() = runHarnessTest { harness ->
        val sends = sends(harness)
        val cid = harness.photoBubbleWhoseMessageRowDied(sends)

        reconciler(harness, sends).reconcile()

        assertThat(harness.outbox.row(cid)).isNull()
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.FAILED.name)
    }
}
