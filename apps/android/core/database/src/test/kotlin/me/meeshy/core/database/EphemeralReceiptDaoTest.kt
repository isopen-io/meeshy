package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.EphemeralReceiptEntity
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun receipt(messageId: String = "m1", receivedAt: Long = 100L, expiresAt: Long? = 500L) =
    EphemeralReceiptEntity(messageId, "conv1", receivedAt, expiresAt)

@RunWith(RobolectricTestRunner::class)
class EphemeralReceiptDaoTest {

    private val db: MeeshyDatabase by lazy {
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }
    private val dao by lazy { db.ephemeralReceiptDao() }

    @After
    fun tearDown() = db.close()

    @Test
    fun `rejouer la meme reception ne change rien`() = runTest {
        dao.record(receipt())
        dao.record(receipt())

        assertThat(dao.forConversation("conv1")).containsExactly(receipt())
    }

    @Test
    fun `une reception plus ancienne ne fait jamais reculer receivedAt`() = runTest {
        dao.record(receipt(receivedAt = 100L))
        dao.record(receipt(receivedAt = 40L))

        assertThat(dao.find("m1")?.receivedAt).isEqualTo(100L)
    }

    @Test
    fun `une reception plus recente avance receivedAt`() = runTest {
        dao.record(receipt(receivedAt = 100L))
        dao.record(receipt(receivedAt = 250L))

        assertThat(dao.find("m1")?.receivedAt).isEqualTo(250L)
    }

    @Test
    fun `les receptions d'une conversation sont triees par date de reception`() = runTest {
        dao.record(receipt("b", receivedAt = 20L))
        dao.record(receipt("a", receivedAt = 10L))

        assertThat(dao.forConversation("conv1").map { it.messageId }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `delete retire la reception`() = runTest {
        dao.record(receipt())
        dao.delete("m1")

        assertThat(dao.find("m1")).isNull()
    }
}
