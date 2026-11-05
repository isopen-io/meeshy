package me.meeshy.sdk.media

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.media.AttachmentGroupKind
import me.meeshy.sdk.model.media.OutgoingMediaGroup
import me.meeshy.sdk.model.media.PlannedMessage
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.kindEnum
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxAttachmentGroupSenderTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private lateinit var uploads: MediaUploadQueue
    private val bubbles = mutableListOf<Triple<String, List<String>, Set<String>>>()
    private var hostAccepts = true
    private var hostThrows = false

    private val host = object : AttachmentSendHost {
        override suspend fun sendPostedBubble(tempId: String, attachmentIds: List<String>, dependsOn: Set<String>): Boolean {
            if (hostThrows) throw IllegalStateException("db closed")
            bubbles += Triple(tempId, attachmentIds, dependsOn)
            return hostAccepts
        }

        override suspend fun markFailed(tempId: String, reason: String) = Unit
    }

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        val blobStore = MediaBlobStore(
            db.mediaBlobDao(),
            MediaBlobFiles(kotlin.io.path.createTempDirectory("blobs").toFile()) { me.meeshy.core.crypto.primitives.StreamingSeal.ephemeral() },
        )
        outbox = OutboxRepository(db, db.outboxDao())
        uploads = MediaUploadQueue(blobStore, outbox)
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun group() = OutgoingMediaGroup(PlannedMessage(AttachmentGroupKind.VISUAL, listOf("i1", "i2"), null, false), "cid_1")

    private fun items() = listOf("i1", "i2").map { GroupUploadItem(it, MediaUploadItem(byteArrayOf(1, 2), "$it.jpg", "image/jpeg")) }

    private fun sender() = OutboxAttachmentGroupSender(uploads, host, conversationId = "conv-1")

    @Test
    fun `chaque piece devient une ligne de televersement durable sans passer par TUS`() = runTest {
        assertThat(sender().enqueueOffline(group(), items())).isTrue()

        val rows = outbox.deliverable(OutboxLanes.MEDIA)
        assertThat(rows).hasSize(2)
        assertThat(rows.map { it.kindEnum }).containsExactly(OutboxKind.UPLOAD_MEDIA, OutboxKind.UPLOAD_MEDIA)
    }

    @Test
    fun `la bulle posee au tap part sous son tempId et depend des televersements pour la greffe des ids`() = runTest {
        sender().enqueueOffline(group(), items())

        val (tempId, ids, dependsOn) = bubbles.single()
        val cmids = outbox.deliverable(OutboxLanes.MEDIA).map { it.cmid }
        assertThat(tempId).isEqualTo("cid_1")
        assertThat(ids).containsExactlyElementsIn(cmids)
        assertThat(dependsOn).containsExactlyElementsIn(cmids)
    }

    @Test
    fun `si la bulle ne peut pas etre mise en file les televersements sont retires`() = runTest {
        hostThrows = true

        assertThat(sender().requeueAfterOnlineFailure(group(), items())).isFalse()

        assertThat(outbox.deliverable(OutboxLanes.MEDIA)).isEmpty()
    }

    @Test
    fun `un groupe sans fichier n'ecrit rien`() = runTest {
        assertThat(sender().enqueueOffline(group(), emptyList())).isFalse()
        assertThat(bubbles).isEmpty()
    }
}
