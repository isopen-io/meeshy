package me.meeshy.sdk.media

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.crypto.primitives.StreamingSeal
import me.meeshy.core.database.entity.MediaBlobEntity
import okhttp3.MediaType.Companion.toMediaType
import okio.Buffer
import okio.buffer
import org.junit.After
import org.junit.Rule
import org.junit.Before
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import java.io.File
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MediaBlobStoreTest {

    @get:Rule val folder = TemporaryFolder()

    private lateinit var db: MeeshyDatabase
    private lateinit var store: MediaBlobStore
    private lateinit var directory: File
    private val seal = StreamingSeal.ephemeral()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        directory = folder.newFolder("media-outbox")
        store = MediaBlobStore(db.mediaBlobDao(), MediaBlobFiles(directory) { seal })
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
    fun `get returns the item put under a cmid`() = runTest {
        store.put("c1", item(bytes = byteArrayOf(4, 5, 6), fileName = "clip.mp4", mimeType = "video/mp4"))

        val got = store.get("c1")

        assertThat(got).isNotNull()
        assertThat(got!!.bytes).isEqualTo(byteArrayOf(4, 5, 6))
        assertThat(got.fileName).isEqualTo("clip.mp4")
        assertThat(got.mimeType).isEqualTo("video/mp4")
    }

    @Test
    fun `get returns null for an unknown cmid`() = runTest {
        assertThat(store.get("missing")).isNull()
    }

    @Test
    fun `has is true for a stored cmid and false for an unknown one`() = runTest {
        store.put("c1", item())

        assertThat(store.has("c1")).isTrue()
        assertThat(store.has("missing")).isFalse()
    }

    @Test
    fun `has turns false once the blob is removed`() = runTest {
        store.put("c1", item())
        store.remove("c1")

        assertThat(store.has("c1")).isFalse()
    }

    @Test
    fun `put overwrites a previous item for the same cmid`() = runTest {
        store.put("c1", item(bytes = byteArrayOf(1)))
        store.put("c1", item(bytes = byteArrayOf(2, 2), fileName = "new.png"))

        val got = store.get("c1")

        assertThat(got!!.bytes).isEqualTo(byteArrayOf(2, 2))
        assertThat(got.fileName).isEqualTo("new.png")
    }

    @Test
    fun `remove deletes the stored item`() = runTest {
        store.put("c1", item())

        store.remove("c1")

        assertThat(store.get("c1")).isNull()
    }

    @Test
    fun `remove is a no-op for an unknown cmid`() = runTest {
        store.put("c1", item())

        store.remove("missing")

        assertThat(store.get("c1")).isNotNull()
    }

    @Test
    fun `independent cmids are stored separately`() = runTest {
        store.put("c1", item(bytes = byteArrayOf(1), fileName = "a.jpg"))
        store.put("c2", item(bytes = byteArrayOf(2), fileName = "b.jpg"))

        assertThat(store.get("c1")!!.fileName).isEqualTo("a.jpg")
        assertThat(store.get("c2")!!.fileName).isEqualTo("b.jpg")
    }

    private fun MediaUploadItem.sent(): ByteArray = Buffer().also { requestBody("video/mp4".toMediaType()).writeTo(it) }.readByteArray()

    @Test
    fun `a queued file is kept SEALED on disk, never in the row, and comes back streamed`() = runTest {
        val marker = "\u00a9xyz+48.8566+002.3522/".toByteArray(Charsets.ISO_8859_1)
        val content = ByteArray(90_000) { (it % 241).toByte() } + marker + ByteArray(90_000)
        store.put("c1", MediaUploadItem.onDisk(folder.newFile().also { it.writeBytes(content) }, "clip.mp4", "video/mp4"))

        val got = store.get("c1")!!

        assertThat(db.mediaBlobDao().find("c1")!!.bytes).isEmpty()
        assertThat(got.source).isNotInstanceOf(MediaUploadSource.InMemory::class.java)
        assertThat(got.sizeBytes).isEqualTo(content.size.toLong())
        assertThat(got.sent()).isEqualTo(content)
        assertThat(got.rangeBody(90_000, marker.size.toLong(), null).let { Buffer().also { b -> it.writeTo(b) }.readByteArray() }).isEqualTo(marker)
        val onDisk = directory.listFiles()!!.single()
        assertThat(String(onDisk.readBytes(), Charsets.ISO_8859_1)).doesNotContain(String(marker, Charsets.ISO_8859_1))
        assertThat(onDisk.name).doesNotContain("c1")
    }

    @Test
    fun `a row written before the octets moved to files is still delivered`() = runTest {
        db.mediaBlobDao().upsert(MediaBlobEntity("old", byteArrayOf(7, 8, 9), "old.jpg", "image/jpeg", 1L))

        val got = store.get("old")!!

        assertThat(got.bytes).isEqualTo(byteArrayOf(7, 8, 9))
        assertThat(got.fileName).isEqualTo("old.jpg")
    }

    @Test
    fun `a blob whose sealed file is lost or moved under another cmid reads as gone`() = runTest {
        store.put("c1", item(bytes = ByteArray(5_000) { 1 }))
        store.put("c2", item(bytes = ByteArray(5_000) { 2 }))
        val files = directory.listFiles()!!.sortedBy { it.name }
        files[0].copyTo(files[1], overwrite = true)

        val opened = listOf(store.get("c1"), store.get("c2"))

        assertThat(opened.count { it == null }).isEqualTo(1)
        directory.listFiles()!!.forEach { it.delete() }
        assertThat(store.get("c1")).isNull()
    }

    @Test
    fun `removing a blob or leaving the account leaves no sealed file`() = runTest {
        store.put("c1", item())
        store.put("c2", item())

        store.remove("c1")
        assertThat(directory.listFiles()!!).hasLength(1)
        store.clear()

        assertThat(directory.listFiles()!!).isEmpty()
    }

    /**
     * Sealing then opening 200 MB churns ~12 % of the throughput in per-segment cipher temporaries; one array of the
     * media size would alone reach [size]. The retained bound itself is proven under a 48 MB heap ([BoundedHeapTest]).
     */
    @Test
    fun `a 200 MB file is queued and read back sealed without any array of its size`() {
        val size = 200L * 1024 * 1024
        val source = folder.newFile().also { java.io.RandomAccessFile(it, "rw").use { raf -> raf.setLength(size) } }
        val sameThread = MediaBlobStore(db.mediaBlobDao(), MediaBlobFiles(directory) { seal }, kotlinx.coroutines.Dispatchers.Unconfined)
        val counting = CountingSink()

        val allocated = AllocationMeter.allocatedBy {
            kotlinx.coroutines.runBlocking(kotlinx.coroutines.Dispatchers.Unconfined) {
                sameThread.put("big", MediaUploadItem.onDisk(source, "long.mp4", "video/mp4"))
                val item = sameThread.get("big")!!
                counting.buffer().use { item.requestBody(null).writeTo(it) }
            }
        }

        assertThat(counting.total).isEqualTo(size)
        assertThat(allocated).isLessThan(size / 2)
    }

    private class CountingSink : okio.Sink by okio.blackholeSink() {
        var total = 0L
        override fun write(source: Buffer, byteCount: Long) {
            total += byteCount
            source.skip(byteCount)
        }
    }
}
