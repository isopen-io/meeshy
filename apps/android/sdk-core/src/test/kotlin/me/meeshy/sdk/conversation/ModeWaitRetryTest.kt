package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.ConversationModeRead
import me.meeshy.sdk.outbox.EndToEndOutboxAdmission
import me.meeshy.sdk.outbox.MediaUploadPayload
import me.meeshy.sdk.outbox.MutationSender
import me.meeshy.sdk.outbox.OutboxDrainer
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxPlaintextAdmission
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.senders.UploadMediaHandler
import me.meeshy.sdk.outbox.stateEnum
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13820 — une attente du mode est BORNÉE, et la borne ne perd rien : la bulle reste, ses octets restent, et « Réessayer »
 * relance la pièce dont elle dépend avec une attente neuve, au lieu de la retrouver épuisée et sans octets.
 */
@RunWith(RobolectricTestRunner::class)
class ModeWaitRetryTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")
    private val ledger = InMemoryEndToEndRegimeLedger()
    private val blobs = mockk<MediaBlobStore>(relaxed = true)

    private fun MessageCollaboratorHarness.coordinator() =
        MessageSendCoordinator(database, database.messageDao(), outbox, clock)

    private fun MessageCollaboratorHarness.drainer(coordinator: MessageSendCoordinator, sent: MutableList<String>): OutboxDrainer {
        val uploads = UploadMediaHandler(blobs, mockk(), mockk(), MeeshyApi.json, MediaUploadProgressLedger(), ledger)
        return OutboxDrainer(
            outbox = outbox,
            senders = OutboxKind.entries.associateWith { MutationSender { row -> sent += row.cmid; SendResult.Success } },
            onExhausted = { row: OutboxEntity ->
                when (row.kindEnum) {
                    OutboxKind.UPLOAD_MEDIA -> uploads.onExhausted(row)
                    OutboxKind.SEND_MESSAGE -> coordinator.markSendFailed(row.cmid, row.lastError)
                    else -> Unit
                }
            },
            plaintextAdmission = EndToEndOutboxAdmission(
                ledger, database.conversationDao(), database.messageDao(), outbox,
                modeReader = { ConversationModeRead.Unreadable },
            ),
        )
    }

    private suspend fun MessageCollaboratorHarness.unconfirmed(id: String) {
        database.conversationDao().upsertAll(
            listOf(ConversationEntity(id = id, payload = MeeshyApi.json.encodeToString(ApiConversation(id = id, encryptionMode = "server")), updatedAt = 0, cachedAt = 0)),
        )
        ledger.markModeUnconfirmed(id)
    }

    private suspend fun MessageCollaboratorHarness.waitedBeyondTheBound(cmid: String) {
        database.outboxDao().defer(
            cmid,
            nextAttemptAt = 0L,
            waitingSince = System.currentTimeMillis() - 61 * 60 * 1000L,
            now = 0L,
        )
    }

    @Test
    fun `une piece epuisee faute de mode garde ses octets, sa bulle le dit, et reessayer la relance avec une attente neuve`() = runHarnessTest { harness ->
        harness.unconfirmed("c1")
        harness.outbox.enqueue(
            OutboxMutation(
                OutboxKind.UPLOAD_MEDIA,
                OutboxLanes.MEDIA,
                targetId = "up1",
                payload = MeeshyApi.json.encodeToString(MediaUploadPayload(conversationId = "c1")),
                cmid = "up1",
            ),
        )
        harness.waitedBeyondTheBound("up1")
        val coordinator = harness.coordinator()
        val cid = coordinator.sendOptimistic("c1", "la photo", "fr", sender, attachmentUploadCmids = listOf("up1"))
        val sent = mutableListOf<String>()
        val drainer = harness.drainer(coordinator, sent)

        drainer.drainLane(OutboxLanes.MEDIA)
        drainer.drainLane(OutboxLanes.forMessage("c1"))

        assertThat(harness.outbox.row("up1")?.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(harness.outbox.row(cid)?.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(harness.outbox.row(cid)?.lastError).isEqualTo(OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.FAILED.name)

        coordinator.retrySend(cid)
        drainer.drainLane(OutboxLanes.MEDIA)
        drainer.drainLane(OutboxLanes.forMessage("c1"))

        assertThat(sent).isEmpty()
        assertThat(harness.outbox.row(cid)?.stateEnum).isEqualTo(OutboxState.PENDING)
        val upload = harness.outbox.row("up1")!!
        assertThat(upload.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(upload.waitingSince).isAtLeast(System.currentTimeMillis() - 60_000L)
        coVerify(exactly = 0) { blobs.remove(any()) }
    }

    @Test
    fun `un message hors du fil epuise faute de mode garde sa bulle et son texte, et reessayer le remet en file`() = runHarnessTest { harness ->
        harness.unconfirmed("c1")
        val coordinator = harness.coordinator()
        val cid = coordinator.sendOptimistic("c1", "salut", "fr", sender)
        harness.waitedBeyondTheBound(cid)
        val sent = mutableListOf<String>()
        val drainer = harness.drainer(coordinator, sent)

        drainer.drainLane(OutboxLanes.forMessage("c1"))

        assertThat(sent).isEmpty()
        assertThat(harness.outbox.row(cid)?.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.FAILED.name)
        assertThat(harness.cachedMessage(cid).content).isEqualTo("salut")

        coordinator.retrySend(cid)

        val revived = harness.outbox.row(cid)!!
        assertThat(revived.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(revived.waitingSince).isNull()
    }
}
