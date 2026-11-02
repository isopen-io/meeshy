package me.meeshy.sdk.media

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.core.crypto.primitives.StreamingSeal
import me.meeshy.core.database.MeeshyDatabase
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

/**
 * #13555 — a process that died mid-send leaves, at the next start, a sealed blob its row never named (killed between the
 * file and the row), a half-written `.part`, and cleaned copies IN CLEAR in `outgoing-clean`. The boot sweep removes
 * them, and never what the running process has just written.
 */
@RunWith(RobolectricTestRunner::class)
class OutgoingMediaBootSweepTest {

    @get:Rule val folder = TemporaryFolder()

    private lateinit var db: MeeshyDatabase
    private lateinit var blobDirectory: File
    private lateinit var scratch: File
    private lateinit var blobs: MediaBlobStore
    private lateinit var sweep: OutgoingMediaBootSweep

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        blobDirectory = folder.newFolder("media-outbox")
        scratch = folder.newFolder("outgoing-clean")
        val seal = StreamingSeal.ephemeral()
        blobs = MediaBlobStore(db.mediaBlobDao(), MediaBlobFiles(blobDirectory) { seal })
        sweep = OutgoingMediaBootSweep(blobs, OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(false), Dispatchers.Unconfined, scratch))
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun File.agedBy(millis: Long): File = also { it.setLastModified(System.currentTimeMillis() - millis) }

    @Test
    fun `the files a dead process left are swept at start, what the queue still holds and what this process writes are kept`() = runTest {
        blobs.put("held", MediaUploadItem(ByteArray(2_000) { 1 }, "a.jpg", "image/jpeg"))
        blobDirectory.listFiles()!!.single().agedBy(HOUR)
        val orphan = File(blobDirectory, "0".repeat(64) + ".blob").also { it.writeBytes(ByteArray(64)) }.agedBy(HOUR)
        val half = File(blobDirectory, "1".repeat(64) + ".blob.part").also { it.writeBytes(ByteArray(64)) }.agedBy(HOUR)
        val cleanCopy = File(scratch, "copy-of-a-dead-send.mp4").also { it.writeBytes(ByteArray(64) { 5 }) }.agedBy(HOUR)
        val startedAt = System.currentTimeMillis() - MINUTE
        val freshCopy = File(scratch, "copy-of-this-process.mp4").also { it.writeBytes(ByteArray(64) { 5 }) }
        val freshOrphan = File(blobDirectory, "2".repeat(64) + ".blob").also { it.writeBytes(ByteArray(64)) }

        sweep.sweep(processStartedAt = startedAt)

        assertThat(orphan.exists()).isFalse()
        assertThat(half.exists()).isFalse()
        assertThat(cleanCopy.exists()).isFalse()
        assertThat(blobs.get("held")).isNotNull()
        assertThat(freshCopy.exists()).isTrue()
        assertThat(freshOrphan.exists()).isTrue()
    }

    @Test
    fun `what a sweep spares is dated from the PROCESS start, not from whenever the initializer happens to run`() {
        val startedAt = OutgoingMediaBootSweep.processStartedAt(wallNowMillis = 1_000_000L, uptimeNowMillis = 50_000L, processStartUptimeMillis = 42_000L)

        assertThat(startedAt).isEqualTo(992_000L)
    }

    private companion object {
        const val MINUTE = 60_000L
        const val HOUR = 60 * MINUTE
    }
}
