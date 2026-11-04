package me.meeshy.sdk.share

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageForwardService
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.share.SharePendingShare
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class ShareDurableSenderTest {

    @get:Rule val tmp = TemporaryFolder()

    private val me = MeeshyUser(id = "me", username = "atabeth")

    private fun group(id: String) = ShareRecipient.conversation(id, "Groupe $id", ShareRecipient.Detail.Group(3), null, null, null)

    private class Optimistic(val conversationId: String, val content: String, val forwardedFromId: String?, val forwardedFromConversationId: String?,
        val uploadCmids: List<String>, val clientMessageId: String?, val copyFrom: String?)

    private class Rig(
        val sender: ShareDurableSender,
        val store: SharePendingShareStore,
        val sent: MutableList<Optimistic>,
        val posted: MutableList<Pair<String, String?>>,
        val uploads: MediaUploadQueue,
        val scheduled: IntArray,
        val sheetAtFirstByte: MutableList<SharePendingShare?>,
    )

    private fun rig(
        admissions: Map<String, OutOfThreadAdmission> = emptyMap(),
        failSend: (String) -> Boolean = { false },
        store: SharePendingShareStore = SharePendingShareStore(File(tmp.root, "root")),
    ): Rig {
        val sent = mutableListOf<Optimistic>()
        val posted = mutableListOf<Pair<String, String?>>()
        val sheetAtFirstByte = mutableListOf<SharePendingShare?>()
        val scheduled = intArrayOf(0)
        val messages = mockk<MessageRepository>()
        coEvery { messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } coAnswers {
            val a = args
            sheetAtFirstByte += kotlinx.coroutines.runBlocking { store.load(sheetId, "me") }
            if (failSend(a[0] as String)) error("offline")
            @Suppress("UNCHECKED_CAST")
            sent += Optimistic(a[0] as String, a[1] as String, a[6] as String?, a[7] as String?, a[10] as List<String>, a[15] as String?, a[17] as String?)
            a[15] as String
        }
        val forwards = mockk<MessageForwardService>()
        coEvery { forwards.post(any(), any(), any(), any(), any()) } coAnswers {
            sheetAtFirstByte += kotlinx.coroutines.runBlocking { store.load(sheetId, "me") }
            if (failSend(secondArg())) error("offline")
            posted += secondArg<String>() to arg<String?>(3)
            arg<String?>(3).orEmpty()
        }
        val network = InMemoryNetworkMonitor(initialOnline = true)
        val gate = OutOfThreadSendGate { id -> admissions[id] ?: OutOfThreadAdmission.SEND }
        val resolver = ShareTargetResolver { recipient, _ -> ShareTarget.Ready(recipient.conversationId.orEmpty()) }
        val dispatcher = ShareDispatcher(resolver, gate, forwards, network)
        val uploads = mockk<MediaUploadQueue>(relaxed = true)
        val scheduler = SharePendingSendScheduler { scheduled[0]++ }
        return Rig(ShareDurableSender(store, dispatcher, gate, forwards, messages, uploads, network, scheduler), store, sent, posted, uploads, scheduled, sheetAtFirstByte)
    }

    private val sheetId = "share-1"

    private fun file(name: String = "a.png"): MediaUploadItem {
        val f = File(tmp.root, "src-$name").apply { writeText("octets") }
        return MediaUploadItem.onDisk(f, name, "image/png")
    }

    private fun request(content: String? = "regarde", files: List<MediaUploadItem> = emptyList()) =
        ShareDurableRequest(sheetId, content, files, me)

    @Test
    fun `the sheet is on disk before the first byte leaves`() = runTest {
        val r = rig()

        r.sender.send(request(files = listOf(file())), listOf(group("a"), group("b")))

        assertThat(r.sheetAtFirstByte).isNotEmpty()
        assertThat(r.sheetAtFirstByte.first()).isNotNull()
        assertThat(r.sheetAtFirstByte.first()!!.targets.map { it.conversationId }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `the files are uploaded once and targets 2 to N copy them on the server`() = runTest {
        val r = rig()

        val outcomes = r.sender.send(request(files = listOf(file())), listOf(group("a"), group("b"), group("c")))

        coVerify(exactly = 1) { r.uploads.enqueueAs(any(), any(), any(), any()) }
        val origin = r.sent.single { it.conversationId == "a" }
        assertThat(origin.uploadCmids).hasSize(1)
        assertThat(origin.copyFrom).isNull()
        val copies = r.sent.filter { it.conversationId != "a" }
        assertThat(copies.map { it.copyFrom }).containsExactly(origin.clientMessageId, origin.clientMessageId)
        assertThat(copies.all { it.uploadCmids.isEmpty() }).isTrue()
        assertThat(outcomes.values).containsExactly(
            ShareDeliveryOutcome.Sent("a"), ShareDeliveryOutcome.Sent("b"), ShareDeliveryOutcome.Sent("c"),
        )
    }

    @Test
    fun `a replay keeps the client message id of every target`() = runTest {
        val first = rig()
        first.sender.send(request(), listOf(group("a"), group("b")))
        val ids = first.posted.map { it.second }
        val second = rig(store = SharePendingShareStore(File(tmp.root, "other")))
        second.sender.send(request(), listOf(group("a"), group("b")))

        assertThat(second.posted.map { it.second }).isEqualTo(ids)
        assertThat(ids.toSet()).hasSize(2)
    }

    @Test
    fun `nothing carries a transfer mark`() = runTest {
        val r = rig()

        r.sender.send(request(files = listOf(file())), listOf(group("a"), group("b")))

        assertThat(r.sent.all { it.forwardedFromId == null && it.forwardedFromConversationId == null }).isTrue()
    }

    @Test
    fun `a sealed destination is refused and never enters the sheet`() = runTest {
        val r = rig(admissions = mapOf("b" to OutOfThreadAdmission.END_TO_END))

        val outcomes = r.sender.send(request(), listOf(group("a"), group("b")))

        assertThat(outcomes["conv:b"]).isEqualTo(ShareDeliveryOutcome.Failed(ShareFailure.SEALED_DESTINATION))
        assertThat(r.posted.map { it.first }).containsExactly("a")
    }

    @Test
    fun `a transient failure keeps the target in the sheet, queued, and schedules the resume`() = runTest {
        val r = rig(failSend = { it == "b" })

        val outcomes = r.sender.send(request(), listOf(group("a"), group("b")))

        assertThat(outcomes["conv:b"]).isEqualTo(ShareDeliveryOutcome.Queued("b"))
        assertThat(r.store.load(sheetId, "me")!!.remainingTargets.map { it.conversationId }).containsExactly("b")
        assertThat(r.scheduled[0]).isEqualTo(1)
    }

    @Test
    fun `a fully served share leaves nothing on disk`() = runTest {
        val r = rig()

        r.sender.send(request(files = listOf(file())), listOf(group("a")))

        assertThat(r.store.pending("me")).isEmpty()
        assertThat(r.store.mediaDirectory(sheetId).exists()).isFalse()
        assertThat(r.scheduled[0]).isEqualTo(0)
    }

    @Test
    fun `a process killed between the sheet and the enqueue loses nothing`() = runTest {
        val store = SharePendingShareStore(File(tmp.root, "root"))
        store.commit(SharePendingShare.make(sheetId, System.currentTimeMillis(), "me", "regarde", emptyList(), listOf("a", "b")))
        val reborn = rig(store = store)

        val pending = reborn.sender.resume(me)

        assertThat(pending).isFalse()
        assertThat(reborn.posted.map { it.first }).containsExactly("a", "b").inOrder()
        assertThat(store.pending("me")).isEmpty()
    }

    @Test
    fun `a resume skips the targets already served`() = runTest {
        val store = SharePendingShareStore(File(tmp.root, "root"))
        val sheet = SharePendingShare.make(sheetId, System.currentTimeMillis(), "me", "regarde", emptyList(), listOf("a", "b"))
        store.commit(sheet.markSent("a", null))
        val reborn = rig(store = store)

        reborn.sender.resume(me)

        assertThat(reborn.posted.map { it.first }).containsExactly("b")
    }

    @Test
    fun `a resume keeps a target the network still refuses`() = runTest {
        val store = SharePendingShareStore(File(tmp.root, "root"))
        store.commit(SharePendingShare.make(sheetId, System.currentTimeMillis(), "me", "regarde", emptyList(), listOf("a")))
        val reborn = rig(failSend = { true }, store = store)

        assertThat(reborn.sender.resume(me)).isTrue()
        assertThat(store.pending("me")).hasSize(1)
    }
}
