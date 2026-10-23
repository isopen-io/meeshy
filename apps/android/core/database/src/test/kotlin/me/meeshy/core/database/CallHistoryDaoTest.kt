package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.CallHistoryDao
import me.meeshy.core.database.entity.CallHistoryEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun call(id: String, startedAt: Long) =
    CallHistoryEntity(callId = id, payload = "{}", startedAt = startedAt, cachedAt = 0L)

@RunWith(RobolectricTestRunner::class)
class CallHistoryDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: CallHistoryDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.callHistoryDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `observeAll returns rows newest-first by startedAt`() = runTest {
        dao.upsertAll(listOf(call("a", 100), call("b", 300), call("c", 200)))

        val rows = dao.observeAll().first()

        assertThat(rows.map { it.callId }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `observeAll is empty on a cold table`() = runTest {
        assertThat(dao.observeAll().first()).isEmpty()
    }

    @Test
    fun `upsertAll replaces an existing row by call id`() = runTest {
        dao.upsertAll(listOf(call("a", 100)))
        dao.upsertAll(listOf(call("a", 999)))

        val rows = dao.observeAll().first()

        assertThat(rows).hasSize(1)
        assertThat(rows.single().startedAt).isEqualTo(999)
    }

    @Test
    fun `deleteNotIn removes rows absent from the keep set`() = runTest {
        dao.upsertAll(listOf(call("a", 1), call("b", 2), call("c", 3)))

        dao.deleteNotIn(listOf("b"))

        assertThat(dao.observeAll().first().map { it.callId }).containsExactly("b")
    }

    @Test
    fun `clear empties the table`() = runTest {
        dao.upsertAll(listOf(call("a", 1), call("b", 2)))

        dao.clear()

        assertThat(dao.observeAll().first()).isEmpty()
    }

    @Test
    fun `deleteById removes only that line`() = runTest {
        dao.upsertAll(listOf(call("a", 1), call("b", 2), call("c", 3)))

        dao.deleteById("b")

        assertThat(dao.observeAll().first().map { it.callId }).containsExactly("c", "a").inOrder()
        assertThat(dao.get("b")).isNull()
    }

    @Test
    fun `a restored line takes back its place by startedAt`() = runTest {
        dao.upsertAll(listOf(call("a", 100), call("b", 300), call("c", 200)))
        val b = dao.get("b")!!
        dao.deleteById("b")

        dao.upsertAll(listOf(b))

        assertThat(dao.all().map { it.callId }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `idsSince keeps the window and idsBeyond the overflow`() = runTest {
        dao.upsertAll(listOf(call("a", 100), call("b", 300), call("c", 200)))

        assertThat(dao.idsSince(200)).containsExactly("b", "c")
        assertThat(dao.idsBeyond(2)).containsExactly("a")
        assertThat(dao.idsBeyond(5)).isEmpty()
    }

    @Test
    fun `deleteOlderThan drops what left the window`() = runTest {
        dao.upsertAll(listOf(call("a", 100), call("b", 300)))

        dao.deleteOlderThan(200)

        assertThat(dao.all().map { it.callId }).containsExactly("b")
    }
}
