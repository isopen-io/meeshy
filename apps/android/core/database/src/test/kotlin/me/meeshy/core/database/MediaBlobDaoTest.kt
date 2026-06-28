package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.MediaBlobDao
import me.meeshy.core.database.entity.MediaBlobEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun blob(
    cmid: String,
    bytes: ByteArray = byteArrayOf(1, 2, 3),
    fileName: String = "photo.jpg",
    mimeType: String = "image/jpeg",
    createdAt: Long = 0L,
) = MediaBlobEntity(
    cmid = cmid,
    bytes = bytes,
    fileName = fileName,
    mimeType = mimeType,
    createdAt = createdAt,
)

@RunWith(RobolectricTestRunner::class)
class MediaBlobDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: MediaBlobDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.mediaBlobDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `find returns the upserted blob with every field preserved`() = runTest {
        dao.upsert(
            blob(
                "a",
                bytes = byteArrayOf(9, 8, 7, 6),
                fileName = "clip.mp4",
                mimeType = "video/mp4",
                createdAt = 1234L,
            ),
        )

        val found = dao.find("a")

        assertThat(found).isNotNull()
        assertThat(found!!.cmid).isEqualTo("a")
        assertThat(found.fileName).isEqualTo("clip.mp4")
        assertThat(found.mimeType).isEqualTo("video/mp4")
        assertThat(found.createdAt).isEqualTo(1234L)
        assertThat(found.bytes).isEqualTo(byteArrayOf(9, 8, 7, 6))
    }

    @Test
    fun `find returns null for an unknown cmid`() = runTest {
        assertThat(dao.find("missing")).isNull()
    }

    @Test
    fun `upsert replaces the blob for an existing cmid`() = runTest {
        dao.upsert(blob("a", bytes = byteArrayOf(1)))
        dao.upsert(blob("a", bytes = byteArrayOf(2, 2), fileName = "new.png"))

        val found = dao.find("a")

        assertThat(found!!.bytes).isEqualTo(byteArrayOf(2, 2))
        assertThat(found.fileName).isEqualTo("new.png")
    }

    @Test
    fun `delete removes only the given cmid`() = runTest {
        dao.upsert(blob("a"))
        dao.upsert(blob("b"))

        dao.delete("a")

        assertThat(dao.find("a")).isNull()
        assertThat(dao.find("b")).isNotNull()
    }

    @Test
    fun `delete is a no-op for an unknown cmid`() = runTest {
        dao.upsert(blob("a"))

        dao.delete("missing")

        assertThat(dao.find("a")).isNotNull()
    }

    @Test
    fun `clear removes every blob`() = runTest {
        dao.upsert(blob("a"))
        dao.upsert(blob("b"))

        dao.clear()

        assertThat(dao.find("a")).isNull()
        assertThat(dao.find("b")).isNull()
    }
}
