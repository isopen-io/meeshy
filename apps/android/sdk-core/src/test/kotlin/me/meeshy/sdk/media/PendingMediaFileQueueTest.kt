package me.meeshy.sdk.media

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.crypto.primitives.StreamingSeal
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.MediaBlobEntity
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.stateEnum
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.io.IOException
import java.io.InputStream

/** #14710 — file-backed media queue: typed disk-full, no phantom, legacy BLOB migration, sweep. */
@RunWith(RobolectricTestRunner::class)
class PendingMediaFileQueueTest {

    @get:Rule val folder = TemporaryFolder()

    private lateinit var db: MeeshyDatabase
    private lateinit var directory: File
    private lateinit var blobs: MediaBlobStore
    private lateinit var outbox: OutboxRepository
    private lateinit var queue: MediaUploadQueue

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        directory = folder.newFolder("media-outbox")
        val seal = StreamingSeal.ephemeral()
        blobs = MediaBlobStore(db.mediaBlobDao(), MediaBlobFiles(directory) { seal })
        outbox = OutboxRepository(db, db.outboxDao())
        queue = MediaUploadQueue(blobs, outbox)
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun failingItem(message: String) = MediaUploadItem(
        source = object : MediaUploadSource {
            override val size: Long = 10
            override fun open(offset: Long): InputStream = object : InputStream() {
                override fun read(): Int = throw IOException(message)
            }
        },
        fileName = "big.mp4",
        mimeType = "video/mp4",
    )

    private suspend fun legacyRow(cmid: String, bytes: ByteArray, createdAt: Long = 0L) {
        db.mediaBlobDao().upsert(MediaBlobEntity(cmid, bytes, "old.jpg", "image/jpeg", createdAt))
    }

    @Test
    fun `a full disk fails the enqueue with a typed error and leaves neither row nor file`() = runTest {
        val failure = runCatching { queue.enqueue(failingItem("write failed: ENOSPC (No space left on device)")) }.exceptionOrNull()

        assertThat(failure).isInstanceOf(MediaStorageFullException::class.java)
        assertThat(db.outboxDao().byState(OutboxState.PENDING.name)).isEmpty()
        assertThat(directory.listFiles().orEmpty().toList()).isEmpty()
    }

    @Test
    fun `a copy that fails for another reason queues nothing either`() = runTest {
        val failure = runCatching { queue.enqueue(failingItem("boom")) }.exceptionOrNull()

        assertThat(failure).isInstanceOf(IOException::class.java)
        assertThat(failure).isNotInstanceOf(MediaStorageFullException::class.java)

        assertThat(db.outboxDao().byState(OutboxState.PENDING.name)).isEmpty()
        assertThat(directory.listFiles().orEmpty().toList()).isEmpty()
    }

    @Test
    fun `a legacy BLOB migrates to a sealed file, still delivers, and its column is emptied`() = runTest {
        val cmid = queue.enqueue(MediaUploadItem(byteArrayOf(1), "x.jpg", "image/jpeg"))
        blobs.remove(cmid)
        legacyRow(cmid, ByteArray(3_000_000) { (it % 251).toByte() })
        assertThat(blobs.get(cmid)!!.bytes).hasLength(3_000_000)

        val converted = MediaBlobMigrator(blobs, outbox).migrate()

        assertThat(converted).isEqualTo(1)
        assertThat(db.mediaBlobDao().legacyCmids()).isEmpty()
        assertThat(directory.listFiles().orEmpty().toList()).hasSize(1)
        assertThat(blobs.get(cmid)!!.bytes).isEqualTo(ByteArray(3_000_000) { (it % 251).toByte() })
    }

    @Test
    fun `a legacy BLOB whose upload no longer exists is dropped by the migration`() = runTest {
        legacyRow("ghost", byteArrayOf(1, 2, 3))

        MediaBlobMigrator(blobs, outbox).migrate()

        assertThat(db.mediaBlobDao().meta("ghost")).isNull()
    }

    @Test
    fun `a pending upload whose file vanished fails instead of being replayed`() = runTest {
        val lost = queue.enqueue(MediaUploadItem(byteArrayOf(1, 2), "a.jpg", "image/jpeg"))
        directory.listFiles().orEmpty().forEach { it.delete() }

        PendingMediaSweeper(blobs, outbox, db.outboxDao()).sweep(before = System.currentTimeMillis() + 1_000)

        assertThat(db.outboxDao().find(lost)!!.stateEnum).isEqualTo(OutboxState.EXHAUSTED)
        assertThat(db.mediaBlobDao().meta(lost)).isNull()
    }

    @Test
    fun `a pending upload whose file is there stays queued, and a blob no upload names leaves the disk`() = runTest {
        val kept = queue.enqueue(MediaUploadItem(byteArrayOf(3, 4), "b.jpg", "image/jpeg"))
        legacyRow("orphan", byteArrayOf(9), createdAt = 1L)

        PendingMediaSweeper(blobs, outbox, db.outboxDao()).sweep(before = System.currentTimeMillis() + 1_000)

        assertThat(db.outboxDao().find(kept)!!.stateEnum).isEqualTo(OutboxState.PENDING)
        assertThat(blobs.get(kept)).isNotNull()
        assertThat(db.mediaBlobDao().meta("orphan")).isNull()
    }

    @Test
    fun `a blob row written after the cut-off is never swept`() = runTest {
        legacyRow("fresh", byteArrayOf(9), createdAt = 5_000L)

        PendingMediaSweeper(blobs, outbox, db.outboxDao()).sweep(before = 1_000L)

        assertThat(db.mediaBlobDao().meta("fresh")).isNotNull()
    }
}
