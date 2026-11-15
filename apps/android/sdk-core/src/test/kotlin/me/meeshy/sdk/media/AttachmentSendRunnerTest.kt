package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.guest.GuestAttachmentKind
import me.meeshy.sdk.model.guest.GuestAttachmentRefusal
import me.meeshy.sdk.model.media.AttachmentSendBatch
import me.meeshy.sdk.model.media.OutgoingAttachmentRules
import me.meeshy.sdk.model.media.OutgoingMediaGroup
import me.meeshy.sdk.model.media.PlannableAttachment
import me.meeshy.sdk.model.media.TusTranscription
import org.junit.Test

class AttachmentSendRunnerTest {

    private class Harness(
        var online: Boolean = true,
        var hasCredential: Boolean = true,
        var uploadFailure: Exception? = null,
        var queueAccepts: Boolean = true,
        val transcriptions: LocalTranscriptions = LocalTranscriptions.None,
    ) {
        val sent = mutableListOf<Triple<String, List<String>, Set<String>>>()
        val failed = mutableListOf<Pair<String, String>>()
        val offlineQueued = mutableListOf<String>()
        val requeued = mutableListOf<String>()
        val uploadedTranscriptions = mutableListOf<TusTranscription?>()
        val events = mutableListOf<String>()
        val deletedNow = mutableListOf<String>()
        val deletedLater = mutableListOf<Pair<List<String>, Long>>()

        val host = object : AttachmentSendHost {
            override suspend fun sendPostedBubble(tempId: String, attachmentIds: List<String>, dependsOn: Set<String>): Boolean {
                sent += Triple(tempId, attachmentIds, dependsOn)
                return true
            }

            override suspend fun markFailed(tempId: String, reason: String) {
                failed += tempId to reason
            }
        }
        val queue = object : AttachmentGroupQueueing {
            override suspend fun enqueueOffline(group: OutgoingMediaGroup, items: List<GroupUploadItem>): Boolean {
                offlineQueued += group.tempId
                return queueAccepts
            }

            override suspend fun requeueAfterOnlineFailure(group: OutgoingMediaGroup, items: List<GroupUploadItem>): Boolean {
                requeued += group.tempId
                return queueAccepts
            }
        }
        val uploader = MediaGroupUploading { group, items, onPromoted ->
            uploadFailure?.let { throw it }
            items.forEach { uploadedTranscriptions += it.transcription; onPromoted(it.attachmentId, "srv-${it.attachmentId}") }
            UploadedGroup(
                items.map { "srv-${it.attachmentId}" },
                items.map { UploadedMedia("srv-${it.attachmentId}", "u", "image/jpeg", 1L, null, null, null, null) },
            )
        }
        val feedback = object : AttachmentSendFeedback {
            override fun sendSucceeded() { events += "success" }
            override fun sendFailed() { events += "error" }
            override fun showFailureToast() { events += "toast" }
            override fun reduceHint(attachmentCount: Int) = "réduisez ($attachmentCount)"
            override fun restorePlace(sent: Boolean) { events += "place:$sent" }
            override fun abortUpload() { events += "abort" }
        }
        val cleanup = object : AttachmentFileCleanup {
            override fun deleteNow(attachmentIds: List<String>) { deletedNow += attachmentIds }
            override fun deleteAfter(attachmentIds: List<String>, delayMs: Long) { deletedLater += attachmentIds to delayMs }
        }

        fun runner() = AttachmentSendRunner(
            host, queue, uploader, { online }, { hasCredential }, feedback, cleanup, transcriptions,
        )
    }

    private fun counter(): () -> String {
        var n = 0
        return { "cid_${++n}" }
    }

    private fun batch(vararg pieces: PlannableAttachment, text: String = "", place: Boolean = false) =
        AttachmentSendBatch.of(pieces.toList(), text, hasReply = false, hasPlace = place, newTempId = counter())

    private fun files(vararg ids: String): Map<String, GroupUploadItem> =
        ids.associateWith { GroupUploadItem(it, MediaUploadItem(byteArrayOf(1), "$it.bin", "image/jpeg")) }

    private val photo = PlannableAttachment("i1", "image/jpeg")
    private val voice = PlannableAttachment("a1", "audio/mp4")

    @Test
    fun `en ligne les pieces montent puis le message reutilise le tempId de la bulle`() = runTest {
        val h = Harness()

        h.runner().run(batch(photo), files("i1"))

        assertThat(h.sent).containsExactly(Triple("cid_1", listOf("srv-i1"), emptySet<String>()))
        assertThat(h.offlineQueued).isEmpty()
        assertThat(h.events).containsExactly("success")
    }

    @Test
    fun `hors ligne le groupe va a l'outbox durable sans monter`() = runTest {
        val h = Harness(online = false)

        h.runner().run(batch(photo), files("i1"))

        assertThat(h.offlineQueued).containsExactly("cid_1")
        assertThat(h.sent).isEmpty()
        assertThat(h.events).containsExactly("success")
    }

