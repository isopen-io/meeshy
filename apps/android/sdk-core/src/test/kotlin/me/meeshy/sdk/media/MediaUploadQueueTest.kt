package me.meeshy.sdk.media

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MediaUploadQueueTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var blobStore: MediaBlobStore
    private lateinit var outbox: OutboxRepository
    private lateinit var queue: MediaUploadQueue

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        blobStore = MediaBlobStore(db.mediaBlobDao())
        outbox = OutboxRepository(db, db.outboxDao())
        queue = MediaUploadQueue(blobStore, outbox)
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun item(
        bytes: ByteArray = byteArrayOf(1, 2, 3),
        fileName: String = "photo.jpg",
        mimeType: String = "image/jpeg",
    ) = MediaUploadItem(bytes = bytes, fileName = fileName, mimeType = mimeType)

    @Test
    fun `enqueue stores the bytes retrievable by the returned cmid`() = runTest {
        val cmid = queue.enqueue(item(bytes = byteArrayOf(4, 5, 6), fileName = "clip.mp4", mimeType = "video/mp4"))

        val stored = blobStore.get(cmid)
        assertThat(stored).isNotNull()
        assertThat(stored!!.bytes).isEqualTo(byteArrayOf(4, 5, 6))
        assertThat(stored.fileName).isEqualTo("clip.mp4")
        assertThat(stored.mimeType).isEqualTo("video/mp4")
    }

    @Test
    fun `enqueue queues an UPLOAD_MEDIA row on the media lane keyed by the cmid`() = runTest {
        val cmid = queue.enqueue(item())

        val rows = outbox.deliverable(OutboxLanes.MEDIA)
        assertThat(rows).hasSize(1)
        val row = rows.single()
        assertThat(row.cmid).isEqualTo(cmid)
        assertThat(row.targetId).isEqualTo(cmid)
        assertThat(row.kindEnum).isEqualTo(OutboxKind.UPLOAD_MEDIA)
        assertThat(row.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(row.dependsOn).isNull()
    }

    @Test
    fun `independent enqueues produce distinct rows and blobs`() = runTest {
        val first = queue.enqueue(item(bytes = byteArrayOf(1), fileName = "a.jpg"))
        val second = queue.enqueue(item(bytes = byteArrayOf(2), fileName = "b.jpg"))

        assertThat(first).isNotEqualTo(second)
        assertThat(outbox.deliverable(OutboxLanes.MEDIA).map { it.cmid })
            .containsExactly(first, second)
        assertThat(blobStore.get(first)!!.fileName).isEqualTo("a.jpg")
        assertThat(blobStore.get(second)!!.fileName).isEqualTo("b.jpg")
    }

    @Test
    fun `cancel drops both the outbox row and the stored blob for the cmid`() = runTest {
        val cmid = queue.enqueue(item())

        queue.cancel(cmid)

        assertThat(outbox.deliverable(OutboxLanes.MEDIA)).isEmpty()
        assertThat(outbox.stateOf(cmid)).isNull()
        assertThat(blobStore.get(cmid)).isNull()
    }

    @Test
    fun `cancel leaves other queued uploads untouched`() = runTest {
        val keep = queue.enqueue(item(bytes = byteArrayOf(1), fileName = "keep.jpg"))
        val drop = queue.enqueue(item(bytes = byteArrayOf(2), fileName = "drop.jpg"))

        queue.cancel(drop)

        assertThat(outbox.deliverable(OutboxLanes.MEDIA).map { it.cmid }).containsExactly(keep)
        assertThat(blobStore.get(keep)!!.fileName).isEqualTo("keep.jpg")
        assertThat(blobStore.get(drop)).isNull()
    }

    @Test
    fun `cancel of an unknown cmid is a no-op`() = runTest {
        val cmid = queue.enqueue(item())

        queue.cancel("never-queued")

        assertThat(outbox.deliverable(OutboxLanes.MEDIA).map { it.cmid }).containsExactly(cmid)
        assertThat(blobStore.get(cmid)).isNotNull()
    }
}
