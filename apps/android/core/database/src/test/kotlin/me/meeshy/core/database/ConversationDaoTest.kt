package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.entity.ConversationEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun conversation(id: String, updatedAt: Long, unreadCount: Int = 0) =
    ConversationEntity(id = id, payload = "{}", updatedAt = updatedAt, cachedAt = 0L, unreadCount = unreadCount)

@RunWith(RobolectricTestRunner::class)
class ConversationDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: ConversationDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.conversationDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `observeAll returns rows sorted by updatedAt descending`() = runTest {
        dao.upsertAll(listOf(conversation("a", 100), conversation("b", 300), conversation("c", 200)))

        val rows = dao.observeAll().first()

        assertThat(rows.map { it.id }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `upsertAll replaces an existing row by primary key`() = runTest {
        dao.upsertAll(listOf(conversation("a", 100)))
        dao.upsertAll(listOf(conversation("a", 999)))

        val rows = dao.observeAll().first()

        assertThat(rows).hasSize(1)
        assertThat(rows.single().updatedAt).isEqualTo(999)
    }

    @Test
    fun `deleteNotIn removes rows absent from the keep set`() = runTest {
        dao.upsertAll(listOf(conversation("a", 1), conversation("b", 2), conversation("c", 3)))

        dao.deleteNotIn(listOf("b"))

        assertThat(dao.observeAll().first().map { it.id }).containsExactly("b")
    }

    @Test
    fun `totalUnreadCount is zero on an empty table`() = runTest {
        assertThat(dao.totalUnreadCount().first()).isEqualTo(0)
    }

    @Test
    fun `totalUnreadCount sums the unreadCount column across every row`() = runTest {
        dao.upsertAll(
            listOf(
                conversation("a", 1, unreadCount = 3),
                conversation("b", 2, unreadCount = 0),
                conversation("c", 3, unreadCount = 5),
            ),
        )

        assertThat(dao.totalUnreadCount().first()).isEqualTo(8)
    }

    @Test
    fun `totalUnreadCount follows a later upsert without a fresh collection`() = runTest {
        dao.upsertAll(listOf(conversation("a", 1, unreadCount = 3)))
        assertThat(dao.totalUnreadCount().first()).isEqualTo(3)

        dao.upsertAll(listOf(conversation("a", 1, unreadCount = 0)))

        assertThat(dao.totalUnreadCount().first()).isEqualTo(0)
    }

    @Test
    fun `recentByUpdatedAt returns at most limit rows, most-recently-updated first`() = runTest {
        dao.upsertAll((0 until 10).map { i -> conversation("c$i", updatedAt = i.toLong()) })

        val rows = dao.recentByUpdatedAt(limit = 3)

        assertThat(rows.map { it.id }).containsExactly("c9", "c8", "c7").inOrder()
    }
}