    @Test
    fun `un echec en ligne rejoint l'outbox et compte comme une mise en file`() = runTest {
        val h = Harness(uploadFailure = AttachmentUploadException("coupé"))

        h.runner().run(batch(photo), files("i1"))

        assertThat(h.requeued).containsExactly("cid_1")
        assertThat(h.failed).isEmpty()
        assertThat(h.events).containsExactly("success")
    }

    @Test
    fun `un echec impossible a remettre en file marque la bulle en echec avec la raison et le conseil`() = runTest {
        val h = Harness(uploadFailure = AttachmentUploadException("coupé"), queueAccepts = false)

        h.runner().run(batch(photo, PlannableAttachment("i2", "image/png")), files("i1", "i2"))

        assertThat(h.failed).containsExactly("cid_1" to "coupé réduisez (2)")
        assertThat(h.events).containsExactly("error", "toast").inOrder()
    }

    @Test
    fun `le refus d'une piece d'invite est definitif, la bulle dit pourquoi, rien n'est remis en file`() = runTest {
        val refusal = GuestAttachmentRefusal(GuestAttachmentRefusal.Reason.KIND_NOT_ALLOWED)
        val h = Harness(uploadFailure = GuestAttachmentRefusedException(refusal))

        h.runner().run(batch(photo), files("i1"), guestKinds = listOf(GuestAttachmentKind.TEXT, GuestAttachmentKind.AUDIO))

        assertThat(h.requeued).isEmpty()
        val (tempId, reason) = h.failed.single()
        assertThat(tempId).isEqualTo("cid_1")
        assertThat(OutgoingAttachmentRules.isDefinitiveReason(reason)).isTrue()
        assertThat(OutgoingAttachmentRules.parseGuestRefusal(reason)!!.allowedKinds)
            .containsExactly(GuestAttachmentKind.TEXT, GuestAttachmentKind.AUDIO)
    }

    @Test
    fun `les groupes partent dans l'ordre puis le texte en dernier sur sa bulle`() = runTest {
        val h = Harness()

        h.runner().run(batch(voice, text = "écoute"), files("a1"))

        assertThat(h.sent.map { it.first }).containsExactly("cid_1", "cid_2").inOrder()
        assertThat(h.sent.last().second).isEmpty()
    }

    @Test
    fun `un lieu part seul et la place est restauree selon l'issue`() = runTest {
        val h = Harness()

        h.runner().run(batch(place = true), emptyMap())

        assertThat(h.sent.single().first).isEqualTo("cid_1")
        assertThat(h.events).containsExactly("place:true", "success").inOrder()
    }

    @Test
    fun `sans jeton l'envoi est abandonne et la place restauree`() = runTest {
        val h = Harness(hasCredential = false)

        h.runner().run(batch(photo, place = true), files("i1"))

        assertThat(h.sent).isEmpty()
        assertThat(h.events).containsExactly("abort", "toast", "place:false").inOrder()
    }

    @Test
    fun `les visuels sont supprimes tout de suite, les vocaux gardent leur fichier dix secondes`() = runTest {
        val h = Harness()

        h.runner().run(batch(photo, voice), files("i1", "a1"))

        assertThat(h.deletedNow).containsExactly("i1")
        assertThat(h.deletedLater).containsExactly(listOf("a1") to 10_000L)
    }

    @Test
    fun `un groupe audio attend les transcriptions locales puis les pose sur l'envoi`() = runTest {
        val transcription = TusTranscription(text = "bonjour", language = "fr")
        val h = Harness(
            transcriptions = object : LocalTranscriptions {
                override suspend fun await(attachmentIds: List<String>, tempId: String) = mapOf("a1" to transcription)
                override fun promoted(localId: String, serverId: String) = Unit
            },
        )

        h.runner().run(batch(voice), files("a1"))

        assertThat(h.uploadedTranscriptions).containsExactly(transcription)
    }

    @Test
    fun `une transcription trop lente n'est pas attendue au dela de 700 ms`() = runTest {
        val h = Harness(
            transcriptions = object : LocalTranscriptions {
                override suspend fun await(attachmentIds: List<String>, tempId: String): Map<String, TusTranscription> {
                    delay(5_000L)
                    return mapOf("a1" to TusTranscription("trop tard", "fr"))
                }

                override fun promoted(localId: String, serverId: String) = Unit
            },
        )

        h.runner().run(batch(voice), files("a1"))

        assertThat(h.uploadedTranscriptions).hasSize(1)
        assertThat(h.uploadedTranscriptions.single()).isNull()
        assertThat(testScheduler.currentTime).isAtMost(LocalTranscriptions.SEND_WAIT_BUDGET_MS + 50)
    }
}
