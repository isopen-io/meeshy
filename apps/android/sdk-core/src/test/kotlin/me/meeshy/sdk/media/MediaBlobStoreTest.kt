package me.meeshy.sdk.media

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MediaBlobStoreTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var store: MediaBlobStore

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        store = MediaBlobStore(db.mediaBlobDao())
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
}
