package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.entity.TusUploadCheckpointEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun checkpointRow(
    key: String = "post:video.mp4:video/mp4:25",
    location: String = "https://gate.meeshy.me/api/v1/uploads/abc",
    uploadedBytes: Long = 10L,
    totalBytes: Long = 25L,
    updatedAt: Long = 1_000L,
) = TusUploadCheckpointEntity(
    checkpointKey = key,
    location = location,
    uploadedBytes = uploadedBytes,
    totalBytes = totalBytes,
    updatedAt = updatedAt,
)

@RunWith(RobolectricTestRunner::class)
class TusUploadCheckpointDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: TusUploadCheckpointDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.tusUploadCheckpointDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `find on an empty table returns null`() = runTest {
        assertThat(dao.find("missing")).isNull()
    }

    @Test
    fun `upsert then find returns the persisted row`() = runTest {
        dao.upsert(checkpointRow(key = "k1", uploadedBytes = 10L))

        val found = dao.find("k1")

        assertThat(found).isNotNull()
        assertThat(found!!.uploadedBytes).isEqualTo(10L)
        assertThat(found.location).isEqualTo("https://gate.meeshy.me/api/v1/uploads/abc")
    }

    @Test
    fun `upsert on an existing key replaces it rather than duplicating`() = runTest {
        dao.upsert(checkpointRow(key = "k1", uploadedBytes = 10L))
        dao.upsert(checkpointRow(key = "k1", uploadedBytes = 20L))

        assertThat(dao.find("k1")!!.uploadedBytes).isEqualTo(20L)
    }

    @Test
    fun `delete removes only the matching key`() = runTest {
        dao.upsert(checkpointRow(key = "k1"))
        dao.upsert(checkpointRow(key = "k2"))

        dao.delete("k1")

        assertThat(dao.find("k1")).isNull()
        assertThat(dao.find("k2")).isNotNull()
    }

    @Test
    fun `deleting a missing key is a harmless no-op`() = runTest {
        dao.delete("missing")

        assertThat(dao.find("missing")).isNull()
    }

    @Test
    fun `clear removes every row`() = runTest {
        dao.upsert(checkpointRow(key = "k1"))
        dao.upsert(checkpointRow(key = "k2"))

        dao.clear()

        assertThat(dao.find("k1")).isNull()
        assertThat(dao.find("k2")).isNull()
    }
}
